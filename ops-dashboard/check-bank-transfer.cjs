#!/usr/bin/env node

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
});

async function check() {
  const result = await pool.query(`
    SELECT
      bt.id as bank_transfer_id,
      bt.settlement_batch_id,
      bt.utr_number,
      bt.status as transfer_status,
      bt.verification_status,
      bt.transfer_mode,
      bt.completed_at
    FROM sp_v2_settlement_bank_transfers bt
    WHERE bt.settlement_batch_id = 'fe7066ca-5075-4698-8579-aaf79bcca44e'
  `);

  console.log('Bank transfer records:', JSON.stringify(result.rows, null, 2));
  pool.end();
}

check();
