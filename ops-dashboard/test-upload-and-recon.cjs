const { Pool } = require('pg');
const fs = require('fs');
const axios = require('axios');

// Database connection
const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

// Parse CSV
function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = values[i] ? values[i].trim() : '';
    });
    return obj;
  });
}

async function uploadAndRecon() {
  const client = await pool.connect();

  try {
    console.log('📁 Step 1: Parsing CSV files...');
    const pgData = parseCSV(fs.readFileSync('test-v1-pg-transactions.csv', 'utf8'));
    const bankData = parseCSV(fs.readFileSync('test-v1-bank-statements.csv', 'utf8'));
    console.log(`  PG Transactions: ${pgData.length}`);
    console.log(`  Bank Statements: ${bankData.length}`);

    console.log('\n💾 Step 2: Inserting PG transactions into sp_v2_transactions...');

    // Map bank names to valid acquirer codes
    const bankNameToCode = {
      'ICICI Bank': 'ICICI',
      'HDFC Bank': 'HDFC',
      'AXIS Bank': 'AXIS',
      'SBI': 'SBI',
      'Yes Bank': 'YES_BANK',
      'Kotak Bank': 'KOTAK'
    };

    let txnInserted = 0;
    for (const row of pgData) {
      const amountPaise = Math.round(parseFloat(row.paid_amount) * 100);
      const settlementAmountPaise = Math.round(parseFloat(row.settlement_amount) * 100);
      const acquirerCode = bankNameToCode[row.bank_name] || 'UNKNOWN';

      await client.query(`
        INSERT INTO sp_v2_transactions
        (transaction_id, merchant_id, amount_paise, settlement_amount_paise, payment_method,
         utr, rrn, status, transaction_date, transaction_timestamp, source_type, source_name, acquirer_code)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (transaction_id) DO NOTHING
      `, [
        row.transaction_id,
        row.client_code,
        amountPaise,
        settlementAmountPaise,
        row.payment_mode,
        row.utr,
        row.rrn,
        'PENDING',
        row.trans_date,
        row.trans_complete_date,
        'MANUAL_UPLOAD',
        row.pg_name,
        acquirerCode
      ]);
      txnInserted++;
    }
    console.log(`  ✅ Inserted ${txnInserted} transactions`);

    console.log('\n💾 Step 3: Inserting Bank statements into sp_v2_bank_statements...');
    let bankInserted = 0;
    for (const row of bankData) {
      const amountPaise = Math.round(parseFloat(row.CREDIT_AMT) * 100);

      await client.query(`
        INSERT INTO sp_v2_bank_statements
        (bank_ref, bank_name, utr, amount_paise, transaction_date, value_date,
         source_type, source_file, debit_credit)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT DO NOTHING
      `, [
        row.TXNID,
        row.BANK,
        row.UTR,
        amountPaise,
        row.POST_DATE,
        row.VALUE_DATE,
        'MANUAL_UPLOAD',
        'test-v1-bank-statements.csv',
        'CREDIT'
      ]);
      bankInserted++;
    }
    console.log(`  ✅ Inserted ${bankInserted} bank statements`);

    console.log('\n🔄 Step 4: Triggering reconciliation...');
    const reconResponse = await axios.post('http://localhost:5103/recon/run', {
      merchantId: 'MERCH001',
      date: '2025-10-06',
      test: true
    });

    console.log(`  ✅ Reconciliation job started: ${reconResponse.data.jobId}`);
    console.log(`     Status: ${reconResponse.data.status}`);

    // Wait a bit for reconciliation to complete
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('\n📊 Step 5: Checking reconciliation results...');
    const jobStatus = await axios.get(`http://localhost:5103/recon/jobs/${reconResponse.data.jobId}`);
    console.log(`  Job Status: ${jobStatus.data.status}`);
    console.log(`  Counters:`, JSON.stringify(jobStatus.data.counters, null, 2));

    console.log('\n✅ Upload and reconciliation complete!');
    console.log('\nNext steps:');
    console.log('  1. Check sp_v2_reconciliation_results table');
    console.log('  2. Check sp_v2_settlement_queue for auto-triggered settlements');
    console.log('  3. Check sp_v2_settlement_batches for settlement calculations');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

uploadAndRecon();
