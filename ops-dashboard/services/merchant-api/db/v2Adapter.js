const { Pool } = require('pg');
require('dotenv').config();

// Environment variables
const USE_DB = process.env.USE_DB === 'true';
const PG_URL = process.env.PG_URL || 'postgresql://postgres:postgres@localhost:5432/settlepaisa_v2';
const DEFAULT_MERCHANT_ID = process.env.DEFAULT_MERCHANT_ID || '11111111-1111-1111-1111-111111111111';

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
      console.error('❌ V2 Database connection failed:', err.message);
      console.log('📋 Falling back to mock data mode');
    } else {
      console.log('✅ V2 Database connected:', res.rows[0].now);
    }
  });
}

// V2 Database adapter functions
const v2Adapter = {
  // Get merchant dashboard summary
  async getMerchantSummary(merchantId = DEFAULT_MERCHANT_ID) {
    if (!USE_DB || !pool) {
      return null; // Fall back to mock data
    }

    try {
      const query = `
        WITH last_settlement AS (
          SELECT id, settlement_completed_at, net_amount_paise, status
          FROM sp_v2_settlement_batches
          WHERE merchant_id = $1 AND status = 'SETTLED'
          ORDER BY settlement_completed_at DESC LIMIT 1
        ),
        pending AS (
          SELECT COALESCE(SUM(net_amount_paise), 0) AS pending_amount
          FROM sp_v2_settlement_batches
          WHERE merchant_id = $1 AND status IN ('PROCESSING', 'APPROVED')
        ),
        unreconciled AS (
          SELECT COALESCE(SUM(amount_paise), 0) AS unreconciled
          FROM sp_v2_transactions
          WHERE merchant_id = $1 AND status = 'UNMATCHED'
        ),
        holds AS (
          SELECT COALESCE(SUM(reserve_amount_paise - released_amount_paise), 0) AS holds
          FROM sp_v2_rolling_reserve_ledger
          WHERE merchant_id = $1 AND status = 'HELD'
        )
        SELECT
          pending.pending_amount AS current_balance_paise,
          ls.settlement_completed_at AS last_settlement_at,
          ls.net_amount_paise AS last_settlement_amount,
          ls.status AS last_settlement_status,
          unreconciled.unreconciled,
          holds.holds
        FROM last_settlement ls, pending, unreconciled, holds;
      `;
      
      const result = await pool.query(query, [merchantId]);
      const row = result.rows[0];
      
      return {
        currentBalance: parseInt(row?.current_balance_paise || 0),
        lastSettlement: row?.last_settlement_amount ? {
          date: row.last_settlement_at,
          amount: parseInt(row.last_settlement_amount),
          status: row.last_settlement_status
        } : null,
        unreconciled: parseInt(row?.unreconciled || 0),
        holds: parseInt(row?.holds || 0)
      };
    } catch (error) {
      console.error('❌ getMerchantSummary error:', error);
      return null;
    }
  },

  // Get next settlement ETA
  async getNextSettlementETA(merchantId = DEFAULT_MERCHANT_ID) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      const query = `
        SELECT settlement_frequency, settlement_day, settlement_time,
               preferred_transfer_mode
        FROM sp_v2_merchant_settlement_config
        WHERE merchant_id = $1;
      `;
      
      const result = await pool.query(query, [merchantId]);
      const config = result.rows[0];
      
      if (!config) {
        return null;
      }
      
      // Calculate next settlement date based on frequency
      const now = new Date();
      let nextSettlement = new Date();
      
      if (config.settlement_frequency === 'daily') {
        nextSettlement.setDate(now.getDate() + 1);
      } else if (config.settlement_frequency === 'weekly') {
        const daysUntilNext = (config.settlement_day - now.getDay() + 7) % 7;
        nextSettlement.setDate(now.getDate() + daysUntilNext);
      }
      
      // Set time
      const [hours, minutes] = config.settlement_time.split(':');
      nextSettlement.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      return {
        nextSettlementDue: nextSettlement.toISOString(),
        transferMode: config.preferred_transfer_mode,
        frequency: config.settlement_frequency,
        cutoffTime: config.settlement_time
      };
    } catch (error) {
      console.error('❌ getNextSettlementETA error:', error);
      return null;
    }
  },

  // List settlements with pagination
  async listSettlements(merchantId = DEFAULT_MERCHANT_ID, { limit = 25, offset = 0 } = {}) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      const query = `
        SELECT 
          b.id, 
          CASE 
            WHEN b.id LIKE '%instant%' THEN 'instant'
            ELSE 'regular'
          END as type,
          b.created_at, 
          b.status, 
          b.net_amount_paise,
          b.total_commission_paise as fees_paise,
          b.total_gst_paise as taxes_paise,
          b.cycle_date,
          b.bank_reference_number as utr,
          b.settlement_completed_at as settled_at,
          t.utr_number as bank_utr,
          t.status AS bank_status,
          msc.account_holder_name,
          msc.bank_name,
          RIGHT(msc.account_number, 4) as account_last_four
        FROM sp_v2_settlement_batches b
        LEFT JOIN sp_v2_bank_transfer_queue t ON t.batch_id = b.id
        LEFT JOIN sp_v2_merchant_settlement_config msc ON msc.merchant_id = b.merchant_id
        WHERE b.merchant_id = $1
        ORDER BY b.created_at DESC
        LIMIT $2 OFFSET $3;
      `;

      const countQuery = `
        SELECT COUNT(*) as total 
        FROM sp_v2_settlement_batches 
        WHERE merchant_id = $1;
      `;

      const [settlements, count] = await Promise.all([
        pool.query(query, [merchantId, limit, offset]),
        pool.query(countQuery, [merchantId])
      ]);

      return {
        settlements: settlements.rows.map(row => ({
          id: row.id,
          type: row.type,
          amount: parseInt(row.net_amount_paise),
          fees: parseInt(row.fees_paise || 0),
          tax: parseInt(row.taxes_paise || 0),
          utr: row.bank_utr || row.utr || '-',
          rrn: row.bank_utr || '-',
          status: row.status.toLowerCase(),
          createdAt: row.created_at,
          settledAt: row.settled_at,
          bankAccount: row.bank_name ? `${row.bank_name} ****${row.account_last_four}` : 'Default Account',
          transactionCount: Math.floor(parseInt(row.net_amount_paise) / 250000) // Estimate
        })),
        pagination: {
          limit,
          offset,
          total: parseInt(count.rows[0].total),
          hasNext: offset + limit < parseInt(count.rows[0].total)
        }
      };
    } catch (error) {
      console.error('❌ listSettlements error:', error);
      return null;
    }
  },

  // Get settlement timeline events
  async getSettlementTimeline(settlementId) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      // First check if settlement exists and get its status
      const settlementQuery = `
        SELECT status FROM sp_v2_settlement_batches WHERE id = $1;
      `;
      const settlementResult = await pool.query(settlementQuery, [settlementId]);
      
      if (settlementResult.rows.length === 0) {
        return null;
      }
      
      const settlementStatus = settlementResult.rows[0].status;
      
      // Get timeline events (if they exist)
      const timelineQuery = `
        SELECT event_type, reason, detail, occurred_at, meta
        FROM sp_v2_settlement_timeline_events
        WHERE settlement_id = $1
        ORDER BY occurred_at ASC;
      `;
      
      const timelineResult = await pool.query(timelineQuery, [settlementId]);
      
      if (timelineResult.rows.length > 0) {
        return timelineResult.rows.map(row => ({
          type: row.event_type,
          reason: row.reason,
          detail: row.detail,
          at: row.occurred_at,
          meta: row.meta
        }));
      }
      
      // Synthesize timeline from settlement and transfer status
      const transferQuery = `
        SELECT status, queued_at, sent_at, completed_at, utr_number
        FROM sp_v2_bank_transfer_queue
        WHERE batch_id = $1;
      `;
      
      const transferResult = await pool.query(transferQuery, [settlementId]);
      const transfer = transferResult.rows[0];
      
      const timeline = [];
      const baseTime = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 hours ago
      
      // Always show INITIATED
      timeline.push({
        type: 'INITIATED',
        at: new Date(baseTime.getTime()).toISOString(),
        detail: 'Settlement request initiated'
      });
      
      // BATCHED
      timeline.push({
        type: 'BATCHED',
        at: new Date(baseTime.getTime() + 60 * 1000).toISOString(),
        detail: 'Added to settlement batch'
      });
      
      if (settlementStatus === 'PROCESSING') {
        // For processing settlements, stop at BANK_FILE_AWAITED
        timeline.push({
          type: 'BANK_FILE_AWAITED',
          reason: 'AWAITING_BANK_FILE',
          at: new Date(baseTime.getTime() + 2 * 60 * 1000).toISOString(),
          detail: 'Awaiting confirmation from the bank',
          meta: {
            expectedByIST: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            bank: 'HDFC Bank'
          }
        });
      } else if (settlementStatus === 'SETTLED') {
        // For completed settlements, show full timeline
        timeline.push({
          type: 'BANK_FILE_RECEIVED',
          at: new Date(baseTime.getTime() + 3 * 60 * 1000).toISOString(),
          detail: 'Bank confirmation file received'
        });
        
        timeline.push({
          type: 'UTR_ASSIGNED',
          at: new Date(baseTime.getTime() + 4 * 60 * 1000).toISOString(),
          detail: `Bank UTR: ${transfer?.utr_number || 'HDFC24091501234567'}`
        });
        
        timeline.push({
          type: 'SETTLED',
          at: new Date(baseTime.getTime() + 5 * 60 * 1000).toISOString(),
          detail: 'Amount credited to bank account'
        });
      }
      
      return timeline;
    } catch (error) {
      console.error('❌ getSettlementTimeline error:', error);
      return null;
    }
  },

  // Create instant settlement
  async createInstantSettlement(merchantId = DEFAULT_MERCHANT_ID, { amount, bankAccountId }) {
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

      // Generate UTR and settlement ID
      const utr = 'INST' + Date.now().toString().slice(-10);
      const { v4: uuidv4 } = require('uuid');
      const settlementId = uuidv4();

      // Insert settlement batch
      const insertQuery = `
        INSERT INTO sp_v2_settlement_batches (
          id, merchant_id, cycle_date, gross_amount_paise, 
          total_commission_paise, total_gst_paise, net_amount_paise,
          status, bank_reference_number, created_at, settlement_completed_at
        ) VALUES (
          $1, $2, CURRENT_DATE, $3, $4, $5, $6, 'SETTLED', $7, NOW(), NOW()
        ) RETURNING *;
      `;

      const result = await client.query(insertQuery, [
        settlementId, merchantId, grossPaise, feesPaise, taxesPaise, netPaise, utr
      ]);

      // Insert bank transfer
      const transferQuery = `
        INSERT INTO sp_v2_bank_transfer_queue (
          id, batch_id, transfer_mode, amount_paise, status, 
          utr_number, queued_at, sent_at, completed_at
        ) VALUES (
          gen_random_uuid(), $1, 'IMPS', $2, 'completed', $3, NOW(), NOW(), NOW()
        );
      `;

      await client.query(transferQuery, [settlementId, netPaise, utr]);

      // Add timeline events
      const timelineEvents = [
        { type: 'INITIATED', detail: 'Instant settlement request initiated' },
        { type: 'UTR_ASSIGNED', detail: `Instant UTR: ${utr}` },
        { type: 'SETTLED', detail: 'Amount instantly credited to bank account' }
      ];

      for (let i = 0; i < timelineEvents.length; i++) {
        const event = timelineEvents[i];
        await client.query(
          `INSERT INTO sp_v2_settlement_timeline_events (settlement_id, event_type, occurred_at, detail)
           VALUES ($1, $2, NOW() + INTERVAL '${i} seconds', $3)`,
          [settlementId, event.type, event.detail]
        );
      }

      await client.query('COMMIT');

      const settlement = result.rows[0];
      return {
        id: settlement.id,
        type: 'instant',
        amount: parseInt(settlement.net_amount_paise),
        fees: parseInt(settlement.total_commission_paise),
        tax: parseInt(settlement.total_gst_paise),
        grossAmount: parseInt(settlement.gross_amount_paise),
        utr: utr,
        status: 'completed',
        createdAt: settlement.created_at,
        settledAt: settlement.settlement_completed_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ createInstantSettlement error:', error);
      throw error;
    } finally {
      client.release();
    }
  },

  // Get settlement schedule
  async getSettlementSchedule(merchantId = DEFAULT_MERCHANT_ID) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      const query = `
        SELECT settlement_frequency, settlement_day, settlement_time,
               auto_settle, min_settlement_amount_paise,
               preferred_transfer_mode, updated_at
        FROM sp_v2_merchant_settlement_config
        WHERE merchant_id = $1;
      `;
      
      const result = await pool.query(query, [merchantId]);
      const config = result.rows[0];
      
      if (!config) {
        return null;
      }
      
      // Convert to API format
      const tPlusDays = config.settlement_frequency === 'daily' ? 1 : 7;
      const [hours, minutes] = config.settlement_time.split(':');
      const cutoffMinutesIST = parseInt(hours) * 60 + parseInt(minutes);
      
      return {
        tPlusDays,
        cutoffMinutesIST,
        effectiveFrom: new Date().toISOString().split('T')[0],
        lastChangedAt: config.updated_at
      };
    } catch (error) {
      console.error('❌ getSettlementSchedule error:', error);
      return null;
    }
  },

  // Update settlement schedule
  async updateSettlementSchedule(merchantId = DEFAULT_MERCHANT_ID, { tPlusDays, cutoffMinutesIST, effectiveFrom }) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      const frequency = tPlusDays === 1 ? 'daily' : 'weekly';
      const hours = Math.floor(cutoffMinutesIST / 60);
      const minutes = cutoffMinutesIST % 60;
      const settlementTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
      
      const query = `
        UPDATE sp_v2_merchant_settlement_config 
        SET settlement_frequency = $1, settlement_time = $2, updated_at = NOW()
        WHERE merchant_id = $3
        RETURNING *;
      `;
      
      const result = await pool.query(query, [frequency, settlementTime, merchantId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return {
        accepted: true,
        appliedFrom: effectiveFrom || new Date().toISOString().split('T')[0],
        schedule: {
          tPlusDays,
          cutoffMinutesIST,
          effectiveFrom: effectiveFrom || new Date().toISOString().split('T')[0],
          lastChangedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('❌ updateSettlementSchedule error:', error);
      return null;
    }
  },

  // Get insights/analytics
  async getInsights(merchantId = DEFAULT_MERCHANT_ID, days = 30) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      const query = `
        SELECT 
          cycle_date as date,
          COUNT(*) as count,
          SUM(gross_amount_paise) as amount,
          SUM(total_commission_paise) as fees
        FROM sp_v2_settlement_batches
        WHERE merchant_id = $1 
          AND cycle_date >= CURRENT_DATE - INTERVAL '${days} days'
        GROUP BY cycle_date
        ORDER BY cycle_date DESC;
      `;

      const result = await pool.query(query, [merchantId]);

      return {
        trend: result.rows.map(row => ({
          date: row.date,
          amount: parseInt(row.amount || 0),
          count: parseInt(row.count || 0),
          fees: parseInt(row.fees || 0)
        }))
      };
    } catch (error) {
      console.error('❌ getInsights error:', error);
      return null;
    }
  }
};

module.exports = v2Adapter;