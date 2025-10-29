#!/usr/bin/env node

/**
 * List all tables in the deployed database
 */

const { Pool } = require('pg');

const pool = new Pool({
  user: 'settlepaisainternal',
  host: '3.108.237.99',
  database: 'settlepaisa',
  password: 'sabpaisa123',
  port: 5432,
});

async function listTables() {
  console.log('📋 Tables in database: settlepaisa');
  console.log('='.repeat(70));
  console.log('');

  try {
    const tables = await pool.query(`
      SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
      FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schemaname, tablename
    `);

    console.log(`Found ${tables.rows.length} tables:\n`);

    let currentSchema = '';
    tables.rows.forEach(table => {
      if (table.schemaname !== currentSchema) {
        currentSchema = table.schemaname;
        console.log(`\n[Schema: ${currentSchema}]`);
      }
      console.log(`  - ${table.tablename} (${table.size})`);
    });

    console.log('\n');

    // Look for transaction-related tables
    console.log('🔍 Transaction-related tables:');
    console.log('-'.repeat(70));
    const txnTables = tables.rows.filter(t =>
      t.tablename.includes('transaction') ||
      t.tablename.includes('upload') ||
      t.tablename.includes('v2')
    );

    if (txnTables.length > 0) {
      txnTables.forEach(t => {
        console.log(`  ✓ ${t.tablename} (${t.size})`);
      });
    } else {
      console.log('  ❌ No v2 transaction tables found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

listTables().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
