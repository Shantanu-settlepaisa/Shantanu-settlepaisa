const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function checkMerchantId() {
  try {
    console.log('🔍 CHECKING MERCHANT_ID ISSUE:\n');

    // Check PG transactions
    const pgResult = await pool.query(`
      SELECT merchant_id, COUNT(*) as count
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-28'
      GROUP BY merchant_id
    `);

    console.log('PG Transactions:');
    pgResult.rows.forEach(row => {
      console.log(`  merchant_id: "${row.merchant_id}" (${row.count} txns)`);
    });

    // Check Bank statements  
    const bankResult = await pool.query(`
      SELECT merchant_id, COUNT(*) as count
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-28'
      GROUP BY merchant_id
    `);

    console.log('\nBank Statements:');
    if (bankResult.rows.length === 0) {
      console.log('  ❌ NO merchant_id in bank statements!');
    } else {
      bankResult.rows.forEach(row => {
        console.log(`  merchant_id: "${row.merchant_id}" (${row.count} stmts)`);
      });
    }

    // Check if they match
    if (pgResult.rows.length > 0 && bankResult.rows.length > 0) {
      const pgMerchant = pgResult.rows[0].merchant_id;
      const bankMerchant = bankResult.rows[0].merchant_id;

      if (pgMerchant === bankMerchant) {
        console.log('\n✅ Merchant IDs MATCH!');
      } else {
        console.log('\n❌ Merchant IDs DO NOT MATCH!');
        console.log(`   PG: "${pgMerchant}"`);
        console.log(`   Bank: "${bankMerchant}"`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkMerchantId();
