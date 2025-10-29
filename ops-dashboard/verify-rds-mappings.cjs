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
    console.log('=== BANK COLUMN MAPPINGS IN RDS ===');
    console.log('');

    const result = await client.query(`
      SELECT bank_name, v1_column_mappings
      FROM sp_v2_bank_column_mappings
      WHERE bank_name IN ('HDFC BANK', 'AXIS BANK', 'BOB')
      ORDER BY bank_name
    `);

    result.rows.forEach(r => {
      console.log('Bank:', r.bank_name);
      const mappings = r.v1_column_mappings;
      console.log('  UTR mapping:', mappings.utr || 'NOT SET ❌');
      console.log('  transaction_id mapping:', mappings.transaction_id || 'NOT SET');
      console.log('');
    });

    console.log('=== CHECKING UPLOADED BANK DATA (Oct 28) ===');
    console.log('');

    const bankData = await client.query(`
      SELECT bank_name, COUNT(*) as count,
             COUNT(utr) as utr_populated,
             COUNT(bank_ref) as bank_ref_populated
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = '2025-10-28'
      GROUP BY bank_name
      ORDER BY bank_name
    `);

    if (bankData.rows.length === 0) {
      console.log('❌ NO BANK DATA FOUND FOR OCT 28 in RDS');
      console.log('This means uploads are going to a DIFFERENT database!');
    } else {
      console.log('Bank statements found:');
      bankData.rows.forEach(r => {
        console.log('');
        console.log('Bank:', r.bank_name);
        console.log('  Total records:', r.count);
        console.log('  UTR populated:', r.utr_populated);
        console.log('  bank_ref populated:', r.bank_ref_populated);
      });
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
