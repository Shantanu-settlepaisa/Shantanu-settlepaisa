#!/usr/bin/env node
/**
 * Apply Migration 032 to Staging 2 Database
 * Run: node apply-migration-032-staging2.cjs
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration for Staging 2
const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024!',
  ssl: false
});

async function applyMigrations() {
  const client = await pool.connect();

  try {
    console.log('=========================================');
    console.log('Applying Migration 032 to Staging 2');
    console.log('=========================================\n');

    console.log('Database: settlepaisa_v2');
    console.log('Host: settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com\n');

    // Step 1: Apply gross_amount migration
    console.log('Step 1: Applying 032_add_gross_amount_to_transactions.sql');
    console.log('----------------------------------------------------------------------');

    const migration1Path = path.join(__dirname, 'db/migrations/032_add_gross_amount_to_transactions.sql');
    const migration1SQL = fs.readFileSync(migration1Path, 'utf8');

    await client.query(migration1SQL);
    console.log('✅ Migration 032_add_gross_amount_to_transactions.sql applied successfully\n');

    // Step 2: Apply upload_sessions migration
    console.log('Step 2: Applying 032_add_upload_sessions.sql');
    console.log('----------------------------------------------------------------------');

    const migration2Path = path.join(__dirname, 'db/migrations/032_add_upload_sessions.sql');
    const migration2SQL = fs.readFileSync(migration2Path, 'utf8');

    await client.query(migration2SQL);
    console.log('✅ Migration 032_add_upload_sessions.sql applied successfully\n');

    // Step 3: Verify tables exist
    console.log('Step 3: Verifying tables');
    console.log('----------------------------------------------------------------------');

    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('sp_v2_upload_sessions', 'sp_v2_transactions')
      ORDER BY table_name
    `);

    console.log('Tables found:');
    tableCheck.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });

    // Step 4: Verify columns
    console.log('\nVerifying columns in sp_v2_transactions:');
    const columnCheck = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'sp_v2_transactions'
      AND column_name IN ('gross_amount_paise', 'upload_session_id')
      ORDER BY column_name
    `);

    columnCheck.rows.forEach(row => {
      console.log(`  ✓ ${row.column_name} (${row.data_type})`);
    });

    console.log('\n=========================================');
    console.log('✅ All migrations applied successfully!');
    console.log('=========================================\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migrations
applyMigrations()
  .then(() => {
    console.log('Migration process completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
