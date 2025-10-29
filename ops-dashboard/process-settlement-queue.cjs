const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

async function processSettlementQueue() {
  const client = await pool.connect();

  try {
    console.log('📊 Processing Settlement Queue...\n');

    // Step 1: Fetch pending settlement queue items
    const queueResult = await client.query(`
      SELECT *
      FROM sp_v2_settlement_queue
      WHERE status = 'PENDING'
      ORDER BY merchant_id, created_at
    `);

    console.log(`Found ${queueResult.rows.length} pending queue items\n`);

    if (queueResult.rows.length === 0) {
      console.log('No pending items to process');
      return;
    }

    // Step 2: Group by merchant
    const merchantGroups = {};
    for (const item of queueResult.rows) {
      if (!merchantGroups[item.merchant_id]) {
        merchantGroups[item.merchant_id] = [];
      }
      merchantGroups[item.merchant_id].push(item);
    }

    // Step 3: Create settlement batch for each merchant
    for (const [merchantId, items] of Object.entries(merchantGroups)) {
      console.log(`\n💰 Processing ${items.length} transactions for ${merchantId}...`);

      // Fetch full transaction details
      const txnIds = items.map(i => i.transaction_id);
      const txnResult = await client.query(`
        SELECT *
        FROM sp_v2_transactions
        WHERE transaction_id = ANY($1::varchar[])
      `, [txnIds]);

      const transactions = txnResult.rows;
      console.log(`  Fetched ${transactions.length} transaction details`);

      // Calculate settlement amounts
      const grossAmount = transactions.reduce((sum, t) => sum + BigInt(t.amount_paise || 0), BigInt(0));
      const commission = grossAmount * BigInt(2) / BigInt(100); // 2% commission
      const gst = commission * BigInt(18) / BigInt(100); // 18% GST on commission
      const netAmount = grossAmount - commission - gst;

      console.log(`  Gross Amount: ₹${Number(grossAmount) / 100}`);
      console.log(`  Commission (2%): ₹${Number(commission) / 100}`);
      console.log(`  GST (18% on commission): ₹${Number(gst) / 100}`);
      console.log(`  Net Settlement Amount: ₹${Number(netAmount) / 100}`);

      // Step 4: Create settlement batch
      const batchId = uuidv4();
      await client.query(`
        INSERT INTO sp_v2_settlement_batches
        (id, merchant_id, cycle_date, total_transactions, gross_amount_paise,
         total_commission_paise, total_gst_paise, net_amount_paise, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        batchId,
        merchantId,
        new Date(),
        transactions.length,
        grossAmount.toString(),
        commission.toString(),
        gst.toString(),
        netAmount.toString(),
        'PENDING_APPROVAL'
      ]);

      console.log(`  ✅ Created settlement batch: ${batchId}`);

      // Step 5: Create settlement items
      for (const txn of transactions) {
        const txnCommission = BigInt(txn.amount_paise || 0) * BigInt(2) / BigInt(100);
        const txnGst = txnCommission * BigInt(18) / BigInt(100);
        const txnNetAmount = BigInt(txn.amount_paise || 0) - txnCommission - txnGst;

        await client.query(`
          INSERT INTO sp_v2_settlement_items
          (settlement_batch_id, transaction_id, amount_paise, commission_paise,
           gst_paise, net_paise)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          batchId,
          txn.transaction_id,
          txn.amount_paise,
          txnCommission.toString(),
          txnGst.toString(),
          txnNetAmount.toString()
        ]);
      }

      console.log(`  ✅ Created ${transactions.length} settlement items`);

      // Step 6: Update queue items to PROCESSED
      await client.query(`
        UPDATE sp_v2_settlement_queue
        SET status = 'PROCESSED', processed_at = NOW()
        WHERE merchant_id = $1 AND status = 'PENDING'
      `, [merchantId]);

      console.log(`  ✅ Marked queue items as PROCESSED`);
    }

    console.log('\n✅ Settlement queue processing complete!');

    // Verify results
    console.log('\n📈 Final Status:');
    const batchCount = await client.query('SELECT COUNT(*) as count FROM sp_v2_settlement_batches WHERE created_at > NOW() - INTERVAL \'5 minutes\'');
    const itemCount = await client.query('SELECT COUNT(*) as count FROM sp_v2_settlement_items WHERE created_at > NOW() - INTERVAL \'5 minutes\'');
    const queueStatus = await client.query('SELECT status, COUNT(*) as count FROM sp_v2_settlement_queue GROUP BY status');

    console.log(`  Settlement Batches Created: ${batchCount.rows[0].count}`);
    console.log(`  Settlement Items Created: ${itemCount.rows[0].count}`);
    console.log(`  Queue Status:`);
    queueStatus.rows.forEach(row => {
      console.log(`    ${row.status}: ${row.count}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

processSettlementQueue();
