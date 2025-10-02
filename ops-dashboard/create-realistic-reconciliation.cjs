const { Pool } = require('pg');

// Database connection to V2 PostgreSQL
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

async function createRealisticReconciliation() {
  console.log('🚀 Creating realistic time-based reconciliation matches...');
  
  const client = await pool.connect();
  
  try {
    // Clear existing matches to start fresh
    await client.query('DELETE FROM sp_v2_recon_matches');
    console.log('🧹 Cleared existing reconciliation matches');
    
    // Get all transactions and credits grouped by age
    const transactionsQuery = `
      SELECT 
        t.id as txn_id,
        uc.id as credit_id,
        t.utr,
        t.amount_paise,
        t.created_at,
        uc.credited_at,
        EXTRACT(epoch FROM (CURRENT_TIMESTAMP - t.created_at))/3600 as age_hours
      FROM sp_v2_transactions_v1 t
      LEFT JOIN sp_v2_utr_credits uc ON t.utr = uc.utr 
      WHERE t.status = 'SUCCESS' AND t.utr IS NOT NULL AND uc.id IS NOT NULL
      ORDER BY t.created_at DESC
    `;
    
    const result = await client.query(transactionsQuery);
    const transactions = result.rows;
    
    console.log(`📊 Found ${transactions.length} successful transactions with bank credits`);
    
    // Define realistic reconciliation rates based on transaction age
    const getReconciliationRate = (ageHours) => {
      if (ageHours < 24) return 0.35;        // 35% for transactions < 24 hours (fresh)
      if (ageHours < 48) return 0.65;        // 65% for 1-2 days old  
      if (ageHours < 72) return 0.80;        // 80% for 2-3 days old
      if (ageHours < 168) return 0.90;       // 90% for 3-7 days old (1 week)
      if (ageHours < 720) return 0.95;       // 95% for 1-30 days old
      return 0.98;                           // 98% for > 30 days old (mature)
    };
    
    let totalMatches = 0;
    let matchesByAge = {
      'fresh_24h': { attempted: 0, matched: 0 },
      '1_2_days': { attempted: 0, matched: 0 },
      '2_3_days': { attempted: 0, matched: 0 },
      '3_7_days': { attempted: 0, matched: 0 },
      '1_30_days': { attempted: 0, matched: 0 },
      'mature_30d': { attempted: 0, matched: 0 }
    };
    
    // Create reconciliation matches based on age-based probability
    for (const txn of transactions) {
      const ageHours = parseFloat(txn.age_hours);
      const reconciliationRate = getReconciliationRate(ageHours);
      const shouldMatch = Math.random() < reconciliationRate;
      
      // Categorize by age for reporting
      let ageCategory;
      if (ageHours < 24) ageCategory = 'fresh_24h';
      else if (ageHours < 48) ageCategory = '1_2_days';
      else if (ageHours < 72) ageCategory = '2_3_days';
      else if (ageHours < 168) ageCategory = '3_7_days';
      else if (ageHours < 720) ageCategory = '1_30_days';
      else ageCategory = 'mature_30d';
      
      matchesByAge[ageCategory].attempted++;
      
      if (shouldMatch) {
        // Store the match for later processing (after settlement items are created)
        const matchType = Math.random() < 0.85 ? 'EXACT' : 'FUZZY'; // 85% exact, 15% fuzzy
        const matchScore = matchType === 'EXACT' ? 100 : Math.floor(Math.random() * 20) + 75; // 75-95 for fuzzy
        
        // Determine when the match was created (should be after the credit)
        const creditTime = new Date(txn.credited_at);
        const matchTime = new Date(creditTime.getTime() + Math.random() * 4 * 60 * 60 * 1000); // 0-4 hours after credit
        
        // Store match data for later processing
        txn.matchData = {
          matchType,
          matchScore,
          matchTime
        };
        
        totalMatches++;
        matchesByAge[ageCategory].matched++;
      }
    }
    
    // Create settlement items first (required for reconciliation matches)
    console.log('💼 Creating settlement items for transactions...');
    
    // Get or create settlement batch
    let batchResult = await client.query('SELECT id FROM sp_v2_settlement_batches LIMIT 1');
    let batchId;
    
    if (batchResult.rows.length === 0) {
      const batchInsert = await client.query(`
        INSERT INTO sp_v2_settlement_batches 
        (merchant_id, cycle_date, rail, status, total_transactions, gross_amount_paise, net_amount_paise)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        '550e8400-e29b-41d4-a716-446655440001', // merchant_id
        new Date().toISOString().split('T')[0],   // cycle_date
        'NEFT',
        'COMPLETED',
        transactions.length,
        transactions.reduce((sum, t) => sum + parseInt(t.amount_paise), 0),
        Math.floor(transactions.reduce((sum, t) => sum + parseInt(t.amount_paise) * 0.98, 0)) // 2% fees
      ]);
      batchId = batchInsert.rows[0].id;
    } else {
      batchId = batchResult.rows[0].id;
    }
    
    // Create settlement items for all transactions
    const settlementItemIds = new Map(); // Map txn_id to settlement_item_id
    
    for (const txn of transactions) {
      const grossAmount = parseInt(txn.amount_paise);
      const commission = Math.floor(grossAmount * 0.02); // 2% commission
      const gst = Math.floor(commission * 0.18); // 18% GST
      const tds = Math.floor(commission * 0.02); // 2% TDS
      const netAmount = grossAmount - commission - gst - tds;
      
      const itemResult = await client.query(`
        INSERT INTO sp_v2_settlement_items 
        (batch_id, txn_id, gross_paise, commission_paise, gst_on_commission_paise, tds_paise, net_paise, commission_tier)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        batchId,
        txn.txn_id,
        grossAmount,
        commission,
        gst,
        tds,
        netAmount,
        'Tier 1 - Under 25L'
      ]);
      
      settlementItemIds.set(txn.txn_id, itemResult.rows[0].id);
    }
    
    // Now create the reconciliation matches using settlement item IDs
    console.log('🔗 Creating reconciliation matches...');
    let actualMatches = 0;
    
    for (const txn of transactions) {
      if (txn.matchData) {
        const settlementItemId = settlementItemIds.get(txn.txn_id);
        
        await client.query(`
          INSERT INTO sp_v2_recon_matches 
          (utr_id, item_id, match_type, match_score, amount_difference_paise, matched_by, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          txn.credit_id,
          settlementItemId,
          txn.matchData.matchType,
          txn.matchData.matchScore,
          0, // Exact match for now
          'AUTO_RECON',
          txn.matchData.matchTime
        ]);
        
        actualMatches++;
      }
    }
    
    console.log(`\n🎉 Realistic reconciliation matching completed!\n`);
    
    console.log(`📊 Summary by Transaction Age:`);
    console.log(`┌─────────────┬──────────┬─────────┬─────────────┐`);
    console.log(`│ Age Range   │ Attempted│ Matched │ Match Rate  │`);
    console.log(`├─────────────┼──────────┼─────────┼─────────────┤`);
    
    Object.entries(matchesByAge).forEach(([ageRange, stats]) => {
      const rate = stats.attempted > 0 ? (stats.matched / stats.attempted * 100).toFixed(1) : '0.0';
      const ageLabel = ageRange.replace('_', '-').replace('d', ' days').replace('h', ' hours');
      console.log(`│ ${ageLabel.padEnd(11)} │ ${stats.attempted.toString().padStart(8)} │ ${stats.matched.toString().padStart(7)} │ ${(rate + '%').padStart(11)} │`);
    });
    console.log(`└─────────────┴──────────┴─────────┴─────────────┘`);
    
    console.log(`\n💰 Overall Statistics:`);
    console.log(`- Total Successful Transactions: ${transactions.length}`);
    console.log(`- Total Reconciliation Matches: ${totalMatches}`);
    console.log(`- Overall Match Rate: ${(totalMatches / transactions.length * 100).toFixed(1)}%`);
    
    console.log(`\n🔍 Expected Dashboard Behavior:`);
    console.log(`- Today: ~35% match rate (fresh transactions)`);
    console.log(`- Last 7 Days: ~75-85% blended match rate`);
    console.log(`- Last 30 Days: ~85-90% blended match rate`);
    
    console.log(`\n✅ Reconciliation data now reflects realistic fintech patterns!`);
    
  } catch (error) {
    console.error('❌ Error creating reconciliation matches:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

createRealisticReconciliation().catch(console.error);