const { Pool } = require('pg');

const pool = new Pool({
  host: '3.108.237.99',
  port: 5432,
  database: 'settlepaisa_demo',
  user: 'settlepaisainternal_demo',
  password: 'sabpaisa@123',
});

async function checkV1Database() {
  try {
    console.log('🔌 Connecting to V1 Production Database...\n');

    // 1. List ALL tables
    console.log('📋 ALL Tables in V1 Database:');
    console.log('='.repeat(80));
    const allTablesResult = await pool.query(`
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    allTablesResult.rows.forEach((row, idx) => {
      console.log(`  ${(idx + 1).toString().padStart(3)}. ${row.table_name}`);
    });

    console.log(`\n  📊 Total tables: ${allTablesResult.rows.length}\n`);

    // 2. Check transactions_to_settle table (V1's main transaction table)
    console.log('🔍 V1 transactions_to_settle table structure:');
    console.log('='.repeat(80));
    const txnTableExists = allTablesResult.rows.some(r => r.table_name === 'transactions_to_settle');

    if (txnTableExists) {
      const txnSchema = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'transactions_to_settle'
        ORDER BY ordinal_position;
      `);

      console.log('  Columns related to REFUNDS/CHARGEBACKS:');
      const refundColumns = txnSchema.rows.filter(col =>
        col.column_name.toLowerCase().includes('refund') ||
        col.column_name.toLowerCase().includes('chargeback')
      );

      if (refundColumns.length > 0) {
        refundColumns.forEach(col => {
          console.log(`    ✅ ${col.column_name.padEnd(35)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
        });
      } else {
        console.log('    ❌ No refund/chargeback columns found');
      }

      console.log('\n  ALL Columns (first 50):');
      txnSchema.rows.slice(0, 50).forEach(col => {
        console.log(`    ${col.column_name.padEnd(40)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });

      // Check data counts
      const totalCount = await pool.query('SELECT COUNT(*) as count FROM transactions_to_settle');
      console.log(`\n  📊 Total transactions: ${totalCount.rows[0].count}`);

      // Check refund/chargeback data
      const refundCount = await pool.query(`
        SELECT COUNT(*) as count
        FROM transactions_to_settle
        WHERE refund_type IS NOT NULL
      `);
      console.log(`  📊 Transactions with refund_type: ${refundCount.rows[0].count}`);

      if (parseInt(refundCount.rows[0].count) > 0) {
        const refundBreakdown = await pool.query(`
          SELECT refund_type, COUNT(*) as count
          FROM transactions_to_settle
          WHERE refund_type IS NOT NULL
          GROUP BY refund_type
        `);
        console.log('  📊 Refund type breakdown:');
        refundBreakdown.rows.forEach(row => {
          console.log(`     ${row.refund_type}: ${row.count}`);
        });

        // Sample refund records
        console.log('\n  📄 Sample refund records:');
        const sampleRefunds = await pool.query(`
          SELECT transaction_id, refund_type, refund_transaction_amount,
                 refund_transaction_date, is_refund_done, chargeback_processing_fee
          FROM transactions_to_settle
          WHERE refund_type IS NOT NULL
          LIMIT 5
        `);
        sampleRefunds.rows.forEach(row => {
          console.log(`     TXN: ${row.transaction_id}`);
          console.log(`       Type: ${row.refund_type}, Amount: ${row.refund_transaction_amount}`);
          console.log(`       Date: ${row.refund_transaction_date}, Done: ${row.is_refund_done}`);
          console.log(`       Chargeback Fee: ${row.chargeback_processing_fee || 'N/A'}`);
          console.log('');
        });
      }

      console.log('\n');
    } else {
      console.log('  ❌ transactions_to_settle table NOT found!\n');
    }

    // 3. Check for any V2 tables (shouldn't be any)
    console.log('🔍 Checking for V2 tables (sp_v2_*):');
    console.log('='.repeat(80));
    const v2Tables = allTablesResult.rows.filter(r => r.table_name.startsWith('sp_v2_'));
    if (v2Tables.length > 0) {
      console.log('  ⚠️  Found V2 tables in V1 database:');
      v2Tables.forEach(t => console.log(`     ${t.table_name}`));
    } else {
      console.log('  ✅ No V2 tables found (as expected for V1 database)');
    }

    console.log('\n');

    // 4. Summary
    console.log('📊 V1 DATABASE SUMMARY:');
    console.log('='.repeat(80));
    console.log(`  Total tables: ${allTablesResult.rows.length}`);
    console.log(`  transactions_to_settle exists: ${txnTableExists ? '✅ YES' : '❌ NO'}`);
    console.log(`  V2 tables exist: ${v2Tables.length > 0 ? '⚠️  YES (unexpected)' : '✅ NO (expected)'}`);
    console.log('\n  ✅ This is confirmed V1 database');
    console.log('  ⚠️  V2 database connection needed for Phase 1 implementation\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

checkV1Database();
