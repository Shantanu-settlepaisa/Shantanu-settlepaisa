const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function checkData() {
  console.log('\n📊 PG Transactions:');
  const pgResult = await pool.query(`
    SELECT transaction_id, amount_paise, gross_amount_paise, bank_fee_paise, utr
    FROM sp_v2_transactions
    WHERE transaction_id LIKE 'TXN20251023V1%'
    ORDER BY transaction_id
    LIMIT 3
  `);

  pgResult.rows.forEach(row => {
    console.log(`\n  ${row.transaction_id}:`);
    console.log(`    net (payee_amount):  ${row.amount_paise} paise (expect: 9788)`);
    console.log(`    gross (paid_amount): ${row.gross_amount_paise} paise (expect: 10000)`);
    console.log(`    bank_fee:            ${row.bank_fee_paise || 0} paise (expect: 212)`);
  });

  console.log('\n\n📊 Bank Statements:');
  const bankResult = await pool.query(`
    SELECT utr, amount_paise, gross_amount_paise, bank_fee_paise, bank_gst_paise
    FROM sp_v2_bank_statements
    WHERE utr LIKE 'UTR20251023V1%'
    ORDER BY utr
    LIMIT 3
  `);

  bankResult.rows.forEach(row => {
    console.log(`\n  ${row.utr}:`);
    console.log(`    net (payee_amount): ${row.amount_paise} paise (expect: 9788)`);
    console.log(`    gross (paid_amount): ${row.gross_amount_paise} paise (expect: 10000)`);
    console.log(`    bank_fee:           ${row.bank_fee_paise || 0} paise (expect: 200)`);
    console.log(`    bank_gst:           ${row.bank_gst_paise || 0} paise (expect: 12)`);
  });

  await pool.end();
}

checkData().catch(console.error);
