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

  // List settlements with pagination
  async listSettlements(merchantId = MERCHANT_ID, { limit = 25, offset = 0 } = {}) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      const query = `
        SELECT 
          id, merchant_id, gross_amount_paise, total_commission_paise, total_gst_paise, net_amount_paise,
          status, bank_reference_number as utr, bank_reference_number as rrn, 'regular' as settlement_type, 
          created_at, settled_at, updated_at, total_transactions,
          merchant_name || ' ****1234' as bank_account
        FROM sp_v2_settlement_batches
        WHERE merchant_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const countQuery = `
        SELECT COUNT(*) as total FROM sp_v2_settlement_batches WHERE merchant_id = $1
      `;

      const [settlements, count] = await Promise.all([
        pool.query(query, [merchantId, limit, offset]),
        pool.query(countQuery, [merchantId])
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
    if (!USE_DB || !pool) {
      return null;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Calculate fees (1.2% for instant settlement)
      const grossPaise = amount * 100; // Convert to paise
      const feesPaise = Math.floor(grossPaise * 0.012);
      const taxesPaise = Math.floor(feesPaise * 0.18); // 18% GST
      const netPaise = grossPaise - feesPaise - taxesPaise;

      // Generate UTR
      const utr = 'INST' + Date.now().toString().slice(-10);
      const settlementId = require('crypto').randomUUID();

      // Insert settlement
      const insertQuery = `
        INSERT INTO settlements (
          id, merchant_id, gross_paise, fees_paise, taxes_paise, net_paise,
          status, utr, settlement_type, created_at, settled_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'COMPLETED', $7, 'instant', NOW(), NOW(), NOW()
        ) RETURNING *
      `;

      const result = await client.query(insertQuery, [
        settlementId, merchantId, grossPaise, feesPaise, taxesPaise, netPaise, utr
      ]);

      // Add timeline events
      const timelineEvents = [
        { type: 'INITIATED', detail: 'Instant settlement request initiated' },
        { type: 'UTR_ASSIGNED', detail: `Instant UTR: ${utr}` },
        { type: 'SETTLED', detail: 'Amount instantly credited to bank account' }
      ];

      for (const event of timelineEvents) {
        await client.query(
          `INSERT INTO settlement_timeline_events (settlement_id, event_type, occurred_at, detail)
           VALUES ($1, $2, NOW(), $3)`,
          [settlementId, event.type, event.detail]
        );
      }

      await client.query('COMMIT');

      const settlement = result.rows[0];
      return {
        id: settlement.id,
        type: 'instant',
        amount: parseInt(settlement.net_paise),
        fees: parseInt(settlement.fees_paise),
        tax: parseInt(settlement.taxes_paise),
        grossAmount: parseInt(settlement.gross_paise),
        utr: settlement.utr,
        status: 'completed',
        createdAt: settlement.created_at,
        settledAt: settlement.settled_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create instant settlement error:', error);
      throw error;
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