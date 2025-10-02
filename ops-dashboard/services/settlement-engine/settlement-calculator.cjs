const { Pool } = require('pg');

// Settlement calculation engine with V1-compatible logic
class SettlementCalculator {
  constructor() {
    this.pool = new Pool({
      user: 'postgres',
      host: 'localhost',
      database: 'settlepaisa_v2',
      password: 'settlepaisa123',
      port: 5433,
    });
    
    // V1 compatible tax rates
    this.TAX_RATES = {
      GST: 18.0,      // 18% GST on commission
      TDS: 1.0,       // 1% TDS on gross amount 
      RESERVE: 5.0    // 5% reserve fund on net amount
    };
  }

  // Get commission tier for merchant based on 30-day volume
  async getCommissionTier(merchantId, effectiveDate = new Date()) {
    const client = await this.pool.connect();
    try {
      // Calculate merchant's 30-day volume ending at effectiveDate
      const volumeQuery = `
        SELECT COALESCE(SUM(amount_paise), 0) as total_volume_paise
        FROM sp_v2_transactions_v1 
        WHERE merchant_id = $1 
        AND status = 'SUCCESS'
        AND created_at >= $2::date - INTERVAL '30 days'
        AND created_at <= $2::date
      `;
      
      const volumeResult = await client.query(volumeQuery, [merchantId, effectiveDate]);
      const totalVolume = parseInt(volumeResult.rows[0].total_volume_paise) || 0;
      
      // Find applicable commission tier
      const tierQuery = `
        SELECT tier_name, commission_percentage 
        FROM sp_v2_commission_tiers 
        WHERE is_active = true
        AND min_volume_paise <= $1
        AND (max_volume_paise IS NULL OR max_volume_paise >= $1)
        ORDER BY min_volume_paise DESC
        LIMIT 1
      `;
      
      const tierResult = await client.query(tierQuery, [totalVolume]);
      
      if (tierResult.rows.length === 0) {
        throw new Error(`No commission tier found for volume: ${totalVolume}`);
      }
      
      const tier = tierResult.rows[0];
      
      console.log(`📊 [Settlement] Merchant ${merchantId}:`);
      console.log(`  30-day volume: ₹${(totalVolume/100).toLocaleString('en-IN')}`);
      console.log(`  Applied tier: ${tier.tier_name} (${tier.commission_percentage}%)`);
      
      return {
        tierName: tier.tier_name,
        commissionRate: parseFloat(tier.commission_percentage),
        volumePaise: totalVolume,
        effectiveDate: effectiveDate
      };
      
    } finally {
      client.release();
    }
  }

  // Calculate settlement for a batch of transactions
  async calculateSettlement(transactions, merchantId, batchDate = new Date()) {
    console.log(`💰 [Settlement] Calculating for ${transactions.length} transactions`);
    
    // Get merchant's commission tier
    const tier = await this.getCommissionTier(merchantId, batchDate);
    
    let grossAmountPaise = 0;
    let commissionPaise = 0;
    let gstPaise = 0;
    let tdsPaise = 0;
    let reservePaise = 0;
    
    // Process each transaction
    for (const txn of transactions) {
      const txnAmount = parseInt(txn.amount_paise) || 0;
      grossAmountPaise += txnAmount;
      
      // Calculate commission based on tier
      const txnCommission = Math.round(txnAmount * tier.commissionRate / 100);
      commissionPaise += txnCommission;
      
      // Calculate GST on commission (18%)
      const txnGst = Math.round(txnCommission * this.TAX_RATES.GST / 100);
      gstPaise += txnGst;
      
      // Calculate TDS on gross amount (1%) 
      const txnTds = Math.round(txnAmount * this.TAX_RATES.TDS / 100);
      tdsPaise += txnTds;
    }
    
    // Calculate net amount before reserve
    const preReserveNet = grossAmountPaise - commissionPaise - gstPaise - tdsPaise;
    
    // Calculate reserve fund (5% of net amount)
    reservePaise = Math.round(preReserveNet * this.TAX_RATES.RESERVE / 100);
    
    // Final net amount
    const netAmountPaise = preReserveNet - reservePaise;
    
    const settlement = {
      batchId: `BATCH_${Date.now()}`,
      merchantId: merchantId,
      batchDate: batchDate,
      transactionCount: transactions.length,
      
      // Financial breakdown
      grossAmountPaise: grossAmountPaise,
      commissionPaise: commissionPaise,
      gstPaise: gstPaise,
      tdsPaise: tdsPaise, 
      reservePaise: reservePaise,
      netAmountPaise: netAmountPaise,
      
      // Commission details
      commissionTier: tier.tierName,
      commissionRate: tier.commissionRate,
      merchantVolumePaise: tier.volumePaise,
      
      // Tax rates applied
      taxRates: this.TAX_RATES,
      
      // Calculation timestamp
      calculatedAt: new Date()
    };
    
    console.log(`📊 [Settlement] Batch Summary:`);
    console.log(`  Gross Amount: ₹${(grossAmountPaise/100).toLocaleString('en-IN')}`);
    console.log(`  Commission (${tier.commissionRate}%): ₹${(commissionPaise/100).toLocaleString('en-IN')}`);
    console.log(`  GST (${this.TAX_RATES.GST}%): ₹${(gstPaise/100).toLocaleString('en-IN')}`);
    console.log(`  TDS (${this.TAX_RATES.TDS}%): ₹${(tdsPaise/100).toLocaleString('en-IN')}`);
    console.log(`  Reserve (${this.TAX_RATES.RESERVE}%): ₹${(reservePaise/100).toLocaleString('en-IN')}`);
    console.log(`  Net Amount: ₹${(netAmountPaise/100).toLocaleString('en-IN')}`);
    
    return settlement;
  }

  // Save settlement batch to database
  async saveSettlementBatch(settlement) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Insert settlement batch using existing schema
      const batchQuery = `
        INSERT INTO sp_v2_settlement_batches (
          merchant_id, cycle_date, total_transactions, gross_amount_paise,
          total_commission_paise, total_gst_paise, total_tds_paise, 
          total_reserve_paise, net_amount_paise, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `;
      
      const batchValues = [
        settlement.merchantId,
        settlement.batchDate.toISOString().split('T')[0], // Convert to date
        settlement.transactionCount,
        settlement.grossAmountPaise,
        settlement.commissionPaise,
        settlement.gstPaise,
        settlement.tdsPaise,
        settlement.reservePaise,
        settlement.netAmountPaise,
        'PENDING'
      ];
      
      const batchResult = await client.query(batchQuery, batchValues);
      const batchDbId = batchResult.rows[0].id;
      
      await client.query('COMMIT');
      
      console.log(`✅ [Settlement] Batch saved (DB ID: ${batchDbId})`);
      
      return { ...settlement, dbId: batchDbId };
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ [Settlement] Failed to save batch:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Get pending transactions for settlement
  async getPendingTransactions(merchantId = null, limit = 100) {
    const client = await this.pool.connect();
    try {
      let query = `
        SELECT id, merchant_id, amount_paise, utr, status, created_at
        FROM sp_v2_transactions_v1 
        WHERE status = 'SUCCESS'
        AND id NOT IN (
          SELECT DISTINCT transaction_id 
          FROM sp_v2_settlement_transaction_map 
          WHERE settlement_batch_id IS NOT NULL
        )
      `;
      
      const values = [];
      
      if (merchantId) {
        query += ` AND merchant_id = $1`;
        values.push(merchantId);
      }
      
      query += ` ORDER BY created_at ASC LIMIT $${values.length + 1}`;
      values.push(limit);
      
      const result = await client.query(query, values);
      return result.rows;
      
    } finally {
      client.release();
    }
  }

  // Process settlement for pending transactions
  async processSettlements(merchantId = null) {
    console.log('🚀 [Settlement] Starting settlement processing...');
    
    const pendingTxns = await this.getPendingTransactions(merchantId);
    console.log(`📋 [Settlement] Found ${pendingTxns.length} pending transactions`);
    
    if (pendingTxns.length === 0) {
      console.log('✅ [Settlement] No pending transactions to settle');
      return [];
    }
    
    // Group by merchant
    const merchantGroups = {};
    pendingTxns.forEach(txn => {
      const mid = txn.merchant_id || 'default';
      if (!merchantGroups[mid]) merchantGroups[mid] = [];
      merchantGroups[mid].push(txn);
    });
    
    const settlements = [];
    
    for (const [mid, txns] of Object.entries(merchantGroups)) {
      console.log(`💼 [Settlement] Processing ${txns.length} transactions for merchant: ${mid}`);
      
      const settlement = await this.calculateSettlement(txns, mid);
      const savedSettlement = await this.saveSettlementBatch(settlement);
      settlements.push(savedSettlement);
    }
    
    console.log(`✅ [Settlement] Created ${settlements.length} settlement batches`);
    return settlements;
  }
}

module.exports = SettlementCalculator;