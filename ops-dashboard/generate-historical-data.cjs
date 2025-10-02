const { Pool } = require('pg');
const { randomUUID } = require('crypto');

// Generate 40 days of historical data for V2 database
class HistoricalDataGenerator {
  constructor() {
    this.pool = new Pool({
      user: 'postgres',
      host: 'localhost',
      database: 'settlepaisa_v2',
      password: 'settlepaisa123',
      port: 5433,
    });
  }

  // Generate random data for a specific date
  generateDayData(date, dayIndex) {
    // Base volumes that increase over time (simulating growth)
    const baseVolume = 1000000 + (dayIndex * 50000); // 10L to 30L over 40 days
    const dailyTxnCount = 50 + Math.floor(Math.random() * 100); // 50-150 txns per day
    
    const transactions = [];
    const bankCredits = [];
    const settlements = [];
    
    // Generate transactions
    for (let i = 0; i < dailyTxnCount; i++) {
      const txnAmount = Math.floor(Math.random() * 50000) + 1000; // ₹10 to ₹500
      const merchantId = ['550e8400-e29b-41d4-a716-446655440001', 
                          '550e8400-e29b-41d4-a716-446655440002',
                          '550e8400-e29b-41d4-a716-446655440003'][Math.floor(Math.random() * 3)];
      
      const txnId = randomUUID();
      transactions.push({
        id: txnId,
        merchant_id: merchantId,
        pgw_ref: `PG_${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}_${i}`,
        amount_paise: txnAmount,
        utr: `UTR${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}${String(i).padStart(4,'0')}`,
        payment_mode: ['UPI', 'NEFT', 'IMPS', 'CARD'][Math.floor(Math.random() * 4)],
        status: Math.random() > 0.05 ? 'SUCCESS' : 'FAILED', // 95% success rate
        created_at: date
      });
    }
    
    // Generate bank credits (80% of successful transactions)
    const successfulTxns = transactions.filter(t => t.status === 'SUCCESS');
    const creditedTxns = successfulTxns.slice(0, Math.floor(successfulTxns.length * 0.8));
    
    creditedTxns.forEach((txn, i) => {
      bankCredits.push({
        id: randomUUID(),
        utr: txn.utr,
        acquirer: ['HDFC BANK', 'ICICI BANK', 'AXIS BANK', 'SBI'][Math.floor(Math.random() * 4)],
        amount_paise: txn.amount_paise,
        credited_at: new Date(date.getTime() + Math.floor(Math.random() * 12 * 60 * 60 * 1000)), // Within 12 hours
        cycle_date: date,
        bank_reference: `REF${Math.floor(Math.random() * 1000000)}`
      });
    });
    
    return { date, transactions, bankCredits, dailyTxnCount, successfulCount: successfulTxns.length };
  }

  async insertHistoricalData() {
    console.log('🔄 [Historical] Starting 40-day data generation...');
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Clear existing data
      console.log('🗑️ [Historical] Clearing existing data...');
      await client.query('DELETE FROM sp_v2_recon_matches');
      await client.query('DELETE FROM sp_v2_utr_credits');
      await client.query('DELETE FROM sp_v2_transactions_v1 WHERE id::text NOT LIKE \'650e8400%\''); // Keep original 5 records
      
      let totalInserted = 0;
      const today = new Date();
      
      // Generate data for last 40 days
      for (let i = 40; i >= 1; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        
        const dayData = this.generateDayData(date, 40 - i);
        console.log(`📅 [Historical] Day ${40-i+1}/40: ${date.toISOString().split('T')[0]} - ${dayData.dailyTxnCount} txns`);
        
        // Insert transactions
        for (const txn of dayData.transactions) {
          await client.query(
            `INSERT INTO sp_v2_transactions_v1 (id, merchant_id, pgw_ref, amount_paise, utr, payment_mode, status, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [txn.id, txn.merchant_id, txn.pgw_ref, txn.amount_paise, txn.utr, txn.payment_mode, txn.status, txn.created_at]
          );
        }
        
        // Insert bank credits
        for (const credit of dayData.bankCredits) {
          await client.query(
            `INSERT INTO sp_v2_utr_credits (id, utr, acquirer, amount_paise, credited_at, cycle_date, bank_reference) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [credit.id, credit.utr, credit.acquirer, credit.amount_paise, credit.credited_at, credit.cycle_date, credit.bank_reference]
          );
        }
        
        // Create reconciliation matches (70% of bank credits get matched)
        const matchedCredits = dayData.bankCredits.slice(0, Math.floor(dayData.bankCredits.length * 0.7));
        for (const credit of matchedCredits) {
          const matchingTxn = dayData.transactions.find(t => t.utr === credit.utr);
          if (matchingTxn) {
            await client.query(
              `INSERT INTO sp_v2_recon_matches (id, transaction_id, utr_credit_id, match_type, created_at) 
               VALUES ($1, $2, $3, $4, $5)`,
              [randomUUID(), matchingTxn.id, credit.id, 'EXACT', credit.credited_at]
            );
          }
        }
        
        totalInserted += dayData.dailyTxnCount;
      }
      
      await client.query('COMMIT');
      console.log(`✅ [Historical] Generated ${totalInserted} transactions across 40 days`);
      
      // Generate summary stats
      const stats = await client.query(`
        SELECT 
          COUNT(*) as total_txns,
          COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as successful_txns,
          SUM(amount_paise) as total_volume_paise
        FROM sp_v2_transactions_v1
      `);
      
      const creditStats = await client.query(`
        SELECT COUNT(*) as total_credits, SUM(amount_paise) as total_credit_volume
        FROM sp_v2_utr_credits
      `);
      
      const matchStats = await client.query(`
        SELECT COUNT(*) as total_matches FROM sp_v2_recon_matches
      `);
      
      const txnData = stats.rows[0];
      const creditData = creditStats.rows[0];
      const matchData = matchStats.rows[0];
      
      console.log('\n📊 [Historical] Database Summary:');
      console.log(`  Total Transactions: ${txnData.total_txns}`);
      console.log(`  Successful: ${txnData.successful_txns} (${(txnData.successful_txns/txnData.total_txns*100).toFixed(1)}%)`);
      console.log(`  Total Volume: ₹${(txnData.total_volume_paise/100).toLocaleString('en-IN')}`);
      console.log(`  Bank Credits: ${creditData.total_credits}`);
      console.log(`  Credit Volume: ₹${(creditData.total_credit_volume/100).toLocaleString('en-IN')}`);
      console.log(`  Reconciled: ${matchData.total_matches}`);
      console.log(`  Recon Rate: ${(matchData.total_matches/txnData.successful_txns*100).toFixed(1)}%`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ [Historical] Generation failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

// Run the generator
async function main() {
  const generator = new HistoricalDataGenerator();
  try {
    await generator.insertHistoricalData();
  } finally {
    await generator.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = HistoricalDataGenerator;