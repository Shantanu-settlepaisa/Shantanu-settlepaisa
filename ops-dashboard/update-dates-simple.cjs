const { Pool } = require('pg');

// Database connection to V2 PostgreSQL
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

async function updateDatesSimple() {
  console.log('🚀 Updating existing transaction dates for realistic date filtering...');
  
  const client = await pool.connect();
  
  try {
    // First, check how many transactions we have
    const countResult = await client.query('SELECT COUNT(*) as count FROM sp_v2_transactions_v1');
    const totalTransactions = parseInt(countResult.rows[0].count);
    
    console.log(`📊 Found ${totalTransactions} existing transactions to update`);
    
    if (totalTransactions === 0) {
      console.log('❌ No transactions found. Please upload some test data first.');
      return;
    }
    
    // Get all transaction IDs
    const transactionsResult = await client.query('SELECT id FROM sp_v2_transactions_v1 ORDER BY id');
    const transactionIds = transactionsResult.rows.map(row => row.id);
    
    // Create realistic date distribution
    const scenarios = [
      { count: Math.min(50, Math.floor(totalTransactions * 0.05)), daysAgo: 0, label: "Today" },
      { count: Math.min(100, Math.floor(totalTransactions * 0.08)), daysAgo: 1, label: "Yesterday" },
      { count: Math.min(150, Math.floor(totalTransactions * 0.12)), daysAgo: 2, label: "2 days ago" },
      { count: Math.min(200, Math.floor(totalTransactions * 0.15)), daysAgo: 3, label: "3 days ago" },
      { count: Math.min(250, Math.floor(totalTransactions * 0.18)), daysAgo: 4, label: "4 days ago" },
      { count: Math.min(180, Math.floor(totalTransactions * 0.12)), daysAgo: 5, label: "5 days ago" },
      { count: Math.min(120, Math.floor(totalTransactions * 0.08)), daysAgo: 6, label: "6 days ago" },
      { count: Math.min(300, Math.floor(totalTransactions * 0.10)), daysAgo: 10, label: "10 days ago" },
      { count: Math.min(400, Math.floor(totalTransactions * 0.12)), daysAgo: 15, label: "15 days ago" },
    ];
    
    // Distribute remaining transactions to older dates
    let usedCount = scenarios.reduce((sum, s) => sum + s.count, 0);
    let remainingTransactions = totalTransactions - usedCount;
    
    if (remainingTransactions > 0) {
      scenarios.push({ 
        count: remainingTransactions, 
        daysAgo: 25, 
        label: "25+ days ago" 
      });
    }
    
    console.log('\n📅 Date distribution plan:');
    scenarios.forEach(s => {
      console.log(`  ${s.label}: ${s.count} transactions`);
    });
    
    // Update transactions with new dates
    let currentIndex = 0;
    
    for (const scenario of scenarios) {
      if (scenario.count === 0) continue;
      
      const transactionIdsToUpdate = transactionIds.slice(currentIndex, currentIndex + scenario.count);
      
      for (const transactionId of transactionIdsToUpdate) {
        // Random time within the day
        const baseTime = Date.now() - (scenario.daysAgo * 24 * 60 * 60 * 1000);
        const randomOffset = Math.random() * 24 * 60 * 60 * 1000; // Random time within 24 hours
        const newDate = new Date(baseTime - randomOffset);
        
        // Update transaction date
        await client.query(
          'UPDATE sp_v2_transactions_v1 SET created_at = $1 WHERE id = $2',
          [newDate, transactionId]
        );
        
        // Update related bank credits if they exist
        await client.query(`
          UPDATE sp_v2_utr_credits 
          SET credited_at = $1 
          WHERE utr IN (
            SELECT utr FROM sp_v2_transactions_v1 WHERE id = $2 AND utr IS NOT NULL
          )
        `, [new Date(newDate.getTime() + Math.random() * 2 * 60 * 60 * 1000), transactionId]); // Credits 0-2 hours after transaction
        
        // Update related reconciliation matches
        await client.query(`
          UPDATE sp_v2_recon_matches 
          SET created_at = $1 
          WHERE item_id IN (
            SELECT si.id FROM sp_v2_settlement_items si 
            WHERE si.txn_id = $2
          )
        `, [new Date(newDate.getTime() + Math.random() * 4 * 60 * 60 * 1000), transactionId]); // Matches 0-4 hours after transaction
      }
      
      currentIndex += scenario.count;
      console.log(`✅ Updated ${scenario.count} transactions for ${scenario.label}`);
    }
    
    // Update settlement batches to have appropriate dates
    await client.query(`
      UPDATE sp_v2_settlement_batches 
      SET created_at = date_trunc('day', CURRENT_DATE - INTERVAL '1 day') + INTERVAL '18 hours',
          cycle_date = CURRENT_DATE - INTERVAL '1 day'
      WHERE id IN (SELECT id FROM sp_v2_settlement_batches LIMIT 1)
    `);
    
    console.log(`
🎉 Date update completed successfully!

📊 Summary:
- Updated ${totalTransactions} transactions with realistic dates
- Distributed across ${scenarios.length} different time periods
- Range: Today to 25+ days ago

🔍 Test scenarios now available:
- Today: ~50 transactions
- Last 7 Days: ~1,000+ transactions  
- Last 30 Days: All ${totalTransactions} transactions

✅ Your dashboard date filtering will now show different results for each time period!
    `);
    
  } catch (error) {
    console.error('❌ Error updating dates:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
updateDatesSimple().catch(console.error);