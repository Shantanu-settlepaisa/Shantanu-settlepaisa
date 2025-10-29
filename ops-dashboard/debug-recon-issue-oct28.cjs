const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function debugReconIssue() {
  try {
    console.log('🔍 DEBUGGING RECONCILIATION ISSUE - Oct 28\n');
    console.log('='.repeat(80));

    // 1. Check PG transactions
    console.log('\n1️⃣  PG TRANSACTIONS IN DATABASE:');
    console.log('-'.repeat(80));
    const pgResult = await pool.query(`
      SELECT
        transaction_id,
        utr,
        amount_paise / 100.0 as net_amount,
        gross_amount_paise / 100.0 as gross_amount,
        status,
        source_type,
        created_at::date
      FROM sp_v2_transactions
      WHERE merchant_id = 'MERCH001'
        AND DATE(transaction_date) = '2025-10-28'
      ORDER BY transaction_id
      LIMIT 5
    `);

    if (pgResult.rows.length === 0) {
      console.log('❌ NO PG transactions found for MERCH001 on 2025-10-28!');
    } else {
      console.log(`✅ Found ${pgResult.rows.length} PG transactions (showing first 5):`);
      pgResult.rows.forEach(row => {
        console.log(`  ${row.transaction_id}`);
        console.log(`    UTR: ${row.utr}`);
        console.log(`    Net Amount: ₹${row.net_amount}`);
        console.log(`    Gross Amount: ₹${row.gross_amount}`);
        console.log(`    Status: ${row.status}`);
        console.log(`    Source: ${row.source_type}`);
        console.log();
      });
    }

    // 2. Check Bank statements
    console.log('\n2️⃣  BANK STATEMENTS IN DATABASE:');
    console.log('-'.repeat(80));
    const bankResult = await pool.query(`
      SELECT
        utr,
        bank_ref,
        amount_paise / 100.0 as net_amount,
        gross_amount_paise / 100.0 as gross_amount,
        paid_amount_paise / 100.0 as paid_amount,
        payee_amount_paise / 100.0 as payee_amount,
        bank_name,
        status,
        source_type,
        created_at::date
      FROM sp_v2_bank_statements
      WHERE merchant_id = 'MERCH001'
        AND DATE(transaction_date) = '2025-10-28'
      ORDER BY utr
      LIMIT 5
    `);

    if (bankResult.rows.length === 0) {
      console.log('❌ NO Bank statements found for MERCH001 on 2025-10-28!');
    } else {
      console.log(`✅ Found ${bankResult.rows.length} Bank statements (showing first 5):`);
      bankResult.rows.forEach(row => {
        console.log(`  UTR: ${row.utr}`);
        console.log(`    Bank Ref: ${row.bank_ref}`);
        console.log(`    Net Amount (amount_paise): ₹${row.net_amount} ⚠️ THIS IS WHAT RECON USES!`);
        console.log(`    Gross Amount (gross_amount_paise): ₹${row.gross_amount}`);
        console.log(`    Paid Amount (paid_amount_paise): ₹${row.paid_amount}`);
        console.log(`    Payee Amount (payee_amount_paise): ₹${row.payee_amount}`);
        console.log(`    Bank: ${row.bank_name}`);
        console.log(`    Status: ${row.status}`);
        console.log();
      });
    }

    // 3. Check totals
    console.log('\n3️⃣  TOTALS:');
    console.log('-'.repeat(80));
    const pgTotal = await pool.query(`
      SELECT
        COUNT(*) as count,
        SUM(amount_paise) / 100.0 as total_net,
        SUM(gross_amount_paise) / 100.0 as total_gross
      FROM sp_v2_transactions
      WHERE merchant_id = 'MERCH001'
        AND DATE(transaction_date) = '2025-10-28'
    `);

    const bankTotal = await pool.query(`
      SELECT
        COUNT(*) as count,
        SUM(amount_paise) / 100.0 as total_net,
        SUM(gross_amount_paise) / 100.0 as total_gross
      FROM sp_v2_bank_statements
      WHERE merchant_id = 'MERCH001'
        AND DATE(transaction_date) = '2025-10-28'
    `);

    console.log('PG:');
    console.log(`  Count: ${pgTotal.rows[0].count}`);
    console.log(`  Net Total: ₹${pgTotal.rows[0].total_net?.toLocaleString('en-IN') || 0}`);
    console.log(`  Gross Total: ₹${pgTotal.rows[0].total_gross?.toLocaleString('en-IN') || 0}`);
    console.log();
    console.log('Bank:');
    console.log(`  Count: ${bankTotal.rows[0].count}`);
    console.log(`  Net Total: ₹${bankTotal.rows[0].total_net?.toLocaleString('en-IN') || 0} ⚠️ RECON USES THIS!`);
    console.log(`  Gross Total: ₹${bankTotal.rows[0].total_gross?.toLocaleString('en-IN') || 0}`);
    console.log();
    console.log('Expected:');
    console.log(`  Count: 10`);
    console.log(`  Total: ₹2,20,000`);

    // 4. Check HDFC BANK config
    console.log('\n4️⃣  HDFC BANK RECON CONFIG:');
    console.log('-'.repeat(80));
    const configResult = await pool.query(`
      SELECT
        config_name,
        bank_name,
        v1_column_mappings,
        is_active
      FROM sp_v2_bank_column_mappings
      WHERE UPPER(bank_name) = 'HDFC BANK'
    `);

    if (configResult.rows.length > 0) {
      const config = configResult.rows[0];
      console.log('✅ HDFC BANK config found:');
      console.log(JSON.stringify(config.v1_column_mappings, null, 2));
      console.log(`Active: ${config.is_active}`);
    } else {
      console.log('❌ NO HDFC BANK config found!');
    }

    // 5. Check exceptions
    console.log('\n5️⃣  RECENT EXCEPTIONS:');
    console.log('-'.repeat(80));
    const exceptionsResult = await pool.query(`
      SELECT
        exception_type,
        reason,
        metadata,
        created_at::timestamp
      FROM sp_v2_recon_exceptions
      WHERE merchant_id = 'MERCH001'
        AND DATE(created_at) = '2025-10-28'
      ORDER BY created_at DESC
      LIMIT 3
    `);

    if (exceptionsResult.rows.length > 0) {
      console.log(`Found ${exceptionsResult.rows.length} exceptions (showing first 3):`);
      exceptionsResult.rows.forEach(row => {
        console.log(`\n  Type: ${row.exception_type}`);
        console.log(`  Reason: ${row.reason}`);
        console.log(`  Metadata: ${JSON.stringify(row.metadata, null, 2)}`);
        console.log(`  Time: ${row.created_at}`);
      });
    } else {
      console.log('No exceptions found');
    }

    // 6. Check upload sessions
    console.log('\n6️⃣  RECENT UPLOAD SESSIONS:');
    console.log('-'.repeat(80));
    const sessionsResult = await pool.query(`
      SELECT
        session_id,
        file_type,
        records_inserted,
        records_updated,
        status,
        created_at::timestamp
      FROM sp_v2_upload_sessions
      WHERE merchant_id = 'MERCH001'
        AND DATE(created_at) = CURRENT_DATE
      ORDER BY created_at DESC
      LIMIT 5
    `);

    if (sessionsResult.rows.length > 0) {
      console.log(`Found ${sessionsResult.rows.length} upload sessions:`);
      sessionsResult.rows.forEach(row => {
        console.log(`\n  Session: ${row.session_id}`);
        console.log(`  Type: ${row.file_type}`);
        console.log(`  Inserted: ${row.records_inserted}`);
        console.log(`  Updated: ${row.records_updated}`);
        console.log(`  Status: ${row.status}`);
        console.log(`  Time: ${row.created_at}`);
      });
    } else {
      console.log('No recent upload sessions found');
    }

    // 7. ROOT CAUSE ANALYSIS
    console.log('\n\n🎯 ROOT CAUSE ANALYSIS:');
    console.log('='.repeat(80));

    if (bankTotal.rows[0].total_net === 0 || bankTotal.rows[0].total_net === null) {
      console.log('❌ PROBLEM: Bank statements have amount_paise = 0 or NULL!');
      console.log('   This is why reconciliation shows "Bank ₹0.00"');
      console.log();
      console.log('   Possible causes:');
      console.log('   1. "Net Amount" column missing from CSV');
      console.log('   2. "Net Amount" column has wrong header name');
      console.log('   3. Bank file not uploaded correctly');
      console.log('   4. V1 mapper not mapping "Net Amount" → amount_paise');
      console.log();
      console.log('   Check the bank_statements rows above to see which amount fields are populated.');
    } else if (bankTotal.rows[0].total_net === pgTotal.rows[0].total_net) {
      console.log('✅ Amounts match! Reconciliation should work.');
      console.log('   If still failing, check UTR matching or date windows.');
    } else {
      console.log('⚠️  Amounts don\'t match:');
      console.log(`   PG Net: ₹${pgTotal.rows[0].total_net}`);
      console.log(`   Bank Net: ₹${bankTotal.rows[0].total_net}`);
      console.log(`   Difference: ₹${Math.abs(pgTotal.rows[0].total_net - bankTotal.rows[0].total_net)}`);
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

debugReconIssue();
