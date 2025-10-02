const { Pool } = require('pg');

const v2Pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

class SettlementCalculatorV2 {
  
  constructor() {
    console.log('[Settlement Calculator V2] Initialized with local merchant configs');
  }

  async calculateSettlement(merchantId, reconciledTransactions, cycleDate) {
    try {
      console.log(`[Settlement V2] Calculating for merchant ${merchantId}, ${reconciledTransactions.length} transactions`);
      
      const merchantConfig = await this.getMerchantConfig(merchantId);
      
      if (!merchantConfig) {
        throw new Error(`Merchant config not found for ${merchantId}`);
      }
      
      let totalGrossAmount = 0;
      let totalCommission = 0;
      let totalGST = 0;
      let totalRollingReserve = 0;
      let totalSettlementAmount = 0;
      
      const itemizedSettlements = [];
      
      for (const txn of reconciledTransactions) {
        const amountPaise = parseInt(txn.paid_amount);
        const mdrRate = 2.0;
        const gstRate = 18.0;
        
        const commission = Math.round((amountPaise * mdrRate) / 100);
        const gst = Math.round((commission * gstRate) / 100);
        
        const settlementBeforeReserve = amountPaise - commission - gst;
        
        let rollingReserveAmount = 0;
        if (merchantConfig.rolling_reserve_percentage) {
          rollingReserveAmount = Math.round((settlementBeforeReserve * merchantConfig.rolling_reserve_percentage) / 100);
        }
        
        const finalSettlement = settlementBeforeReserve - rollingReserveAmount;
        
        totalGrossAmount += amountPaise;
        totalCommission += commission;
        totalGST += gst;
        totalRollingReserve += rollingReserveAmount;
        totalSettlementAmount += finalSettlement;
        
        itemizedSettlements.push({
          transaction_id: txn.transaction_id,
          gross_amount: amountPaise,
          commission: commission,
          gst: gst,
          settlement_before_reserve: settlementBeforeReserve,
          rolling_reserve_amount: rollingReserveAmount,
          final_settlement_amount: finalSettlement,
          payment_mode: txn.payment_mode
        });
      }
      
      const settlementBatch = {
        merchant_id: merchantId,
        merchant_name: merchantConfig.merchant_name,
        cycle_date: cycleDate,
        total_transactions: reconciledTransactions.length,
        gross_amount: totalGrossAmount,
        total_commission: totalCommission,
        total_gst: totalGST,
        total_rolling_reserve: totalRollingReserve,
        net_settlement_amount: totalSettlementAmount,
        status: 'PENDING_APPROVAL',
        created_at: new Date().toISOString(),
        itemized_settlements: itemizedSettlements
      };
      
      console.log(`[Settlement V2] Calculated for ${merchantId}:`);
      console.log(`  Gross: ₹${(totalGrossAmount / 100).toFixed(2)}`);
      console.log(`  Commission: ₹${(totalCommission / 100).toFixed(2)}`);
      console.log(`  GST: ₹${(totalGST / 100).toFixed(2)}`);
      console.log(`  Rolling Reserve: ₹${(totalRollingReserve / 100).toFixed(2)}`);
      console.log(`  Net Settlement: ₹${(totalSettlementAmount / 100).toFixed(2)}`);
      
      return settlementBatch;
      
    } catch (error) {
      console.error('[Settlement V2] Calculation failed:', error.message);
      throw error;
    }
  }

  async getMerchantConfig(merchantId) {
    try {
      const result = await v2Pool.query(
        `SELECT 
          merchant_id,
          merchant_name,
          0 as rolling_reserve_percentage,
          settlement_frequency,
          min_settlement_amount_paise
         FROM sp_v2_merchant_settlement_config
         WHERE merchant_id = $1 AND is_active = true`,
        [merchantId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
      
    } catch (error) {
      console.error('[Settlement V2] Error fetching merchant config:', error.message);
      throw error;
    }
  }

  async persistSettlement(settlementBatch) {
    const client = await v2Pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const batchQuery = `
        INSERT INTO sp_v2_settlement_batches 
        (merchant_id, merchant_name, cycle_date, total_transactions, 
         gross_amount_paise, total_commission_paise, total_gst_paise, 
         total_reserve_paise, net_amount_paise, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        RETURNING id
      `;
      
      const batchResult = await client.query(batchQuery, [
        settlementBatch.merchant_id,
        settlementBatch.merchant_name,
        settlementBatch.cycle_date,
        settlementBatch.total_transactions,
        settlementBatch.gross_amount,
        settlementBatch.total_commission,
        settlementBatch.total_gst,
        settlementBatch.total_rolling_reserve,
        settlementBatch.net_settlement_amount,
        settlementBatch.status
      ]);
      
      const batchId = batchResult.rows[0].id;
      
      for (const item of settlementBatch.itemized_settlements) {
        await client.query(
          `INSERT INTO sp_v2_settlement_items 
           (settlement_batch_id, transaction_id, amount_paise, commission_paise, 
            gst_paise, reserve_paise, net_paise, payment_mode, fee_bearer)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            batchId,
            item.transaction_id,
            item.gross_amount,
            item.commission,
            item.gst,
            item.rolling_reserve_amount,
            item.final_settlement_amount,
            item.payment_mode,
            'merchant'
          ]
        );
      }
      
      await client.query('COMMIT');
      
      console.log(`[Settlement V2] Persisted batch ${batchId} with ${settlementBatch.itemized_settlements.length} items`);
      
      return batchId;
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Settlement V2] Failed to persist settlement:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await v2Pool.end();
    console.log('[Settlement Calculator V2] Connection pool closed');
  }
}

module.exports = { SettlementCalculatorV2 };
