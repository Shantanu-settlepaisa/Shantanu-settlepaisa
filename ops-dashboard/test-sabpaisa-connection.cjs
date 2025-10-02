const { Pool } = require('pg');

const sabpaisaPool = new Pool({
  user: 'settlepaisainternal',
  host: '3.108.237.99',
  database: 'settlepaisa',
  password: 'sabpaisa123',
  port: 5432,
  connectionTimeoutMillis: 5000,
});

async function testConnection() {
  try {
    console.log('[TEST] Connecting to SabPaisa staging database...');
    console.log('[TEST] Host: 3.108.237.99:5432');
    console.log('[TEST] Database: settlepaisa');
    console.log('[TEST] User: settlepaisainternal');
    console.log('');
    
    const client = await sabpaisaPool.connect();
    console.log('✅ [SUCCESS] Connected to SabPaisa database!');
    console.log('');
    
    console.log('[QUERY] Fetching database version...');
    const versionResult = await client.query('SELECT version()');
    console.log('Database Version:', versionResult.rows[0].version);
    console.log('');
    
    console.log('[QUERY] Listing all tables...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log(`Found ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach((row, idx) => {
      console.log(`  ${idx + 1}. ${row.table_name}`);
    });
    console.log('');
    
    console.log('[QUERY] Checking for key tables used by V1...');
    const keyTables = ['transactions', 'merchants', 'settlement_batches', 'bank_statements', 'merchant_data'];
    
    for (const tableName of keyTables) {
      const checkResult = await client.query(
        `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = $1`,
        [tableName]
      );
      
      if (checkResult.rows[0].count > 0) {
        const countResult = await client.query(`SELECT COUNT(*) as total FROM ${tableName}`);
        console.log(`  ✅ ${tableName} - EXISTS (${countResult.rows[0].total} rows)`);
      } else {
        console.log(`  ❌ ${tableName} - NOT FOUND`);
      }
    }
    console.log('');
    
    console.log('[QUERY] Sample transaction data (last 5 records)...');
    const txnResult = await client.query(`
      SELECT id, transaction_id, merchant_id, payee_amount, paid_amount, 
             paymode_id, trans_complete_date, is_recon, is_bank_matched
      FROM transactions_to_settle 
      ORDER BY id DESC 
      LIMIT 5
    `);
    
    if (txnResult.rows.length > 0) {
      console.log('Sample transactions:');
      console.table(txnResult.rows);
    } else {
      console.log('No transactions found in transactions_to_settle table');
    }
    
    client.release();
    await sabpaisaPool.end();
    
    console.log('');
    console.log('✅ [COMPLETE] Database connection test successful!');
    console.log('');
    console.log('NEXT STEP: V2 can now integrate with SabPaisa staging database');
    
  } catch (error) {
    console.error('❌ [ERROR] Failed to connect to SabPaisa database:');
    console.error('Error:', error.message);
    console.error('');
    console.error('Possible issues:');
    console.error('  1. Network connectivity to 3.108.237.99:5432');
    console.error('  2. Firewall blocking connection');
    console.error('  3. Credentials changed');
    console.error('  4. Database server down');
    process.exit(1);
  }
}

testConnection();
