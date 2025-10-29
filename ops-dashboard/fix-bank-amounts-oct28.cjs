const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

// Correct amounts mapped by UTR
const correctAmounts = {
  'HDFCN0251028001': { gross: 10000.00, net: 9764.00 },
  'HDFCN0251028002': { gross: 25000.00, net: 24410.00 },
  'HDFCN0251028003': { gross: 15000.00, net: 14646.00 },
  'HDFCN0251028004': { gross: 35000.00, net: 34174.00 },
  'HDFCN0251028005': { gross: 20000.00, net: 19528.00 },
  'HDFCN0251028006': { gross: 40000.00, net: 39056.00 },
  'HDFCN0251028007': { gross: 18000.00, net: 17575.00 },
  'HDFCN0251028008': { gross: 28000.00, net: 27339.00 },
  'HDFCN0251028009': { gross: 12000.00, net: 11717.00 },
  'HDFCN0251028010': { gross: 17000.00, net: 16599.00 }
};

async function fixBankAmounts() {
  try {
    console.log('🔧 Fixing bank statement amounts for Oct 28...\n');

    // First, check current state
    const checkResult = await pool.query(`
      SELECT utr, paid_amount_paise / 100.0 as current_amount
      FROM sp_v2_bank_statements
      WHERE merchant_id = 'MERCH001'
        AND DATE(transaction_date) = '2025-10-28'
      ORDER BY utr
    `);

    console.log('Current bank amounts:');
    checkResult.rows.forEach(row => {
      console.log(`  ${row.utr}: ₹${row.current_amount}`);
    });

    // Update each record
    let fixed = 0;
    for (const [utr, amounts] of Object.entries(correctAmounts)) {
      const result = await pool.query(`
        UPDATE sp_v2_bank_statements
        SET
          paid_amount_paise = $1,
          payee_amount_paise = $2
        WHERE merchant_id = 'MERCH001'
          AND utr = $3
          AND DATE(transaction_date) = '2025-10-28'
        RETURNING utr, paid_amount_paise / 100.0 as new_amount
      `, [amounts.gross * 100, amounts.net * 100, utr]);

      if (result.rowCount > 0) {
        console.log(`✅ Fixed ${utr}: ₹${result.rows[0].new_amount}`);
        fixed++;
      }
    }

    console.log(`\n✅ Fixed ${fixed} bank records`);

    // Verify totals
    const totalResult = await pool.query(`
      SELECT
        COUNT(*) as count,
        SUM(paid_amount_paise) / 100.0 as total
      FROM sp_v2_bank_statements
      WHERE merchant_id = 'MERCH001'
        AND DATE(transaction_date) = '2025-10-28'
    `);

    console.log('\n📊 Verification:');
    console.log(`  Count: ${totalResult.rows[0].count}`);
    console.log(`  Total: ₹${totalResult.rows[0].total.toLocaleString('en-IN')}`);
    console.log(`  Expected: ₹2,20,000`);

    if (totalResult.rows[0].total === 220000) {
      console.log('\n🎉 SUCCESS! Amounts match expected total.');
      console.log('\n📌 Next step: Go back to Recon Workspace and click "Run Reconciliation" again.');
    } else {
      console.log('\n⚠️  Total does not match expected. Please verify data.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixBankAmounts();
