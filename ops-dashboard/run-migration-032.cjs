#!/usr/bin/env node

/**
 * Migration 032 Runner: Add Upload Sessions Tracking
 * Purpose: Run migration to prevent data loss from partial uploads
 * Date: 2025-10-25
 * Issue: #3 - Concurrent Upload Data Loss Risk (Phase 1)
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('./services/config/env.cjs');

const pool = new Pool({
  user: config.db.user,
  host: config.db.host,
  database: config.db.database,
  password: config.db.password,
  port: config.db.port,
});

async function runMigration() {
  const client = await pool.connect();
  console.log('🚀 [Migration 032] Starting migration...\n');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'db', 'migrations', '032_add_upload_sessions.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📋 [Migration 032] Migration file loaded');
    console.log('📊 [Migration 032] Checking current schema...\n');

    // Check if sp_v2_upload_sessions table already exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'sp_v2_upload_sessions'
      );
    `);

    if (tableCheck.rows[0].exists) {
      console.log('⚠️  [Migration 032] sp_v2_upload_sessions table already exists');
      console.log('🔍 [Migration 032] Checking column existence...\n');

      // Check if upload_session_id column exists in sp_v2_transactions
      const columnCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = 'sp_v2_transactions'
          AND column_name = 'upload_session_id'
        );
      `);

      if (columnCheck.rows[0].exists) {
        console.log('✅ [Migration 032] Migration already applied - upload_session_id column exists');
        console.log('📊 [Migration 032] Getting current session count...\n');

        const sessionCount = await client.query('SELECT COUNT(*) FROM sp_v2_upload_sessions');
        const txnWithSession = await client.query('SELECT COUNT(*) FROM sp_v2_transactions WHERE upload_session_id IS NOT NULL');

        console.log(`📈 Current state:`);
        console.log(`   - Upload sessions: ${sessionCount.rows[0].count}`);
        console.log(`   - Transactions with session ID: ${txnWithSession.rows[0].count}`);
        console.log('\n✅ Migration 032 is already applied. Nothing to do.\n');
        return;
      }
    }

    console.log('🔨 [Migration 032] Applying migration...\n');

    // Execute migration
    await client.query(migrationSQL);

    console.log('✅ [Migration 032] Migration executed successfully!\n');

    // Verify tables created
    console.log('🔍 [Migration 032] Verifying schema changes...\n');

    // Check sp_v2_upload_sessions table
    const uploadSessionsCheck = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'sp_v2_upload_sessions'
      ORDER BY ordinal_position;
    `);

    console.log('📋 sp_v2_upload_sessions columns:');
    uploadSessionsCheck.rows.forEach(row => {
      console.log(`   - ${row.column_name} (${row.data_type}${row.is_nullable === 'NO' ? ', NOT NULL' : ''})`);
    });

    // Check sp_v2_transactions.upload_session_id column
    const txnColumnCheck = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'sp_v2_transactions' AND column_name = 'upload_session_id';
    `);

    console.log('\n📋 sp_v2_transactions new column:');
    txnColumnCheck.rows.forEach(row => {
      console.log(`   - ${row.column_name} (${row.data_type}${row.is_nullable === 'NO' ? ', NOT NULL' : ''})`);
    });

    // Check constraints
    const constraintCheck = await client.query(`
      SELECT conname, contype
      FROM pg_constraint
      WHERE conrelid = 'sp_v2_transactions'::regclass
      AND conname = 'unique_txn_merchant';
    `);

    console.log('\n📋 Constraints:');
    if (constraintCheck.rows.length > 0) {
      console.log(`   ✅ unique_txn_merchant constraint created`);
    } else {
      console.log(`   ⚠️  unique_txn_merchant constraint not found`);
    }

    // Check indexes
    const indexCheck = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'sp_v2_upload_sessions'
      OR (tablename = 'sp_v2_transactions' AND indexname = 'idx_transactions_upload_session')
      ORDER BY indexname;
    `);

    console.log('\n📋 Indexes created:');
    indexCheck.rows.forEach(row => {
      console.log(`   ✅ ${row.indexname}`);
    });

    // Check triggers
    const triggerCheck = await client.query(`
      SELECT trigger_name, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'sp_v2_upload_sessions';
    `);

    console.log('\n📋 Triggers created:');
    if (triggerCheck.rows.length > 0) {
      triggerCheck.rows.forEach(row => {
        console.log(`   ✅ ${row.trigger_name} (${row.event_manipulation})`);
      });
    } else {
      console.log(`   ⚠️  No triggers found`);
    }

    console.log('\n✅ [Migration 032] Schema verification complete!');
    console.log('\n🎉 Migration 032 applied successfully!\n');

  } catch (error) {
    console.error('❌ [Migration 032] Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('✅ Migration complete. Exiting...');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
