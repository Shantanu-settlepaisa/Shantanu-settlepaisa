const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Reading migration file...');
    const migrationPath = path.join(__dirname, 'db/migrations/008_exception_workflow_system.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Running migration...');
    await client.query(sql);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify tables created
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE 'sp_v2_exception%'
      ORDER BY table_name
    `);
    
    console.log('\n📊 Created tables:');
    tables.rows.forEach(row => console.log(`  - ${row.table_name}`));
    
    // Verify triggers created
    const triggers = await client.query(`
      SELECT trigger_name, event_object_table
      FROM information_schema.triggers
      WHERE trigger_name LIKE 'trg_%exception%'
      ORDER BY trigger_name
    `);
    
    console.log('\n🔧 Created triggers:');
    triggers.rows.forEach(row => console.log(`  - ${row.trigger_name} on ${row.event_object_table}`));
    
    // Verify functions created
    const functions = await client.query(`
      SELECT proname
      FROM pg_proc
      WHERE proname LIKE 'fn_%'
      ORDER BY proname
    `);
    
    console.log('\n⚙️  Created functions:');
    functions.rows.forEach(row => console.log(`  - ${row.proname}()`));
    
    // Verify default data
    const slaCount = await client.query('SELECT COUNT(*) FROM sp_v2_sla_config');
    const rulesCount = await client.query('SELECT COUNT(*) FROM sp_v2_exception_rules');
    const viewsCount = await client.query('SELECT COUNT(*) FROM sp_v2_exception_saved_views');
    
    console.log('\n📋 Default data inserted:');
    console.log(`  - SLA configs: ${slaCount.rows[0].count}`);
    console.log(`  - Exception rules: ${rulesCount.rows[0].count}`);
    console.log(`  - Saved views: ${viewsCount.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
