const { Pool } = require('pg');

const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'SettlePaisa2024'
});

async function testAPIQuery() {
  const client = await pool.connect();

  try {
    const cycle_date = '2025-10-26';
    const merchant_id = 'MERCH001';

    console.log('Testing exact API query with parameters:');
    console.log('  cycle_date:', cycle_date);
    console.log('  merchant_id:', merchant_id);
    console.log('');

    // Exact query from the API (line 326-386 in overview-api/index.js)
    let query = `
      SELECT
        t.transaction_id,
        t.created_at as transaction_date,
        t.acquirer_code,
        t.utr,
        t.gateway_ref,
        t.status as transaction_status,
        sb.cycle_date,
        sb.merchant_name,
        si.payment_mode,
        si.amount_paise,
        si.commission_paise,
        si.commission_rate,
        si.commission_type,
        si.gst_paise,
        si.reserve_paise,
        si.net_paise,
        si.fee_bearer,
        si.settlement_batch_id,
        sb.status as batch_status
      FROM sp_v2_transactions t
      INNER JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
      JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (cycle_date) {
      query += ` AND sb.cycle_date = $${paramIndex++}`;
      params.push(cycle_date);
    }

    if (merchant_id) {
      query += ` AND sb.merchant_id = $${paramIndex++}`;
      params.push(merchant_id);
    }

    query += ` ORDER BY sb.cycle_date DESC, si.transaction_id LIMIT 1000`;

    console.log('Query:', query.substring(0, 200) + '...');
    console.log('Params:', params);
    console.log('');

    const result = await client.query(query, params);

    console.log('✅ Query Result:');
    console.log('   Rows returned:', result.rows.length);
    console.log('');

    if (result.rows.length > 0) {
      console.log('Sample Rows (first 3):');
      result.rows.slice(0, 3).forEach((row, idx) => {
        console.log(`\n   Row ${idx + 1}:`);
        console.log('   Transaction ID:', row.transaction_id);
        console.log('   Amount: ₹' + (row.amount_paise / 100).toFixed(2));
        console.log('   Commission: ₹' + (row.commission_paise / 100).toFixed(2));
        console.log('   GST: ₹' + (row.gst_paise / 100).toFixed(2));
        console.log('   Net: ₹' + (row.net_paise / 100).toFixed(2));
        console.log('   Cycle Date:', row.cycle_date);
        console.log('   Payment Mode:', row.payment_mode);
      });
    } else {
      console.log('❌ NO ROWS RETURNED!');
      console.log('');

      // Check what cycle_date values actually exist
      const cycleCheckResult = await client.query(`
        SELECT DISTINCT sb.cycle_date, sb.merchant_id
        FROM sp_v2_settlement_batches sb
        ORDER BY sb.cycle_date DESC
        LIMIT 10
      `);

      console.log('Available cycle_date values in settlement_batches:');
      cycleCheckResult.rows.forEach((row) => {
        console.log('   Cycle Date:', row.cycle_date, '| Merchant:', row.merchant_id);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

testAPIQuery().catch(console.error);
