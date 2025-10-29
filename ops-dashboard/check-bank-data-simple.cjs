const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function checkBankData() {
  try {
    console.log('🏦 BANK STATEMENTS FOR OCT 28:\n');

    const result = await pool.query(`
      SELECT
        utr,
        bank_ref,
        amount_paise / 100.0 as amount,
        gross_amount_paise / 100.0 as gross_amount,
        bank_fee_paise / 100.0 as bank_fee,
        bank_name,
        transaction_date,
        created_at::timestamp
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-28'
      ORDER BY utr
    `);

    if (result.rows.length === 0) {
      console.log('❌ NO BANK STATEMENTS FOUND FOR 2025-10-28!');
      console.log('   This means the bank file was NOT uploaded successfully.');
    } else {
      console.log(`✅ Found ${result.rows.length} bank statements:\n`);
      result.rows.forEach(row => {
        console.log(`UTR: ${row.utr}`);
        console.log(`  Amount (amount_paise): ₹${row.amount} ⚠️ RECON USES THIS!`);
        console.log(`  Gross Amount: ₹${row.gross_amount}`);
        console.log(`  Bank Fee: ₹${row.bank_fee || 0}`);
        console.log(`  Bank: ${row.bank_name}`);
        console.log(`  Date: ${row.transaction_date}`);
        console.log();
      });

      // Calculate total
      const total = result.rows.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
      console.log(`\n💰 TOTAL BANK AMOUNT: ₹${total.toLocaleString('en-IN')}`);
      console.log(`   Expected: ₹2,20,000`);

      if (total === 0) {
        console.log('\n❌ PROBLEM FOUND: amount_paise is 0 for all records!');
        console.log('   This is why reconciliation shows "Bank ₹0.00"');
      } else if (total === 220000) {
        console.log('\n✅ AMOUNTS ARE CORRECT!');
        console.log('   Reconciliation should work. Check UTR matching.');
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkBankData();
