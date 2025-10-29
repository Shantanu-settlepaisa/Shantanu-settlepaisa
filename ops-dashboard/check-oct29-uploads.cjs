const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function main() {
  const client = await pool.connect();

  try {
    console.log('');
    console.log('══════════════════════════════════════════════════════');
    console.log('CHECKING UPLOADED DATA FROM TODAY (Oct 29)');
    console.log('══════════════════════════════════════════════════════');
    console.log('');

    // Check bank statements uploaded today
    const bankData = await client.query(`
      SELECT
        id, bank_name, utr, bank_ref, amount_paise / 100.0 as amount,
        transaction_date, created_at
      FROM sp_v2_bank_statements
      WHERE DATE(created_at) >= '2025-10-29'
      ORDER BY bank_name, id
      LIMIT 15
    `);

    console.log('BANK STATEMENTS (' + bankData.rows.length + ' records):');
    console.log('');

    const byBank = {};
    bankData.rows.forEach(row => {
      if (!byBank[row.bank_name]) byBank[row.bank_name] = [];
      byBank[row.bank_name].push(row);
    });

    Object.keys(byBank).forEach(bankName => {
      const records = byBank[bankName];
      console.log('');
      console.log('Bank: ' + bankName + ' (' + records.length + ' records):');
      records.slice(0, 3).forEach((row, idx) => {
        console.log('  [' + (idx + 1) + '] ID: ' + row.id);
        console.log('      UTR: ' + (row.utr || 'NULL'));
        console.log('      bank_ref: ' + (row.bank_ref || 'NULL'));
        console.log('      Amount: ' + row.amount);
      });
    });

    // Check PG transactions
    console.log('');
    console.log('══════════════════════════════════════════════════════');
    const pgData = await client.query(`
      SELECT
        transaction_id, utr, amount_paise / 100.0 as amount,
        status, created_at
      FROM sp_v2_transactions
      WHERE DATE(created_at) >= '2025-10-29'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log('');
    console.log('PG TRANSACTIONS (' + pgData.rows.length + ' records):');
    console.log('');
    pgData.rows.forEach((row, idx) => {
      console.log('[' + (idx + 1) + '] TXN ID: ' + row.transaction_id);
      console.log('    UTR: ' + (row.utr || 'NULL'));
      console.log('    Amount: ' + row.amount);
      console.log('    Status: ' + row.status);
    });

    // Summary
    const utrCount = bankData.rows.filter(r => r.utr).length;
    const totalBank = bankData.rows.length;

    console.log('');
    console.log('══════════════════════════════════════════════════════');
    console.log('SUMMARY:');
    console.log('══════════════════════════════════════════════════════');
    console.log('Bank Statements: ' + totalBank);
    console.log('With UTR populated: ' + utrCount);
    console.log('With UTR NULL: ' + (totalBank - utrCount));

    if (utrCount === 0) {
      console.log('');
      console.log('PROBLEM: All bank statements have NULL UTR!');
      console.log('This means the v1-mapper is NOT using the updated database mappings.');
    } else if (utrCount === totalBank) {
      console.log('');
      console.log('SUCCESS: All bank statements have UTR populated!');
    } else {
      console.log('');
      console.log('PARTIAL: Some banks have UTR, some do not');
    }

  } catch (error) {
    console.error('');
    console.error('Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
