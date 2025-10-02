const { Pool } = require('pg');

const pool = new Pool({
  user: 'settlepaisainternal',
  host: '3.108.237.99',
  database: 'settlepaisa',
  password: 'sabpaisa123',
  port: 5432,
});

async function exploreSchema() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 EXPLORING SABPAISA STAGING DATABASE SCHEMA\n');
    console.log('='*60);
    console.log('\n');
    
    // 1. transactions_to_settle table (main transaction table)
    console.log('📊 TABLE: transactions_to_settle');
    console.log('-'.repeat(60));
    const txnSchema = await client.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'transactions_to_settle'
      ORDER BY ordinal_position
    `);
    console.log('Columns:');
    txnSchema.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });
    
    const txnCount = await client.query('SELECT COUNT(*) FROM transactions_to_settle');
    console.log(`Total Records: ${txnCount.rows[0].count}`);
    
    const txnSample = await client.query('SELECT * FROM transactions_to_settle ORDER BY id DESC LIMIT 1');
    console.log('\nSample Record:');
    console.log(JSON.stringify(txnSample.rows[0], null, 2));
    console.log('\n');
    
    // 2. merchant_data table
    console.log('🏢 TABLE: merchant_data');
    console.log('-'.repeat(60));
    const merchantSchema = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'merchant_data'
      ORDER BY ordinal_position
      LIMIT 20
    `);
    console.log('Columns:');
    merchantSchema.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });
    console.log('\n');
    
    // 3. Check for bank-related tables
    console.log('🏦 BANK-RELATED TABLES');
    console.log('-'.repeat(60));
    const bankTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE '%bank%' OR table_name LIKE '%settle%'
      ORDER BY table_name
    `);
    bankTables.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    console.log('\n');
    
    // 4. Check settled_transactions table
    console.log('💰 TABLE: settled_transactions');
    console.log('-'.repeat(60));
    const settledSchema = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'settled_transactions'
      ORDER BY ordinal_position
    `);
    if (settledSchema.rows.length > 0) {
      console.log('Columns:');
      settledSchema.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
      
      const settledCount = await client.query('SELECT COUNT(*) FROM settled_transactions');
      console.log(`Total Records: ${settledCount.rows[0].count}`);
    } else {
      console.log('Table does not exist');
    }
    console.log('\n');
    
    // 5. Check recon tables
    console.log('🔄 RECONCILIATION TABLES');
    console.log('-'.repeat(60));
    const reconTables = ['recon_configs', 'recon_upload', 'transaction_recon_table'];
    for (const table of reconTables) {
      const count = await client.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`  - ${table}: ${count.rows[0].count} records`);
    }
    console.log('\n');
    
    // 6. Check transaction_bank table
    console.log('🏧 TABLE: transaction_bank');
    console.log('-'.repeat(60));
    const bankSchema = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'transaction_bank'
      ORDER BY ordinal_position
    `);
    if (bankSchema.rows.length > 0) {
      console.log('Columns:');
      bankSchema.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
      
      const bankCount = await client.query('SELECT COUNT(*) FROM transaction_bank');
      console.log(`Total Records: ${bankCount.rows[0].count}`);
    }
    console.log('\n');
    
    console.log('✅ SCHEMA EXPLORATION COMPLETE');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

exploreSchema();
