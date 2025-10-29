#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2'
});

async function checkSettlementStatus() {
  try {
    console.log('\n🔍 Checking settlement processing status...\n');
    
    // Check transaction status
    const txnResult = await pool.query(`
      SELECT 
        transaction_id, 
        status, 
        settlement_batch_id, 
        settled_at,
        updated_at
      FROM sp_v2_transactions 
      WHERE transaction_id = 'TRIGGER_TEST_20251007121336'
    `);
    
    console.log('=== TRANSACTION STATUS ===');
    if (txnResult.rows.length > 0) {
      const txn = txnResult.rows[0];
      console.log(`Transaction ID: ${txn.transaction_id}`);
      console.log(`Status: ${txn.status}`);
      console.log(`Settlement Batch ID: ${txn.settlement_batch_id || '(not settled yet)'}`);
      console.log(`Settled At: ${txn.settled_at || '(not settled yet)'}`);
      console.log(`Last Updated: ${txn.updated_at}`);
    } else {
      console.log('Transaction not found!');
    }
    
    // Check queue status
    const queueResult = await pool.query(`
      SELECT 
        id, 
        transaction_id, 
        status, 
        queued_at, 
        processed_at,
        updated_at,
        error_message
      FROM sp_v2_settlement_queue
      WHERE transaction_id = 'TRIGGER_TEST_20251007121336'
    `);
    
    console.log('\n=== QUEUE STATUS ===');
    if (queueResult.rows.length > 0) {
      const queue = queueResult.rows[0];
      console.log(`Queue ID: ${queue.id}`);
      console.log(`Status: ${queue.status}`);
      console.log(`Queued At: ${queue.queued_at}`);
      console.log(`Processed At: ${queue.processed_at || '(not processed yet)'}`);
      console.log(`Error: ${queue.error_message || '(none)'}`);
      
      if (queue.status === 'PENDING') {
        const queuedTime = new Date(queue.queued_at);
        const now = new Date();
        const minutesWaiting = Math.floor((now - queuedTime) / 60000);
        console.log(`\n⏱️  Waiting time: ${minutesWaiting} minutes (batches after 5 minutes)`);
      }
    } else {
      console.log('Queue entry not found!');
    }
    
    // Check if settlement batch was created
    const batchResult = await pool.query(`
      SELECT 
        id, 
        merchant_id, 
        total_transactions, 
        gross_amount_paise,
        net_amount_paise, 
        status, 
        created_at
      FROM sp_v2_settlement_batches
      WHERE merchant_id = 'MERCH001'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    console.log('\n=== LATEST SETTLEMENT BATCH (MERCH001) ===');
    if (batchResult.rows.length > 0) {
      const batch = batchResult.rows[0];
      console.log(`Batch ID: ${batch.id}`);
      console.log(`Merchant ID: ${batch.merchant_id}`);
      console.log(`Total Transactions: ${batch.total_transactions}`);
      console.log(`Gross Amount: ₹${(batch.gross_amount_paise / 100).toFixed(2)}`);
      console.log(`Net Amount: ₹${(batch.net_amount_paise / 100).toFixed(2)}`);
      console.log(`Status: ${batch.status}`);
      console.log(`Created At: ${batch.created_at}`);
    } else {
      console.log('No settlement batch created yet');
    }
    
    // Check reserve ledger
    const reserveResult = await pool.query(`
      SELECT 
        id,
        settlement_batch_id,
        reserve_amount_paise,
        hold_date,
        release_date,
        status
      FROM sp_v2_merchant_reserve_ledger
      WHERE merchant_id = 'MERCH001'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    console.log('\n=== RESERVE LEDGER (MERCH001) ===');
    if (reserveResult.rows.length > 0) {
      const reserve = reserveResult.rows[0];
      console.log(`Ledger ID: ${reserve.id}`);
      console.log(`Batch ID: ${reserve.settlement_batch_id}`);
      console.log(`Reserve Amount: ₹${(reserve.reserve_amount_paise / 100).toFixed(2)}`);
      console.log(`Hold Date: ${reserve.hold_date}`);
      console.log(`Release Date: ${reserve.release_date}`);
      console.log(`Status: ${reserve.status}`);
    } else {
      console.log('No reserve entries yet');
    }
    
    // Check commission audit
    const commissionResult = await pool.query(`
      SELECT 
        id,
        settlement_batch_id,
        commission_amount_paise,
        commission_rate,
        commission_type,
        gst_amount_paise,
        created_at
      FROM sp_v2_commission_audit
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    console.log('\n=== COMMISSION AUDIT (Latest) ===');
    if (commissionResult.rows.length > 0) {
      const commission = commissionResult.rows[0];
      console.log(`Audit ID: ${commission.id}`);
      console.log(`Batch ID: ${commission.settlement_batch_id}`);
      console.log(`Commission: ₹${(commission.commission_amount_paise / 100).toFixed(2)}`);
      console.log(`Rate: ${commission.commission_rate}% (${commission.commission_type})`);
      console.log(`GST: ₹${(commission.gst_amount_paise / 100).toFixed(2)}`);
      console.log(`Created At: ${commission.created_at}`);
    } else {
      console.log('No commission audit entries yet');
    }
    
    console.log('\n✅ Check complete\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 'ETIMEDOUT') {
      console.error('💡 Connection timed out. Make sure you can reach the RDS database.');
      console.error('💡 You may need to run this from the EC2 server or set up an SSH tunnel.');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkSettlementStatus();
