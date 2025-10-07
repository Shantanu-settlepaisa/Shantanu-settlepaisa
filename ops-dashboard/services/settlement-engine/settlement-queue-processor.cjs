require('dotenv').config();
const { Pool } = require('pg');
const { SettlementCalculatorV3 } = require('./settlement-calculator-v3.cjs');

const v2Pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'settlepaisa_v2',
  password: process.env.DB_PASSWORD || 'settlepaisa123',
  port: process.env.DB_PORT || 5433,
});

class SettlementQueueProcessor {
  constructor() {
    this.calculator = new SettlementCalculatorV3();
    this.batchWindow = 5 * 60 * 1000; // 5 minutes
    this.batchSize = 100;
    this.processingIntervalMs = 2 * 60 * 1000; // 2 minutes
    this.isProcessing = false;
  }
  
  async start() {
    console.log('[Settlement Queue] Starting queue processor...');
    
    try {
      // Listen to PostgreSQL notifications for real-time processing
      const notificationClient = await v2Pool.connect();
      await notificationClient.query('LISTEN settlement_queue');
      
      notificationClient.on('notification', async (msg) => {
        if (msg.channel === 'settlement_queue' && !this.isProcessing) {
          const payload = JSON.parse(msg.payload);
          console.log('[Settlement Queue] New transaction queued:', payload.transaction_id);
          await this.processPendingBatches();
        }
      });
      
      console.log('[Settlement Queue] Listening for settlement events...');
      
    } catch (error) {
      console.error('[Settlement Queue] Failed to setup notification listener:', error.message);
    }
    
    // Also poll every 2 minutes as fallback
    setInterval(() => {
      if (!this.isProcessing) {
        this.processPendingBatches();
      }
    }, this.processingIntervalMs);
    
    // Initial processing
    await this.processPendingBatches();
    
    console.log('[Settlement Queue] Queue processor ready!');
  }
  
  async processPendingBatches() {
    if (this.isProcessing) {
      console.log('[Settlement Queue] Already processing, skipping...');
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // Get pending transactions grouped by merchant
      const result = await v2Pool.query(`
        SELECT 
          merchant_id,
          array_agg(transaction_id ORDER BY queued_at) as transaction_ids,
          COUNT(*) as txn_count,
          MIN(queued_at) as oldest_queued,
          SUM(amount_paise) as total_amount
        FROM sp_v2_settlement_queue
        WHERE status = 'PENDING'
        GROUP BY merchant_id
        HAVING 
          COUNT(*) >= $1 OR
          MIN(queued_at) < NOW() - INTERVAL '5 minutes'
      `, [this.batchSize]);
      
      if (result.rows.length === 0) {
        // No batches ready
        this.isProcessing = false;
        return;
      }
      
      console.log(`[Settlement Queue] Found ${result.rows.length} merchant batches ready for processing`);
      
      for (const batch of result.rows) {
        await this.processSettlementBatch(
          batch.merchant_id, 
          batch.transaction_ids,
          batch.txn_count,
          batch.total_amount
        );
      }
      
    } catch (error) {
      console.error('[Settlement Queue] Processing error:', error);
    } finally {
      this.isProcessing = false;
    }
  }
  
  async processSettlementBatch(merchantId, transactionIds, txnCount, totalAmount) {
    const client = await v2Pool.connect();
    const startTime = Date.now();
    
    try {
      console.log(`[Settlement Queue] Processing batch for merchant ${merchantId} (${txnCount} transactions, ₹${(totalAmount / 100).toFixed(2)})`);
      
      await client.query('BEGIN');
      
      // Mark as processing with row-level lock (prevents duplicate processing)
      const lockResult = await client.query(`
        UPDATE sp_v2_settlement_queue
        SET status = 'PROCESSING',
            updated_at = NOW()
        WHERE transaction_id = ANY($1)
          AND status = 'PENDING'
        RETURNING transaction_id
      `, [transactionIds]);
      
      if (lockResult.rows.length === 0) {
        console.log('[Settlement Queue] No transactions locked (already processing?), rolling back');
        await client.query('ROLLBACK');
        return;
      }
      
      const lockedTxnIds = lockResult.rows.map(r => r.transaction_id);
      console.log(`[Settlement Queue] Locked ${lockedTxnIds.length} transactions`);
      
      // Get transactions from sp_v2_transactions
      const txnResult = await client.query(`
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
        WHERE transaction_id = ANY($1)
          AND status = 'RECONCILED'
      `, [lockedTxnIds]);
      
      if (txnResult.rows.length === 0) {
        console.log('[Settlement Queue] No eligible transactions found (not RECONCILED?), marking as failed');
        
        await client.query(`
          UPDATE sp_v2_settlement_queue
          SET status = 'FAILED',
              error_message = 'No eligible transactions found (status != RECONCILED)',
              updated_at = NOW()
          WHERE transaction_id = ANY($1)
        `, [lockedTxnIds]);
        
        await client.query('COMMIT');
        return;
      }
      
      console.log(`[Settlement Queue] Found ${txnResult.rows.length} eligible transactions`);
      
      // Resolve merchant ID (UUID → VARCHAR mapping)
      const resolvedMerchantId = await this.resolveMerchantId(client, merchantId);
      console.log(`[Settlement Queue] Resolved merchant ID: ${merchantId} → ${resolvedMerchantId}`);
      
      // Calculate settlement using V3 calculator
      const cycleDate = new Date().toISOString().split('T')[0];
      const calculatorResult = await this.calculator.calculateSettlement(
        resolvedMerchantId,
        txnResult.rows,
        cycleDate
      );
      
      const settlementBatch = {
        merchant_id: calculatorResult.merchantId,
        merchant_name: calculatorResult.merchantName,
        cycle_date: calculatorResult.cycleDate,
        total_transactions: calculatorResult.transactionCount,
        gross_amount_paise: calculatorResult.grossAmount,
        total_commission_paise: calculatorResult.totalCommission,
        total_gst_paise: calculatorResult.totalGST,
        total_reserve_paise: calculatorResult.totalReserve,
        net_settlement_amount: calculatorResult.netAmount,
        items: calculatorResult.items
      };
      
      console.log(`[Settlement Queue] Settlement calculated: ₹${(settlementBatch.net_settlement_amount / 100).toFixed(2)} net`);
      
      // Persist settlement to database
      const batchId = await this.persistSettlementBatch(client, settlementBatch, txnResult.rows);
      
      // Update transactions to SETTLED
      await client.query(`
        UPDATE sp_v2_transactions
        SET status = 'SETTLED',
            settlement_batch_id = $1,
            settled_at = NOW(),
            updated_at = NOW()
        WHERE transaction_id = ANY($2)
      `, [batchId, lockedTxnIds]);
      
      // Log reserve hold
      if (settlementBatch.total_reserve_paise > 0) {
        // Get current balance
        const balanceResult = await client.query(`
          SELECT balance_paise 
          FROM sp_v2_merchant_reserve_ledger 
          WHERE merchant_id = $1 
          ORDER BY created_at DESC 
          LIMIT 1
        `, [resolvedMerchantId]);
        
        const currentBalance = balanceResult.rows.length > 0 ? balanceResult.rows[0].balance_paise : 0;
        const newBalance = currentBalance + settlementBatch.total_reserve_paise;
        
        await client.query(`
          INSERT INTO sp_v2_merchant_reserve_ledger (
            merchant_id,
            transaction_type,
            amount_paise,
            balance_paise,
            reference_type,
            reference_id,
            description
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          resolvedMerchantId,
          'HOLD',
          settlementBatch.total_reserve_paise,
          newBalance,
          'SETTLEMENT_BATCH',
          batchId,
          `Reserve held for settlement batch ${batchId}`
        ]);
      }
      
      // Log commission audit
      await client.query(`
        INSERT INTO sp_v2_commission_audit (
          batch_id,
          merchant_id,
          commission_tier,
          commission_rate,
          volume_30_days_paise,
          calculation_date,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        batchId,
        resolvedMerchantId,
        'TIER_DEFAULT', // TODO: Get from calculator
        (settlementBatch.total_commission_paise / settlementBatch.gross_amount_paise),
        0, // TODO: Get 30-day volume
        cycleDate,
        JSON.stringify({
          transaction_count: txnResult.rows.length,
          gross_amount: settlementBatch.gross_amount_paise,
          commission_amount: settlementBatch.total_commission_paise,
          gst_amount: settlementBatch.total_gst_paise,
          reserve_amount: settlementBatch.total_reserve_paise
        })
      ]);
      
      // Mark queue items as processed
      await client.query(`
        UPDATE sp_v2_settlement_queue
        SET status = 'PROCESSED',
            processed_at = NOW(),
            updated_at = NOW()
        WHERE transaction_id = ANY($1)
      `, [lockedTxnIds]);
      
      await client.query('COMMIT');
      
      const duration = Math.floor((Date.now() - startTime) / 1000);
      console.log(`[Settlement Queue] ✅ Processed batch ${batchId} for merchant ${merchantId} in ${duration}s`);
      
      // Check if approval needed
      if (settlementBatch.net_settlement_amount > 100000 * 100) { // ₹1L threshold
        await this.queueForApproval(batchId, settlementBatch, resolvedMerchantId);
      } else {
        await this.autoApprove(batchId);
      }
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Settlement Queue] Batch processing error:', error);
      
      // Mark as failed with retry
      await client.query(`
        UPDATE sp_v2_settlement_queue
        SET status = 'FAILED',
            retry_count = retry_count + 1,
            error_message = $1,
            updated_at = NOW()
        WHERE transaction_id = ANY($2)
      `, [error.message, transactionIds]);
      
    } finally {
      client.release();
    }
  }
  
  async persistSettlementBatch(client, settlementBatch, transactions) {
    // Insert settlement batch
    const batchResult = await client.query(`
      INSERT INTO sp_v2_settlement_batches (
        id,
        merchant_id,
        cycle_date,
        total_transactions,
        gross_amount_paise,
        total_commission_paise,
        total_gst_paise,
        total_reserve_paise,
        net_amount_paise,
        status,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
      ) RETURNING id
    `, [
      settlementBatch.merchant_id,
      settlementBatch.cycle_date,
      settlementBatch.total_transactions,
      settlementBatch.gross_amount_paise,
      settlementBatch.total_commission_paise,
      settlementBatch.total_gst_paise,
      settlementBatch.total_reserve_paise,
      settlementBatch.net_settlement_amount,
      'CALCULATED'
    ]);
    
    const batchId = batchResult.rows[0].id;
    
    // Insert settlement items
    for (const txn of transactions) {
      await client.query(`
        INSERT INTO sp_v2_settlement_items (
          settlement_batch_id,
          transaction_id,
          amount_paise,
          commission_paise,
          gst_paise,
          reserve_paise,
          net_paise,
          payment_mode
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        batchId,
        txn.transaction_id,
        txn.paid_amount,
        0, // TODO: Calculate individual commission
        0, // TODO: Calculate individual GST
        0, // TODO: Calculate individual reserve
        txn.paid_amount, // Simplified for now
        txn.payment_mode
      ]);
    }
    
    return batchId;
  }
  
  async resolveMerchantId(client, merchantId) {
    // Check if UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (uuidRegex.test(merchantId)) {
      // Lookup in mapping table
      const result = await client.query(`
        SELECT varchar_merchant_id 
        FROM sp_v2_merchant_id_mapping 
        WHERE uuid_merchant_id = $1
      `, [merchantId]);
      
      if (result.rows.length === 0) {
        console.warn(`[Settlement Queue] Merchant UUID ${merchantId} not found in mapping table, using as-is`);
        return merchantId;
      }
      
      return result.rows[0].varchar_merchant_id;
    }
    
    return merchantId; // Already VARCHAR format
  }
  
  async queueForApproval(batchId, settlementBatch, merchantId) {
    await v2Pool.query(`
      UPDATE sp_v2_settlement_batches
      SET status = 'PENDING_APPROVAL',
          updated_at = NOW()
      WHERE id = $1
    `, [batchId]);
    
    console.log(`[Settlement Queue] ⚠️  Batch ${batchId} queued for approval (amount: ₹${(settlementBatch.net_settlement_amount / 100).toFixed(2)})`);
    
    // TODO: Send notification (email/Slack/dashboard alert)
  }
  
  async autoApprove(batchId) {
    await v2Pool.query(`
      UPDATE sp_v2_settlement_batches
      SET status = 'APPROVED',
          updated_at = NOW()
      WHERE id = $1
    `, [batchId]);
    
    console.log(`[Settlement Queue] ✅ Batch ${batchId} auto-approved, will queue for bank transfer`);
    
    // TODO: Trigger bank transfer via scheduler or separate service
  }
  
  async close() {
    await v2Pool.end();
    await this.calculator.close();
    console.log('[Settlement Queue] Closed');
  }
}

// Start the service
if (require.main === module) {
  const processor = new SettlementQueueProcessor();
  
  processor.start().catch(error => {
    console.error('[Settlement Queue] Fatal error during startup:', error);
    process.exit(1);
  });
  
  console.log('[Settlement Queue] Service started. Press Ctrl+C to stop.');
  
  process.on('SIGINT', async () => {
    console.log('\n[Settlement Queue] Shutting down gracefully...');
    await processor.close();
    process.exit(0);
  });
}

module.exports = { SettlementQueueProcessor };
