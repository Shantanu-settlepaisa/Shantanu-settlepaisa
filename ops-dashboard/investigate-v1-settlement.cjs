const { Client } = require('pg');

const client = new Client({
  host: '3.108.237.99',
  port: 5432,
  database: 'sabpaisa_prod',
  user: 'sabpaisa_user',
  password: 'SabP@1sa_Pr0d#2024',
  ssl: false
});

async function investigateV1Settlement() {
  try {
    await client.connect();
    console.log('Connected to V1 SettlePaisa database successfully!\n');

    // 1. Find all settlement-related tables
    console.log('=== FINDING SETTLEMENT-RELATED TABLES ===');
    const settlementKeywords = ['settlement', 'commission', 'fee', 'reserve', 'tax', 'tds', 'mis', 'report'];
    
    for (const keyword of settlementKeywords) {
      console.log(`\n--- Tables containing '${keyword}' ---`);
      const tablesQuery = `
        SELECT table_name, table_schema 
        FROM information_schema.tables 
        WHERE table_name ILIKE '%${keyword}%' 
        AND table_schema = 'public'
        ORDER BY table_name;
      `;
      
      const result = await client.query(tablesQuery);
      if (result.rows.length > 0) {
        result.rows.forEach(row => {
          console.log(`  ${row.table_schema}.${row.table_name}`);
        });
      } else {
        console.log(`  No tables found with '${keyword}'`);
      }
    }

    // 2. Get all tables to see complete schema
    console.log('\n\n=== ALL DATABASE TABLES ===');
    const allTablesQuery = `
      SELECT table_name, table_schema 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    
    const allTablesResult = await client.query(allTablesQuery);
    console.log(`Total tables in database: ${allTablesResult.rows.length}`);
    allTablesResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.table_name}`);
    });

    // 3. Look for specific finance/settlement related tables
    console.log('\n\n=== FINANCE & SETTLEMENT SPECIFIC TABLES ===');
    const financeKeywords = [
      'settlement', 'commission', 'fee', 'reserve', 'tax', 'tds', 'payout', 
      'wallet', 'balance', 'ledger', 'account', 'refund', 'merchant',
      'transaction', 'payment', 'bank', 'mis', 'report', 'summary'
    ];

    const potentialTables = [];
    for (const table of allTablesResult.rows) {
      const tableName = table.table_name.toLowerCase();
      for (const keyword of financeKeywords) {
        if (tableName.includes(keyword)) {
          potentialTables.push(table.table_name);
          break;
        }
      }
    }

    console.log('Potential finance/settlement tables:');
    potentialTables.forEach((table, index) => {
      console.log(`${index + 1}. ${table}`);
    });

  } catch (error) {
    console.error('Error investigating V1 settlement:', error);
  } finally {
    await client.end();
  }
}

investigateV1Settlement();