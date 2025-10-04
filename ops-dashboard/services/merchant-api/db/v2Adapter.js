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
            WHEN b.id::text LIKE '%instant%' THEN 'instant'
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
      console.log('🔍 Reconstructing timeline for settlement:', settlementId);

      // Get settlement batch data with all relevant timestamps
      const batchQuery = `
        SELECT 
          id, created_at, updated_at, approved_at, settlement_completed_at, settled_at,
          status, approval_status, transfer_status, bank_reference_number,
          merchant_name, net_amount_paise, total_transactions
        FROM sp_v2_settlement_batches
        WHERE id = $1;
      `;

      const batchResult = await pool.query(batchQuery, [settlementId]);
      
      if (batchResult.rows.length === 0) {
        console.log('❌ No settlement batch found for ID:', settlementId);
        return null;
      }

      const batch = batchResult.rows[0];
      console.log('✅ Found settlement batch:', {
        status: batch.status,
        created_at: batch.created_at,
        approved_at: batch.approved_at,
        settlement_completed_at: batch.settlement_completed_at,
        settled_at: batch.settled_at
      });

      const timeline = [];

      // 1. INITIATED - Always present when settlement is created
      timeline.push({
        type: 'INITIATED',
        at: batch.created_at,
        detail: 'Settlement request initiated'
      });

      // 2. BATCHED - When transactions are grouped for processing
      if (batch.approved_at || batch.status !== 'DRAFT') {
        timeline.push({
          type: 'BATCHED', 
          at: batch.approved_at || new Date(new Date(batch.created_at).getTime() + 30000), // +30 seconds if no approval timestamp
          detail: 'Added to settlement batch'
        });
      }

      // 3. Check for bank transfers to determine file dispatch status
      const transferQuery = `
        SELECT created_at, status, utr_number, failure_reason
        FROM sp_v2_settlement_bank_transfers 
        WHERE settlement_batch_id = $1
        ORDER BY created_at ASC
        LIMIT 1;
      `;
      
      const transferResult = await pool.query(transferQuery, [settlementId]);
      
      if (transferResult.rows.length > 0) {
        const transfer = transferResult.rows[0];
        
        timeline.push({
          type: 'FILE_DISPATCHED',
          at: transfer.created_at,
          detail: 'Payment file sent to bank'
        });

        if (transfer.utr_number) {
          timeline.push({
            type: 'UTR_ASSIGNED',
            at: transfer.created_at,
            detail: 'UTR assigned by bank',
            meta: { utr: transfer.utr_number }
          });
        }

        if (transfer.status === 'FAILED' && transfer.failure_reason) {
          timeline.push({
            type: 'FAILED',
            at: transfer.created_at,
            detail: transfer.failure_reason
          });
        }
      } else {
        // No bank transfer record, determine state from batch status
        if (batch.status === 'PROCESSING') {
          timeline.push({
            type: 'BANK_FILE_AWAITED',
            reason: 'AWAITING_BANK_FILE',
            at: new Date(new Date(batch.created_at).getTime() + 60000), // +1 minute
            detail: 'Awaiting confirmation from the bank',
            meta: {
              expectedByIST: new Date(new Date(batch.created_at).getTime() + 24 * 60 * 60 * 1000).toISOString(),
              bank: 'HDFC Bank'
            }
          });
        }
      }

      // 4. Check for approval events
      const approvalQuery = `
        SELECT decision_at, decision, approver_name, rejection_reason
        FROM sp_v2_settlement_approvals 
        WHERE batch_id = $1
        ORDER BY decision_at ASC;
      `;
      
      const approvalResult = await pool.query(approvalQuery, [settlementId]);
      
      for (const approval of approvalResult.rows) {
        if (approval.decision === 'APPROVED') {
          timeline.push({
            type: 'APPROVED',
            at: approval.decision_at,
            detail: `Approved by ${approval.approver_name}`
          });
        } else if (approval.decision === 'REJECTED') {
          timeline.push({
            type: 'FAILED',
            at: approval.decision_at,
            detail: approval.rejection_reason || 'Settlement rejected'
          });
        }
      }

      // 5. RECONCILED - When settlement is processed
      if (batch.settlement_completed_at) {
        timeline.push({
          type: 'RECONCILED',
          at: batch.settlement_completed_at,
          detail: 'Settlement reconciled with bank'
        });
      }

      // 6. SETTLED - Final completion
      if (batch.settled_at) {
        timeline.push({
          type: 'SETTLED',
          at: batch.settled_at,
          detail: 'Settlement completed successfully'
        });
      }

      // 7. Check for any errors
      const errorQuery = `
        SELECT created_at, error_message, error_type, is_resolved, resolved_at
        FROM sp_v2_settlement_errors 
        WHERE batch_id = $1
        ORDER BY created_at ASC;
      `;
      
      const errorResult = await pool.query(errorQuery, [settlementId]);
      
      for (const error of errorResult.rows) {
        timeline.push({
          type: error.is_resolved ? 'RESOLVED' : 'FAILED',
          at: error.is_resolved ? error.resolved_at : error.created_at,
          detail: error.error_message || `${error.error_type} error occurred`
        });
      }

      // Sort timeline by timestamp
      timeline.sort((a, b) => new Date(a.at) - new Date(b.at));

      console.log('✅ Reconstructed timeline with', timeline.length, 'events');
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
  },

  // Get settlement transactions with financial breakdown
  async getSettlementTransactions(settlementId) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      const query = `
        SELECT 
          t.transaction_id,
          t.amount_paise,
          t.payment_method,
          t.status,
          t.transaction_timestamp,
          t.settled_at,
          t.source_type,
          t.gateway_ref,
          t.utr,
          t.rrn,
          t.acquirer_code,
          t.bank_fee_paise,
          t.settlement_amount_paise,
          t.exception_reason,
          si.commission_paise,
          si.gst_paise,
          si.reserve_paise,
          si.net_paise,
          si.fee_bearer,
          si.commission_type,
          si.commission_rate
        FROM sp_v2_transactions t
        LEFT JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
        WHERE t.settlement_batch_id = $1
        ORDER BY t.transaction_timestamp DESC;
      `;

      const result = await pool.query(query, [settlementId]);

      return result.rows.map(row => ({
        transaction_id: row.transaction_id,
        amount_paise: parseInt(row.amount_paise || 0),
        payment_method: row.payment_method,
        status: row.status,
        transaction_timestamp: row.transaction_timestamp,
        settled_at: row.settled_at,
        source_type: row.source_type,
        gateway_ref: row.gateway_ref,
        utr: row.utr,
        rrn: row.rrn,
        acquirer_code: row.acquirer_code,
        bank_fee_paise: parseInt(row.bank_fee_paise || 0),
        settlement_amount_paise: parseInt(row.settlement_amount_paise || 0),
        exception_reason: row.exception_reason,
        // Settlement items (financial breakdown)
        commission_paise: parseInt(row.commission_paise || 0),
        gst_paise: parseInt(row.gst_paise || 0),
        reserve_paise: parseInt(row.reserve_paise || 0),
        net_paise: parseInt(row.net_paise || 0),
        fee_bearer: row.fee_bearer,
        commission_type: row.commission_type,
        commission_rate: parseFloat(row.commission_rate || 0)
      }));
    } catch (error) {
      console.error('❌ getSettlementTransactions error:', error);
      return null;
    }
  },

  // Settlement Schedule Management
  async getSettlementSchedule(merchantId) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      console.log('🔍 Getting settlement schedule for merchant:', merchantId);

      const query = `
        SELECT 
          settlement_time,
          settlement_frequency,
          auto_settle,
          min_settlement_amount_paise,
          updated_at
        FROM sp_v2_merchant_settlement_config
        WHERE merchant_id = $1 AND is_active = true
        LIMIT 1;
      `;

      const result = await pool.query(query, [merchantId]);
      
      if (result.rows.length === 0) {
        console.log('❌ No settlement config found for merchant:', merchantId);
        return null;
      }

      const config = result.rows[0];
      
      // Convert settlement_time (HH:MM:SS) to minutes from start of day in IST
      const timeParts = config.settlement_time.split(':');
      const cutoffMinutesIST = (parseInt(timeParts[0]) * 60) + parseInt(timeParts[1]);
      
      // Convert to frontend format
      const schedule = {
        tPlusDays: 1, // Default T+1 for daily settlements
        cutoffMinutesIST: cutoffMinutesIST,
        effectiveFrom: new Date().toISOString().split('T')[0],
        lastChangedAt: config.updated_at ? config.updated_at.toISOString() : new Date().toISOString()
      };

      console.log('✅ Settlement schedule retrieved:', schedule);
      return schedule;

    } catch (error) {
      console.error('❌ getSettlementSchedule error:', error);
      return null;
    }
  },

  async updateSettlementSchedule(merchantId, scheduleData) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      console.log('🔧 Updating settlement schedule for merchant:', merchantId, scheduleData);

      const { tPlusDays, cutoffMinutesIST, effectiveFrom } = scheduleData;
      
      // Convert cutoffMinutesIST back to time format (HH:MM:SS)
      const hours = Math.floor(cutoffMinutesIST / 60);
      const minutes = cutoffMinutesIST % 60;
      const settlementTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

      const updateQuery = `
        UPDATE sp_v2_merchant_settlement_config
        SET 
          settlement_time = $2,
          updated_at = NOW()
        WHERE merchant_id = $1 AND is_active = true
        RETURNING *;
      `;

      const result = await pool.query(updateQuery, [merchantId, settlementTime]);
      
      if (result.rows.length === 0) {
        console.log('❌ No settlement config found to update for merchant:', merchantId);
        return null;
      }

      const updatedConfig = result.rows[0];
      
      // Return in the expected format
      const response = {
        accepted: true,
        appliedFrom: effectiveFrom || new Date().toISOString().split('T')[0],
        schedule: {
          tPlusDays: tPlusDays,
          cutoffMinutesIST: cutoffMinutesIST,
          effectiveFrom: effectiveFrom || new Date().toISOString().split('T')[0],
          lastChangedAt: updatedConfig.updated_at.toISOString()
        }
      };

      console.log('✅ Settlement schedule updated successfully:', response);
      return response;

    } catch (error) {
      console.error('❌ updateSettlementSchedule error:', error);
      return null;
    }
  },

  // On-Demand Settlements (manual/instant settlements)
  async listOnDemandSettlements(merchantId = DEFAULT_MERCHANT_ID, { limit = 25, offset = 0 } = {}) {
    if (!USE_DB || !pool) {
      return null;
    }

    try {
      console.log('🔍 Fetching on-demand settlements for merchant:', merchantId);

      // Query for on-demand settlements (manual triggers OR single transactions)
      const query = `
        SELECT 
          sb.id,
          sb.merchant_id,
          sb.merchant_name,
          sb.cycle_date,
          sb.total_transactions,
          sb.gross_amount_paise,
          sb.total_commission_paise,
          sb.total_gst_paise,
          sb.total_reserve_paise,
          sb.net_amount_paise,
          sb.status,
          sb.created_at,
          sb.updated_at,
          sb.approved_at,
          sb.settled_at,
          sb.bank_reference_number,
          sr.trigger_type,
          sr.triggered_by,
          bt.utr_number,
          bt.transfer_mode
        FROM sp_v2_settlement_batches sb
        LEFT JOIN sp_v2_settlement_schedule_runs sr ON sb.settlement_run_id = sr.id
        LEFT JOIN sp_v2_settlement_bank_transfers bt ON bt.settlement_batch_id = sb.id
        WHERE sb.merchant_id = $1
        AND (
          sr.trigger_type = 'manual' 
          OR sb.total_transactions <= 5
          OR (sb.created_at = sb.updated_at AND sb.total_transactions <= 10)
        )
        ORDER BY sb.created_at DESC
        LIMIT $2 OFFSET $3;
      `;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM sp_v2_settlement_batches sb
        LEFT JOIN sp_v2_settlement_schedule_runs sr ON sb.settlement_run_id = sr.id
        WHERE sb.merchant_id = $1
        AND (
          sr.trigger_type = 'manual' 
          OR sb.total_transactions <= 5
          OR (sb.created_at = sb.updated_at AND sb.total_transactions <= 10)
        );
      `;

      const [dataResult, countResult] = await Promise.all([
        pool.query(query, [merchantId, limit, offset]),
        pool.query(countQuery, [merchantId])
      ]);

      const settlements = dataResult.rows.map(row => ({
        id: row.id,
        type: row.trigger_type === 'manual' ? 'instant' : 'on-demand',
        date: row.created_at.toISOString(),
        amount: parseInt(row.gross_amount_paise || 0),
        fees: parseInt(row.total_commission_paise || 0),
        taxes: parseInt(row.total_gst_paise || 0),
        netAmount: parseInt(row.net_amount_paise || 0),
        status: this.mapStatus(row.status),
        utr: row.utr_number || null,
        rrn: row.bank_reference_number || null,
        createdAt: row.created_at.toISOString(),
        settledAt: row.settled_at ? row.settled_at.toISOString() : null,
        bankAccount: row.transfer_mode || "Manual Transfer",
        transactionCount: row.total_transactions,
        tPlusDays: 0, // Instant/on-demand = T+0
        triggerType: row.trigger_type || 'on-demand',
        triggeredBy: row.triggered_by || 'merchant'
      }));

      const total = parseInt(countResult.rows[0].total);

      console.log(`✅ Found ${settlements.length} on-demand settlements (${total} total)`);

      return {
        settlements,
        pagination: {
          limit,
          offset,
          total,
          hasNext: offset + limit < total
        }
      };

    } catch (error) {
      console.error('❌ listOnDemandSettlements error:', error);
      return null;
    }
  }
};

module.exports = v2Adapter;