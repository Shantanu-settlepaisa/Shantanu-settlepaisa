#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

async function checkExceptionDistribution() {
  console.log('📊 Exception Distribution in V2 Database\n');
  console.log('=' .repeat(80));
  
  try {
    // Get exception breakdown
    const result = await pool.query(`
      SELECT 
        exception_reason,
        COUNT(*) as count,
        SUM(amount_paise) / 100.0 as total_amount_rupees,
        MIN(transaction_date) as earliest_date,
        MAX(transaction_date) as latest_date,
        ARRAY_AGG(DISTINCT merchant_id ORDER BY merchant_id) FILTER (WHERE merchant_id IS NOT NULL) as merchants
      FROM sp_v2_transactions
      WHERE status = 'EXCEPTION'
      GROUP BY exception_reason
      ORDER BY count DESC
    `);
    
    console.log(`\n📋 Exception Reasons Breakdown:\n`);
    
    let totalExceptions = 0;
    let totalAmount = 0;
    
    result.rows.forEach((row, idx) => {
      totalExceptions += parseInt(row.count);
      totalAmount += parseFloat(row.total_amount_rupees || 0);
      
      console.log(`${idx + 1}. ${row.exception_reason || 'NULL (No Reason)'}`);
      console.log(`   Count: ${row.count}`);
      console.log(`   Total Amount: ₹${parseFloat(row.total_amount_rupees || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
      console.log(`   Date Range: ${row.earliest_date} to ${row.latest_date}`);
      console.log(`   Merchants: ${row.merchants?.slice(0, 5).join(', ')}${row.merchants?.length > 5 ? '...' : ''}`);
      console.log('');
    });
    
    console.log('=' .repeat(80));
    console.log(`\n📊 Summary:`);
    console.log(`   Total Exceptions: ${totalExceptions}`);
    console.log(`   Total Amount: ₹${totalAmount.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
    console.log(`   Distinct Reasons: ${result.rows.length}`);
    
    // Get overall transaction stats
    const statsResult = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(amount_paise) / 100.0 as total_amount
      FROM sp_v2_transactions
      GROUP BY status
      ORDER BY count DESC
    `);
    
    console.log(`\n📈 Overall Transaction Status Distribution:\n`);
    statsResult.rows.forEach(row => {
      console.log(`   ${row.status}: ${row.count} transactions (₹${parseFloat(row.total_amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})})`);
    });
    
    // Get total transactions
    const totalResult = await pool.query(`SELECT COUNT(*) as total FROM sp_v2_transactions`);
    const total = parseInt(totalResult.rows[0].total);
    const exceptionRate = ((totalExceptions / total) * 100).toFixed(2);
    
    console.log(`\n   Total Transactions: ${total}`);
    console.log(`   Exception Rate: ${exceptionRate}%`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkExceptionDistribution();
