#!/usr/bin/env node

/**
 * Database-Driven V1 Test File Generator
 *
 * Generates V1 format CSV files using bank configurations from PostgreSQL.
 * This ensures generated files match the exact V1 format expected by the system.
 *
 * Usage:
 *   node generate-v1-from-db-config.cjs
 *
 * Output:
 *   - test-pg-v1-{date}.csv (PG transactions)
 *   - test-hdfc-v1-{date}.csv (HDFC bank statements)
 *   - test-axis-v1-{date}.csv (AXIS bank statements)
 *   - test-bob-v1-{date}.csv (BOB bank statements)
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection (using local or staging based on your setup)
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'settlepaisa_v2',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

// Configuration
const TEST_DATE = process.env.TEST_DATE || '2025-10-28';
const MERCHANT_ID = 'MERCH001';
const TOTAL_TRANSACTIONS = 50;

// Distribution across banks
const BANK_DISTRIBUTION = {
  'HDFC BANK': 30,
  'AXIS BANK': 10,
  'BOB': 10
};

/**
 * Fetch bank column mappings from database
 */
async function fetchBankMappings() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        config_name,
        bank_name,
        v1_column_mappings,
        date_format,
        file_type,
        delimiter
      FROM sp_v2_bank_column_mappings
      WHERE bank_name IN ('HDFC BANK', 'AXIS BANK', 'BOB')
      AND is_active = true
    `);

    console.log(`✅ Fetched ${result.rows.length} bank configurations from database`);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Generate realistic test data
 */
function generateTestData(count, bankDistribution) {
  const transactions = [];
  let txnCounter = 1;

  for (const [bankName, txnCount] of Object.entries(bankDistribution)) {
    for (let i = 0; i < txnCount; i++) {
      const txnId = `TXN${String(txnCounter).padStart(6, '0')}`;
      const utr = `${bankName.substring(0, 4).toUpperCase()}${String(txnCounter).padStart(6, '0')}`;

      // Random amount between 1000 and 100000 paise (₹10 to ₹1000)
      const grossAmount = Math.floor(Math.random() * 99000) + 1000;

      // Calculate fees (2% MDR + 18% GST)
      const mdr = Math.floor(grossAmount * 0.02);
      const gst = Math.floor(mdr * 0.18);
      const netAmount = grossAmount - mdr - gst;

      transactions.push({
        transaction_id: txnId,
        utr: utr,
        gross_amount: grossAmount / 100, // Convert paise to rupees
        mdr: mdr / 100,
        gst: gst / 100,
        net_amount: netAmount / 100,
        bank_name: bankName,
        payment_method: ['UPI', 'CARD', 'NETBANKING'][Math.floor(Math.random() * 3)],
        status: 'SUCCESS'
      });

      txnCounter++;
    }
  }

  return transactions;
}

/**
 * Format date according to bank's date format
 */
function formatDate(dateString, format) {
  const date = new Date(dateString);

  switch (format) {
    case 'dd-MM-yyyy':
      return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
    case 'dd/MM/yyyy':
      return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    case 'yyyy-MM-dd':
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    default:
      return dateString;
  }
}

/**
 * Generate PG Transactions V1 CSV
 */
function generatePGTransactionsCSV(transactions, outputPath) {
  // V1 PG format columns
  const headers = [
    'transaction_id',
    'client_code',
    'payee_amount',
    'paid_amount',
    'payment_mode',
    'trans_complete_date',
    'status',
    'utr',
    'pg_name'
  ];

  const rows = transactions.map(txn => ({
    transaction_id: txn.transaction_id,
    client_code: MERCHANT_ID,
    payee_amount: txn.net_amount.toFixed(2),
    paid_amount: txn.gross_amount.toFixed(2),
    payment_mode: txn.payment_method,
    trans_complete_date: `${TEST_DATE} 10:00:00`,
    status: txn.status,
    utr: txn.utr,
    pg_name: 'RAZORPAY'
  }));

  // Write CSV
  const csvContent = [
    headers.join(','),
    ...rows.map(row => headers.map(h => row[h]).join(','))
  ].join('\n');

  fs.writeFileSync(outputPath, csvContent);
  console.log(`✅ Generated PG transactions: ${outputPath} (${transactions.length} rows)`);
}

/**
 * Generate Bank Statements V1 CSV
 */
function generateBankStatementCSV(transactions, bankConfig, outputPath) {
  const bankName = bankConfig.bank_name;
  const v1Mappings = bankConfig.v1_column_mappings;
  const dateFormat = bankConfig.date_format;
  const delimiter = bankConfig.delimiter || ',';

  // Reverse mapping: V2 -> V1
  const reverseMapping = {};
  for (const [v1Col, v2Col] of Object.entries(v1Mappings)) {
    reverseMapping[v2Col] = v1Col;
  }

  // Determine V1 column headers based on bank
  let headers = [];

  if (bankName === 'HDFC BANK') {
    headers = ['MERCHANT_TRACKID', 'DOMESTIC AMT', 'Net Amount', 'SETTLE DATE', 'TRANS DATE'];
  } else if (bankName === 'AXIS BANK') {
    headers = ['Amount', 'PRNNo', 'Date'];
  } else if (bankName === 'BOB') {
    headers = ['Settlement Amount', 'Net Amount', 'Merchant Track ID', 'Payment Date', 'Transaction Date', 'Onus Indicator'];
  }

  // Filter transactions for this bank
  const bankTransactions = transactions.filter(txn => txn.bank_name === bankName);

  // Generate rows
  const rows = bankTransactions.map(txn => {
    const formattedDate = formatDate(TEST_DATE, dateFormat);

    if (bankName === 'HDFC BANK') {
      return {
        'MERCHANT_TRACKID': txn.utr,  // ✅ Correct: Use UTR for matching
        'DOMESTIC AMT': txn.gross_amount.toFixed(2),
        'Net Amount': txn.net_amount.toFixed(2),
        'SETTLE DATE': formattedDate,
        'TRANS DATE': formattedDate
      };
    } else if (bankName === 'AXIS BANK') {
      return {
        'Amount': txn.gross_amount.toFixed(2),
        'PRNNo': txn.utr,  // ✅ FIXED: Use UTR instead of transaction_id
        'Date': formattedDate
      };
    } else if (bankName === 'BOB') {
      return {
        'Settlement Amount': txn.gross_amount.toFixed(2),
        'Net Amount': txn.net_amount.toFixed(2),
        'Merchant Track ID': txn.utr,  // ✅ FIXED: Use UTR instead of transaction_id
        'Payment Date': formattedDate,
        'Transaction Date': formattedDate,
        'Onus Indicator': 'N'
      };
    }
  });

  // Write CSV with appropriate delimiter
  const csvContent = [
    headers.join(delimiter),
    ...rows.map(row => headers.map(h => row[h]).join(delimiter))
  ].join('\n');

  fs.writeFileSync(outputPath, csvContent);
  console.log(`✅ Generated ${bankName} statements: ${outputPath} (${bankTransactions.length} rows)`);
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('📁 Database-Driven V1 Test File Generator');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log(`Test Date: ${TEST_DATE}`);
    console.log(`Total Transactions: ${TOTAL_TRANSACTIONS}`);
    console.log(`Distribution: HDFC=${BANK_DISTRIBUTION['HDFC BANK']}, AXIS=${BANK_DISTRIBUTION['AXIS BANK']}, BOB=${BANK_DISTRIBUTION['BOB']}`);
    console.log('');

    // Step 1: Fetch bank configurations from database
    console.log('Step 1: Fetching bank configurations from database...');
    const bankConfigs = await fetchBankMappings();
    console.log('');

    // Step 2: Generate test data
    console.log('Step 2: Generating test transaction data...');
    const transactions = generateTestData(TOTAL_TRANSACTIONS, BANK_DISTRIBUTION);
    console.log(`✅ Generated ${transactions.length} test transactions`);
    console.log('');

    // Step 3: Generate PG transactions CSV
    console.log('Step 3: Generating PG transactions CSV (V1 format)...');
    const pgOutputPath = path.join(__dirname, `test-pg-v1-${TEST_DATE}.csv`);
    generatePGTransactionsCSV(transactions, pgOutputPath);
    console.log('');

    // Step 4: Generate bank statement CSVs
    console.log('Step 4: Generating bank statement CSVs (V1 formats)...');
    for (const bankConfig of bankConfigs) {
      const bankName = bankConfig.bank_name;
      const sanitizedBankName = bankName.toLowerCase().replace(/\s+/g, '-');
      const outputPath = path.join(__dirname, `test-${sanitizedBankName}-v1-${TEST_DATE}.csv`);

      generateBankStatementCSV(transactions, bankConfig, outputPath);
    }
    console.log('');

    // Step 5: Generate summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ FILE GENERATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('Generated Files:');
    console.log(`  1. test-pg-v1-${TEST_DATE}.csv (${TOTAL_TRANSACTIONS} PG transactions)`);
    console.log(`  2. test-hdfc-bank-v1-${TEST_DATE}.csv (${BANK_DISTRIBUTION['HDFC BANK']} bank statements)`);
    console.log(`  3. test-axis-bank-v1-${TEST_DATE}.csv (${BANK_DISTRIBUTION['AXIS BANK']} bank statements)`);
    console.log(`  4. test-bob-v1-${TEST_DATE}.csv (${BANK_DISTRIBUTION['BOB']} bank statements)`);
    console.log('');
    console.log('Expected Reconciliation Results:');
    console.log(`  • Total Matches: ${TOTAL_TRANSACTIONS}/${TOTAL_TRANSACTIONS} (100%)`);
    console.log(`  • Exceptions: 0`);
    console.log(`  • Missing in Bank: 0`);
    console.log(`  • Missing in PG: 0`);
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Upload test-pg-v1-{date}.csv via Upload API (fileType=pg_transactions)');
    console.log('  2. Upload test-hdfc-bank-v1-{date}.csv via Upload API (fileType=bank_statements, sourceType=HDFC BANK)');
    console.log('  3. Upload test-axis-bank-v1-{date}.csv via Upload API (fileType=bank_statements, sourceType=AXIS BANK)');
    console.log('  4. Upload test-bob-v1-{date}.csv via Upload API (fileType=bank_statements, sourceType=BOB)');
    console.log('  5. Run reconciliation and verify 50/50 matches');
    console.log('  6. Trigger settlement and verify batch creation');
    console.log('');

    // Summary JSON
    const summary = {
      test_date: TEST_DATE,
      files_generated: 4,
      total_transactions: TOTAL_TRANSACTIONS,
      distribution: BANK_DISTRIBUTION,
      files: [
        `test-pg-v1-${TEST_DATE}.csv`,
        `test-hdfc-bank-v1-${TEST_DATE}.csv`,
        `test-axis-bank-v1-${TEST_DATE}.csv`,
        `test-bob-v1-${TEST_DATE}.csv`
      ],
      expected_results: {
        total_matches: TOTAL_TRANSACTIONS,
        exceptions: 0,
        missing_in_bank: 0,
        missing_in_pg: 0
      }
    };

    fs.writeFileSync(
      path.join(__dirname, `test-summary-${TEST_DATE}.json`),
      JSON.stringify(summary, null, 2)
    );
    console.log(`📄 Test summary saved: test-summary-${TEST_DATE}.json`);
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { generateTestData, formatDate };
