const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  user: 'postgres',
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  database: 'settlepaisa_v2',
  password: 'SettlePaisa2024',
  port: 5432
});

async function createReconMatches() {
  const client = await pool.connect();
  
  try {
    console.log('Creating recon matches for PG_LIVE transactions...\n');
    
    await client.query('BEGIN');
    
    const items = await client.query(`
      SELECT si.id as item_id, si.transaction_id, t.utr, t.amount_paise
      FROM sp_v2_settlement_items si
      JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id
      WHERE si.transaction_id LIKE 'PG_LIVE_%'
    `);
    
    console.log(`Found ${items.rows.length} settlement items\n`);
    
    for (const item of items.rows) {
      const bank = await client.query(`
        SELECT id FROM sp_v2_bank_statements WHERE utr = $1
      `, [item.utr]);
      
      if (bank.rows.length > 0) {
        await client.query(`
          INSERT INTO sp_v2_recon_matches 
          (id, utr_id, item_id, match_type, match_score, amount_difference_paise, matched_by, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT DO NOTHING
        `, [
          crypto.randomUUID(),
          bank.rows[0].id,
          item.item_id,
          'EXACT',
          100,
          0,
          'auto_test'
        ]);
        
        console.log(`✅ Created recon match: ${item.transaction_id} <-> ${item.utr} (₹${item.amount_paise/100})`);
      } else {
        console.log(`❌ No bank statement found for UTR: ${item.utr}`);
      }
    }
    
    await client.query('COMMIT');
    console.log('\n✅ All recon matches created successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createReconMatches().catch(console.error);
