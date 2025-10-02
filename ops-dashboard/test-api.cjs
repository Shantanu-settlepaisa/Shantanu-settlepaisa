const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

async function testReconAmountQuery() {
  console.log('🔍 Testing reconciled amount query...');
  
  const client = await pool.connect();
  
  try {
    // Test the exact query from the API with date filtering
    const reconAmountQuery = `
      SELECT 
        SUM(t.amount_paise) as total_reconciled_amount_paise
      FROM sp_v2_recon_matches rm
      JOIN sp_v2_settlement_items si ON rm.item_id = si.id  
      JOIN sp_v2_transactions_v1 t ON si.txn_id = t.id
      WHERE rm.created_at >= $1 AND rm.created_at <= $2
    `;
    
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const toDate = new Date().toISOString();
    
    console.log('Query params:', { fromDate, toDate });
    
    const result = await client.query(reconAmountQuery, [fromDate, toDate]);
    const data = result.rows[0];
    
    console.log('📊 Query Result:');
    console.log(`- Total Reconciled Amount (Paise): ${data.total_reconciled_amount_paise}`);
    console.log(`- Total Reconciled Amount (Rupees): ₹${(data.total_reconciled_amount_paise || 0) / 100}`);
    
  } catch (error) {
    console.error('❌ Query Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

testReconAmountQuery().catch(console.error);