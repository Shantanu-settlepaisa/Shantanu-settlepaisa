const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('[Migration 009] Adding exception_reason column and updating trigger...\n');
    
    const sql = fs.readFileSync('db/migrations/009_add_exception_reason.sql', 'utf8');
    
    await client.query(sql);
    
    console.log('✅ [Migration 009] Completed successfully\n');
    
    // Verify column was added
    const columnCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sp_v2_transactions' 
      AND column_name = 'exception_reason'
    `);
    
    if (columnCheck.rows.length > 0) {
      console.log('✅ Column exception_reason added to sp_v2_transactions');
      console.log(`   Type: ${columnCheck.rows[0].data_type}\n`);
    }
    
    // Verify trigger was updated
    const triggerCheck = await client.query(`
      SELECT pg_get_functiondef(oid) as definition
      FROM pg_proc
      WHERE proname = 'fn_create_exception_workflow'
    `);
    
    if (triggerCheck.rows.length > 0) {
      const def = triggerCheck.rows[0].definition;
      const hasReasonLogic = def.includes('NEW.exception_reason');
      console.log(`✅ Trigger fn_create_exception_workflow updated`);
      console.log(`   Uses NEW.exception_reason: ${hasReasonLogic ? 'YES' : 'NO'}\n`);
    }
    
    // Check SLA configurations
    const slaCheck = await client.query(`
      SELECT reason, severity, hours_to_resolve
      FROM sp_v2_sla_config
      WHERE reason IN ('UTR_NOT_FOUND', 'DUPLICATE_UTR', 'MISSING_UTR', 'NO_PG_TXN')
      ORDER BY reason, severity
    `);
    
    console.log(`✅ SLA Configurations for new reason types (${slaCheck.rows.length} rows):`);
    slaCheck.rows.forEach(row => {
      console.log(`   ${row.reason} / ${row.severity}: ${row.hours_to_resolve}h`);
    });
    
  } catch (error) {
    console.error('❌ [Migration 009] Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
