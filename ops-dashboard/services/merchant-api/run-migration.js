const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const v2Pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2'
});

async function runMigration() {
  console.log('🚀 Starting Reports Schema Migration...\n');
  
  try {
    // Read migration SQL file
    const migrationPath = path.join(__dirname, 'migrations', 'create-reports-schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration file loaded:', migrationPath);
    console.log('📏 SQL size:', migrationSQL.length, 'characters\n');
    
    // Execute migration
    console.log('⚙️  Executing migration...');
    const startTime = Date.now();
    await v2Pool.query(migrationSQL);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Migration completed in ${duration}ms\n`);
    
    // Verify tables created
    console.log('🔍 Verifying tables created...');
    
    const tables = [
      'sp_v2_report_metadata',
      'sp_v2_scheduled_reports',
      'sp_v2_report_recipients',
      'sp_v2_disputes',
      'sp_v2_report_downloads_log'
    ];
    
    for (const table of tables) {
      const result = await v2Pool.query(`
        SELECT COUNT(*) AS count FROM ${table}
      `);
      console.log(`  ✓ ${table}: ${result.rows[0].count} rows`);
    }
    
    console.log('\n📊 Sample data verification:');
    
    // Check report types distribution
    const reportTypes = await v2Pool.query(`
      SELECT report_type, COUNT(*) AS count
      FROM sp_v2_report_metadata
      GROUP BY report_type
      ORDER BY report_type
    `);
    
    console.log('\n  Report Types:');
    reportTypes.rows.forEach(row => {
      console.log(`    - ${row.report_type}: ${row.count} reports`);
    });
    
    // Check scheduled reports
    const schedules = await v2Pool.query(`
      SELECT schedule_id, report_name, frequency
      FROM sp_v2_scheduled_reports
      WHERE is_active = true
    `);
    
    console.log('\n  Scheduled Reports:');
    schedules.rows.forEach(row => {
      console.log(`    - ${row.schedule_id}: ${row.report_name} (${row.frequency})`);
    });
    
    // Check recipients
    const recipients = await v2Pool.query(`
      SELECT recipient_email, recipient_role
      FROM sp_v2_report_recipients
      WHERE is_active = true
    `);
    
    console.log('\n  Email Recipients:');
    recipients.rows.forEach(row => {
      console.log(`    - ${row.recipient_email} (${row.recipient_role})`);
    });
    
    // Check disputes
    const disputes = await v2Pool.query(`
      SELECT dispute_id, dispute_type, status
      FROM sp_v2_disputes
    `);
    
    console.log('\n  Sample Disputes:');
    disputes.rows.forEach(row => {
      console.log(`    - ${row.dispute_id}: ${row.dispute_type} (${row.status})`);
    });
    
    console.log('\n✅ All tables created and verified successfully!');
    console.log('\n🎉 Reports backend schema is ready!\n');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await v2Pool.end();
  }
}

runMigration();
