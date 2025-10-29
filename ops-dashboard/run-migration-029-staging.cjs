const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Staging RDS connection
const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'admin',
  password: process.env.DB_PASSWORD || 'settlepaisa123',  // Use env var in production
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    console.log('🔄 Running Migration 029 on STAGING RDS...');
    console.log('   Host:', pool.options.host);
    console.log('   Database:', pool.options.database);
    console.log('');

    // Read migration file
    const migrationPath = path.join(__dirname, 'db/migrations/029_add_deductions_to_settlement_batches.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await pool.query(migrationSQL);

    console.log('✅ Migration 029 completed on STAGING!\n');
    console.log('Created:');
    console.log('  • refund_deductions_paise column in sp_v2_settlement_batches');
    console.log('  • chargeback_deductions_paise column in sp_v2_settlement_batches');
    console.log('  • outstanding_debt_recovered_paise column in sp_v2_settlement_batches');
    console.log('  • v_settlement_report view with deduction breakdowns');
    console.log('  • idx_settlement_batches_cycle_merchant index');
    console.log('  • chk_net_amount_valid constraint');
    console.log('');

    // Verify migration
    console.log('🔍 Verifying migration...');
    const verifyResult = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'sp_v2_settlement_batches'
        AND column_name IN ('refund_deductions_paise', 'chargeback_deductions_paise', 'outstanding_debt_recovered_paise')
      ORDER BY column_name
    `);

    if (verifyResult.rows.length === 3) {
      console.log('✅ All 3 columns created successfully:');
      verifyResult.rows.forEach(row => {
        console.log(`   • ${row.column_name} (${row.data_type}, default: ${row.column_default})`);
      });
    } else {
      console.warn('⚠️  Only', verifyResult.rows.length, 'columns found (expected 3)');
    }

    console.log('');
    console.log('✅ Migration 029 deployment to STAGING completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
