const { Client } = require('pg');

async function investigate() {
  const client = new Client({
    host: 'staging2-ops-db.ctxvxpk4xuye.ap-south-1.rds.amazonaws.com',
    port: 5432,
    database: 'ops_dashboard',
    user: 'ops_admin',
    password: 'SabPaisa2024Ops',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to RDS\n');

    console.log('=== 1. RECENT BANK UPLOADS (Last 10 minutes) ===');
    const recentBank = await client.query(`
      SELECT 
        bank_name,
        utr,
        bank_ref,
        amount_paise,
        transaction_date,
        created_at
      FROM sp_v2_bank_statements
      WHERE created_at >= NOW() - INTERVAL '10 minutes'
      ORDER BY created_at DESC
      LIMIT 30;
    `);
    console.log(`Found ${recentBank.rows.length} recent bank records\n`);
    recentBank.rows.forEach(row => {
      const utr = row.utr || 'NULL';
      console.log(`  ${row.bank_name} | UTR: ${utr} | Ref: ${row.bank_ref} | Amount: ${row.amount_paise}`);
    });

    console.log('\n=== 2. RECENT PG TRANSACTIONS (Last 10 minutes) ===');
    const recentPG = await client.query(`
      SELECT 
        transaction_id,
        utr,
        amount_paise,
        status,
        created_at
      FROM sp_v2_transactions
      WHERE created_at >= NOW() - INTERVAL '10 minutes'
      ORDER BY created_at DESC
      LIMIT 15;
    `);
    console.log(`Found ${recentPG.rows.length} recent PG records\n`);
    recentPG.rows.forEach(row => {
      const utr = row.utr || 'NULL';
      console.log(`  TXN: ${row.transaction_id} | UTR: ${utr} | Amount: ${row.amount_paise}`);
    });

    console.log('\n=== 3. AXIS BANK DATA for 2025-10-28 ===');
    const axisData = await client.query(`
      SELECT 
        COUNT(*) as count,
        COUNT(CASE WHEN utr IS NOT NULL AND utr != 'NULL' THEN 1 END) as with_utr,
        COUNT(CASE WHEN utr IS NULL OR utr = 'NULL' THEN 1 END) as null_utr,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM sp_v2_bank_statements
      WHERE bank_name = 'AXIS BANK' AND DATE(transaction_date) = '2025-10-28';
    `);
    console.log('AXIS Summary:', axisData.rows[0]);

    const axisSample = await client.query(`
      SELECT utr, bank_ref, amount_paise, created_at
      FROM sp_v2_bank_statements
      WHERE bank_name = 'AXIS BANK' AND DATE(transaction_date) = '2025-10-28'
      ORDER BY created_at DESC
      LIMIT 5;
    `);
    console.log('\nLatest AXIS records:');
    axisSample.rows.forEach(row => {
      const utr = row.utr || 'NULL';
      console.log(`  UTR: ${utr} | Ref: ${row.bank_ref} | Amount: ${row.amount_paise}`);
    });

    console.log('\n=== 4. BOB DATA for 2025-10-28 ===');
    const bobData = await client.query(`
      SELECT 
        COUNT(*) as count,
        COUNT(CASE WHEN utr IS NOT NULL AND utr != 'NULL' THEN 1 END) as with_utr,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM sp_v2_bank_statements
      WHERE bank_name = 'BOB' AND DATE(transaction_date) = '2025-10-28';
    `);
    console.log('BOB Summary:', bobData.rows[0]);

    const bobSample = await client.query(`
      SELECT utr, bank_ref, amount_paise, created_at
      FROM sp_v2_bank_statements
      WHERE bank_name = 'BOB' AND DATE(transaction_date) = '2025-10-28'
      ORDER BY created_at DESC
      LIMIT 5;
    `);
    console.log('\nLatest BOB records:');
    bobSample.rows.forEach(row => {
      const utr = row.utr || 'NULL';
      console.log(`  UTR: ${utr} | Ref: ${row.bank_ref} | Amount: ${row.amount_paise}`);
    });

    console.log('\n=== 5. HDFC DATA for 2025-10-28 ===');
    const hdfcData = await client.query(`
      SELECT 
        COUNT(*) as count,
        COUNT(CASE WHEN utr IS NOT NULL AND utr != 'NULL' THEN 1 END) as with_utr,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM sp_v2_bank_statements
      WHERE bank_name = 'HDFC BANK' AND DATE(transaction_date) = '2025-10-28';
    `);
    console.log('HDFC Summary:', hdfcData.rows[0]);

    console.log('\n=== 6. UPLOAD SESSIONS (Last 15 minutes) ===');
    const sessions = await client.query(`
      SELECT 
        session_id,
        file_type,
        source_type,
        file_name,
        rows_processed,
        rows_inserted,
        created_at
      FROM sp_v2_upload_sessions
      WHERE created_at >= NOW() - INTERVAL '15 minutes'
      ORDER BY created_at DESC;
    `);
    console.log(`Found ${sessions.rows.length} upload sessions\n`);
    sessions.rows.forEach(row => {
      console.log(`  ${row.file_type} | ${row.source_type} | ${row.file_name} | Rows: ${row.rows_inserted}`);
    });

    console.log('\n=== 7. UTR MATCHING ANALYSIS ===');
    const utrMatch = await client.query(`
      SELECT utr, COUNT(*) as count
      FROM sp_v2_transactions
      WHERE created_at >= NOW() - INTERVAL '10 minutes' AND utr IS NOT NULL
      GROUP BY utr
      ORDER BY utr
      LIMIT 10;
    `);
    console.log('PG UTRs:');
    utrMatch.rows.forEach(row => {
      console.log(`  ${row.utr}: ${row.count} records`);
    });

    const bankUtrMatch = await client.query(`
      SELECT bank_name, utr, COUNT(*) as count
      FROM sp_v2_bank_statements
      WHERE created_at >= NOW() - INTERVAL '10 minutes' AND utr IS NOT NULL
      GROUP BY bank_name, utr
      ORDER BY bank_name, utr
      LIMIT 15;
    `);
    console.log('\nBank UTRs:');
    bankUtrMatch.rows.forEach(row => {
      console.log(`  ${row.bank_name} - ${row.utr}: ${row.count} records`);
    });

  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

investigate().catch(console.error);
