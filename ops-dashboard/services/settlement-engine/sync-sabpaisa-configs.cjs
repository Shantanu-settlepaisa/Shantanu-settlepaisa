const { Pool } = require('pg');

class SabPaisaConfigSync {
  constructor() {
    this.sabpaisaPool = new Pool({
      host: '3.108.237.99',
      port: 5432,
      user: 'settlepaisainternal',
      password: 'sabpaisa123',
      database: 'settlepaisa'
    });
    
    this.v2Pool = new Pool({
      host: 'localhost',
      port: 5433,
      user: 'postgres',
      password: 'settlepaisa123',
      database: 'settlepaisa_v2'
    });
  }
  
  async logSyncStart(syncType, syncMode = 'full', triggeredBy = 'system') {
    const result = await this.v2Pool.query(`
      INSERT INTO sp_v2_sync_log (
        sync_type, sync_mode, started_at, triggered_by, status
      ) VALUES ($1, $2, NOW(), $3, 'RUNNING')
      RETURNING id
    `, [syncType, syncMode, triggeredBy]);
    
    return result.rows[0].id;
  }
  
  async logSyncEnd(logId, stats, status = 'SUCCESS', errorMessage = null) {
    await this.v2Pool.query(`
      UPDATE sp_v2_sync_log
      SET 
        records_synced = $2,
        records_updated = $3,
        records_inserted = $4,
        records_failed = $5,
        completed_at = NOW(),
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
        status = $6,
        error_message = $7
      WHERE id = $1
    `, [
      logId,
      stats.synced || 0,
      stats.updated || 0,
      stats.inserted || 0,
      stats.failed || 0,
      status,
      errorMessage
    ]);
  }
  
  async syncMerchantMaster(specificMerchantId = null) {
    const logId = await this.logSyncStart(
      'merchant_master', 
      specificMerchantId ? 'single_merchant' : 'full'
    );
    
    const stats = { synced: 0, updated: 0, inserted: 0, failed: 0 };
    
    try {
      console.log('[Sync] Syncing merchant master data...');
      
      let query = `
        SELECT 
          clientcode,
          clientname,
          email_id,
          contactnumber,
          rolling_reserve,
          rolling_percentage,
          no_of_days,
          merchant_settlement_cycle,
          status
        FROM merchant_data
        WHERE 1=1
      `;
      
      const params = [];
      if (specificMerchantId) {
        query += ' AND clientcode = $1';
        params.push(specificMerchantId);
      }
      
      const merchants = await this.sabpaisaPool.query(query, params);
      
      console.log(`  Found ${merchants.rows.length} merchants in SabPaisa`);
      
      for (const merchant of merchants.rows) {
        try {
          const result = await this.v2Pool.query(`
            INSERT INTO sp_v2_merchant_master (
              merchant_id, merchant_name, merchant_email, merchant_phone,
              rolling_reserve_enabled, rolling_reserve_percentage, 
              reserve_hold_days, settlement_cycle,
              is_active, synced_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (merchant_id) 
            DO UPDATE SET
              merchant_name = EXCLUDED.merchant_name,
              merchant_email = EXCLUDED.merchant_email,
              merchant_phone = EXCLUDED.merchant_phone,
              rolling_reserve_enabled = EXCLUDED.rolling_reserve_enabled,
              rolling_reserve_percentage = EXCLUDED.rolling_reserve_percentage,
              reserve_hold_days = EXCLUDED.reserve_hold_days,
              settlement_cycle = EXCLUDED.settlement_cycle,
              is_active = EXCLUDED.is_active,
              synced_at = NOW(),
              updated_at = NOW()
          `, [
            merchant.clientcode,
            merchant.clientname,
            merchant.email_id,
            merchant.contactnumber ? merchant.contactnumber.toString() : null,
            merchant.rolling_reserve || false,
            merchant.rolling_percentage || 0,
            merchant.no_of_days || 0,
            merchant.merchant_settlement_cycle || 1,
            merchant.status === 'Active'
          ]);
          
          if (result.rowCount > 0) {
            stats.synced++;
            stats.inserted++;
          }
          
        } catch (error) {
          console.error(`  ❌ Failed to sync merchant ${merchant.clientcode}:`, error.message);
          stats.failed++;
        }
      }
      
      console.log(`✅ Synced ${stats.synced} merchants (${stats.failed} failed)`);
      
      await this.logSyncEnd(logId, stats, 'SUCCESS');
      
      return stats;
      
    } catch (error) {
      console.error('❌ Merchant master sync failed:', error.message);
      await this.logSyncEnd(logId, stats, 'FAILED', error.message);
      throw error;
    }
  }
  
  async syncCommissionConfig(specificMerchantId = null) {
    const logId = await this.logSyncStart(
      'commission_config',
      specificMerchantId ? 'single_merchant' : 'full'
    );
    
    const stats = { synced: 0, updated: 0, inserted: 0, failed: 0 };
    
    try {
      console.log('[Sync] Syncing commission config...');
      
      let query = `
        SELECT 
          client_code,
          paymodename,
          paymodeid,
          epname,
          endpointcharge,
          endpointchargestypes,
          gst,
          slabfloor,
          slabceiling
        FROM merchant_base_rate
        WHERE 1=1
      `;
      
      const params = [];
      if (specificMerchantId) {
        query += ' AND client_code = $1';
        params.push(specificMerchantId);
      }
      
      const rates = await this.sabpaisaPool.query(query, params);
      
      console.log(`  Found ${rates.rows.length} commission configs in SabPaisa`);
      
      let batchCount = 0;
      const batchSize = 1000;
      
      for (let i = 0; i < rates.rows.length; i++) {
        const rate = rates.rows[i];
        
        try {
          await this.v2Pool.query(`
            INSERT INTO sp_v2_merchant_commission_config (
              merchant_id, payment_mode, payment_mode_id, bank_code, bank_name,
              commission_value, commission_type, gst_percentage,
              slab_floor, slab_ceiling, synced_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            ON CONFLICT (merchant_id, payment_mode, bank_code)
            DO UPDATE SET
              payment_mode_id = EXCLUDED.payment_mode_id,
              bank_name = EXCLUDED.bank_name,
              commission_value = EXCLUDED.commission_value,
              commission_type = EXCLUDED.commission_type,
              gst_percentage = EXCLUDED.gst_percentage,
              slab_floor = EXCLUDED.slab_floor,
              slab_ceiling = EXCLUDED.slab_ceiling,
              synced_at = NOW(),
              updated_at = NOW()
          `, [
            rate.client_code,
            rate.paymodename || 'Unknown',
            rate.paymodeid,
            rate.epname || 'Default',
            rate.epname,
            parseFloat(rate.endpointcharge) || 0,
            rate.endpointchargestypes || 'percentage',
            parseFloat(rate.gst) || 18,
            rate.slabfloor ? parseFloat(rate.slabfloor) : null,
            rate.slabceiling ? parseFloat(rate.slabceiling) : null
          ]);
          
          stats.synced++;
          stats.inserted++;
          
        } catch (error) {
          console.error(`  ❌ Failed to sync rate for ${rate.client_code}:`, error.message);
          stats.failed++;
        }
        
        batchCount++;
        if (batchCount % batchSize === 0) {
          console.log(`  Progress: ${batchCount}/${rates.rows.length} (${Math.round(batchCount/rates.rows.length*100)}%)`);
        }
      }
      
      console.log(`✅ Synced ${stats.synced} commission configs (${stats.failed} failed)`);
      
      await this.logSyncEnd(logId, stats, 'SUCCESS');
      
      return stats;
      
    } catch (error) {
      console.error('❌ Commission config sync failed:', error.message);
      await this.logSyncEnd(logId, stats, 'FAILED', error.message);
      throw error;
    }
  }
  
  async syncFeeBearerConfig(specificMerchantId = null) {
    const logId = await this.logSyncStart(
      'fee_bearer_config',
      specificMerchantId ? 'single_merchant' : 'full'
    );
    
    const stats = { synced: 0, updated: 0, inserted: 0, failed: 0 };
    
    try {
      console.log('[Sync] Syncing fee bearer config...');
      
      let query = `
        SELECT 
          merchant_id,
          mode_id,
          fee_bearer_id
        FROM merchant_fee_bearer
        WHERE 1=1
      `;
      
      const params = [];
      if (specificMerchantId) {
        query += ` AND merchant_id = (
          SELECT loginmasterid FROM merchant_data WHERE clientcode = $1
        )`;
        params.push(specificMerchantId);
      }
      
      const configs = await this.sabpaisaPool.query(query, params);
      
      console.log(`  Found ${configs.rows.length} fee bearer configs in SabPaisa`);
      
      for (const config of configs.rows) {
        try {
          await this.v2Pool.query(`
            INSERT INTO sp_v2_merchant_fee_bearer_config (
              merchant_id, payment_mode_id, fee_bearer_code, synced_at
            ) VALUES ($1, $2, $3, NOW())
            ON CONFLICT (merchant_id, payment_mode_id)
            DO UPDATE SET
              fee_bearer_code = EXCLUDED.fee_bearer_code,
              synced_at = NOW(),
              updated_at = NOW()
          `, [
            config.merchant_id.toString(),
            config.mode_id,
            config.fee_bearer_id
          ]);
          
          stats.synced++;
          stats.inserted++;
          
        } catch (error) {
          console.error(`  ❌ Failed to sync fee bearer for merchant ${config.merchant_id}:`, error.message);
          stats.failed++;
        }
      }
      
      console.log(`✅ Synced ${stats.synced} fee bearer configs (${stats.failed} failed)`);
      
      await this.logSyncEnd(logId, stats, 'SUCCESS');
      
      return stats;
      
    } catch (error) {
      console.error('❌ Fee bearer config sync failed:', error.message);
      await this.logSyncEnd(logId, stats, 'FAILED', error.message);
      throw error;
    }
  }
  
  async syncAll(specificMerchantId = null) {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║     SABPAISA CONFIG SYNC TO V2 SETTLEPAISA            ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    if (specificMerchantId) {
      console.log(`Target: Merchant ${specificMerchantId}\n`);
    } else {
      console.log('Target: All merchants\n');
    }
    
    const startTime = Date.now();
    
    try {
      const results = {
        merchantMaster: await this.syncMerchantMaster(specificMerchantId),
        commissionConfig: await this.syncCommissionConfig(specificMerchantId),
        feeBearerConfig: await this.syncFeeBearerConfig(specificMerchantId)
      };
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log('\n╔════════════════════════════════════════════════════════╗');
      console.log('║                  SYNC SUMMARY                          ║');
      console.log('╚════════════════════════════════════════════════════════╝\n');
      console.log(`Merchant Master:    ${results.merchantMaster.synced} synced, ${results.merchantMaster.failed} failed`);
      console.log(`Commission Config:  ${results.commissionConfig.synced} synced, ${results.commissionConfig.failed} failed`);
      console.log(`Fee Bearer Config:  ${results.feeBearerConfig.synced} synced, ${results.feeBearerConfig.failed} failed`);
      console.log(`\nTotal Duration:     ${duration}s`);
      console.log('\n✅ All configs synced successfully');
      
      return results;
      
    } catch (error) {
      console.error('\n❌ Sync failed:', error.message);
      throw error;
    }
  }
  
  async close() {
    await this.sabpaisaPool.end();
    await this.v2Pool.end();
  }
}

module.exports = { SabPaisaConfigSync };

if (require.main === module) {
  const sync = new SabPaisaConfigSync();
  const merchantId = process.argv[2];
  
  sync.syncAll(merchantId)
    .then(() => {
      console.log('\n✓ Sync completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Sync failed:', error);
      process.exit(1);
    })
    .finally(() => {
      sync.close();
    });
}
