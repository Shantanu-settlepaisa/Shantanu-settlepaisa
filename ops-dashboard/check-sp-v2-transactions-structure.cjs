const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function checkTransactionsTable() {
  try {
    console.log('🔍 Checking sp_v2_transactions table structure:\n');
    console.log('='.repeat(80));

    const txnSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sp_v2_transactions'
      ORDER BY ordinal_position;
    `);

    console.log('  ALL columns in sp_v2_transactions:');
    txnSchema.rows.forEach(col => {
      const marker = col.column_name.includes('refund') || col.column_name.includes('chargeback') ? '⚠️ ' : '  ';
      console.log(`  ${marker}${col.column_name.padEnd(40)} ${col.data_type.padEnd(25)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    // Check if refund columns already exist
    const refundCols = txnSchema.rows.filter(col =>
      col.column_name.includes('refund') || col.column_name.includes('chargeback')
    );

    if (refundCols.length > 0) {
      console.log('\n  ✅ Found refund/chargeback columns:');
      refundCols.forEach(col => console.log(`     ${col.column_name}`));
    } else {
      console.log('\n  ❌ NO refund/chargeback columns in sp_v2_transactions');
    }

    // Check data counts
    const totalCount = await pool.query('SELECT COUNT(*) as count FROM sp_v2_transactions');
    console.log(`\n  📊 Total transactions: ${totalCount.rows[0].count}`);

    // Check source_type breakdown
    const sourceBreakdown = await pool.query(`
      SELECT source_type, COUNT(*) as count
      FROM sp_v2_transactions
      GROUP BY source_type
      ORDER BY count DESC
    `);

    console.log('  📊 Source type breakdown:');
    sourceBreakdown.rows.forEach(row => {
      console.log(`     ${row.source_type || 'NULL'}: ${row.count}`);
    });

    // Sample records
    console.log('\n  📄 Sample transactions (first 3):');
    const samples = await pool.query(`
      SELECT transaction_id, source_type, status, amount_paise, merchant_id
      FROM sp_v2_transactions
      LIMIT 3
    `);
    samples.rows.forEach(row => {
      console.log(`     TXN: ${row.transaction_id}, Source: ${row.source_type}, Status: ${row.status}, Amount: ${row.amount_paise}`);
    });

    console.log('\n');

    // Check sp_v2_transactions_v1 for comparison
    console.log('🔍 Checking sp_v2_transactions_v1 table structure:\n');
    console.log('='.repeat(80));

    const txnV1Schema = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sp_v2_transactions_v1'
      ORDER BY ordinal_position;
    `);

    console.log('  ALL columns in sp_v2_transactions_v1:');
    txnV1Schema.rows.forEach(col => {
      const marker = col.column_name.includes('refund') || col.column_name.includes('chargeback') ? '⚠️ ' : '  ';
      console.log(`  ${marker}${col.column_name.padEnd(40)} ${col.data_type.padEnd(25)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    const v1RefundCols = txnV1Schema.rows.filter(col =>
      col.column_name.includes('refund') || col.column_name.includes('chargeback')
    );

    if (v1RefundCols.length > 0) {
      console.log('\n  ✅ Found refund/chargeback columns in V1 table:');
      v1RefundCols.forEach(col => console.log(`     ${col.column_name}`));
    } else {
      console.log('\n  ❌ NO refund/chargeback columns in sp_v2_transactions_v1');
    }

    console.log('\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTransactionsTable();
