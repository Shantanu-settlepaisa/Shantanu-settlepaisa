const fetch = require('node-fetch');
const { mapV1ToV2 } = require('../utils/v1-column-mapper');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2'
});

const SABPAISA_REPORT_API_BASE = 'https://reportapi.sabpaisa.in/SabPaisaReport/REST/SettlePaisa/txnData';

async function fetchFromSabPaisaAPI(fromDate, toDate, clientCode) {
  try {
    const url = `${SABPAISA_REPORT_API_BASE}/${fromDate}/${toDate}/${clientCode}`;
    
    console.log(`[PG Sync] Fetching from SabPaisa API: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log(`[PG Sync] Received ${data.length} transactions from API`);
    
    return data;
  } catch (error) {
    console.error('[PG Sync] Error fetching from SabPaisa API:', error.message);
    throw error;
  }
}

function transformV1ToV2(v1Transactions) {
  console.log(`[PG Sync] Transforming ${v1Transactions.length} V1 transactions to V2 format`);
  
  const v2Transactions = v1Transactions.map((v1Txn, idx) => {
    try {
      const v2Txn = mapV1ToV2(v1Txn, 'pg_transactions');
      
      v2Txn.source_type = 'API_SYNC';
      v2Txn.source_name = v1Txn.pg_name || 'SABPAISA';
      
      if (!v2Txn.transaction_id) {
        v2Txn.transaction_id = v1Txn.txn_id;
      }
      
      if (!v2Txn.merchant_id) {
        v2Txn.merchant_id = String(v1Txn.client_code).trim().toUpperCase();
      }
      
      if (!v2Txn.amount_paise && v1Txn.payee_amount) {
        const amount = parseFloat(v1Txn.payee_amount);
        if (!isNaN(amount)) {
          v2Txn.amount_paise = Math.round(amount * 100);
        }
      }
      
      if (!v2Txn.currency) {
        v2Txn.currency = 'INR';
      }
      
      if (!v2Txn.status && v1Txn.status) {
        v2Txn.status = v1Txn.status.toUpperCase();
      }
      
      return v2Txn;
    } catch (error) {
      console.error(`[PG Sync] Error transforming transaction ${idx}:`, error.message);
      console.error(`[PG Sync] Problematic V1 data:`, JSON.stringify(v1Txn, null, 2));
      throw error;
    }
  });
  
  console.log(`[PG Sync] Successfully transformed ${v2Transactions.length} transactions`);
  
  return v2Transactions;
}

async function insertV2Transactions(v2Transactions, client) {
  let insertedCount = 0;
  let skippedCount = 0;
  let updatedCount = 0;
  
  console.log(`[PG Sync] Inserting ${v2Transactions.length} transactions into sp_v2_transactions`);
  
  for (const txn of v2Transactions) {
    try {
      const existingCheck = await client.query(
        'SELECT source_type FROM sp_v2_transactions WHERE transaction_id = $1',
        [txn.transaction_id]
      );
      
      if (existingCheck.rows.length > 0) {
        const existingSource = existingCheck.rows[0].source_type;
        
        if (existingSource === 'API_SYNC') {
          console.log(`[PG Sync] Transaction ${txn.transaction_id} already exists from API_SYNC - skipping`);
          skippedCount++;
          continue;
        } else {
          console.log(`[PG Sync] Transaction ${txn.transaction_id} exists from ${existingSource} - will update with API_SYNC data`);
        }
      }
      
      const result = await client.query(`
        INSERT INTO sp_v2_transactions (
          transaction_id,
          merchant_id,
          amount_paise,
          currency,
          transaction_date,
          transaction_timestamp,
          source_type,
          source_name,
          payment_method,
          utr,
          rrn,
          approval_code,
          bank_name,
          status,
          bank_fee_paise,
          settlement_amount_paise
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (transaction_id) DO UPDATE SET
          merchant_id = CASE 
            WHEN sp_v2_transactions.source_type = 'API_SYNC' 
            THEN sp_v2_transactions.merchant_id 
            ELSE EXCLUDED.merchant_id 
          END,
          amount_paise = CASE 
            WHEN sp_v2_transactions.source_type = 'API_SYNC' 
            THEN sp_v2_transactions.amount_paise 
            ELSE EXCLUDED.amount_paise 
          END,
          transaction_timestamp = CASE 
            WHEN sp_v2_transactions.source_type = 'API_SYNC' 
            THEN sp_v2_transactions.transaction_timestamp 
            ELSE EXCLUDED.transaction_timestamp 
          END,
          source_type = CASE 
            WHEN sp_v2_transactions.source_type = 'API_SYNC' 
            THEN 'API_SYNC' 
            ELSE EXCLUDED.source_type 
          END,
          source_name = CASE 
            WHEN sp_v2_transactions.source_type = 'API_SYNC' 
            THEN sp_v2_transactions.source_name 
            ELSE EXCLUDED.source_name 
          END,
          payment_method = CASE 
            WHEN sp_v2_transactions.source_type = 'API_SYNC' 
            THEN sp_v2_transactions.payment_method 
            ELSE EXCLUDED.payment_method 
          END,
          utr = CASE 
            WHEN sp_v2_transactions.source_type = 'API_SYNC' 
            THEN sp_v2_transactions.utr 
            ELSE EXCLUDED.utr 
          END,
          status = CASE 
            WHEN sp_v2_transactions.source_type = 'API_SYNC' 
            THEN sp_v2_transactions.status 
            ELSE EXCLUDED.status 
          END,
          updated_at = NOW()
        WHERE sp_v2_transactions.source_type != 'API_SYNC'
      `, [
        txn.transaction_id,
        txn.merchant_id || 'UNKNOWN',
        txn.amount_paise || 0,
        txn.currency || 'INR',
        txn.transaction_date || new Date().toISOString().split('T')[0],
        txn.transaction_timestamp || new Date().toISOString(),
        'API_SYNC',
        txn.source_name || 'SABPAISA',
        txn.payment_method || 'UNKNOWN',
        txn.utr || null,
        txn.rrn || null,
        txn.approval_code || null,
        txn.bank_name || null,
        txn.status || 'SUCCESS',
        txn.bank_fee_paise || null,
        txn.settlement_amount_paise || null
      ]);
      
      if (existingCheck.rows.length > 0 && existingCheck.rows[0].source_type !== 'API_SYNC') {
        updatedCount++;
      } else if (existingCheck.rows.length === 0) {
        insertedCount++;
      }
      
    } catch (error) {
      console.error(`[PG Sync] Error inserting transaction ${txn.transaction_id}:`, error.message);
      throw error;
    }
  }
  
  console.log(`[PG Sync] Insert complete: ${insertedCount} new, ${updatedCount} updated, ${skippedCount} skipped`);
  
  return {
    inserted: insertedCount,
    updated: updatedCount,
    skipped: skippedCount,
    total: v2Transactions.length
  };
}

async function syncPgTransactions(cycleDate, merchantId) {
  const client = await pool.connect();
  
  try {
    console.log(`[PG Sync] Starting sync for cycle_date=${cycleDate}, merchant_id=${merchantId}`);
    
    const existingData = await client.query(`
      SELECT COUNT(*) as count, source_type 
      FROM sp_v2_transactions 
      WHERE transaction_date = $1
      GROUP BY source_type
    `, [cycleDate]);
    
    const apiSyncCount = existingData.rows.find(r => r.source_type === 'API_SYNC')?.count || 0;
    
    if (apiSyncCount > 0) {
      console.log(`[PG Sync] Found ${apiSyncCount} existing API_SYNC transactions for ${cycleDate}`);
      return {
        success: true,
        already_synced: true,
        count: parseInt(apiSyncCount),
        source: 'DATABASE',
        message: `${apiSyncCount} transactions already synced for ${cycleDate}`
      };
    }
    
    console.log(`[PG Sync] No API_SYNC data found for ${cycleDate}. Fetching from SabPaisa API...`);
    
    const v1Data = await fetchFromSabPaisaAPI(cycleDate, cycleDate, merchantId);
    
    if (!v1Data || v1Data.length === 0) {
      console.log(`[PG Sync] No data returned from API for ${cycleDate}`);
      return {
        success: true,
        count: 0,
        source: 'API',
        message: `No transactions found for ${cycleDate} in SabPaisa API`
      };
    }
    
    const v2Data = transformV1ToV2(v1Data);
    
    await client.query('BEGIN');
    
    const insertStats = await insertV2Transactions(v2Data, client);
    
    await client.query('COMMIT');
    
    console.log(`[PG Sync] Sync complete for ${cycleDate}: ${insertStats.inserted} inserted, ${insertStats.updated} updated`);
    
    return {
      success: true,
      freshly_synced: true,
      count: insertStats.inserted + insertStats.updated,
      source: 'API',
      message: `Successfully synced ${insertStats.inserted + insertStats.updated} transactions from SabPaisa API`,
      stats: insertStats
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[PG Sync] Sync failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function getPgTransactions(cycleDate, merchantId = null) {
  const client = await pool.connect();
  
  try {
    let query = `
      SELECT 
        transaction_id,
        merchant_id,
        amount_paise,
        currency,
        transaction_date,
        transaction_timestamp,
        source_type,
        source_name,
        payment_method,
        utr,
        rrn,
        status,
        created_at,
        updated_at
      FROM sp_v2_transactions
      WHERE transaction_date = $1
    `;
    
    const params = [cycleDate];
    
    if (merchantId) {
      query += ' AND merchant_id = $2';
      params.push(merchantId);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await client.query(query, params);
    
    const sourceCounts = {};
    result.rows.forEach(row => {
      sourceCounts[row.source_type] = (sourceCounts[row.source_type] || 0) + 1;
    });
    
    console.log(`[PG Sync] Retrieved ${result.rows.length} transactions for ${cycleDate}`);
    console.log(`[PG Sync] Source breakdown:`, sourceCounts);
    
    return {
      success: true,
      count: result.rows.length,
      transactions: result.rows,
      source_breakdown: sourceCounts
    };
    
  } finally {
    client.release();
  }
}

module.exports = {
  fetchFromSabPaisaAPI,
  transformV1ToV2,
  syncPgTransactions,
  getPgTransactions
};
