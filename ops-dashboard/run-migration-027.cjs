const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function runMigration() {
  try {
    console.log('🔄 Running migration 027: Add refund columns to sp_v2_transactions\n');

    const sql = fs.readFileSync('./db/migrations/027_add_refund_columns_to_transactions.sql', 'utf8');

    await pool.query(sql);

    console.log('✅ Migration completed successfully!\n');

    // Verify columns were added
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sp_v2_transactions'
        AND column_name LIKE '%refund%'
      ORDER BY ordinal_position;
    `);

    console.log('📊 Refund columns in sp_v2_transactions:');
    result.rows.forEach(col => {
      console.log(`   ✅ ${col.column_name.padEnd(40)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    console.log('\n✨ Database ready for refund uploads!\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
