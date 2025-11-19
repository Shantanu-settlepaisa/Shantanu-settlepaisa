const { Pool } = require('pg');
const config = require('../config/env.cjs');

const sabpaisaPool = new Pool({
  user: config.sabpaisaDb.user,
  host: config.sabpaisaDb.host,
  database: config.sabpaisaDb.database,
  password: config.sabpaisaDb.password,
  port: config.sabpaisaDb.port,
});

const v2Pool = new Pool({
  user: config.db.user,
  host: config.db.host,
  database: config.db.database,
  password: config.db.password,
  port: config.db.port,
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

        // V1 Logic: Calculate convChargeGst (SabPaisa's internal adjustment)
        const convChargeGst = this.calculateConvChargeGst(
          convCharges,
          mdrRates.sp_conv_rate,
          mdrRates.sp_conv_rate_type
        );

        // V1 Logic: Total charges = convcharges + ep_charges + gst + convChargeGst
        // Apply same rounding as V1 (.toFixed(2))
        let charges = convCharges + epCharges + gst;
        charges = Number(charges.toFixed(2));
        charges += Number(convChargeGst);

        const pgCharge = charges;

        let settlementAmount = 0;

        if (feeBearerConfig.fee_bearer_id === '1') {
          // Bank bears the fee
          settlementAmount = txn.paid_amount;
        } else if (feeBearerConfig.fee_bearer_id === '2') {
          // Merchant bears the fee
          settlementAmount = txn.paid_amount - pgCharge;
        } else if (feeBearerConfig.fee_bearer_id === '3') {
          // Payer bears the fee - use payee_amount, recalculate charges
          settlementAmount = txn.payee_amount;
          charges = Number(txn.paid_amount) - Number(txn.payee_amount);
        } else if (feeBearerConfig.fee_bearer_id === '4') {
          // Subscriber bears the fee
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
          conv_charge_gst: convChargeGst,  // V1 specific adjustment for audit
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
      // Mock config for test merchants
      if (merchantId.startsWith('TEST_') || merchantId.startsWith('MERCH_') || merchantId.startsWith('MERCH')) {
        console.log(`[Settlement] Using mock config for test merchant: ${merchantId}`);
        return {
          merchantid: 999999,
          client_code: merchantId,
          companyname: `Test Company ${merchantId}`,
          rolling_reserve: false,
          rolling_percentage: 0,
          no_of_days: 0,
          subscribe: false,
          subscribe_amount: 0
        };
      }

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
      // Mock for test merchants (merchantDbId 999999 from above)
      if (merchantDbId === 999999) {
        return {
          fee_bearer_id: '2',
          fee_bearer_name: 'merchant'
        };
      }

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
      // Mock MDR rates for test merchants
      if (clientCode.startsWith('TEST_') || clientCode.startsWith('MERCH_') || clientCode.startsWith('MERCH')) {
        return {
          convcharges: '0',
          convchargestype: 'percentage',
          endpointcharge: '2',
          endpointchargestypes: 'percentage',
          gst: '18',
          gsttype: 'percentage',
          sp_conv_rate: '0',
          sp_conv_rate_type: 'fixed'
        };
      }

      const result = await sabpaisaPool.query(
        `SELECT
          convcharges,
          convchargestype,
          endpointcharge,
          endpointchargestypes,
          gst,
          gsttype,
          sp_conv_rate,
          sp_conv_rate_type
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
          gsttype: 'percentage',
          sp_conv_rate: '0',
          sp_conv_rate_type: 'fixed'
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
        gsttype: 'percentage',
        sp_conv_rate: '0',
        sp_conv_rate_type: 'fixed'
      };
    }
  }

  /**
   * Calculate convChargeGst - V1 specific adjustment
   * This is SabPaisa's internal adjustment for convenience charge GST
   */
  calculateConvChargeGst(convCharges, spConvRate, spConvRateType) {
    const spRate = parseFloat(spConvRate) || 0;

    if (spConvRateType === 'fixed') {
      return convCharges - spRate;
    } else {
      // Percentage type
      return (convCharges - (convCharges * spRate)) / 100;
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

      // 🆕 STEP 1: Calculate total bank charges from transactions
      console.log(`   💳 [Bank Fees] Calculating for ${settlementBatch.client_code}, cycle ${settlementBatch.cycle_date}...`);

      const bankChargesQuery = `
        SELECT
          COALESCE(SUM(bank_fee_paise), 0) as total_bank_fees,
          COUNT(*) FILTER (WHERE bank_fee_paise IS NOT NULL AND bank_fee_paise > 0) as transactions_with_fees
        FROM sp_v2_transactions
        WHERE merchant_id = $1
          AND DATE(transaction_date) = $2
          AND status = 'RECONCILED'
      `;

      const bankChargesResult = await client.query(bankChargesQuery, [
        settlementBatch.client_code,
        settlementBatch.cycle_date
      ]);

      const totalBankChargesPaise = parseInt(bankChargesResult.rows[0].total_bank_fees) || 0;
      const transactionsWithFees = parseInt(bankChargesResult.rows[0].transactions_with_fees) || 0;

      console.log(`   💰 [Bank Fees] Total: ₹${(totalBankChargesPaise / 100).toFixed(2)} (${transactionsWithFees}/${settlementBatch.total_transactions} transactions)`);

      // 🆕 STEP 2: Calculate SettlePaisa's net revenue
      const totalCommission = settlementBatch.total_convcharges + settlementBatch.total_ep_charges;
      const totalCommissionPaise = Math.round(totalCommission * 100);
      const settlepaisaRevenuePaise = totalCommissionPaise - totalBankChargesPaise;

      console.log(`   📊 [Revenue Split]:`);
      console.log(`      • Total MDR Collected: ₹${(totalCommissionPaise / 100).toFixed(2)}`);
      console.log(`      • Bank's Share: ₹${(totalBankChargesPaise / 100).toFixed(2)} (${totalCommissionPaise > 0 ? ((totalBankChargesPaise / totalCommissionPaise) * 100).toFixed(1) : 0}%)`);
      console.log(`      • SettlePaisa Revenue: ₹${(settlepaisaRevenuePaise / 100).toFixed(2)} (${totalCommissionPaise > 0 ? ((settlepaisaRevenuePaise / totalCommissionPaise) * 100).toFixed(1) : 0}%)`);

      // 🆕 STEP 3: Insert batch with bank charges tracking
      const batchQuery = `
        INSERT INTO sp_v2_settlement_batches
        (merchant_id, merchant_name, cycle_date, total_transactions,
         gross_amount_paise, total_commission_paise, total_gst_paise,
         total_reserve_paise, total_bank_charges_paise, settlepaisa_revenue_paise,
         net_amount_paise, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        RETURNING id
      `;
      
      const batchResult = await client.query(batchQuery, [
        settlementBatch.client_code,                                  // $1
        settlementBatch.merchant_name,                                // $2
        settlementBatch.cycle_date,                                   // $3
        settlementBatch.total_transactions,                           // $4
        Math.round(settlementBatch.gross_amount * 100),               // $5: gross_amount_paise
        totalCommissionPaise,                                         // $6: total_commission_paise
        Math.round(settlementBatch.total_gst * 100),                  // $7: total_gst_paise
        Math.round(settlementBatch.total_rolling_reserve * 100),      // $8: total_reserve_paise
        totalBankChargesPaise,                                        // $9: total_bank_charges_paise (NEW)
        settlepaisaRevenuePaise,                                      // $10: settlepaisa_revenue_paise (NEW)
        Math.round(settlementBatch.net_settlement_amount * 100),      // $11: net_amount_paise
        settlementBatch.status                                        // $12: status
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

      // Update transactions to link them to the settlement batch
      const transactionIds = settlementBatch.itemized_settlements.map(item => item.transaction_id);
      if (transactionIds.length > 0) {
        const updateResult = await client.query(
          `UPDATE sp_v2_transactions
           SET settlement_batch_id = $1,
               updated_at = NOW()
           WHERE transaction_id = ANY($2::text[])`,
          [batchId, transactionIds]
        );
        console.log(`[Settlement] Linked ${updateResult.rowCount} transactions to batch ${batchId}`);
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
