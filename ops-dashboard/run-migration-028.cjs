const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function runMigration() {
  try {
    console.log('🔄 Running Migration 028: Settlement Tracking...\n');

    // Read migration file
    const migrationPath = path.join(__dirname, 'db/migrations/028_add_settlement_tracking.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await pool.query(migrationSQL);

    console.log('✅ Migration 028 completed successfully!\n');
    console.log('Created:');
    console.log('  • is_settlement_processed column in sp_v2_chargebacks');
    console.log('  • sp_v2_merchant_outstanding_debts table');
    console.log('  • Indexes for efficient querying');
    console.log('  • Tracking columns in sp_v2_settlements');
    console.log('');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

runMigration();
