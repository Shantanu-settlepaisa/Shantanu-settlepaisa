const { Pool } = require('pg');

const sabpaisaPool = new Pool({
  user: process.env.SABPAISA_DB_USER || 'settlepaisainternal',
  host: process.env.SABPAISA_DB_HOST || '3.108.237.99',
  database: process.env.SABPAISA_DB_NAME || 'settlepaisa',
  password: process.env.SABPAISA_DB_PASSWORD || 'sabpaisa123',
  port: process.env.SABPAISA_DB_PORT || 5432,
});

const v2Pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

class SettlementCalculatorV1Logic {
  
  constructor() {
    console.log('[Settlement Calculator] Initialized with V1 logic');
  }

  async calculateSettlement(merchantId, reconciledTransactions, cycleDate) {
    try {
      console.log(`[Settlement] Calculating for merchant ${merchantId}, ${reconciledTransactions.length} transactions`);
      
      const merchantConfig = await this.getMerchantConfig(merchantId);
      
      if (!merchantConfig) {
        throw new Error(`Merchant config not found for ${merchantId}`);
      }
      
      let totalGrossAmount = 0;
      let totalConvCharges = 0;
      let totalEpCharges = 0;
      let totalGST = 0;
      let totalPGCharge = 0;
      let totalRollingReserve = 0;
      let totalSettlementAmount = 0;
      
      const itemizedSettlements = [];
      
      for (const txn of reconciledTransactions) {
        const feeBearerConfig = await this.getFeeBearerConfig(
          merchantConfig.merchantid,
          txn.paymode_id || this.getPaymodeIdFromName(txn.payment_mode)
        );
        
        const mdrRates = await this.getMDRRates(
          merchantConfig.client_code,
          txn.paymode_id || this.getPaymodeIdFromName(txn.payment_mode)
        );
        
        const convCharges = this.calculateConvCharges(
          txn.paid_amount,
          mdrRates.convcharges,
          mdrRates.convchargestype
        );
        
        const epCharges = this.calculateEpCharges(
          txn.paid_amount,
          mdrRates.endpointcharge,
          mdrRates.endpointchargestypes
        );
        
        const gst = this.calculateGST(
          convCharges + epCharges,
          mdrRates.gst,
          mdrRates.gsttype
        );
        
        const pgCharge = convCharges + epCharges + gst;
        
        let settlementAmount = 0;
        
        if (feeBearerConfig.fee_bearer_id === '1') {
          settlementAmount = txn.paid_amount;
        } else if (feeBearerConfig.fee_bearer_id === '2') {
          settlementAmount = txn.paid_amount - pgCharge;
        } else if (feeBearerConfig.fee_bearer_id === '3') {
          settlementAmount = txn.payee_amount;
        } else if (feeBearerConfig.fee_bearer_id === '4') {
          settlementAmount = txn.paid_amount;
        }
        
        let rollingReserveAmount = 0;
        let rollingReserveDate = null;
        
        if (merchantConfig.rolling_reserve && merchantConfig.rolling_percentage) {
          rollingReserveAmount = (settlementAmount * merchantConfig.rolling_percentage) / 100;
          
          if (merchantConfig.no_of_days) {
            const cycleDateTime = new Date(cycleDate);
            cycleDateTime.setDate(cycleDateTime.getDate() + merchantConfig.no_of_days);
            rollingReserveDate = cycleDateTime.toISOString().split('T')[0];
          }
        }
        
        const finalSettlement = settlementAmount - rollingReserveAmount;
        
        totalGrossAmount += txn.paid_amount;
        totalConvCharges += convCharges;
        totalEpCharges += epCharges;
        totalGST += gst;
        totalPGCharge += pgCharge;
        totalRollingReserve += rollingReserveAmount;
        totalSettlementAmount += finalSettlement;
        
        itemizedSettlements.push({
          transaction_id: txn.transaction_id || txn.pgw_ref,
          gross_amount: txn.paid_amount,
          payee_amount: txn.payee_amount,
          convcharges: convCharges,
          ep_charges: epCharges,
          gst: gst,
          pg_charge: pgCharge,
          fee_bearer_id: feeBearerConfig.fee_bearer_id,
          fee_bearer_name: feeBearerConfig.fee_bearer_name,
          settlement_before_reserve: settlementAmount,
          rolling_reserve_amount: rollingReserveAmount,
          rolling_reserve_settlement_date: rollingReserveDate,
          final_settlement_amount: finalSettlement,
          payment_mode: txn.payment_mode,
          paymode_id: txn.paymode_id
        });
      }
      
      const settlementBatch = {
        merchant_id: merchantId,
        merchant_name: merchantConfig.companyname,
        client_code: merchantConfig.client_code,
        cycle_date: cycleDate,
        total_transactions: reconciledTransactions.length,
        gross_amount: totalGrossAmount,
        total_convcharges: totalConvCharges,
        total_ep_charges: totalEpCharges,
        total_gst: totalGST,
        total_pg_charge: totalPGCharge,
        total_rolling_reserve: totalRollingReserve,
        net_settlement_amount: totalSettlementAmount,
        status: 'PENDING_APPROVAL',
        created_at: new Date().toISOString(),
        itemized_settlements: itemizedSettlements
      };
      
      console.log(`[Settlement] Calculated for ${merchantId}:`);
      console.log(`  Gross: ₹${(totalGrossAmount / 100).toFixed(2)}`);
      console.log(`  PG Charge: ₹${(totalPGCharge / 100).toFixed(2)}`);
      console.log(`  Rolling Reserve: ₹${(totalRollingReserve / 100).toFixed(2)}`);
      console.log(`  Net Settlement: ₹${(totalSettlementAmount / 100).toFixed(2)}`);
      
      return settlementBatch;
      
    } catch (error) {
      console.error('[Settlement] Calculation failed:', error.message);
      throw error;
    }
  }

  async getMerchantConfig(merchantId) {
    try {
      const result = await sabpaisaPool.query(
        `SELECT 
          merchantid,
          clientcode as client_code,
          companyname,
          rolling_reserve,
          rolling_percentage,
          no_of_days,
          subscribe,
          subscribe_amount
         FROM merchant_data
         WHERE clientcode = $1`,
        [merchantId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
      
    } catch (error) {
      console.error('[Settlement] Error fetching merchant config:', error.message);
      throw error;
    }
  }

  async getFeeBearerConfig(merchantDbId, paymodeId) {
    try {
      const result = await sabpaisaPool.query(
        `SELECT 
          mfb.fee_bearer_id,
          fb.name as fee_bearer_name
         FROM merchant_fee_bearer mfb
         JOIN fee_bearer fb ON mfb.fee_bearer_id::integer = fb.id
         WHERE mfb.merchant_id = $1 AND mfb.mode_id = $2`,
        [merchantDbId, paymodeId.toString()]
      );
      
      if (result.rows.length === 0) {
        return {
          fee_bearer_id: '2',
          fee_bearer_name: 'merchant'
        };
      }
      
      return result.rows[0];
      
    } catch (error) {
      console.error('[Settlement] Error fetching fee bearer config:', error.message);
      return {
        fee_bearer_id: '2',
        fee_bearer_name: 'merchant'
      };
    }
  }

  async getMDRRates(clientCode, paymodeId) {
    try {
      const result = await sabpaisaPool.query(
        `SELECT 
          convcharges,
          convchargestype,
          endpointcharge,
          endpointchargestypes,
          gst,
          gsttype
         FROM merchant_base_rate
         WHERE client_code = $1 AND paymodeid = $2
         LIMIT 1`,
        [clientCode, paymodeId]
      );
      
      if (result.rows.length === 0) {
        return {
          convcharges: '0',
          convchargestype: 'percentage',
          endpointcharge: '2',
          endpointchargestypes: 'percentage',
          gst: '18',
          gsttype: 'percentage'
        };
      }
      
      return result.rows[0];
      
    } catch (error) {
      console.error('[Settlement] Error fetching MDR rates:', error.message);
      return {
        convcharges: '0',
        convchargestype: 'percentage',
        endpointcharge: '2',
        endpointchargestypes: 'percentage',
        gst: '18',
        gsttype: 'percentage'
      };
    }
  }

  calculateConvCharges(amount, rate, type) {
    if (!rate || rate === '0') return 0;
    
    const rateNum = parseFloat(rate);
    
    if (type === 'percentage') {
      return (amount * rateNum) / 100;
    } else {
      return rateNum;
    }
  }

  calculateEpCharges(amount, rate, type) {
    if (!rate || rate === '0') return 0;
    
    const rateNum = parseFloat(rate);
    
    if (type === 'percentage') {
      return (amount * rateNum) / 100;
    } else {
      return rateNum;
    }
  }

  calculateGST(chargesAmount, rate, type) {
    if (!rate || rate === '0') return 0;
    
    const rateNum = parseFloat(rate);
    
    if (type === 'percentage') {
      return (chargesAmount * rateNum) / 100;
    } else {
      return rateNum;
    }
  }

  getPaymodeIdFromName(paymentMode) {
    const modeMapping = {
      'Debit Card': 1,
      'Credit Card': 2,
      'Net Banking': 3,
      'CASH': 4,
      'NEFT/RTGS': 5,
      'UPI': 6,
      'Wallet': 7
    };
    
    return modeMapping[paymentMode] || 3;
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
      
      const totalCommission = settlementBatch.total_convcharges + settlementBatch.total_ep_charges;
      
      const batchResult = await client.query(batchQuery, [
        settlementBatch.client_code,
        settlementBatch.merchant_name,
        settlementBatch.cycle_date,
        settlementBatch.total_transactions,
        Math.round(settlementBatch.gross_amount * 100),
        Math.round(totalCommission * 100),
        Math.round(settlementBatch.total_gst * 100),
        Math.round(settlementBatch.total_rolling_reserve * 100),
        Math.round(settlementBatch.net_settlement_amount * 100),
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
            Math.round(item.gross_amount * 100),
            Math.round((item.convcharges + item.ep_charges) * 100),
            Math.round(item.gst * 100),
            Math.round(item.rolling_reserve_amount * 100),
            Math.round(item.final_settlement_amount * 100),
            item.payment_mode,
            item.fee_bearer_name
          ]
        );
      }
      
      await client.query('COMMIT');
      
      console.log(`[Settlement] Persisted batch ${batchId} with ${settlementBatch.itemized_settlements.length} items`);
      
      return batchId;
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Settlement] Failed to persist settlement:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await sabpaisaPool.end();
    await v2Pool.end();
    console.log('[Settlement Calculator] Connection pools closed');
  }
}

module.exports = { SettlementCalculatorV1Logic };
