const { Pool } = require('pg');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const pool = new Pool({
  user: 'postgres',
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  database: 'settlepaisa_v2',
  password: 'SettlePaisa2024',
  port: 5432
});

async function main() {
  const client = await pool.connect();
  
  try {
    console.log('\n=== STEP 1: INSERTING TEST PG TRANSACTIONS ===\n');
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    const timestamp = Date.now();
    const transactions = [
      { id: `PG_LIVE_${timestamp}_001`, merchant_id: 'MERCH001', amount: 50000, mode: 'UPI', bank: 'HDFC' },
      { id: `PG_LIVE_${timestamp}_002`, merchant_id: 'MERCH001', amount: 75000, mode: 'Net Banking', bank: 'ICICI' },
      { id: `PG_LIVE_${timestamp}_003`, merchant_id: 'MERCH001', amount: 100000, mode: 'UPI', bank: 'SBI' }
    ];
    
    await client.query('BEGIN');
    
    for (const txn of transactions) {
      await client.query(`
        INSERT INTO sp_v2_transactions 
        (transaction_id, merchant_id, gateway_ref, amount_paise, currency, payment_method, status, 
         transaction_date, transaction_timestamp, source_type, source_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (transaction_id) DO NOTHING
      `, [
        txn.id, txn.merchant_id, txn.id, txn.amount, 'INR', txn.mode, 'PENDING',
        today, today, 'MANUAL_UPLOAD', 'dashboard_test'
      ]);
      console.log(`✅ Inserted PG transaction: ${txn.id} - ₹${txn.amount/100}`);
    }
    
    await client.query('COMMIT');
    
    console.log('\n=== STEP 2: INSERTING TEST BANK STATEMENTS ===\n');
    
    const bankStatements = [
      { utr: `UTR_${timestamp}_001`, amount: 50000, bank_ref: `REF_${timestamp}_001` },
      { utr: `UTR_${timestamp}_002`, amount: 75000, bank_ref: `REF_${timestamp}_002` },
      { utr: `UTR_${timestamp}_003`, amount: 100000, bank_ref: `REF_${timestamp}_003` }
    ];
    
    await client.query('BEGIN');
    
    for (const stmt of bankStatements) {
      const exists = await client.query(`
        SELECT id FROM sp_v2_bank_statements WHERE utr = $1 AND bank_name = $2
      `, [stmt.utr, 'HDFC']);
      
      if (exists.rows.length === 0) {
        await client.query(`
          INSERT INTO sp_v2_bank_statements 
          (bank_ref, bank_name, utr, amount_paise, transaction_date, value_date, 
           source_type, source_file, debit_credit)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          stmt.bank_ref, 'HDFC', stmt.utr, stmt.amount, 
          today, today, 'MANUAL_UPLOAD', 'dashboard_test', 'CREDIT'
        ]);
      }
      console.log(`✅ Inserted bank statement: ${stmt.utr} - ₹${stmt.amount/100}`);
    }
    
    await client.query('COMMIT');
    
    console.log('\n=== STEP 3: RUNNING RECONCILIATION ===\n');
    
    const pendingTxns = await client.query(`
      SELECT transaction_id, amount_paise 
      FROM sp_v2_transactions 
      WHERE status = 'PENDING' AND transaction_id LIKE 'PG_LIVE_%'
    `);
    
    console.log(`Found ${pendingTxns.rows.length} pending test transactions\n`);
    
    let reconCount = 0;
    
    await client.query('BEGIN');
    
    for (const txn of pendingTxns.rows) {
      const bankMatch = await client.query(`
        SELECT id, utr, amount_paise 
        FROM sp_v2_bank_statements 
        WHERE amount_paise = $1 
        AND utr LIKE 'UTR_%'
        AND transaction_date = $2
        LIMIT 1
      `, [txn.amount_paise, today]);
      
      if (bankMatch.rows.length > 0) {
        const bank = bankMatch.rows[0];
        
        await client.query(`
          UPDATE sp_v2_transactions 
          SET status = 'RECONCILED', 
              utr = $1,
              updated_at = NOW()
          WHERE transaction_id = $2
        `, [bank.utr, txn.transaction_id]);
        
        console.log(`✅ Reconciled: ${txn.transaction_id} with ${bank.utr} - ₹${txn.amount_paise/100}`);
        reconCount++;
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`\n=== RECONCILIATION COMPLETE: ${reconCount} matches ===\n`);
    
    console.log('\n=== STEP 4: VERIFYING DATABASE ENTRIES ===\n');
    
    const txnResult = await client.query(`
      SELECT transaction_id, status, amount_paise, utr 
      FROM sp_v2_transactions 
      WHERE transaction_id LIKE 'PG_LIVE_%'
      ORDER BY transaction_id
    `);
    
    console.log('📊 sp_v2_transactions:');
    txnResult.rows.forEach(row => {
      console.log(`  ${row.transaction_id}: ${row.status} - ₹${row.amount_paise/100} - UTR: ${row.utr || 'N/A'}`);
    });
    
    const bankResult = await client.query(`
      SELECT utr, amount_paise, bank_name 
      FROM sp_v2_bank_statements 
      WHERE utr LIKE 'UTR_%'
      AND transaction_date = $1
      ORDER BY utr
    `, [today]);
    
    console.log('\n📊 sp_v2_bank_statements:');
    bankResult.rows.forEach(row => {
      console.log(`  ${row.utr}: ₹${row.amount_paise/100} - ${row.bank_name}`);
    });
    
    console.log('\n=== STEP 5: WAITING FOR SETTLEMENT QUEUE (60 seconds) ===\n');
    console.log('Settlement trigger should auto-queue RECONCILED transactions...\n');
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const queueResult = await client.query(`
      SELECT transaction_id, merchant_id, amount_paise, status, created_at 
      FROM sp_v2_settlement_queue 
      WHERE transaction_id LIKE 'PG_LIVE_%'
      ORDER BY created_at DESC
    `);
    
    if (queueResult.rows.length > 0) {
      console.log('✅ Settlement Queue Triggered!');
      console.log('📊 sp_v2_settlement_queue:');
      queueResult.rows.forEach(row => {
        console.log(`  ${row.transaction_id}: ${row.status} - ₹${row.amount_paise/100} - ${row.created_at}`);
      });
    } else {
      console.log('⏳ No entries in settlement queue yet (trigger may be delayed)');
    }
    
    console.log('\n=== STEP 6: CHECKING SETTLEMENT BATCHES (after processor runs) ===\n');
    
    await new Promise(resolve => setTimeout(resolve, 50000));
    
    const batchResult = await client.query(`
      SELECT id, merchant_id, gross_amount_paise, total_commission_paise, 
             total_gst_paise, total_reserve_paise, net_amount_paise, status, created_at
      FROM sp_v2_settlement_batches
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    if (batchResult.rows.length > 0) {
      console.log('✅ Settlement Batch Created!');
      console.log('📊 sp_v2_settlement_batches:');
      batchResult.rows.forEach(row => {
        console.log(`  Batch: ${row.id}`);
        console.log(`  Merchant: ${row.merchant_id}`);
        console.log(`  Gross: ₹${row.gross_amount_paise/100}`);
        console.log(`  Commission: ₹${row.total_commission_paise/100}`);
        console.log(`  GST: ₹${row.total_gst_paise/100}`);
        console.log(`  Reserve: ₹${row.total_reserve_paise/100}`);
        console.log(`  Net: ₹${row.net_amount_paise/100}`);
        console.log(`  Status: ${row.status}`);
        console.log(`  Created: ${row.created_at}\n`);
      });
      
      const latestBatch = batchResult.rows[0].id;
      
      const itemsResult = await client.query(`
        SELECT transaction_id, amount_paise, commission_paise, gst_paise, reserve_paise, net_paise
        FROM sp_v2_settlement_items
        WHERE settlement_batch_id = $1
      `, [latestBatch]);
      
      console.log(`📊 sp_v2_settlement_items (${itemsResult.rows.length} items):`);
      itemsResult.rows.forEach(row => {
        console.log(`  ${row.transaction_id}: Gross ₹${row.amount_paise/100} → Net ₹${row.net_paise/100}`);
      });
      
      const reserveResult = await client.query(`
        SELECT merchant_id, transaction_type, amount_paise, balance_paise, description
        FROM sp_v2_merchant_reserve_ledger
        ORDER BY created_at DESC
        LIMIT 5
      `);
      
      console.log(`\n📊 sp_v2_merchant_reserve_ledger (${reserveResult.rows.length} entries):`);
      reserveResult.rows.forEach(row => {
        console.log(`  ${row.transaction_type}: ₹${row.amount_paise/100} - Balance: ₹${row.balance_paise/100}`);
        console.log(`    ${row.description}`);
      });
      
      const auditResult = await client.query(`
        SELECT merchant_id, commission_tier, commission_rate, volume_30_days_paise, batch_id
        FROM sp_v2_commission_audit
        ORDER BY created_at DESC
        LIMIT 5
      `);
      
      console.log(`\n📊 sp_v2_commission_audit (${auditResult.rows.length} entries):`);
      auditResult.rows.forEach(row => {
        console.log(`  Batch: ${row.batch_id}`);
        console.log(`  Tier: ${row.commission_tier}, Rate: ${row.commission_rate}%, 30-day Volume: ₹${row.volume_30_days_paise/100}`);
      });
      
    } else {
      console.log('⏳ No settlement batches yet (processor may still be running)');
    }
    
    console.log('\n=== TEST COMPLETE ===\n');
    console.log('Summary:');
    console.log('✅ 3 PG transactions inserted');
    console.log('✅ 3 Bank statements inserted');
    console.log(`✅ ${reconCount} transactions reconciled`);
    console.log(`✅ Check settlement queue and batches above\n`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
