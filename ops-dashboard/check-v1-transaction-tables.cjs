const { Pool } = require('pg');

const pool = new Pool({
  host: '3.108.237.99',
  port: 5432,
  database: 'settlepaisa_demo',
  user: 'settlepaisainternal_demo',
  password: 'sabpaisa@123',
});

async function checkV1TransactionTables() {
  try {
    console.log('🔍 Checking V1 database for transaction-related tables:\n');
    console.log('='.repeat(80));

    // 1. Find all transaction-related tables
    const tables = await pool.query(`
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE '%transaction%'
      ORDER BY table_name;
    `);

    console.log('  Transaction-related tables:');
    tables.rows.forEach(t => {
      console.log(`    ${t.table_name} (${t.table_type})`);
    });

    console.log('\n');

    // 2. Check if there's a transaction_details table (SabPaisa main transaction table)
    const hasTransactionDetails = tables.rows.some(t => t.table_name === 'transaction_details');

    if (hasTransactionDetails) {
      console.log('✅ Found transaction_details table (SabPaisa main transaction table)');
      console.log('='.repeat(80));

      const detailsSchema = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'transaction_details'
        ORDER BY ordinal_position;
      `);

      console.log('\n  Columns in transaction_details (first 50):');
      detailsSchema.rows.slice(0, 50).forEach(col => {
        const marker = col.column_name.includes('refund') || col.column_name.includes('chargeback') ? '⚠️ ' : '  ';
        console.log(`  ${marker}${col.column_name.padEnd(40)} ${col.data_type.padEnd(25)}`);
      });

      // Check for refund-related columns
      const refundCols = detailsSchema.rows.filter(col =>
        col.column_name.toLowerCase().includes('refund') ||
        col.column_name.toLowerCase().includes('chargeback')
      );

      if (refundCols.length > 0) {
        console.log('\n  ✅ FOUND refund/chargeback columns in transaction_details:');
        refundCols.forEach(col => {
          console.log(`     ${col.column_name}: ${col.data_type}`);
        });
      } else {
        console.log('\n  ❌ NO refund/chargeback columns in transaction_details');
      }

      // Check data count
      const count = await pool.query('SELECT COUNT(*) as count FROM transaction_details');
      console.log(`\n  📊 Total records in transaction_details: ${count.rows[0].count}`);

      // Check if refund data exists
      if (refundCols.length > 0) {
        const refundCount = await pool.query(`
          SELECT COUNT(*) as count
          FROM transaction_details
          WHERE ${refundCols[0].column_name} IS NOT NULL
        `);
        console.log(`  📊 Records with refund data: ${refundCount.rows[0].count}`);
      }

    } else {
      console.log('❌ No transaction_details table found');
    }

    console.log('\n');

    // 3. Check relationship between transaction_details and transactions_to_settle
    console.log('🔍 Checking relationship between tables:\n');
    console.log('='.repeat(80));

    if (hasTransactionDetails) {
      // Check if transactions_to_settle is populated FROM transaction_details
      console.log('  Looking for evidence of data flow: transaction_details → transactions_to_settle\n');

      // Compare transaction counts
      const detailsCount = await pool.query('SELECT COUNT(*) as count FROM transaction_details');
      const settleCount = await pool.query('SELECT COUNT(*) as count FROM transactions_to_settle');

      console.log(`  transaction_details count: ${detailsCount.rows[0].count}`);
      console.log(`  transactions_to_settle count: ${settleCount.rows[0].count}`);

      if (parseInt(settleCount.rows[0].count) < parseInt(detailsCount.rows[0].count)) {
        console.log('\n  ⚠️  transactions_to_settle has FEWER records than transaction_details');
        console.log('     This suggests: transaction_details is source, transactions_to_settle is filtered subset');
      }
    }

    console.log('\n');

    // 4. Summary
    console.log('📊 SUMMARY:\n');
    console.log('='.repeat(80));
    console.log(`  transaction_details exists: ${hasTransactionDetails ? '✅ YES' : '❌ NO'}`);
    console.log(`  transactions_to_settle exists: ✅ YES (already confirmed)`);

    if (hasTransactionDetails) {
      console.log('\n  🎯 Key Finding:');
      console.log('     - transaction_details is SabPaisa\'s main transaction table');
      console.log('     - transactions_to_settle is a COPY/SUBSET for settlement processing');
      console.log('     - Need to check if transaction_details has refund columns built-in');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkV1TransactionTables();
