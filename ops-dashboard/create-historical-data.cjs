const { Pool } = require('pg');

// Database connection to V2 PostgreSQL
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

async function createHistoricalData() {
  console.log('🚀 Creating realistic historical test data...');
  
  const client = await pool.connect();
  
  try {
    // Clear existing data first
    console.log('🧹 Clearing existing data...');
    await client.query('DELETE FROM sp_v2_recon_matches');
    await client.query('DELETE FROM sp_v2_settlement_items');
    await client.query('DELETE FROM sp_v2_settlement_batches');
    await client.query('DELETE FROM sp_v2_utr_credits');
    await client.query('DELETE FROM sp_v2_transactions_v1');
    
    // Realistic daily volumes for different periods
    const scenarios = [
      // Today - Lower volume (partial day)
      {
        date: new Date(),
        transactions: 45,
        successRate: 0.92,
        matchRate: 0.85,
        description: "Today (current day)"
      },
      
      // Yesterday - Normal volume
      {
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        transactions: 120,
        successRate: 0.89,
        matchRate: 0.78,
        description: "Yesterday"
      },
      
      // Last 7 days - Varying volumes (weekdays vs weekends)
      {
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        transactions: 180,
        successRate: 0.91,
        matchRate: 0.82,
        description: "2 days ago"
      },
      {
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        transactions: 165,
        successRate: 0.88,
        matchRate: 0.75,
        description: "3 days ago"
      },
      {
        date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
        transactions: 210,
        successRate: 0.93,
        matchRate: 0.87,
        description: "4 days ago (high volume)"
      },
      {
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        transactions: 95,
        successRate: 0.85,
        matchRate: 0.72,
        description: "5 days ago (weekend)"
      },
      {
        date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), // 6 days ago
        transactions: 75,
        successRate: 0.87,
        matchRate: 0.70,
        description: "6 days ago (weekend)"
      },
      
      // Older data - Past weeks
      {
        date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        transactions: 195,
        successRate: 0.90,
        matchRate: 0.80,
        description: "10 days ago"
      },
      {
        date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
        transactions: 220,
        successRate: 0.86,
        matchRate: 0.73,
        description: "15 days ago"
      },
      {
        date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
        transactions: 185,
        successRate: 0.89,
        matchRate: 0.76,
        description: "20 days ago"
      },
      {
        date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), // 25 days ago
        transactions: 160,
        successRate: 0.91,
        matchRate: 0.83,
        description: "25 days ago"
      },
      
      // Older data - Beyond 30 days (for testing longer ranges)
      {
        date: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
        transactions: 140,
        successRate: 0.88,
        matchRate: 0.74,
        description: "35 days ago"
      },
      {
        date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
        transactions: 175,
        successRate: 0.84,
        matchRate: 0.69,
        description: "45 days ago"
      },
    ];
    
    let totalTransactionsCreated = 0;
    let totalCreditsCreated = 0;
    let totalMatchesCreated = 0;
    let totalSettlementsCreated = 0;
    
    for (const scenario of scenarios) {
      console.log(`📅 Creating data for ${scenario.description}: ${scenario.transactions} transactions`);
      
      // Generate transactions for this day
      const transactions = [];
      const credits = [];
      const matches = [];
      
      for (let i = 0; i < scenario.transactions; i++) {
        const baseTime = scenario.date.getTime();
        const randomHour = Math.floor(Math.random() * 24);
        const randomMinute = Math.floor(Math.random() * 60);
        const transactionTime = new Date(baseTime + (randomHour * 60 + randomMinute) * 60 * 1000);
        
        const isSuccess = Math.random() < scenario.successRate;
        const amount = Math.floor(Math.random() * 50000) + 1000; // ₹10 to ₹500
        const utr = `UTR${Date.now()}${i}${Math.floor(Math.random() * 1000)}`;
        
        // Create transaction
        const transaction = {
          pgw_ref: `PGW${transactionTime.getTime()}${i}`,
          amount_paise: amount,
          utr: isSuccess ? utr : null,
          payment_mode: ['UPI', 'NETBANKING', 'CARD'][Math.floor(Math.random() * 3)],
          status: isSuccess ? 'SUCCESS' : 'FAILED',
          created_at: transactionTime,
          merchant_id: '550e8400-e29b-41d4-a716-446655440000' // Valid UUID format
        };
        transactions.push(transaction);
        
        // Create corresponding bank credit for successful transactions
        if (isSuccess && Math.random() < 0.95) { // 95% of successful transactions have bank credits
          const creditTime = new Date(transactionTime.getTime() + Math.random() * 2 * 60 * 60 * 1000); // 0-2 hours later
          const credit = {
            amount_paise: amount,
            utr: utr,
            credited_at: creditTime,
            bank_reference: `BANK${creditTime.getTime()}${i}`,
            acquirer: ['HDFC', 'ICICI', 'SBI', 'AXIS'][Math.floor(Math.random() * 4)]
          };
          credits.push(credit);
          
          // Create recon match if within match rate
          if (Math.random() < scenario.matchRate) {
            matches.push({
              transaction_id: transactions.length, // Will be actual ID after insert
              credit_id: credits.length, // Will be actual ID after insert
              match_type: Math.random() < 0.8 ? 'EXACT' : 'FUZZY',
              created_at: new Date(creditTime.getTime() + Math.random() * 30 * 60 * 1000) // 0-30 min later
            });
          }
        }
      }
      
      // Insert transactions
      for (const txn of transactions) {
        await client.query(`
          INSERT INTO sp_v2_transactions_v1 
          (pgw_ref, amount_paise, utr, payment_mode, status, created_at, merchant_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [txn.pgw_ref, txn.amount_paise, txn.utr, txn.payment_mode, txn.status, txn.created_at, txn.merchant_id]);
      }
      totalTransactionsCreated += transactions.length;
      
      // Insert bank credits
      for (const credit of credits) {
        await client.query(`
          INSERT INTO sp_v2_utr_credits 
          (amount_paise, utr, credited_at, bank_reference, acquirer)
          VALUES ($1, $2, $3, $4, $5)
        `, [credit.amount_paise, credit.utr, credit.credited_at, credit.bank_reference, credit.acquirer]);
      }
      totalCreditsCreated += credits.length;
      
      // Create settlement batch for this day (if enough matched transactions)
      const matchedCount = Math.floor(transactions.length * scenario.matchRate);
      if (matchedCount > 10) {
        const settlementDate = new Date(scenario.date.getTime() + 18 * 60 * 60 * 1000); // 6 PM same day
        const grossAmount = transactions.reduce((sum, txn) => sum + txn.amount_paise, 0);
        const commission = Math.floor(grossAmount * 0.02); // 2% commission
        const gst = Math.floor(commission * 0.18); // 18% GST on commission
        const tds = Math.floor(commission * 0.02); // 2% TDS
        const netAmount = grossAmount - commission - gst - tds;
        
        await client.query(`
          INSERT INTO sp_v2_settlement_batches 
          (merchant_id, cycle_date, total_transactions, gross_amount_paise, 
           total_commission_paise, total_gst_paise, total_tds_paise, 
           net_amount_paise, status, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, ['550e8400-e29b-41d4-a716-446655440000', scenario.date.toISOString().split('T')[0], matchedCount, 
            grossAmount, commission, gst, tds, netAmount, 'COMPLETED', settlementDate]);
        
        totalSettlementsCreated++;
      }
      
      console.log(`✅ Created ${transactions.length} transactions, ${credits.length} credits for ${scenario.description}`);
    }
    
    console.log(`
🎉 Historical data creation completed!

📊 Summary:
- Total Transactions: ${totalTransactionsCreated}
- Total Bank Credits: ${totalCreditsCreated} 
- Total Settlement Batches: ${totalSettlementsCreated}
- Date Range: ${scenarios[scenarios.length-1].date.toISOString().split('T')[0]} to ${scenarios[0].date.toISOString().split('T')[0]}

🔍 Testing Scenarios:
- Today: ~45 transactions
- Last 7 Days: ~900 transactions
- Last 30 Days: ~1,800 transactions  
- Last 3 Months: ~2,100 transactions

✅ Your dashboard date filtering will now show different results for each time period!
    `);
    
  } catch (error) {
    console.error('❌ Error creating historical data:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
createHistoricalData().catch(console.error);