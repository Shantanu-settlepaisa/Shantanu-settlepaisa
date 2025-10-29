#!/usr/bin/env node

const { Pool } = require('pg');

// RDS Database connection
const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function checkRDSMappings() {
  const client = await pool.connect();

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 CHECKING RDS DATABASE COLUMN MAPPINGS');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    const result = await client.query(`
      SELECT
        bank_name,
        v1_column_mappings
      FROM sp_v2_bank_column_mappings
      WHERE bank_name IN ('HDFC BANK', 'AXIS BANK', 'BOB')
      ORDER BY bank_name
    `);

    result.rows.forEach(row => {
      console.log(`📊 ${row.bank_name}:`);
      console.log(JSON.stringify(row.v1_column_mappings, null, 2));

      // Check for UTR field
      if (row.v1_column_mappings.utr) {
        console.log(`  ✅ HAS UTR mapping: "${row.v1_column_mappings.utr}"`);
      } else {
        console.log(`  ❌ MISSING UTR mapping!`);
      }

      if (row.v1_column_mappings.transaction_id) {
        console.log(`  ✅ HAS transaction_id mapping: "${row.v1_column_mappings.transaction_id}"`);
      }

      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════');
    console.log('💡 SUMMARY');
    console.log('═══════════════════════════════════════════════════════');

    const hasUTR = result.rows.map(r => ({
      bank: r.bank_name,
      has_utr: !!r.v1_column_mappings.utr,
      utr_column: r.v1_column_mappings.utr || 'N/A',
      txn_id_column: r.v1_column_mappings.transaction_id || 'N/A'
    }));

    console.table(hasUTR);

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

checkRDSMappings().catch(console.error);
