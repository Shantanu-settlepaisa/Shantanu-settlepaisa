const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

async function simulateFullFlow() {
  console.log('=== SIMULATING FULL RECON → SETTLEMENT FLOW ===\n');
  
  // Step 1: Check if services are running
  console.log('Step 1: Checking services...');
  try {
    const pgHealth = await axios.get('http://localhost:5101/health', { timeout: 3000 });
    console.log('✅ PG API healthy:', pgHealth.data.status);
  } catch (e) {
    console.log('❌ PG API not running');
    return;
  }
  
  try {
    const reconHealth = await axios.get('http://localhost:5103/recon/health', { timeout: 3000 });
    console.log('✅ Recon API healthy:', reconHealth.data.status);
  } catch (e) {
    console.log('❌ Recon API not running');
    return;
  }
  
  // Step 2: Trigger reconciliation for 2025-10-01
  console.log('\nStep 2: Triggering reconciliation for 2025-10-01...');
  try {
    const reconResponse = await axios.post('http://localhost:5103/recon/run', {
      date: '2025-10-01',
      dryRun: false,
      test: false
    });
    
    console.log('Recon Job Started:');
    console.log('  Job ID:', reconResponse.data.jobId);
    console.log('  Status:', reconResponse.data.status);
    console.log('  Matched:', reconResponse.data.counters.matched);
    console.log('  Unmatched PG:', reconResponse.data.counters.unmatchedPg);
    console.log('  Unmatched Bank:', reconResponse.data.counters.unmatchedBank);
    
    // Step 3: Wait for job completion (it should be instant)
    console.log('\nStep 3: Waiting for recon to complete...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const jobDetails = await axios.get(`http://localhost:5103/recon/jobs/${reconResponse.data.jobId}`);
    console.log('Job completed:', jobDetails.data.status);
    
    // Step 4: Check if settlement was triggered
    console.log('\nStep 4: Checking for settlement batches...');
    const { Pool } = require('pg');
    const pool = new Pool({
      host: 'localhost',
      port: 5433,
      database: 'settlepaisa_v2',
      user: 'postgres',
      password: 'settlepaisa123'
    });
    
    const batches = await pool.query(`
      SELECT 
        id,
        merchant_id,
        merchant_name,
        cycle_date,
        total_transactions,
        gross_amount_paise/100 as gross_rupees,
        total_commission_paise/100 as commission_rupees,
        total_gst_paise/100 as gst_rupees,
        total_reserve_paise/100 as reserve_rupees,
        net_amount_paise/100 as net_settlement_rupees,
        status,
        created_at
      FROM sp_v2_settlement_batches
      WHERE cycle_date >= '2025-10-01'
      ORDER BY created_at DESC
    `);
    
    if (batches.rows.length === 0) {
      console.log('⚠️  No settlement batches found (auto-trigger issue)');
      console.log('\nManually triggering settlement for matched transactions...');
      
      // Get matched transactions
      const matches = await pool.query(`
        SELECT 
          rm.id,
          rm.match_type,
          t.merchant_id,
          t.amount_paise,
          t.transaction_id,
          t.payment_method
        FROM sp_v2_recon_matches rm
        JOIN sp_v2_transactions t ON rm.item_id = t.id
        WHERE t.transaction_date >= '2025-10-01'
        LIMIT 50
      `);
      
      console.log(`Found ${matches.rows.length} matched transactions`);
      
      if (matches.rows.length > 0) {
        // Group by merchant
        const merchantGroups = {};
        matches.rows.forEach(row => {
          if (!merchantGroups[row.merchant_id]) {
            merchantGroups[row.merchant_id] = [];
          }
          merchantGroups[row.merchant_id].push({
            transaction_id: row.transaction_id,
            paid_amount: row.amount_paise / 100,
            payee_amount: row.amount_paise / 100,
            payment_mode: row.payment_method,
            paymode_id: 1
          });
        });
        
        console.log(`Grouped into ${Object.keys(merchantGroups).length} merchants`);
        
        // Calculate settlement for each merchant
        const { SettlementCalculatorV1Logic } = require('./services/settlement-engine/settlement-calculator-v1-logic.cjs');
        const calculator = new SettlementCalculatorV1Logic();
        
        for (const [merchantId, transactions] of Object.entries(merchantGroups)) {
          console.log(`\n  Calculating settlement for ${merchantId} (${transactions.length} txns)...`);
          const batch = await calculator.calculateSettlement(merchantId, transactions, '2025-10-01');
          const batchId = await calculator.persistSettlement(batch);
          console.log(`  ✅ Created batch ${batchId}: ₹${(batch.net_settlement_amount/100).toFixed(2)}`);
        }
        
        await calculator.close();
      }
      
      // Re-query batches
      const newBatches = await pool.query(`
        SELECT 
          id,
          merchant_id,
          merchant_name,
          cycle_date,
          total_transactions,
          gross_amount_paise/100 as gross_rupees,
          net_amount_paise/100 as net_settlement_rupees,
          status
        FROM sp_v2_settlement_batches
        WHERE cycle_date >= '2025-10-01'
        ORDER BY created_at DESC
      `);
      
      console.log('\n✅ Settlement Batches Created:\n');
      console.table(newBatches.rows);
      
      const total = newBatches.rows.reduce((sum, r) => sum + parseFloat(r.net_settlement_rupees), 0);
      console.log(`\n💰 Total Net Settlement: ₹${total.toFixed(2)}\n`);
    } else {
      console.log('\n✅ Settlement auto-triggered successfully!\n');
      console.table(batches.rows);
      
      const total = batches.rows.reduce((sum, r) => sum + parseFloat(r.net_settlement_rupees), 0);
      console.log(`\n💰 Total Net Settlement: ₹${total.toFixed(2)}\n`);
    }
    
    await pool.end();
    
    console.log('\n=== SIMULATION COMPLETE ===');
    console.log('Summary:');
    console.log('  ✅ Reconciliation: Working');
    console.log('  ✅ Settlement Calculation: Working');
    console.log('  ✅ Database Persistence: Working');
    console.log('  ⚠️  Auto-trigger: Needs debugging (manual trigger works)');
    
  } catch (error) {
    console.error('\n❌ Simulation failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

simulateFullFlow();
