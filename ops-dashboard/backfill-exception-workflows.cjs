const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

function generateExceptionId() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `EXC_${dateStr}_${randomStr}`;
}

function determineSeverity(amountPaise) {
  const amountRupees = amountPaise / 100;
  if (amountRupees >= 100000) return 'CRITICAL';
  if (amountRupees >= 10000) return 'HIGH';
  if (amountRupees >= 1000) return 'MEDIUM';
  return 'LOW';
}

function calculateSLA(severity) {
  const hoursMap = {
    'CRITICAL': 2,
    'HIGH': 8,
    'MEDIUM': 24,
    'LOW': 72
  };
  const hours = hoursMap[severity] || 24;
  const slaDue = new Date();
  slaDue.setHours(slaDue.getHours() + hours);
  return slaDue;
}

async function backfillExceptionWorkflows() {
  const client = await pool.connect();
  
  try {
    console.log('[Backfill] Starting exception workflow backfill...\n');
    
    const missingResult = await client.query(`
      SELECT 
        t.id,
        t.transaction_id,
        t.amount_paise,
        t.merchant_id,
        t.utr,
        t.transaction_date,
        t.created_at
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_exception_workflow ew ON t.id = ew.transaction_id
      WHERE t.status = 'EXCEPTION' 
        AND ew.id IS NULL
      ORDER BY t.created_at DESC
    `);
    
    console.log(`[Backfill] Found ${missingResult.rows.length} exceptions missing workflow records\n`);
    
    if (missingResult.rows.length === 0) {
      console.log('[Backfill] No missing workflow records - all exceptions are already tracked');
      return;
    }
    
    console.log('[Backfill] Sample missing exceptions:');
    missingResult.rows.slice(0, 5).forEach(txn => {
      console.log(`  - ${txn.transaction_id}: ₹${(txn.amount_paise / 100).toFixed(2)} (created: ${txn.created_at})`);
    });
    console.log('');
    
    let inserted = 0;
    let failed = 0;
    
    for (const txn of missingResult.rows) {
      try {
        const exceptionId = generateExceptionId();
        const severity = determineSeverity(txn.amount_paise || 0);
        const slaDue = calculateSLA(severity);
        const reason = 'AMOUNT_MISMATCH';
        
        await client.query(`
          INSERT INTO sp_v2_exception_workflow (
            exception_id,
            transaction_id,
            merchant_id,
            pg_transaction_id,
            utr,
            pg_amount_paise,
            bank_amount_paise,
            amount_delta_paise,
            reason,
            severity,
            status,
            sla_due_at,
            sla_breached,
            assigned_to,
            assigned_to_name,
            tags,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
            'open', $11, false, NULL, NULL, 
            ARRAY['backfilled']::TEXT[], 
            $12, NOW()
          )
        `, [
          exceptionId,
          txn.id,
          txn.merchant_id,
          txn.transaction_id,
          txn.utr,
          txn.amount_paise || 0,
          0,
          txn.amount_paise || 0,
          reason,
          severity,
          slaDue,
          txn.created_at
        ]);
        
        await client.query(`
          INSERT INTO sp_v2_exception_actions (
            exception_id,
            action,
            user_id,
            user_name,
            note
          ) VALUES (
            (SELECT id FROM sp_v2_exception_workflow WHERE exception_id = $1),
            'CREATED',
            'system',
            'System',
            'Exception workflow backfilled from existing transaction'
          )
        `, [exceptionId]);
        
        inserted++;
        
        if (inserted % 10 === 0) {
          console.log(`[Backfill] Progress: ${inserted}/${missingResult.rows.length} exceptions processed`);
        }
        
      } catch (error) {
        console.error(`[Backfill] Failed to create workflow for ${txn.transaction_id}:`, error.message);
        failed++;
      }
    }
    
    console.log('\n[Backfill] ✅ Backfill complete!');
    console.log(`  - Successfully inserted: ${inserted}`);
    console.log(`  - Failed: ${failed}`);
    console.log(`  - Total processed: ${inserted + failed}\n`);
    
    const verifyResult = await client.query(`
      SELECT 
        COUNT(DISTINCT t.id) as total_exceptions,
        COUNT(DISTINCT ew.transaction_id) as with_workflow,
        COUNT(DISTINCT t.id) - COUNT(DISTINCT ew.transaction_id) as still_missing
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_exception_workflow ew ON t.id = ew.transaction_id
      WHERE t.status = 'EXCEPTION'
    `);
    
    console.log('[Backfill] Verification:');
    console.log(`  - Total exception transactions: ${verifyResult.rows[0].total_exceptions}`);
    console.log(`  - With workflow records: ${verifyResult.rows[0].with_workflow}`);
    console.log(`  - Still missing: ${verifyResult.rows[0].still_missing}`);
    
    if (parseInt(verifyResult.rows[0].still_missing) === 0) {
      console.log('\n✅ SUCCESS: All exceptions now have workflow records!\n');
    } else {
      console.log(`\n⚠️  WARNING: ${verifyResult.rows[0].still_missing} exceptions still missing workflows\n`);
    }
    
    const statusCounts = await client.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM sp_v2_exception_workflow
      GROUP BY status
      ORDER BY count DESC
    `);
    
    console.log('[Backfill] Exception status breakdown:');
    statusCounts.rows.forEach(row => {
      console.log(`  - ${row.status}: ${row.count}`);
    });
    
  } catch (error) {
    console.error('[Backfill] Fatal error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

backfillExceptionWorkflows()
  .then(() => {
    console.log('\n[Backfill] Process completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n[Backfill] Process failed:', error);
    process.exit(1);
  });
