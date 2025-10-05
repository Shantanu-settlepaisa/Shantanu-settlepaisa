const { Pool } = require('pg');
require('dotenv').config();

// Environment variables
const USE_DB = process.env.USE_DB === 'true';
const PG_URL = process.env.PG_URL || 'postgresql://postgres:postgres@localhost:5432/settlepaisa';
const MERCHANT_ID = process.env.DEFAULT_MERCHANT_ID || '11111111-1111-1111-1111-111111111111';

// Database connection pool
let pool = null;

if (USE_DB) {
  pool = new Pool({
    connectionString: PG_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Test connection
  pool.query('SELECT NOW()', (err, res) => {
    if (err) {
      console.error('Database connection failed:', err);
      console.log('Falling back to mock data mode');
    } else {
      console.log('Database connected:', res.rows[0].now);
    }
  });
}

// Database adapter functions
const db = {
  // Get dashboard summary for merchant
  async getDashboardSummary(merchantId = MERCHANT_ID) {
    if (!USE_DB || !pool) {
      return null; // Fall back to mock data
    }

    try {
      const queries = {
        // Current balance (unsettled reconciled transactions + pending batches)
        currentBalance: `
          WITH unsettled_txns AS (
            SELECT COALESCE(SUM(t.amount_paise), 0) as balance
            FROM sp_v2_transactions t
            WHERE t.merchant_id = $1 
              AND t.status = 'RECONCILED'
              AND NOT EXISTS (
                SELECT 1 FROM sp_v2_settlement_items si 
                WHERE si.transaction_id = t.transaction_id
              )
          ),
          pending_batches AS (
            SELECT COALESCE(SUM(net_amount_paise), 0) as balance
            FROM sp_v2_settlement_batches
            WHERE merchant_id = $1 AND status IN ('PENDING_APPROVAL', 'APPROVED')
          )
          SELECT (unsettled_txns.balance + pending_batches.balance) as balance
          FROM unsettled_txns, pending_batches
        `,
        // Last settlement
        lastSettlement: `
          SELECT net_amount_paise as amount, status, 
                 COALESCE(settled_at, updated_at) as date
          FROM sp_v2_settlement_batches
          WHERE merchant_id = $1 AND status = 'COMPLETED'
          ORDER BY COALESCE(settled_at, updated_at) DESC LIMIT 1
        `,
        // Next settlement amount (unsettled reconciled transactions)
        nextSettlement: `
          SELECT COALESCE(SUM(t.amount_paise), 0) as amount
          FROM sp_v2_transactions t
          WHERE t.merchant_id = $1 
            AND t.status = 'RECONCILED'
            AND NOT EXISTS (
              SELECT 1 FROM sp_v2_settlement_items si 
              WHERE si.transaction_id = t.transaction_id
            )
        `,
        // Unreconciled amount
        unreconciled: `
          SELECT COALESCE(SUM(gross_amount_paise), 0) as amount
          FROM sp_v2_settlement_batches
          WHERE merchant_id = $1 AND status = 'PENDING_APPROVAL'
        `
      };

      // Get settlement schedule
      const scheduleQuery = `
        SELECT settlement_frequency, settlement_day, settlement_time
        FROM sp_v2_merchant_settlement_config
        WHERE merchant_id = $1 AND is_active = true
      `;

      const [balance, last, next, unrecon, schedule] = await Promise.all([
        pool.query(queries.currentBalance, [merchantId]),
        pool.query(queries.lastSettlement, [merchantId]),
        pool.query(queries.nextSettlement, [merchantId]),
        pool.query(queries.unreconciled, [merchantId]),
        pool.query(scheduleQuery, [merchantId])
      ]);

      // Calculate next settlement due date based on schedule (in IST)
      let nextSettlementDue;
      if (schedule.rows.length > 0) {
        const { settlement_frequency, settlement_time } = schedule.rows[0];
        
        // Get current IST time
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
        const istNow = new Date(now.getTime() + istOffset);
        
        const [hours, minutes] = settlement_time.split(':');
        
        if (settlement_frequency === 'daily') {
          // Create settlement time for today in IST
          const settlementToday = new Date(istNow);
          settlementToday.setUTCHours(parseInt(hours) - 5, parseInt(minutes) - 30, 0, 0); // Convert IST to UTC
          
          if (now > settlementToday) {
            // Settlement time has passed, next is tomorrow
            settlementToday.setDate(settlementToday.getDate() + 1);
          }
          nextSettlementDue = settlementToday.toISOString();
        } else {
          // Default to tomorrow if not daily
          nextSettlementDue = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        }
      } else {
        nextSettlementDue = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }

      return {
        currentBalance: parseInt(balance.rows[0]?.balance || 0),
        lastSettlement: last.rows[0] ? {
          date: last.rows[0].date,
          amount: parseInt(last.rows[0].amount || 0),
          status: last.rows[0].status
        } : null,
        nextSettlementDue,
        nextSettlementAmount: parseInt(next.rows[0]?.amount || 0),
        awaitingBankFile: false,
        pendingHolds: 0,
        unreconciled: parseInt(unrecon.rows[0]?.amount || 0)
      };
    } catch (error) {
      console.error('Dashboard summary error:', error);
      return null;
    }
  },

  // List settlements with pagination and filters
  async listSettlements(merchantId = MERCHANT_ID, { limit = 25, offset = 0, search = '', status = 'all', settlementType = 'all', startDate = null, endDate = null } = {}) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      // Build WHERE clause dynamically
      const conditions = ['merchant_id = $1'];
      const params = [merchantId];
      let paramIndex = 2;

      // Search filter (by settlement ID or UTR)
      if (search && search.trim()) {
        params.push(`%${search.trim()}%`);
        conditions.push(`(id::text ILIKE $${paramIndex} OR bank_reference_number ILIKE $${paramIndex})`);
        paramIndex++;
      }

      // Status filter
      if (status && status !== 'all') {
        params.push(status.toUpperCase());
        conditions.push(`status = $${paramIndex}`);
        paramIndex++;
      }

      // Settlement type filter (instant vs regular)
      if (settlementType && settlementType !== 'all') {
        params.push(settlementType);
        conditions.push(`settlement_type = $${paramIndex}`);
        paramIndex++;
      }

      // Date range filter
      if (startDate) {
        params.push(startDate);
        conditions.push(`created_at >= $${paramIndex}::date`);
        paramIndex++;
      }

      if (endDate) {
        params.push(endDate);
        conditions.push(`created_at < ($${paramIndex}::date + interval '1 day')`);
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      const query = `
        SELECT 
          id, merchant_id, gross_amount_paise, total_commission_paise, total_gst_paise, net_amount_paise,
          status, bank_reference_number as utr, bank_reference_number as rrn, settlement_type, 
          created_at, settled_at, updated_at, total_transactions,
          merchant_name || ' ****1234' as bank_account
        FROM sp_v2_settlement_batches
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const countQuery = `
        SELECT COUNT(*) as total FROM sp_v2_settlement_batches WHERE ${whereClause}
      `;

      const [settlements, count] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery, params.slice(0, -2)) // Exclude limit and offset for count
      ]);

      return {
        settlements: settlements.rows.map(row => ({
          id: row.id,
          type: row.settlement_type || 'regular',
          amount: parseInt(row.net_amount_paise),
          fees: parseInt(row.total_commission_paise),
          tax: parseInt(row.total_gst_paise),
          utr: row.utr || '-',
          rrn: row.rrn || '-',
          status: row.status.toLowerCase(),
          createdAt: row.created_at,
          settledAt: row.settled_at,
          bankAccount: row.bank_account,
          transactionCount: parseInt(row.total_transactions) || 0
        })),
        pagination: {
          limit,
          offset,
          total: parseInt(count.rows[0].total),
          hasNext: offset + limit < parseInt(count.rows[0].total)
        }
      };
    } catch (error) {
      console.error('List settlements error:', error);
      return null;
    }
  },

  async getAvailableBalance(merchantId = MERCHANT_ID) {
    try {
      const unsettledTransactions = await pool.query(`
        SELECT 
          COUNT(*) as total_transactions,
          SUM(amount_paise) as total_amount_paise,
          payment_method,
          COUNT(*) as method_count
        FROM sp_v2_transactions
        WHERE merchant_id = $1
          AND status = 'RECONCILED'
          AND settlement_batch_id IS NULL
        GROUP BY payment_method
      `, [merchantId]);

      const todaySettlements = await pool.query(`
        SELECT 
          COUNT(*) as settlement_count,
          COALESCE(SUM(net_amount_paise), 0) as total_settled_paise
        FROM sp_v2_settlement_batches
        WHERE merchant_id = $1
          AND settlement_type = 'on_demand'
          AND DATE(created_at) = CURRENT_DATE
      `, [merchantId]);

      const merchantConfig = {
        rows: [{
          account_holder_name: 'Demo Merchant Account',
          account_number: 'ACC0010000000000',
          ifsc_code: 'HDFC0001234',
          bank_name: 'HDFC Bank',
          daily_settlement_limit_paise: 50000000,
          minimum_settlement_amount_paise: 10000
        }]
      };

      const totalUnsettled = unsettledTransactions.rows.reduce((sum, row) => 
        sum + (parseInt(row.total_amount_paise) || 0), 0
      );
      
      const breakdown = unsettledTransactions.rows
        .filter(row => row.payment_method)
        .map(row => ({
          method: row.payment_method,
          transactions: parseInt(row.method_count),
          amount: parseFloat((parseInt(row.total_amount_paise) / 100).toFixed(2))
        }));

      const dailyLimit = merchantConfig.rows[0]?.daily_settlement_limit_paise || 50000000;
      const usedToday = parseInt(todaySettlements.rows[0]?.total_settled_paise || 0);
      const remainingToday = Math.max(0, dailyLimit - usedToday);

      return {
        availableBalance: parseFloat((totalUnsettled / 100).toFixed(2)),
        dailyLimit: parseFloat((dailyLimit / 100).toFixed(2)),
        usedToday: parseFloat((usedToday / 100).toFixed(2)),
        remainingToday: parseFloat((remainingToday / 100).toFixed(2)),
        breakdown,
        merchantBankAccount: merchantConfig.rows[0] ? {
          accountNumber: merchantConfig.rows[0].account_number,
          ifscCode: merchantConfig.rows[0].ifsc_code,
          bankName: merchantConfig.rows[0].bank_name,
          accountHolder: merchantConfig.rows[0].account_holder_name,
          minAmount: parseFloat(((merchantConfig.rows[0].minimum_settlement_amount_paise || 10000) / 100).toFixed(2))
        } : null
      };
    } catch (error) {
      console.error('Get available balance error:', error);
      return null;
    }
  },

  // Get settlement by ID
  async getSettlementById(settlementId, merchantId = MERCHANT_ID) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      const query = `
        SELECT * FROM settlements 
        WHERE id = $1 AND merchant_id = $2
      `;
      const result = await pool.query(query, [settlementId, merchantId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        type: row.settlement_type || 'regular',
        amount: parseInt(row.net_paise),
        fees: parseInt(row.fees_paise),
        tax: parseInt(row.taxes_paise),
        grossAmount: parseInt(row.gross_paise),
        utr: row.utr,
        rrn: row.rrn,
        status: row.status.toLowerCase(),
        createdAt: row.created_at,
        settledAt: row.settled_at
      };
    } catch (error) {
      console.error('Get settlement error:', error);
      return null;
    }
  },

  // Create instant settlement
  async createInstantSettlement(merchantId = MERCHANT_ID, { amount, bankAccountId }) {
    console.log('[createInstantSettlement] Called with:', { merchantId, amount, USE_DB, hasPool: !!pool });
    if (!USE_DB || !pool) {
      console.log('[createInstantSettlement] Returning null - USE_DB:', USE_DB, 'pool:', !!pool);
      return null;
    }

    const client = await pool.connect();
    try {
      console.log('[createInstantSettlement] Starting transaction');
      await client.query('BEGIN');

      console.log('[createInstantSettlement] Setting up bank account');
      const bankAccount = {
        merchant_id: merchantId,
        merchant_name: 'Test Merchant 1',
        account_holder_name: 'Demo Merchant Account',
        account_number: 'ACC0010000000000',
        ifsc_code: 'HDFC0001234',
        bank_name: 'HDFC Bank',
        preferred_transfer_mode: 'IMPS'
      };

      // 2. Calculate fees (1.2% for instant settlement)
      console.log('[createInstantSettlement] Calculating fees');
      const grossPaise = amount * 100;
      const feesPaise = Math.floor(grossPaise * 0.012);
      const taxesPaise = Math.floor(feesPaise * 0.18);
      const netPaise = grossPaise - feesPaise - taxesPaise;

      const settlementId = require('crypto').randomUUID();
      console.log('[createInstantSettlement] Generated settlement ID:', settlementId);

      // 3. Create settlement batch in sp_v2_settlement_batches
      console.log('[createInstantSettlement] Creating settlement batch');
      const batchResult = await client.query(`
        INSERT INTO sp_v2_settlement_batches (
          id, merchant_id, merchant_name, cycle_date,
          total_transactions, gross_amount_paise, total_commission_paise, 
          total_gst_paise, net_amount_paise, status, settlement_type,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, CURRENT_DATE, 1, $4, $5, $6, $7, 'PENDING', 'on_demand', NOW(), NOW()
        ) RETURNING *
      `, [settlementId, merchantId, bankAccount.merchant_name, grossPaise, feesPaise, taxesPaise, netPaise]);

      console.log('[createInstantSettlement] Settlement batch created, rows:', batchResult.rows.length);
      const batch = batchResult.rows[0];
      console.log('[createInstantSettlement] Batch:', batch);

      // 4. Queue bank transfer with real merchant account details
      await client.query(`
        INSERT INTO sp_v2_bank_transfer_queue (
          batch_id, transfer_mode, amount_paise, 
          beneficiary_name, account_number, ifsc_code, bank_name, 
          status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, 'queued', NOW(), NOW()
        )
      `, [
        settlementId,
        bankAccount.preferred_transfer_mode || 'IMPS',
        netPaise,
        bankAccount.account_holder_name,
        bankAccount.account_number,
        bankAccount.ifsc_code,
        bankAccount.bank_name
      ]);

      await client.query('COMMIT');

      // 5. Return settlement (scheduler will process and assign real UTR)
      return {
        id: batch.id,
        type: 'on_demand',
        amount: parseInt(batch.net_amount_paise),
        fees: parseInt(batch.total_commission_paise),
        tax: parseInt(batch.total_gst_paise),
        grossAmount: parseInt(batch.gross_amount_paise),
        utr: 'PENDING', // Will be assigned by banking scheduler
        status: 'processing',
        createdAt: batch.created_at,
        settledAt: null
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[createInstantSettlement] ERROR:', error.message);
      console.error('[createInstantSettlement] Full error:', error);
      return null;
    } finally {
      client.release();
    }
  },

  // Get settlement timeline events
  async listTimelineEvents(settlementId) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      const query = `
        SELECT 
          event_type, reason, detail, occurred_at, meta
        FROM settlement_timeline_events
        WHERE settlement_id = $1
        ORDER BY occurred_at ASC
      `;

      const result = await pool.query(query, [settlementId]);

      return result.rows.map(row => ({
        type: row.event_type,
        reason: row.reason,
        detail: row.detail,
        at: row.occurred_at,
        meta: row.meta
      }));
    } catch (error) {
      console.error('List timeline events error:', error);
      return null;
    }
  },

  // Get settlement trend for analytics
  async getSettlementTrend(merchantId = MERCHANT_ID, days = 30) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      const query = `
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count,
          SUM(gross_paise) as amount,
          SUM(fees_paise) as fees
        FROM settlements
        WHERE merchant_id = $1 
          AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `;

      const result = await pool.query(query, [merchantId]);

      return result.rows.map(row => ({
        date: row.date,
        amount: parseInt(row.amount || 0),
        count: parseInt(row.count || 0),
        fees: parseInt(row.fees || 0)
      }));
    } catch (error) {
      console.error('Get settlement trend error:', error);
      return null;
    }
  },

  // Get fees breakdown
  async getFeesBreakdown(merchantId = MERCHANT_ID) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      const query = `
        SELECT 
          SUM(fees_paise) as commission,
          SUM(taxes_paise) as gst,
          SUM(fees_paise) * 0.01 as tds
        FROM settlements
        WHERE merchant_id = $1 
          AND created_at >= CURRENT_DATE - INTERVAL '30 days'
      `;

      const result = await pool.query(query, [merchantId]);
      const row = result.rows[0];

      return {
        breakdown: {
          commission: { rate: 0.021, amount: parseInt(row.commission || 0) },
          gst: { rate: 0.18, amount: parseInt(row.gst || 0) },
          tds: { rate: 0.01, amount: parseInt(row.tds || 0) }
        },
        total: parseInt(row.commission || 0) + parseInt(row.gst || 0) + parseInt(row.tds || 0)
      };
    } catch (error) {
      console.error('Get fees breakdown error:', error);
      return null;
    }
  },

  // List transactions for a settlement
  async listSettlementTransactions(settlementId) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      const query = `
        SELECT 
          t.transaction_id,
          t.transaction_timestamp,
          t.amount_paise,
          si.commission_paise,
          si.gst_paise,
          si.net_paise,
          t.payment_method,
          si.fee_bearer,
          t.status,
          t.settled_at,
          si.net_paise as settlement_amount_paise,
          si.reserve_paise,
          t.utr,
          t.rrn,
          si.commission_rate,
          t.acquirer_code
        FROM sp_v2_settlement_items si
        INNER JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id
        WHERE si.settlement_batch_id = $1::uuid
        ORDER BY t.transaction_timestamp DESC
      `;

      const result = await pool.query(query, [settlementId]);

      return result.rows.map(row => ({
        transaction_id: row.transaction_id,
        transaction_timestamp: row.transaction_timestamp,
        amount_paise: parseInt(row.amount_paise || 0),
        commission_paise: parseInt(row.commission_paise || 0),
        commission_rate: row.commission_rate || '0.00',
        gst_paise: parseInt(row.gst_paise || 0),
        net_paise: parseInt(row.net_paise || 0),
        reserve_paise: parseInt(row.reserve_paise || 0),
        settlement_amount_paise: parseInt(row.settlement_amount_paise || 0),
        payment_method: row.payment_method,
        fee_bearer: row.fee_bearer || 'MERCHANT',
        status: row.status,
        settled_at: row.settled_at,
        utr: row.utr,
        rrn: row.rrn,
        acquirer_code: row.acquirer_code
      }));
    } catch (error) {
      console.error('List settlement transactions error:', error);
      return null;
    }
  }
};

module.exports = db;