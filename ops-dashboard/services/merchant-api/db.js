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
        // Current balance (sum of unsettled net amounts)
        currentBalance: `
          SELECT COALESCE(SUM(net_paise), 0) as balance
          FROM settlements
          WHERE merchant_id = $1 AND status IN ('PENDING', 'PROCESSING')
        `,
        // Last settlement
        lastSettlement: `
          SELECT amount, status, settled_at as date
          FROM settlements
          WHERE merchant_id = $1 AND status = 'COMPLETED'
          ORDER BY settled_at DESC LIMIT 1
        `,
        // Next settlement amount
        nextSettlement: `
          SELECT COALESCE(SUM(net_paise), 0) as amount, 
                 MIN(created_at) as due_date
          FROM settlements
          WHERE merchant_id = $1 AND status = 'PROCESSING'
        `,
        // Unreconciled amount
        unreconciled: `
          SELECT COALESCE(SUM(gross_paise), 0) as amount
          FROM settlements
          WHERE merchant_id = $1 AND status = 'PENDING'
        `
      };

      const [balance, last, next, unrecon] = await Promise.all([
        pool.query(queries.currentBalance, [merchantId]),
        pool.query(queries.lastSettlement, [merchantId]),
        pool.query(queries.nextSettlement, [merchantId]),
        pool.query(queries.unreconciled, [merchantId])
      ]);

      return {
        currentBalance: parseInt(balance.rows[0]?.balance || 0),
        lastSettlement: last.rows[0] ? {
          date: last.rows[0].date,
          amount: parseInt(last.rows[0].amount || 0),
          status: last.rows[0].status
        } : null,
        nextSettlementDue: next.rows[0]?.due_date || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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
          id, merchant_id, gross_paise, fees_paise, taxes_paise, net_paise,
          status, utr, rrn, settlement_type, created_at, settled_at, updated_at,
          CASE 
            WHEN ba.bank_name IS NOT NULL THEN ba.bank_name || ' ****' || RIGHT(ba.account_number, 4)
            ELSE 'Default Account'
          END as bank_account
        FROM settlements s
        LEFT JOIN merchant_bank_accounts ba ON ba.merchant_id = s.merchant_id AND ba.is_primary = true
        WHERE s.merchant_id = $1
        ORDER BY s.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const countQuery = `
        SELECT COUNT(*) as total FROM settlements WHERE merchant_id = $1
      `;

      const [settlements, count] = await Promise.all([
        pool.query(query, [merchantId, limit, offset]),
        pool.query(countQuery, [merchantId])
      ]);

      return {
        settlements: settlements.rows.map(row => ({
          id: row.id,
          type: row.settlement_type || 'regular',
          amount: parseInt(row.net_paise),
          fees: parseInt(row.fees_paise),
          tax: parseInt(row.taxes_paise),
          utr: row.utr || '-',
          rrn: row.rrn || '-',
          status: row.status.toLowerCase(),
          createdAt: row.created_at,
          settledAt: row.settled_at,
          bankAccount: row.bank_account,
          transactionCount: Math.floor(parseInt(row.gross_paise) / 250000) // Estimate
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
  }
};

module.exports = db;