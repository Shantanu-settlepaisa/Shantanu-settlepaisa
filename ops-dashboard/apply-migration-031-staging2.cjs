const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
  ssl: false
});

async function applyMigration031() {
  const client = await pool.connect();

  try {
    console.log('========================================');
    console.log('APPLY MIGRATION 031 TO STAGING 2');
    console.log('Add Bank Charges Tracking to Settlement Batches');
    console.log('========================================\n');

    // Read migration file
    const migrationPath = path.join(__dirname, 'db/migrations/031_add_bank_charges_tracking.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('Migration SQL:');
    console.log(migrationSQL);
    console.log('\n');

    // Check if columns already exist
    const checkQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'sp_v2_settlement_batches'
      AND column_name IN ('total_bank_charges_paise', 'settlepaisa_revenue_paise')
    `;

    const existingColumns = await client.query(checkQuery);

    if (existingColumns.rowCount > 0) {
      console.log('⚠️  Columns already exist:');
      existingColumns.rows.forEach(row => {
        console.log(`  - ${row.column_name}`);
      });
      console.log('\nSkipping migration (already applied)');
      return;
    }

    console.log('✅ Columns do not exist yet. Applying migration...\n');

    // Apply migration
    await client.query(migrationSQL);

    console.log('✅ Migration 031 applied successfully!\n');

    // Verify columns were added
    const verifyQuery = `
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'sp_v2_settlement_batches'
      AND column_name IN ('total_bank_charges_paise', 'settlepaisa_revenue_paise')
      ORDER BY column_name
    `;

    const verifyResult = await client.query(verifyQuery);

    console.log('Verification - Columns Added:');
    verifyResult.rows.forEach(row => {
      console.log(`  ✓ ${row.column_name} (${row.data_type}, default: ${row.column_default})`);
    });

    console.log('\n========================================');
    console.log('MIGRATION 031 COMPLETE');
    console.log('========================================');

  } catch (error) {
    console.error('\n❌ Error applying migration:', error.message);
    console.error(error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration031().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
