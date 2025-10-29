const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function analyzeSchemas() {
  try {
    console.log('🔍 Analyzing CSV Upload Schemas Needed\n');
    console.log('='.repeat(80));

    // 1. Check sp_v2_transactions - what columns we need to add for refunds
    console.log('\n📋 PART 1: Refund Columns Needed in sp_v2_transactions');
    console.log('='.repeat(80));

    const txnSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sp_v2_transactions'
      ORDER BY ordinal_position;
    `);

    // Check what's currently there
    const hasRefundCols = txnSchema.rows.some(col =>
      col.column_name.includes('refund')
    );

    if (hasRefundCols) {
      console.log('  ✅ Refund columns already exist:');
      txnSchema.rows
        .filter(col => col.column_name.includes('refund'))
        .forEach(col => {
          console.log(`     ${col.column_name}: ${col.data_type}`);
        });
    } else {
      console.log('  ❌ NO refund columns yet. Need to add:');
      console.log('     refund_amount_paise: BIGINT');
      console.log('     refund_type: VARCHAR (refund/chargeback)');
      console.log('     refund_date: TIMESTAMPTZ');
      console.log('     is_refund_processed: BOOLEAN');
      console.log('     chargeback_processing_fee_paise: BIGINT');
    }

    // Show key columns for matching transactions
    console.log('\n  📌 Key columns for matching transactions in CSV:');
    const keyColumns = txnSchema.rows.filter(col =>
      ['transaction_id', 'gateway_ref', 'merchant_id', 'utr', 'rrn'].includes(col.column_name)
    );
    keyColumns.forEach(col => {
      console.log(`     ${col.column_name}: ${col.data_type} (use for lookup)`);
    });

    // 2. Check sp_v2_chargebacks - what's the structure
    console.log('\n\n📋 PART 2: Chargeback Table Structure (sp_v2_chargebacks)');
    console.log('='.repeat(80));

    const chargebackSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sp_v2_chargebacks'
      ORDER BY ordinal_position;
    `);

    console.log('  Required columns for CSV upload:');
    const requiredCols = chargebackSchema.rows.filter(col =>
      col.is_nullable === 'NO' && !col.column_default && col.column_name !== 'id'
    );

    requiredCols.forEach(col => {
      console.log(`     ✅ ${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} (REQUIRED)`);
    });

    console.log('\n  Optional but useful columns:');
    const optionalUseful = chargebackSchema.rows.filter(col =>
      col.is_nullable === 'YES' &&
      ['reason_description', 'customer_complaint', 'notes', 'deadline_at'].includes(col.column_name)
    );

    optionalUseful.forEach(col => {
      console.log(`     ⚪ ${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} (OPTIONAL)`);
    });

    // 3. Design CSV formats
    console.log('\n\n📄 PART 3: Recommended CSV Formats');
    console.log('='.repeat(80));

    console.log('\n  🔹 REFUNDS CSV FORMAT (Minimal - V1 Style):');
    console.log('  ─'.repeat(80));
    console.log('  transaction_id,refund_amount,refund_type');
    console.log('  TXN12345,500000,refund');
    console.log('  TXN67890,300000,chargeback');
    console.log('');
    console.log('  Columns:');
    console.log('  • transaction_id (VARCHAR) - Used to find transaction in sp_v2_transactions');
    console.log('  • refund_amount (BIGINT) - Amount in PAISE (not rupees!)');
    console.log('  • refund_type (VARCHAR) - Either "refund" or "chargeback"');

    console.log('\n  🔹 REFUNDS CSV FORMAT (Extended - Optional):');
    console.log('  ─'.repeat(80));
    console.log('  transaction_id,refund_amount,refund_type,refund_date,reason');
    console.log('  TXN12345,500000,refund,2025-10-22,Customer request');
    console.log('');

    console.log('\n  🔹 CHARGEBACKS CSV FORMAT (Minimal):');
    console.log('  ─'.repeat(80));
    console.log('  transaction_id,merchant_id,chargeback_amount,reason_code,status');
    console.log('  TXN12345,MERCH001,200000,FRAUD_CARD_NOT_PRESENT,LOST');
    console.log('  TXN67890,MERCH001,150000,AUTHORIZATION_ISSUE,OPEN');
    console.log('');
    console.log('  Columns:');
    console.log('  • transaction_id - Links to original transaction');
    console.log('  • merchant_id - Merchant identifier');
    console.log('  • chargeback_amount - Amount in PAISE');
    console.log('  • reason_code - Chargeback reason code');
    console.log('  • status - OPEN/LOST/WON/PENDING_BANK');

    console.log('\n  🔹 CHARGEBACKS CSV FORMAT (Full):');
    console.log('  ─'.repeat(80));
    console.log('  transaction_id,merchant_id,acquirer,network_case_id,chargeback_amount,');
    console.log('  reason_code,reason_description,status,received_date,deadline_date');
    console.log('');

    // 4. Sample data from existing chargebacks
    console.log('\n\n📊 PART 4: Sample Existing Chargeback Data');
    console.log('='.repeat(80));

    const sampleChargebacks = await pool.query(`
      SELECT
        txn_ref,
        merchant_id,
        chargeback_paise,
        reason_code,
        status,
        outcome
      FROM sp_v2_chargebacks
      LIMIT 3
    `);

    if (sampleChargebacks.rows.length > 0) {
      console.log('  Sample records to understand format:\n');
      sampleChargebacks.rows.forEach((row, idx) => {
        console.log(`  ${idx + 1}. Transaction: ${row.txn_ref}`);
        console.log(`     Merchant: ${row.merchant_id}`);
        console.log(`     Amount: ${row.chargeback_paise} paise`);
        console.log(`     Reason: ${row.reason_code}`);
        console.log(`     Status: ${row.status}, Outcome: ${row.outcome || 'NULL'}`);
        console.log('');
      });
    } else {
      console.log('  ⚠️  No existing chargeback data to sample from');
    }

    // 5. Check for enum types
    console.log('\n📊 PART 5: Enum Types (Valid Values)');
    console.log('='.repeat(80));

    const enums = await pool.query(`
      SELECT
        t.typname as enum_name,
        string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) as values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname LIKE '%chargeback%'
      GROUP BY t.typname;
    `);

    if (enums.rows.length > 0) {
      console.log('  Chargeback-related enums:');
      enums.rows.forEach(row => {
        console.log(`  • ${row.enum_name}: ${row.values}`);
      });
    } else {
      console.log('  ℹ️  No enum types found - using TEXT/VARCHAR fields');
    }

    // 6. Final recommendations
    console.log('\n\n✅ FINAL RECOMMENDATIONS');
    console.log('='.repeat(80));

    console.log('\n📄 1. REFUND CSV UPLOAD:');
    console.log('   File: refunds.csv');
    console.log('   Format: transaction_id,refund_amount,refund_type');
    console.log('   Backend: UPDATE sp_v2_transactions');
    console.log('   Match by: transaction_id column');
    console.log('   Amount: Use PAISE (₹1 = 100 paise)');

    console.log('\n📄 2. CHARGEBACK CSV UPLOAD:');
    console.log('   File: chargebacks.csv');
    console.log('   Format: transaction_id,merchant_id,chargeback_amount,reason_code,status');
    console.log('   Backend: INSERT into sp_v2_chargebacks');
    console.log('   Required: merchant_id, acquirer (can auto-detect from transaction)');
    console.log('   Amount: Use PAISE (₹1 = 100 paise)');

    console.log('\n📌 Key Difference:');
    console.log('   REFUNDS → UPDATE existing transaction row');
    console.log('   CHARGEBACKS → INSERT new chargeback row');

    console.log('\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

analyzeSchemas();
