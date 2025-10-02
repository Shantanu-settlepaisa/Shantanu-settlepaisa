const { Pool } = require('pg');

class SabPaisaConnector {
  constructor() {
    this.pool = new Pool({
      user: process.env.SABPAISA_DB_USER || 'settlepaisainternal',
      host: process.env.SABPAISA_DB_HOST || '3.108.237.99',
      database: process.env.SABPAISA_DB_NAME || 'settlepaisa',
      password: process.env.SABPAISA_DB_PASSWORD || 'sabpaisa123',
      port: process.env.SABPAISA_DB_PORT || 5432,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    
    console.log('[SabPaisa Connector] Initialized');
    console.log(`[SabPaisa Connector] Connected to: ${this.pool.options.host}:${this.pool.options.port}/${this.pool.options.database}`);
  }

  async fetchPGTransactions(cycleDate, options = {}) {
    const {
      clientCode = null,
      status = 'SUCCESS',
      limit = null
    } = options;
    
    try {
      let query = `
        SELECT 
          t.id,
          t.transaction_id,
          t.client_code,
          t.client_name,
          t.paid_amount,
          t.payee_amount,
          t.payment_mode,
          t.bank_name,
          t.transaction_status,
          t.trans_complete_date,
          t.settlement_utr as utr,
          t.bank_txn_id,
          t.convcharges,
          t.ep_charges,
          t.gst,
          t.is_recon,
          t.is_bank_matched,
          t.is_merchant_settled,
          m.merchantid,
          m.companyname,
          m.email_id
        FROM transactions_to_settle t
        LEFT JOIN merchant_data m ON t.client_code = m.clientcode
        WHERE DATE(t.trans_complete_date) = $1
      `;
      
      const params = [cycleDate];
      let paramIndex = 2;
      
      if (clientCode) {
        query += ` AND t.client_code = $${paramIndex}`;
        params.push(clientCode);
        paramIndex++;
      }
      
      if (status) {
        query += ` AND t.transaction_status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
      
      query += ` ORDER BY t.trans_complete_date ASC`;
      
      if (limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(limit);
      }
      
      console.log(`[SabPaisa Connector] Fetching PG transactions for ${cycleDate}`);
      
      const result = await this.pool.query(query, params);
      
      console.log(`[SabPaisa Connector] Fetched ${result.rows.length} PG transactions`);
      
      return this.normalizePGTransactions(result.rows);
      
    } catch (error) {
      console.error('[SabPaisa Connector] Error fetching PG transactions:', error.message);
      throw error;
    }
  }

  async fetchBankStatements(cycleDate, options = {}) {
    const {
      bankName = null,
      limit = null
    } = options;
    
    try {
      let query = `
        SELECT 
          tb.id,
          tb.transaction_id,
          tb.bank_name,
          tb.utr,
          tb.amount,
          tb.transaction_date,
          tb.description,
          tb.status
        FROM transaction_bank tb
        WHERE DATE(tb.transaction_date) = $1
      `;
      
      const params = [cycleDate];
      let paramIndex = 2;
      
      if (bankName) {
        query += ` AND tb.bank_name = $${paramIndex}`;
        params.push(bankName);
        paramIndex++;
      }
      
      query += ` ORDER BY tb.transaction_date ASC`;
      
      if (limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(limit);
      }
      
      console.log(`[SabPaisa Connector] Fetching bank statements for ${cycleDate}`);
      
      const result = await this.pool.query(query, params);
      
      console.log(`[SabPaisa Connector] Fetched ${result.rows.length} bank records`);
      
      return this.normalizeBankStatements(result.rows);
      
    } catch (error) {
      console.error('[SabPaisa Connector] Error fetching bank statements:', error.message);
      throw error;
    }
  }

  async fetchMerchants(options = {}) {
    const {
      status = 'ACTIVE',
      search = null,
      limit = 100
    } = options;
    
    try {
      let query = `
        SELECT 
          merchantid,
          clientcode,
          clientname,
          companyname,
          email_id,
          contactnumber,
          status,
          rolling_reserve,
          no_of_days as rolling_reserve_days,
          rolling_percentage,
          subscribe,
          subscribe_amount,
          merchant_type_id
        FROM merchant_data
        WHERE 1=1
      `;
      
      const params = [];
      let paramIndex = 1;
      
      if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
      
      if (search) {
        query += ` AND (clientname ILIKE $${paramIndex} OR companyname ILIKE $${paramIndex} OR clientcode ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }
      
      query += ` ORDER BY clientname ASC LIMIT $${paramIndex}`;
      params.push(limit);
      
      const result = await this.pool.query(query, params);
      
      console.log(`[SabPaisa Connector] Fetched ${result.rows.length} merchants`);
      
      return result.rows;
      
    } catch (error) {
      console.error('[SabPaisa Connector] Error fetching merchants:', error.message);
      throw error;
    }
  }

  async fetchFeeBearerConfig(clientCode) {
    try {
      const result = await this.pool.query(
        `SELECT 
          mfb.merchant_id,
          mfb.mode_id,
          mfb.fee_bearer_id,
          fb.name as fee_bearer_name,
          pm.name as payment_mode_name
         FROM merchant_fee_bearer mfb
         JOIN fee_bearer fb ON mfb.fee_bearer_id = fb.id
         JOIN payment_mode pm ON mfb.mode_id = pm.id
         WHERE mfb.merchant_id = (SELECT merchantid FROM merchant_data WHERE clientcode = $1)`,
        [clientCode]
      );
      
      return result.rows;
      
    } catch (error) {
      console.error('[SabPaisa Connector] Error fetching fee bearer config:', error.message);
      throw error;
    }
  }

  normalizePGTransactions(rows) {
    return rows.map(row => ({
      pgw_ref: row.transaction_id,
      merchant_id: row.client_code,
      merchant_name: row.client_name || row.companyname,
      amount_paise: Math.round((row.paid_amount || 0) * 100),
      payment_mode: row.payment_mode || 'UNKNOWN',
      status: row.transaction_status === 'SUCCESS' ? 'SUCCESS' : 'PENDING',
      utr: row.utr,
      bank: row.bank_name,
      gateway_txn_id: row.bank_txn_id,
      created_at: row.trans_complete_date,
      
      sabpaisa_id: row.id,
      sabpaisa_is_recon: row.is_recon,
      sabpaisa_is_bank_matched: row.is_bank_matched,
      sabpaisa_is_merchant_settled: row.is_merchant_settled,
      
      convcharges: row.convcharges,
      ep_charges: row.ep_charges,
      gst: row.gst
    }));
  }

  normalizeBankStatements(rows) {
    return rows.map(row => ({
      id: row.id,
      transaction_id: row.transaction_id,
      utr: row.utr,
      amount_paise: Math.round((row.amount || 0) * 100),
      bank_name: row.bank_name,
      transaction_date: row.transaction_date,
      description: row.description,
      status: row.status
    }));
  }

  async healthCheck() {
    try {
      const result = await this.pool.query('SELECT NOW() as current_time, version() as pg_version');
      
      const tablesResult = await this.pool.query(`
        SELECT COUNT(*) as table_count 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      
      const txnCount = await this.pool.query('SELECT COUNT(*) as count FROM transactions_to_settle');
      const merchantCount = await this.pool.query('SELECT COUNT(*) as count FROM merchant_data');
      
      return {
        status: 'healthy',
        timestamp: result.rows[0].current_time,
        database: this.pool.options.database,
        host: this.pool.options.host,
        port: this.pool.options.port,
        pg_version: result.rows[0].pg_version,
        statistics: {
          total_tables: tablesResult.rows[0].table_count,
          transactions: txnCount.rows[0].count,
          merchants: merchantCount.rows[0].count
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async close() {
    await this.pool.end();
    console.log('[SabPaisa Connector] Connection pool closed');
  }
}

module.exports = { SabPaisaConnector };
