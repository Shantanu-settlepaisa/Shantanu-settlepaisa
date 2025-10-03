const cron = require('node-cron');
const { syncPgTransactions } = require('../services/pg-sync-service');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2'
});

const MERCHANT_CODES = process.env.MERCHANT_CODES ? process.env.MERCHANT_CODES.split(',') : ['ALL'];

async function runDailyPgSync() {
  const syncDate = new Date();
  syncDate.setDate(syncDate.getDate() - 1);
  const cycleDate = syncDate.toISOString().split('T')[0];
  
  console.log('='.repeat(80));
  console.log(`[Daily PG Sync] Starting batch job at ${new Date().toISOString()}`);
  console.log(`[Daily PG Sync] Target Date: ${cycleDate} (T-1)`);
  console.log(`[Daily PG Sync] Merchants: ${MERCHANT_CODES.join(', ')}`);
  console.log('='.repeat(80));
  
  const results = {
    success: [],
    failed: [],
    totalSynced: 0,
    startTime: new Date()
  };
  
  for (const merchantCode of MERCHANT_CODES) {
    try {
      console.log(`\n[Daily PG Sync] Processing merchant: ${merchantCode}`);
      
      const syncResult = await syncPgTransactions(cycleDate, merchantCode);
      
      if (syncResult.success) {
        results.success.push({
          merchant: merchantCode,
          count: syncResult.count,
          source: syncResult.already_synced ? 'DATABASE' : 'API',
          message: syncResult.message
        });
        results.totalSynced += syncResult.count;
        
        console.log(`✅ [Daily PG Sync] ${merchantCode}: ${syncResult.count} transactions`);
      } else {
        results.failed.push({
          merchant: merchantCode,
          error: syncResult.message || 'Unknown error'
        });
        console.error(`❌ [Daily PG Sync] ${merchantCode}: Failed - ${syncResult.message}`);
      }
      
    } catch (error) {
      results.failed.push({
        merchant: merchantCode,
        error: error.message
      });
      console.error(`❌ [Daily PG Sync] ${merchantCode}: Exception -`, error.message);
    }
  }
  
  results.endTime = new Date();
  results.duration = (results.endTime - results.startTime) / 1000;
  
  console.log('\n' + '='.repeat(80));
  console.log('[Daily PG Sync] Batch Job Complete');
  console.log(`[Daily PG Sync] Duration: ${results.duration}s`);
  console.log(`[Daily PG Sync] Success: ${results.success.length}/${MERCHANT_CODES.length} merchants`);
  console.log(`[Daily PG Sync] Total Synced: ${results.totalSynced} transactions`);
  if (results.failed.length > 0) {
    console.log(`[Daily PG Sync] Failed: ${results.failed.length} merchants`);
    results.failed.forEach(f => console.log(`  - ${f.merchant}: ${f.error}`));
  }
  console.log('='.repeat(80));
  
  await logBatchJobResult(cycleDate, results);
  
  return results;
}

async function logBatchJobResult(cycleDate, results) {
  try {
    const client = await pool.connect();
    
    await client.query(`
      INSERT INTO sp_v2_batch_job_logs (
        job_type,
        job_date,
        merchants_processed,
        merchants_success,
        merchants_failed,
        total_transactions_synced,
        duration_seconds,
        status,
        details,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    `, [
      'DAILY_PG_SYNC',
      cycleDate,
      MERCHANT_CODES.length,
      results.success.length,
      results.failed.length,
      results.totalSynced,
      results.duration,
      results.failed.length === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
      JSON.stringify({
        success: results.success,
        failed: results.failed
      })
    ]);
    
    client.release();
    console.log('[Daily PG Sync] Logged to sp_v2_batch_job_logs');
    
  } catch (error) {
    console.error('[Daily PG Sync] Failed to log batch job result:', error.message);
  }
}

function scheduleDailyPgSync() {
  console.log('[Daily PG Sync] Scheduling cron job: Every day at 2:00 AM');
  console.log(`[Daily PG Sync] Merchants to sync: ${MERCHANT_CODES.join(', ')}`);
  
  const cronExpression = '0 2 * * *';
  
  const job = cron.schedule(cronExpression, async () => {
    console.log(`\n[Cron] Triggered: Daily PG Sync at ${new Date().toISOString()}`);
    await runDailyPgSync();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
  
  console.log('[Daily PG Sync] ✓ Cron job scheduled successfully');
  console.log('[Daily PG Sync] Next run: Tomorrow at 2:00 AM IST');
  
  return job;
}

async function runManualSync(cycleDate, merchantCodes) {
  console.log(`[Manual Sync] Running for date: ${cycleDate}, merchants: ${merchantCodes.join(', ')}`);
  
  const originalMerchants = [...MERCHANT_CODES];
  MERCHANT_CODES.length = 0;
  MERCHANT_CODES.push(...merchantCodes);
  
  const result = await runDailyPgSync();
  
  MERCHANT_CODES.length = 0;
  MERCHANT_CODES.push(...originalMerchants);
  
  return result;
}

module.exports = {
  scheduleDailyPgSync,
  runDailyPgSync,
  runManualSync
};
