const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function checkJobsTable() {
  const client = await pool.connect();

  try {
    console.log('='.repeat(80));
    console.log('PHASE 1: INVESTIGATING sp_v2_reconciliation_jobs TABLE');
    console.log('='.repeat(80));
    console.log();

    // 1. Check if table exists
    console.log('1️⃣  Checking if table exists...');
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'sp_v2_reconciliation_jobs'
      );
    `);
    console.log(`   Table exists: ${tableExists.rows[0].exists}`);
    console.log();

    if (!tableExists.rows[0].exists) {
      console.log('❌ TABLE DOES NOT EXIST - This is the root cause!');
      await pool.end();
      return;
    }

    // 2. Get table schema
    console.log('2️⃣  Table schema:');
    const schema = await client.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'sp_v2_reconciliation_jobs'
      ORDER BY ordinal_position;
    `);

    console.log('   Columns:');
    schema.rows.forEach(col => {
      console.log(`     - ${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    console.log();

    // 3. Count records
    console.log('3️⃣  Record count:');
    const count = await client.query('SELECT COUNT(*) as total FROM sp_v2_reconciliation_jobs');
    console.log(`   Total records: ${count.rows[0].total}`);
    console.log();

    // 4. Recent records
    if (parseInt(count.rows[0].total) > 0) {
      console.log('4️⃣  Recent jobs:');
      const recent = await client.query(`
        SELECT job_id, date_from, date_to, status, total_pg_records, matched_records, processing_start
        FROM sp_v2_reconciliation_jobs
        ORDER BY processing_start DESC
        LIMIT 5
      `);
      console.log('   Recent jobs:');
      recent.rows.forEach(job => {
        console.log(`     ${job.job_id}: ${job.date_from} | Status: ${job.status} | PG: ${job.total_pg_records} | Matched: ${job.matched_records}`);
      });
    } else {
      console.log('4️⃣  No records found in table');
      console.log('   ⚠️  This confirms the E2E test report finding');
    }
    console.log();

    // 5. Check for any errors in persistence
    console.log('5️⃣  Checking for constraint violations or issues...');
    const constraints = await client.query(`
      SELECT
        conname AS constraint_name,
        contype AS constraint_type
      FROM pg_constraint
      WHERE conrelid = 'sp_v2_reconciliation_jobs'::regclass;
    `);

    if (constraints.rows.length > 0) {
      console.log('   Constraints:');
      constraints.rows.forEach(c => {
        const type = {
          'p': 'PRIMARY KEY',
          'f': 'FOREIGN KEY',
          'u': 'UNIQUE',
          'c': 'CHECK'
        }[c.constraint_type] || c.constraint_type;
        console.log(`     - ${c.constraint_name}: ${type}`);
      });
    } else {
      console.log('   No constraints found');
    }
    console.log();

    console.log('='.repeat(80));
    console.log('INVESTIGATION COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

checkJobsTable();
