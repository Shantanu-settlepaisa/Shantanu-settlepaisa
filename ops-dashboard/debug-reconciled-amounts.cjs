const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

async function debugReconciledAmounts() {
  console.log('🔍 Debugging reconciled amounts calculation...');
  
  const client = await pool.connect();
  
  try {
    // Check reconciled amounts for last 7 days
    const reconAmountQuery = `
      SELECT 
        COUNT(rm.*) as matched_count,
        SUM(t.amount_paise) as total_matched_amount_paise,
        ROUND(SUM(t.amount_paise)/100) as total_matched_amount_rupees
      FROM sp_v2_recon_matches rm
      JOIN sp_v2_settlement_items si ON rm.item_id = si.id  
      JOIN sp_v2_transactions_v1 t ON si.txn_id = t.id
      WHERE rm.created_at >= CURRENT_DATE - INTERVAL '7 days'
    `;
    
    const result = await client.query(reconAmountQuery);
    const data = result.rows[0];
    
    console.log('📊 Reconciled Amount Data (Last 7 Days):');
    console.log(`- Matched Transactions: ${data.matched_count}`);
    console.log(`- Total Matched Amount (Paise): ${data.total_matched_amount_paise}`);
    console.log(`- Total Matched Amount (Rupees): ₹${data.total_matched_amount_rupees}`);
    
    // Also check total transaction amounts for comparison
    const totalAmountQuery = `
      SELECT 
        COUNT(*) as total_count,
        SUM(amount_paise) as total_amount_paise,
        ROUND(SUM(amount_paise)/100) as total_amount_rupees
      FROM sp_v2_transactions_v1 t
      WHERE t.created_at >= CURRENT_DATE - INTERVAL '7 days'
        AND t.status = 'SUCCESS'
    `;
    
    const totalResult = await client.query(totalAmountQuery);
    const totalData = totalResult.rows[0];
    
    console.log('\n📊 Total Transaction Data (Last 7 Days):');
    console.log(`- Total Transactions: ${totalData.total_count}`);
    console.log(`- Total Amount (Paise): ${totalData.total_amount_paise}`);
    console.log(`- Total Amount (Rupees): ₹${totalData.total_amount_rupees}`);
    
    const reconRate = data.matched_count > 0 ? 
      (data.matched_count / totalData.total_count * 100).toFixed(1) : '0.0';
    const amountReconRate = data.total_matched_amount_paise > 0 ? 
      (data.total_matched_amount_paise / totalData.total_amount_paise * 100).toFixed(1) : '0.0';
    
    console.log('\n🔗 Reconciliation Rates:');
    console.log(`- Transaction Count Rate: ${reconRate}%`);
    console.log(`- Amount Reconciliation Rate: ${amountReconRate}%`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

debugReconciledAmounts().catch(console.error);