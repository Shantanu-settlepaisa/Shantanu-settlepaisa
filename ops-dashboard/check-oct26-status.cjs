#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024',
});

async function checkOct26Status() {
  const client = await pool.connect();
  
  try {
    console.log('Checking Oct 26 transaction statuses...\n');
    
    const result = await client.query(`
      SELECT 
        status,
        COUNT(*) as count,
        STRING_AGG(transaction_id, ', ' LIMIT 5) as sample_ids
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = '2025-10-26'
      AND source_type = 'MANUAL_UPLOAD'
      GROUP BY status
      ORDER BY count DESC
    `);
    
    console.log('Status breakdown for 2025-10-26:');
    console.log('═'.repeat(80));
    result.rows.forEach(row => {
      console.log(`Status: ${row.status}`);
      console.log(`  Count: ${row.count}`);
      console.log(`  Sample IDs: ${row.sample_ids || 'N/A'}`);
      console.log('');
    });
    
    // Check if any are linked to settlements
    const settlementCheck = await client.query(`
      SELECT 
        COUNT(DISTINCT t.transaction_id) as linked_count,
        COUNT(DISTINCT sb.id) as batch_count,
        STRING_AGG(DISTINCT sb.id::text, ', ' LIMIT 3) as batch_ids
      FROM sp_v2_transactions t
      JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
      JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      WHERE DATE(t.transaction_date) = '2025-10-26'
      AND t.source_type = 'MANUAL_UPLOAD'
    `);
    
    console.log('Settlement linkage check:');
    console.log('═'.repeat(80));
    console.log(`Transactions linked to settlements: ${settlementCheck.rows[0].linked_count}`);
    console.log(`Number of settlement batches: ${settlementCheck.rows[0].batch_count}`);
    console.log(`Batch IDs: ${settlementCheck.rows[0].batch_ids || 'None'}`);
    console.log('');
    
  } finally {
    client.release();
    await pool.end();
  }
}

checkOct26Status().catch(console.error);
