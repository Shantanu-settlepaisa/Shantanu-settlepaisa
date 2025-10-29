#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  database: 'settlepaisa_v2',
  password: 'SettlePaisa2024',
  port: 5432,
});

async function runDirectReconciliation() {
  console.log('🔄 DIRECT RECONCILIATION FROM DATABASE');
  console.log('═══════════════════════════════════════════════════════');
  console.log('Date: October 27, 2025');
  console.log('Environment: Staging 2 RDS');
  console.log('Method: Direct database matching');
  console.log('');

  try {
    // Step 1: Fetch PG transactions
    console.log('📊 Step 1: Fetching PG Transactions...');
    const pgResult = await pool.query(`
      SELECT
        transaction_id,
        merchant_id,
        amount_paise,
        gross_amount_paise,
        utr,
        rrn,
        payment_method,
        transaction_date,
        transaction_timestamp,
        status,
        source_type,
        source_name
      FROM sp_v2_transactions
      WHERE merchant_id = 'MERCH001'
        AND source_type = 'MANUAL_UPLOAD'
        AND transaction_date = '2025-10-24'
      ORDER BY transaction_id
    `);

    const pgTransactions = pgResult.rows;
    console.log(`   ✅ Found ${pgTransactions.length} PG transactions`);

    // Step 2: Fetch Bank statements
    console.log('\n📊 Step 2: Fetching Bank Statements...');
    const bankResult = await pool.query(`
      SELECT
        id,
        bank_ref,
        bank_name,
        amount_paise,
        transaction_date,
        value_date,
        utr,
        debit_credit,
        source_type,
        remarks
      FROM sp_v2_bank_statements
      WHERE bank_name = 'HDFC'
        AND source_type = 'MANUAL_UPLOAD'
        AND transaction_date = '2025-10-24'
      ORDER BY bank_ref
    `);

    const bankStatements = bankResult.rows;
    console.log(`   ✅ Found ${bankStatements.length} bank statements`);

    if (pgTransactions.length === 0 || bankStatements.length === 0) {
      console.log('\n❌ Insufficient data for reconciliation');
      return;
    }

    // Step 3: Simple matching logic (date + amount)
    console.log('\n🔍 Step 3: Matching Records...');
    console.log('   Strategy: Exact match on date + amount');

    const matches = [];
    const unmatchedPg = [];
    const unmatchedBank = [...bankStatements];

    for (const pg of pgTransactions) {
      // Normalize dates to YYYY-MM-DD format (handle timezone issues)
      const pgDate = new Date(pg.transaction_date);
      const pgDateStr = `${pgDate.getFullYear()}-${String(pgDate.getMonth() + 1).padStart(2, '0')}-${String(pgDate.getDate()).padStart(2, '0')}`;

      // Find exact match: same date and amount
      const matchIndex = unmatchedBank.findIndex(bank => {
        const bankDate = new Date(bank.transaction_date);
        const bankDateStr = `${bankDate.getFullYear()}-${String(bankDate.getMonth() + 1).padStart(2, '0')}-${String(bankDate.getDate()).padStart(2, '0')}`;

        return bankDateStr === pgDateStr && bank.amount_paise === pg.amount_paise;
      });

      if (matchIndex !== -1) {
        const bank = unmatchedBank[matchIndex];
        matches.push({
          pg_transaction_id: pg.transaction_id,
          bank_statement_id: bank.id,
          match_score: 100,
          pg_amount: pg.amount_paise,
          bank_amount: bank.amount_paise,
          match_date: pgDateStr
        });
        unmatchedBank.splice(matchIndex, 1); // Remove matched bank record
      } else {
        unmatchedPg.push(pg);
      }
    }

    console.log(`   ✅ Matched: ${matches.length}`);
    console.log(`   ⚠️ Unmatched PG: ${unmatchedPg.length}`);
    console.log(`   ⚠️ Unmatched Bank: ${unmatchedBank.length}`);

    // Step 4: Show sample matches
    if (matches.length > 0) {
      console.log('\n✅ Sample Matches (First 5):');
      matches.slice(0, 5).forEach((match, idx) => {
        const rupees = (match.pg_amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
        console.log(`   ${idx + 1}. PG: ${match.pg_transaction_id} ↔ Bank: HDFC${String(match.bank_statement_id).padStart(3, '0')}`);
        console.log(`      Amount: ₹${rupees} (${match.match_score}% confidence)`);
      });
    }

    // Step 5: Show unmatched PG
    if (unmatchedPg.length > 0) {
      console.log('\n⚠️ Unmatched PG Transactions (First 5):');
      unmatchedPg.slice(0, 5).forEach((pg, idx) => {
        const rupees = (pg.amount_paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
        console.log(`   ${idx + 1}. ${pg.transaction_id}: ₹${rupees} (${pg.payment_method}, ${pg.transaction_date.toISOString().split('T')[0]})`);
      });
    }

    // Step 6: Show unmatched Bank
    if (unmatchedBank.length > 0) {
      console.log('\n⚠️ Unmatched Bank Statements (All):');
      unmatchedBank.forEach((bank, idx) => {
        const rupees = (bank.amount_paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
        console.log(`   ${idx + 1}. ${bank.bank_ref}: ₹${rupees} (${bank.transaction_date.toISOString().split('T')[0]})`);
      });
    }

    // Step 7: Calculate match rate
    const matchRate = (matches.length / pgTransactions.length * 100).toFixed(2);
    console.log('\n📈 Reconciliation Summary:');
    console.log('═══════════════════════════════════');
    console.log(`   Total PG Transactions: ${pgTransactions.length}`);
    console.log(`   Total Bank Statements: ${bankStatements.length}`);
    console.log(`   Matched Pairs: ${matches.length}`);
    console.log(`   Match Rate: ${matchRate}%`);
    console.log(`   Unmatched PG: ${unmatchedPg.length} (${(unmatchedPg.length / pgTransactions.length * 100).toFixed(1)}%)`);
    console.log(`   Unmatched Bank: ${unmatchedBank.length} (${(unmatchedBank.length / bankStatements.length * 100).toFixed(1)}%)`);

    // Step 8: Amount reconciliation
    const pgTotal = pgTransactions.reduce((sum, t) => sum + BigInt(t.amount_paise), BigInt(0));
    const bankTotal = bankStatements.reduce((sum, s) => sum + BigInt(s.amount_paise), BigInt(0));
    const matchedTotal = matches.reduce((sum, m) => sum + BigInt(m.pg_amount), BigInt(0));

    console.log('\n💰 Amount Reconciliation:');
    console.log(`   PG Total: ₹${(Number(pgTotal) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    console.log(`   Bank Total: ₹${(Number(bankTotal) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    console.log(`   Matched Total: ₹${(Number(matchedTotal) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    console.log(`   Variance: ₹${(Number(pgTotal - bankTotal) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);

    // Step 9: Would you like to persist results?
    console.log('\n📝 Persistence Options:');
    console.log('   This is a read-only analysis.');
    console.log('   To persist results, use the recon-api /recon/run endpoint');
    console.log('   Or update transaction statuses manually:');
    console.log('');
    console.log('   Example SQL to mark matched as RECONCILED:');
    matches.slice(0, 3).forEach(match => {
      console.log(`   UPDATE sp_v2_transactions SET status = 'RECONCILED' WHERE transaction_id = '${match.pg_transaction_id}';`);
    });

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ Direct reconciliation analysis complete!');

    // Return results for further processing
    return {
      summary: {
        pgCount: pgTransactions.length,
        bankCount: bankStatements.length,
        matchCount: matches.length,
        matchRate: parseFloat(matchRate),
        unmatchedPgCount: unmatchedPg.length,
        unmatchedBankCount: unmatchedBank.length
      },
      matches,
      unmatchedPg,
      unmatchedBank
    };

  } catch (error) {
    console.error('\n❌ Reconciliation failed:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  runDirectReconciliation()
    .then(results => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Script failed');
      process.exit(1);
    });
}

module.exports = { runDirectReconciliation };
