const { Pool } = require('pg');
const cron = require('node-cron');
const { SettlementCalculatorV3 } = require('./settlement-calculator-v3.cjs');

const v2Pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

class SettlementScheduler {
  constructor() {
    this.calculator = new SettlementCalculatorV3();
    this.cronJob = null;
  }

  async runSettlement(triggerType = 'cron', triggeredBy = 'system', options = {}) {
    const runId = await this.createScheduleRun(triggerType, triggeredBy);
    const startTime = Date.now();
    
    console.log(`[Settlement Scheduler] Starting run ${runId} (${triggerType})`);
    
    try {
      const merchants = await this.getMerchantsForSettlement(options);
      console.log(`[Settlement Scheduler] Found ${merchants.length} merchants eligible for settlement`);
      
      let merchantsProcessed = 0;
      let batchesCreated = 0;
      let totalAmountSettled = 0;
      const errors = [];
      
      for (const merchant of merchants) {
        try {
          console.log(`[Settlement Scheduler] Processing merchant: ${merchant.merchant_id}`);
          
          const transactions = await this.getReconciledTransactions(
            merchant.merchant_id,
            options.fromDate,
            options.toDate
          );
          
          if (transactions.length === 0) {
            console.log(`[Settlement Scheduler] No transactions for ${merchant.merchant_id}`);
            continue;
          }
          
          const transactionsByDate = this.groupTransactionsByDate(transactions);
          
          for (const [cycleDate, txns] of Object.entries(transactionsByDate)) {
            try {
              console.log(`[Settlement Scheduler] Creating batch for ${merchant.merchant_id} on ${cycleDate} (${txns.length} txns)`);
              
              const settlementBatch = await this.calculator.calculateSettlement(
                merchant.merchant_id,
                txns,
                cycleDate
              );
              
              const batchId = await this.calculator.persistSettlement(settlementBatch);
              
              await this.createTransactionMapping(batchId, txns);
              
              await this.updateScheduleRun(runId, {
                batches_created: ++batchesCreated,
                merchants_processed: merchantsProcessed,
                total_amount_settled_paise: totalAmountSettled += settlementBatch.net_settlement_amount
              });
              
              if (merchant.auto_settle && settlementBatch.net_settlement_amount >= merchant.min_settlement_amount_paise) {
                await this.queueBankTransfer(batchId, merchant, settlementBatch);
              }
              
            } catch (error) {
              console.error(`[Settlement Scheduler] Error creating batch for ${merchant.merchant_id} on ${cycleDate}:`, error.message);
              errors.push({
                merchant_id: merchant.merchant_id,
                cycle_date: cycleDate,
                error: error.message,
                stack: error.stack
              });
              
              await this.logError('calculation_error', merchant.merchant_id, null, null, error);
            }
          }
          
          merchantsProcessed++;
          
        } catch (error) {
          console.error(`[Settlement Scheduler] Error processing merchant ${merchant.merchant_id}:`, error.message);
          errors.push({
            merchant_id: merchant.merchant_id,
            error: error.message,
            stack: error.stack
          });
          
          await this.logError('calculation_error', merchant.merchant_id, null, null, error);
        }
      }
      
      const duration = Math.floor((Date.now() - startTime) / 1000);
      const status = errors.length === 0 ? 'completed' : (merchantsProcessed > 0 ? 'partial' : 'failed');
      
      await this.completeScheduleRun(runId, {
        status,
        merchants_processed: merchantsProcessed,
        batches_created: batchesCreated,
        total_amount_settled_paise: totalAmountSettled,
        errors_count: errors.length,
        error_details: errors.length > 0 ? errors : null,
        duration_seconds: duration
      });
      
      console.log(`[Settlement Scheduler] Run ${runId} completed:`, {
        status,
        merchants_processed: merchantsProcessed,
        batches_created: batchesCreated,
        total_settled: `₹${(totalAmountSettled / 100).toFixed(2)}`,
        errors: errors.length,
        duration: `${duration}s`
      });
      
      return { runId, status, merchantsProcessed, batchesCreated, totalAmountSettled, errors };
      
    } catch (error) {
      console.error('[Settlement Scheduler] Fatal error:', error);
      await this.completeScheduleRun(runId, {
        status: 'failed',
        errors_count: 1,
        error_details: [{ error: error.message, stack: error.stack }],
        duration_seconds: Math.floor((Date.now() - startTime) / 1000)
      });
      throw error;
    }
  }

  async getMerchantsForSettlement(options = {}) {
    let query = `
      SELECT 
        merchant_id,
        merchant_name,
        settlement_frequency,
        settlement_day,
        auto_settle,
        min_settlement_amount_paise,
        preferred_transfer_mode,
        account_number,
        ifsc_code,
        account_holder_name
      FROM sp_v2_merchant_settlement_config
      WHERE is_active = true
    `;
    
    const params = [];
    
    if (options.merchantId) {
      query += ` AND merchant_id = $1`;
      params.push(options.merchantId);
    } else {
      const today = new Date();
      const dayOfWeek = today.getDay() || 7;
      const dayOfMonth = today.getDate();
      
      query += ` AND (
        (settlement_frequency = 'daily')
        OR (settlement_frequency = 'weekly' AND settlement_day = $1)
        OR (settlement_frequency = 'monthly' AND settlement_day = $2)
        OR (settlement_frequency = 'on_demand' AND auto_settle = false)
      )`;
      params.push(dayOfWeek, dayOfMonth);
    }
    
    const result = await v2Pool.query(query, params);
    return result.rows;
  }

  async getReconciledTransactions(merchantId, fromDate, toDate) {
    const query = `
      SELECT 
        id,
        transaction_id,
        merchant_id,
        amount_paise as paid_amount,
        transaction_date,
        payment_method as payment_mode,
        utr,
        status
      FROM sp_v2_transactions
      WHERE merchant_id = $1
        AND status = 'RECONCILED'
        AND settlement_batch_id IS NULL
        ${fromDate ? 'AND transaction_date >= $2' : ''}
        ${toDate ? `AND transaction_date <= $${fromDate ? 3 : 2}` : ''}
      ORDER BY transaction_date ASC
    `;
    
    const params = [merchantId];
    if (fromDate) params.push(fromDate);
    if (toDate) params.push(toDate);
    
    const result = await v2Pool.query(query, params);
    return result.rows;
  }

  groupTransactionsByDate(transactions) {
    const grouped = {};
    
    for (const txn of transactions) {
      const date = new Date(txn.transaction_date).toISOString().split('T')[0];
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(txn);
    }
    
    return grouped;
  }

  async createTransactionMapping(batchId, transactions) {
    const client = await v2Pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const txn of transactions) {
        await client.query(
          `UPDATE sp_v2_transactions 
           SET settlement_batch_id = $1, settled_at = NOW() 
           WHERE id = $2`,
          [batchId, txn.id]
        );
      }
      
      await client.query('COMMIT');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async queueBankTransfer(batchId, merchantConfig, settlementBatch) {
    try {
      const netAmount = settlementBatch.netAmount || settlementBatch.net_settlement_amount || 0;
      
      if (!netAmount || isNaN(netAmount)) {
        console.warn(`[Settlement Scheduler] Skipping bank transfer - invalid amount: ${netAmount}`);
        return;
      }
      
      const transferMode = this.determineTransferMode(
        netAmount,
        merchantConfig.preferred_transfer_mode
      );
      
      await v2Pool.query(
        `INSERT INTO sp_v2_bank_transfer_queue 
         (batch_id, transfer_mode, amount_paise, beneficiary_name, 
          account_number, ifsc_code, bank_name, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued')`,
        [
          batchId,
          transferMode,
          netAmount,
          merchantConfig.account_holder_name || merchantConfig.merchant_name,
          merchantConfig.account_number,
          merchantConfig.ifsc_code,
          merchantConfig.bank_name || 'Unknown',
        ]
      );
      
      console.log(`[Settlement Scheduler] Queued ${transferMode} transfer for batch ${batchId}: ₹${(netAmount / 100).toFixed(2)}`);
      
    } catch (error) {
      console.error('[Settlement Scheduler] Error queueing bank transfer:', error.message);
      await this.logError('api_error', merchantConfig.merchant_id, batchId, null, error);
    }
  }

  determineTransferMode(amountPaise, preferredMode) {
    const amountRupees = amountPaise / 100;
    
    if (amountRupees >= 200000) {
      return 'RTGS';
    } else if (preferredMode === 'IMPS' && amountRupees <= 200000) {
      return 'IMPS';
    } else {
      return 'NEFT';
    }
  }

  async createScheduleRun(triggerType, triggeredBy) {
    const result = await v2Pool.query(
      `INSERT INTO sp_v2_settlement_schedule_runs 
       (run_date, trigger_type, triggered_by, status)
       VALUES (CURRENT_DATE, $1, $2, 'running')
       RETURNING id`,
      [triggerType, triggeredBy]
    );
    
    return result.rows[0].id;
  }

  async updateScheduleRun(runId, updates) {
    const setClauses = [];
    const params = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      setClauses.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
    
    params.push(runId);
    
    await v2Pool.query(
      `UPDATE sp_v2_settlement_schedule_runs 
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}`,
      params
    );
  }

  async completeScheduleRun(runId, data) {
    const totalAmount = data.total_amount_settled_paise || 0;
    const validAmount = (isNaN(totalAmount) || !isFinite(totalAmount)) ? 0 : totalAmount;
    
    await v2Pool.query(
      `UPDATE sp_v2_settlement_schedule_runs 
       SET status = $1,
           merchants_processed = $2,
           batches_created = $3,
           total_amount_settled_paise = $4,
           errors_count = $5,
           error_details = $6,
           completed_at = NOW(),
           duration_seconds = $7
       WHERE id = $8`,
      [
        data.status,
        data.merchants_processed,
        data.batches_created,
        validAmount,
        data.errors_count,
        data.error_details ? JSON.stringify(data.error_details) : null,
        data.duration_seconds,
        runId
      ]
    );
  }

  async logError(errorType, merchantId, batchId, transferId, error) {
    await v2Pool.query(
      `INSERT INTO sp_v2_settlement_errors 
       (error_type, merchant_id, batch_id, transfer_id, error_message, error_code, error_stack)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [errorType, merchantId, batchId, transferId, error.message, error.code, error.stack]
    );
  }

  startCronJob() {
    this.cronJob = cron.schedule('0 23 * * *', async () => {
      console.log('[Settlement Scheduler] Cron job triggered at 11 PM');
      try {
        await this.runSettlement('cron', 'system');
      } catch (error) {
        console.error('[Settlement Scheduler] Cron job failed:', error);
      }
    });
    
    console.log('[Settlement Scheduler] Cron job scheduled: Daily at 11 PM');
  }

  stopCronJob() {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('[Settlement Scheduler] Cron job stopped');
    }
  }

  async close() {
    this.stopCronJob();
    await this.calculator.close();
    await v2Pool.end();
    console.log('[Settlement Scheduler] Closed');
  }
}

module.exports = { SettlementScheduler };

if (require.main === module) {
  const scheduler = new SettlementScheduler();
  
  scheduler.startCronJob();
  
  console.log('[Settlement Scheduler] Service started. Press Ctrl+C to stop.');
  
  process.on('SIGINT', async () => {
    console.log('\n[Settlement Scheduler] Shutting down gracefully...');
    await scheduler.close();
    process.exit(0);
  });
}
