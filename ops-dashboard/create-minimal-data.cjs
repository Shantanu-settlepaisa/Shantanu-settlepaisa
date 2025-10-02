const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

async function createMinimalData() {
  console.log('🚀 Creating minimal test data for date filtering demo...');
  
  const client = await pool.connect();
  
  try {
    // Create just enough data to show date filtering works
    const scenarios = [
      { date: new Date(), count: 25, label: "Today" },
      { date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), count: 50, label: "Yesterday" },
      { date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), count: 75, label: "3 days ago" },
      { date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), count: 100, label: "1 week ago" },
      { date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), count: 125, label: "2 weeks ago" },
    ];
    
    let totalCreated = 0;
    
    for (const scenario of scenarios) {
      console.log(`📅 Creating ${scenario.count} transactions for ${scenario.label}`);
      
      for (let i = 0; i < scenario.count; i++) {
        const randomHour = Math.floor(Math.random() * 24);
        const randomMinute = Math.floor(Math.random() * 60);
        const transactionTime = new Date(scenario.date.getTime() + (randomHour * 60 + randomMinute) * 60 * 1000);
        
        const amount = Math.floor(Math.random() * 50000) + 1000; // ₹10 to ₹500
        const isSuccess = Math.random() < 0.85; // 85% success rate
        const utr = isSuccess ? `UTR${Date.now()}${i}${Math.floor(Math.random() * 1000)}` : null;
        
        // Insert transaction
        await client.query(`
          INSERT INTO sp_v2_transactions_v1 
          (merchant_id, pgw_ref, amount_paise, utr, payment_mode, status, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          '550e8400-e29b-41d4-a716-446655440001',
          `PGW${Date.now()}${i}`,
          amount,
          utr,
          'UPI', // Use uppercase to match constraint
          isSuccess ? 'SUCCESS' : 'FAILED',
          transactionTime
        ]);
        
        // Create bank credit for successful transactions
        if (isSuccess && Math.random() < 0.9) {
          const creditTime = new Date(transactionTime.getTime() + Math.random() * 2 * 60 * 60 * 1000);
          await client.query(`
            INSERT INTO sp_v2_utr_credits 
            (amount_paise, utr, credited_at, cycle_date, bank_reference, acquirer)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            amount,
            utr,
            creditTime,
            creditTime.toISOString().split('T')[0], // cycle_date as date string
            `BANK${Date.now()}${i}`,
            'HDFC'
          ]);
        }
        
        totalCreated++;
      }
      
      console.log(`✅ Created ${scenario.count} transactions for ${scenario.label}`);
    }
    
    console.log(`
🎉 Minimal data creation completed!

📊 Summary:
- Total Transactions: ${totalCreated}
- Date Range: Today to 2 weeks ago
- Success Rate: ~85%

🔍 Test Results:
- Today: 25 transactions
- Last 7 Days: ~150 transactions  
- Last 30 Days: ${totalCreated} transactions

✅ Your dashboard should now show different results for each date filter!
    `);
    
  } catch (error) {
    console.error('❌ Error creating minimal data:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

createMinimalData().catch(console.error);