#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  user: 'postgres',
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  database: 'settlepaisa_v2',
  password: 'SettlePaisa2024',
  port: 5432,
});

async function uploadBankStatements() {
  const csvPath = '/Users/shantanusingh/ops-dashboard/test-hdfc-v1-proper-2025-10-24.csv';
  const csvData = fs.readFileSync(csvPath, 'utf8');
  const lines = csvData.trim().split('\n');

  console.log('📤 Uploading bank statements (HDFC V1 format)...');
  console.log(`   Total lines: ${lines.length - 1}`);

  let uploaded = 0;
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');

    // HDFC V1 format: MERCHANT_TRACKID, DOMESTIC AMT, SETTLE DATE, TRANS DATE
    const bank_ref = values[0];
    const amount = parseFloat(values[1]);
    const settle_date = values[2];
    const trans_date = values[3];

    // Convert DD-MM-YYYY to YYYY-MM-DD
    const [day, month, year] = settle_date.split('-');
    const formattedSettleDate = `${year}-${month}-${day}`;

    const [tDay, tMonth, tYear] = trans_date.split('-');
    const formattedTransDate = `${tYear}-${tMonth}-${tDay}`;

    // Convert to paise
    const amount_paise = Math.round(amount * 100);

    const query = `
      INSERT INTO sp_v2_bank_statements (
        bank_ref, amount_paise, transaction_date, value_date, bank_name,
        source_type, processed, debit_credit
      ) VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8)
      ON CONFLICT DO NOTHING
    `;

    try {
      await pool.query(query, [
        bank_ref,
        amount_paise,
        formattedTransDate,  // transaction_date
        formattedSettleDate,  // value_date
        'HDFC',
        'MANUAL_UPLOAD',
        false,
        'CREDIT'
      ]);
      uploaded++;
    } catch (error) {
      console.error(`❌ Error uploading ${bank_ref}:`, error.message);
    }
  }

  console.log(`✅ Uploaded ${uploaded} bank statements`);
  return uploaded;
}

async function verifyBankStatements() {
  console.log('\n🔍 Verifying bank statement upload...');

  // Count total statements
  const countResult = await pool.query(`
    SELECT COUNT(*) as count
    FROM sp_v2_bank_statements
    WHERE bank_name = 'HDFC' AND source_type = 'MANUAL_UPLOAD'
  `);
  console.log(`   Total HDFC statements: ${countResult.rows[0].count}`);

  // Check V1 to V2 conversion
  const sampleResult = await pool.query(`
    SELECT
      bank_ref,
      amount_paise,
      transaction_date,
      value_date,
      bank_name,
      source_type
    FROM sp_v2_bank_statements
    WHERE bank_name = 'HDFC' AND source_type = 'MANUAL_UPLOAD'
    ORDER BY bank_ref
    LIMIT 5
  `);

  console.log('\n📊 Sample V1→V2 Conversion Results:');
  console.log('   (Expected: Amounts in paise, e.g., 50000.00 → 5,000,000)');
  console.log('');
  sampleResult.rows.forEach(row => {
    const rupees = (row.amount_paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    console.log(`   ${row.bank_ref}: ₹${rupees} → ${row.amount_paise.toLocaleString()} paise`);
    console.log(`      Date: ${row.transaction_date}, Bank: ${row.bank_name}, Source: ${row.source_type}`);
  });

  // Amount statistics
  const statsResult = await pool.query(`
    SELECT
      MIN(amount_paise) as min_amount,
      MAX(amount_paise) as max_amount,
      AVG(amount_paise)::BIGINT as avg_amount,
      SUM(amount_paise) as total_amount
    FROM sp_v2_bank_statements
    WHERE bank_name = 'HDFC' AND source_type = 'MANUAL_UPLOAD'
  `);

  const stats = statsResult.rows[0];
  console.log('\n💰 Amount Statistics:');
  console.log(`   Minimum: ${stats.min_amount.toLocaleString()} paise (₹${(stats.min_amount/100).toFixed(2)})`);
  console.log(`   Maximum: ${stats.max_amount.toLocaleString()} paise (₹${(stats.max_amount/100).toFixed(2)})`);
  console.log(`   Average: ${stats.avg_amount.toLocaleString()} paise (₹${(stats.avg_amount/100).toFixed(2)})`);
  console.log(`   Total: ${stats.total_amount.toLocaleString()} paise (₹${(stats.total_amount/100).toLocaleString('en-IN', { minimumFractionDigits: 2 })})`);

  // Validation checks
  console.log('\n✅ Validation Checks:');

  const validationResult = await pool.query(`
    SELECT
      COUNT(CASE WHEN amount_paise < 100 THEN 1 END) as below_100_paise,
      COUNT(CASE WHEN amount_paise % 1 != 0 THEN 1 END) as decimal_paise,
      COUNT(CASE WHEN source_type != 'MANUAL_UPLOAD' THEN 1 END) as wrong_source
    FROM sp_v2_bank_statements
    WHERE bank_name = 'HDFC' AND source_type = 'MANUAL_UPLOAD'
  `);

  const validation = validationResult.rows[0];
  console.log(`   Amounts >= 100 paise: ${validation.below_100_paise == 0 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   No decimal paise values: ${validation.decimal_paise == 0 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   All tagged MANUAL_UPLOAD: ${validation.wrong_source == 0 ? '✅ PASS' : '❌ FAIL'}`);
}

async function main() {
  try {
    console.log('🚀 Bank Statement Upload Script (V1 Format → V2 Schema)');
    console.log('══════════════════════════════════════════════════════');

    const bankCount = await uploadBankStatements();
    await verifyBankStatements();

    console.log('\n✅ Bank statement upload complete!');
    console.log(`   ${bankCount} HDFC bank statements uploaded and verified`);

    await pool.end();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
}

main();
