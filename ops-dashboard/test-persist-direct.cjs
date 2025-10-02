// Test persistence directly
async function test() {
  // Mock match result
  const mockResults = {
    matched: [
      {
        pg: {
          transaction_id: 'TEST_TXN_001',
          merchant_id: 'TEST_MERCHANT',
          amount: 10000, // paise
          transaction_date: '2025-10-01',
          transaction_timestamp: '2025-10-01T10:00:00Z',
          payment_method: 'UPI',
          utr: 'TEST_UTR_001'
        },
        bank: {
          TRANSACTION_ID: 'BANK_TEST_001',
          BANK: 'TEST_BANK',
          AMOUNT: 100, // rupees  
          DATE: '2025-10-01',
          VALUE_DATE: '2025-10-01',
          UTR: 'TEST_UTR_001',
          REMARKS: 'Test transaction'
        }
      }
    ],
    unmatchedPg: [],
    unmatchedBank: [],
    exceptions: []
  };
  
  // Import the persist function
  const { Pool } = require('pg');
  
  // Create persistence function inline
  async function persistResults(results) {
    console.log('[Persistence] Starting...');
    console.log(`[Persistence] Matched: ${results.matched.length}`);
    
    const pool = new Pool({
      host: 'localhost',
      port: 5433,
      database: 'settlepaisa_v2',
      user: 'postgres',
      password: 'settlepaisa123'
    });
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      console.log('[Persistence] Transaction started');
      
      for (const match of results.matched) {
        const pgTxn = match.pg;
        
        console.log(`[Persistence] Inserting transaction: ${pgTxn.transaction_id}`);
        
        await client.query(`
          INSERT INTO sp_v2_transactions (
            transaction_id,
            merchant_id,
            amount_paise,
            currency,
            transaction_date,
            transaction_timestamp,
            source_type,
            source_name,
            payment_method,
            utr,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (transaction_id) DO UPDATE SET
            status = EXCLUDED.status,
            updated_at = NOW()
        `, [
          pgTxn.transaction_id,
          pgTxn.merchant_id,
          pgTxn.amount,
          'INR',
          pgTxn.transaction_date,
          pgTxn.transaction_timestamp,
          'MANUAL_UPLOAD',
          'TEST_SOURCE',
          pgTxn.payment_method,
          pgTxn.utr,
          'RECONCILED'
        ]);
        
        console.log(`[Persistence] Transaction inserted successfully`);
      }
      
      await client.query('COMMIT');
      console.log('[Persistence] Committed successfully');
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[Persistence] Error:', error.message);
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }
  
  try {
    await persistResults(mockResults);
    console.log('\n✅ Persistence test completed!');
    
    // Verify
    const pool = new Pool({
      host: 'localhost',
      port: 5433,
      database: 'settlepaisa_v2',
      user: 'postgres',
      password: 'settlepaisa123'
    });
    
    const result = await pool.query(`
      SELECT * FROM sp_v2_transactions 
      WHERE transaction_id = 'TEST_TXN_001'
    `);
    
    console.log('\nVerification:', result.rows.length > 0 ? 'FOUND' : 'NOT FOUND');
    if (result.rows.length > 0) {
      console.table(result.rows);
    }
    
    await pool.end();
    
  } catch (error) {
    console.error('\n❌ Persistence test failed:', error.message);
    console.error(error.stack);
  }
}

test();
