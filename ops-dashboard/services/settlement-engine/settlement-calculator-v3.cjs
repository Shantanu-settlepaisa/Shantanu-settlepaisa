const { Pool } = require('pg');

class SettlementCalculatorV3 {
  constructor() {
    // ONLY V2 database - no SabPaisa dependency at runtime!
    this.v2Pool = new Pool({
      host: 'localhost',
      port: 5433,
      user: 'postgres',
      password: 'settlepaisa123',
      database: 'settlepaisa_v2'
    });
  }
  
  async getMerchantConfig(merchantId) {
    const result = await this.v2Pool.query(
      'SELECT * FROM sp_v2_merchant_master WHERE merchant_id = $1 AND is_active = true',
      [merchantId]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Merchant ${merchantId} not found in V2. Run sync first: node sync-sabpaisa-configs.cjs`);
    }
    
    return result.rows[0];
  }
  
  async getCommissionRate(merchantId, paymentMode, bankCode) {
    // Try exact match first (merchant + mode + bank)
    let result = await this.v2Pool.query(`
      SELECT commission_value, commission_type, gst_percentage
      FROM sp_v2_merchant_commission_config
      WHERE merchant_id = $1 
        AND payment_mode = $2 
        AND (bank_code = $3 OR bank_name = $3)
        AND is_active = true
      LIMIT 1
    `, [merchantId, paymentMode, bankCode]);
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    // Fallback 1: Get default rate for this merchant + payment mode (any bank)
    result = await this.v2Pool.query(`
      SELECT commission_value, commission_type, gst_percentage
      FROM sp_v2_merchant_commission_config
      WHERE merchant_id = $1 
        AND payment_mode = $2
        AND is_active = true
      ORDER BY commission_value ASC
      LIMIT 1
    `, [merchantId, paymentMode]);
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    // Fallback 2: Get any rate for this merchant (any mode, any bank)
    result = await this.v2Pool.query(`
      SELECT commission_value, commission_type, gst_percentage
      FROM sp_v2_merchant_commission_config
      WHERE merchant_id = $1
        AND is_active = true
      ORDER BY commission_value ASC
      LIMIT 1
    `, [merchantId]);
    
    if (result.rows.length > 0) {
      console.warn(`[Warning] Using fallback commission rate for ${merchantId} + ${paymentMode} + ${bankCode}`);
      return result.rows[0];
    }
    
    // Ultimate fallback: Default 2% if no config found
    console.error(`[Error] No commission config found for ${merchantId}. Using default 2%`);
    return {
      commission_value: 2.0,
      commission_type: 'percentage',
      gst_percentage: 18.0
    };
  }
  
  async getFeeBearerConfig(merchantId, paymentModeId) {
    const result = await this.v2Pool.query(`
      SELECT fee_bearer_code
      FROM sp_v2_merchant_fee_bearer_config
      WHERE merchant_id = $1 AND payment_mode_id = $2
      AND is_active = true
    `, [merchantId, paymentModeId]);
    
    if (result.rows.length === 0) {
      // Default: merchant bears fees (most common)
      return '2';
    }
    
    return result.rows[0].fee_bearer_code;
  }
  
  calculateCommissionAmount(amountPaise, commissionValue, commissionType) {
    if (commissionType === 'percentage') {
      return Math.round((amountPaise * commissionValue) / 100);
    } else if (commissionType === 'fixed') {
      // Fixed commission is in rupees, convert to paise
      return Math.round(commissionValue * 100);
    } else {
      throw new Error(`Unknown commission type: ${commissionType}`);
    }
  }
  
  async calculateSettlement(merchantId, transactions, cycleDate) {
    console.log(`\n[Calculator] Processing ${transactions.length} transactions for ${merchantId} on ${cycleDate}`);
    
    // Get merchant config from V2
    const merchantConfig = await this.getMerchantConfig(merchantId);
    
    console.log(`[Config] Merchant: ${merchantConfig.merchant_name}`);
    console.log(`[Config] Rolling Reserve: ${merchantConfig.rolling_reserve_enabled ? merchantConfig.rolling_reserve_percentage + '%' : 'Disabled'}`);
    console.log(`[Config] Settlement Cycle: T+${merchantConfig.settlement_cycle}`);
    
    let batchTotals = {
      grossAmount: 0,
      totalCommission: 0,
      totalGST: 0,
      totalReserve: 0,
      netAmount: 0,
      transactionCount: 0,
      items: []
    };
    
    for (const txn of transactions) {
      const amountPaise = parseInt(txn.paid_amount);
      
      // Get commission rate from V2 (dynamic, per merchant/mode/bank)
      const commissionConfig = await this.getCommissionRate(
        merchantId,
        txn.payment_mode || 'Unknown',
        txn.bank_code || txn.acquirer_code || 'Default'
      );
      
      // Get fee bearer from V2
      const feeBearerCode = await this.getFeeBearerConfig(
        merchantId,
        txn.payment_mode_id || '3' // Default to Net Banking
      );
      
      // Calculate commission
      const commission = this.calculateCommissionAmount(
        amountPaise,
        commissionConfig.commission_value,
        commissionConfig.commission_type
      );
      
      // Calculate GST
      const gst = Math.round((commission * commissionConfig.gst_percentage) / 100);
      
      // Apply fee bearer logic
      let settlementBeforeReserve;
      if (feeBearerCode === '2') {
        // Merchant bears fees (most common)
        settlementBeforeReserve = amountPaise - commission - gst;
      } else if (feeBearerCode === '3') {
        // Payer bears fees (merchant gets full amount)
        settlementBeforeReserve = amountPaise;
      } else if (feeBearerCode === '1') {
        // Bank bears fees (merchant gets full amount)
        settlementBeforeReserve = amountPaise;
      } else {
        // Default: merchant bears fees
        settlementBeforeReserve = amountPaise - commission - gst;
      }
      
      // Calculate rolling reserve
      let reserve = 0;
      if (merchantConfig.rolling_reserve_enabled) {
        reserve = Math.round(
          (settlementBeforeReserve * merchantConfig.rolling_reserve_percentage) / 100
        );
      }
      
      const finalSettlement = settlementBeforeReserve - reserve;
      
      // Accumulate batch totals
      batchTotals.grossAmount += amountPaise;
      batchTotals.totalCommission += commission;
      batchTotals.totalGST += gst;
      batchTotals.totalReserve += reserve;
      batchTotals.netAmount += finalSettlement;
      batchTotals.transactionCount++;
      
      batchTotals.items.push({
        transaction_id: txn.transaction_id,
        amount_paise: amountPaise,
        commission_paise: commission,
        commission_rate: commissionConfig.commission_value,
        commission_type: commissionConfig.commission_type,
        gst_paise: gst,
        reserve_paise: reserve,
        net_paise: finalSettlement,
        payment_mode: txn.payment_mode || 'Unknown',
        fee_bearer_code: feeBearerCode
      });
    }
    
    console.log(`[Result] Gross: ₹${(batchTotals.grossAmount / 100).toFixed(2)}`);
    console.log(`[Result] Commission: ₹${(batchTotals.totalCommission / 100).toFixed(2)}`);
    console.log(`[Result] GST: ₹${(batchTotals.totalGST / 100).toFixed(2)}`);
    console.log(`[Result] Reserve: ₹${(batchTotals.totalReserve / 100).toFixed(2)}`);
    console.log(`[Result] Net Settlement: ₹${(batchTotals.netAmount / 100).toFixed(2)}`);
    
    return {
      merchantId,
      merchantName: merchantConfig.merchant_name,
      cycleDate,
      ...batchTotals
    };
  }
  
  async persistSettlement(settlementBatch) {
    console.log(`\n[Persist] Saving settlement batch for ${settlementBatch.merchantId}`);
    
    // Insert settlement batch
    const batchResult = await this.v2Pool.query(`
      INSERT INTO sp_v2_settlement_batches (
        merchant_id, merchant_name, cycle_date, total_transactions,
        gross_amount_paise, total_commission_paise, total_gst_paise,
        total_reserve_paise, net_amount_paise, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING_APPROVAL')
      RETURNING id
    `, [
      settlementBatch.merchantId,
      settlementBatch.merchantName,
      settlementBatch.cycleDate,
      settlementBatch.transactionCount,
      settlementBatch.grossAmount,
      settlementBatch.totalCommission,
      settlementBatch.totalGST,
      settlementBatch.totalReserve,
      settlementBatch.netAmount
    ]);
    
    const batchId = batchResult.rows[0].id;
    console.log(`[Persist] Batch created: ${batchId}`);
    
    // Insert settlement items
    for (const item of settlementBatch.items) {
      await this.v2Pool.query(`
        INSERT INTO sp_v2_settlement_items (
          settlement_batch_id, transaction_id, amount_paise,
          commission_paise, commission_rate, commission_type,
          gst_paise, reserve_paise, net_paise,
          payment_mode, fee_bearer_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        batchId, item.transaction_id, item.amount_paise,
        item.commission_paise, item.commission_rate, item.commission_type,
        item.gst_paise, item.reserve_paise, item.net_paise,
        item.payment_mode, item.fee_bearer_code
      ]);
    }
    
    console.log(`[Persist] Saved ${settlementBatch.items.length} settlement items`);
    
    // Update transactions with batch ID
    const txnIds = settlementBatch.items.map(item => item.transaction_id);
    await this.v2Pool.query(
      'UPDATE sp_v2_transactions SET settlement_batch_id = $1 WHERE transaction_id = ANY($2)',
      [batchId, txnIds]
    );
    
    console.log(`[Persist] Updated ${txnIds.length} transactions with batch_id`);
    
    // Insert rolling reserve entry if applicable
    if (settlementBatch.totalReserve > 0) {
      const merchantConfig = await this.getMerchantConfig(settlementBatch.merchantId);
      const releaseDate = new Date(settlementBatch.cycleDate);
      releaseDate.setDate(releaseDate.getDate() + merchantConfig.reserve_hold_days);
      
      await this.v2Pool.query(`
        INSERT INTO sp_v2_rolling_reserve_ledger (
          settlement_batch_id, merchant_id, reserve_amount_paise,
          balance_paise, hold_date, release_date, status,
          reserve_percentage, hold_days
        ) VALUES ($1, $2, $3, $4, $5, $6, 'HELD', $7, $8)
      `, [
        batchId,
        settlementBatch.merchantId,
        settlementBatch.totalReserve,
        settlementBatch.totalReserve,
        settlementBatch.cycleDate,
        releaseDate.toISOString().split('T')[0],
        merchantConfig.rolling_reserve_percentage,
        merchantConfig.reserve_hold_days
      ]);
      
      console.log(`[Persist] Created rolling reserve entry (release: ${releaseDate.toISOString().split('T')[0]})`);
    }
    
    return batchId;
  }
  
  async close() {
    await this.v2Pool.end();
  }
}

module.exports = { SettlementCalculatorV3 };

// Test if run directly
if (require.main === module) {
  const calculator = new SettlementCalculatorV3();
  
  // Test with sample merchant
  const testMerchantId = 'KAPR63';
  
  calculator.getMerchantConfig(testMerchantId)
    .then(config => {
      console.log('\n✅ Merchant Config:');
      console.log(JSON.stringify(config, null, 2));
      return calculator.getCommissionRate(testMerchantId, 'Net Banking', 'HDFC Bank');
    })
    .then(rate => {
      console.log('\n✅ Commission Rate:');
      console.log(JSON.stringify(rate, null, 2));
    })
    .catch(error => {
      console.error('\n❌ Test failed:', error.message);
    })
    .finally(() => {
      calculator.close();
    });
}
