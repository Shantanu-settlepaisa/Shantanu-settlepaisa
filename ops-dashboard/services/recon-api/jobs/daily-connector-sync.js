const cron = require('node-cron');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2'
});

async function runDailyConnectorSync() {
  const syncDate = new Date();
  syncDate.setDate(syncDate.getDate() - 1);
  const cycleDate = syncDate.toISOString().split('T')[0];
  
  console.log(`[Daily Connector Sync] Starting sync for ${cycleDate}`);
  
  try {
    const result = await pool.query(`
      SELECT * FROM sp_v2_connectors
      WHERE connector_type IN ('BANK_SFTP', 'BANK_API')
        AND status = 'ACTIVE'
        AND schedule_enabled = true
    `);
    
    console.log(`[Daily Connector Sync] Found ${result.rows.length} active connectors`);
    
    for (const connector of result.rows) {
      try {
        console.log(`[Daily Connector Sync] Running connector: ${connector.name}`);
        
        const runId = await pool.query(`
          INSERT INTO sp_v2_connector_runs (
            connector_id, run_type, run_date, status, triggered_by
          ) VALUES ($1, 'SCHEDULED', $2, 'RUNNING', 'CRON')
          RETURNING id
        `, [connector.id, cycleDate]);
        
        const startTime = Date.now();
        let runResult;
        
        if (connector.connector_type === 'BANK_SFTP') {
          const { downloadSftpFiles } = require('../services/sftp-connector-service');
          runResult = await downloadSftpFiles(
            connector.connection_config,
            cycleDate,
            connector.source_entity
          );
        } else if (connector.connector_type === 'BANK_API') {
          const { fetchFromBankApi } = require('../services/api-connector-service');
          runResult = await fetchFromBankApi(
            connector.connection_config,
            cycleDate,
            connector.source_entity
          );
        }
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        await pool.query(`
          UPDATE sp_v2_connector_runs
          SET 
            status = $1,
            records_processed = $2,
            duration_seconds = $3,
            completed_at = NOW(),
            details = $4
          WHERE id = $5
        `, [
          runResult.success ? 'SUCCESS' : 'FAILED',
          runResult.recordsProcessed || runResult.count || 0,
          duration,
          JSON.stringify(runResult),
          runId.rows[0].id
        ]);
        
        await pool.query(`
          UPDATE sp_v2_connectors
          SET 
            last_run_at = NOW(),
            last_run_status = $1,
            total_runs = total_runs + 1,
            success_count = success_count + $2,
            failure_count = failure_count + $3
          WHERE id = $4
        `, [
          runResult.success ? 'SUCCESS' : 'FAILED',
          runResult.success ? 1 : 0,
          runResult.success ? 0 : 1,
          connector.id
        ]);
        
        console.log(`[Daily Connector Sync] ✓ ${connector.name}: ${runResult.success ? 'SUCCESS' : 'FAILED'}`);
        
      } catch (error) {
        console.error(`[Daily Connector Sync] ✗ ${connector.name} failed:`, error.message);
      }
    }
    
    console.log(`[Daily Connector Sync] Completed`);
    
  } catch (error) {
    console.error('[Daily Connector Sync] Error:', error);
  }
}

function scheduleConnectorSync() {
  const cronExpression = '0 19 * * *';
  
  console.log('[Daily Connector Sync] Scheduling SFTP/API connector job: Every day at 7:00 PM IST');
  
  cron.schedule(cronExpression, runDailyConnectorSync, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });
  
  console.log('[Daily Connector Sync] ✓ Cron job scheduled successfully');
}

module.exports = {
  scheduleConnectorSync,
  runDailyConnectorSync
};
