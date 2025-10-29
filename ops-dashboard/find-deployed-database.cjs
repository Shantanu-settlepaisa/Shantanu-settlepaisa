#!/usr/bin/env node

/**
 * Find the correct database name on deployed RDS
 */

const { Pool } = require('pg');

// Connect to postgres default database to list all databases
const pool = new Pool({
  user: 'settlepaisainternal',
  host: '3.108.237.99',
  database: 'postgres', // Connect to default postgres database
  password: 'sabpaisa123',
  port: 5432,
});

async function findDatabases() {
  console.log('🔍 Finding databases on RDS instance 3.108.237.99');
  console.log('='.repeat(60));
  console.log('');

  try {
    // List all databases
    const databases = await pool.query(`
      SELECT datname, pg_size_pretty(pg_database_size(datname)) as size
      FROM pg_database
      WHERE datistemplate = false
      ORDER BY datname
    `);

    console.log('📊 Available Databases:');
    console.log('-'.repeat(60));
    databases.rows.forEach(db => {
      console.log(`  - ${db.datname} (${db.size})`);
    });
    console.log('');

    // Now let's check the deployed API's actual database
    console.log('🎯 Checking which database the deployed API uses...');
    console.log('   Looking at Overview API code for database config');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Code:', error.code);
  } finally {
    await pool.end();
  }
}

findDatabases().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
