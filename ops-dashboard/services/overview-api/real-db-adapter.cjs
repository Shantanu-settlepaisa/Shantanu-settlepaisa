const { Pool } = require('pg');

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME || 'settlepaisa_v2',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'settlepaisa123',
});

/**
 * Get real KPI data from database
 */
async function getKpisFromDatabase(from, to) {
  const client = await pool.connect();

  try {
    console.log(`[Real DB] Fetching KPIs from ${from} to ${to}`);

    // Aggregate all reconciliation jobs in the date range
    const jobQuery = `
      SELECT
        SUM(total_pg_records) as total_pg_records,
        SUM(total_bank_records) as total_bank_records,
        SUM(matched_records) as matched_records,
        SUM(unmatched_pg) as unmatched_pg,
        SUM(unmatched_bank) as unmatched_bank,
        SUM(exception_records) as exception_records,
        SUM(total_amount_paise) as total_amount_paise,
        SUM(reconciled_amount_paise) as reconciled_amount_paise,
        SUM(variance_amount_paise) as variance_amount_paise,
        COUNT(*) as job_count
      FROM sp_v2_reconciliation_jobs
      WHERE created_at::date BETWEEN $1 AND $2
    `;

    const jobResult = await client.query(jobQuery, [from, to]);
    const job = jobResult.rows[0];

    if (!job || parseInt(job.job_count) === 0) {
      console.log('[Real DB] No reconciliation jobs found in sp_v2_reconciliation_jobs');
      console.log('[Real DB] FALLBACK: Trying sp_v2_reconciliation_results table...');

      // PRODUCTION FALLBACK: Calculate KPIs from sp_v2_reconciliation_results
      try {
        const resultsQuery = `
          SELECT
            COUNT(*) FILTER (WHERE match_status = 'MATCHED') as matched_count,
            COUNT(*) FILTER (WHERE match_status = 'UNMATCHED_PG') as unmatched_pg_count,
            COUNT(*) FILTER (WHERE match_status = 'UNMATCHED_BANK') as unmatched_bank_count,
            COUNT(*) FILTER (WHERE match_status = 'EXCEPTION') as exception_count,
            SUM(pg_amount_paise) FILTER (WHERE pg_amount_paise IS NOT NULL) as total_amount_paise,
            SUM(pg_amount_paise) FILTER (WHERE match_status = 'MATCHED') as reconciled_amount_paise,
            COUNT(DISTINCT pg_transaction_id) FILTER (WHERE pg_transaction_id NOT LIKE 'BANK_%') as total_pg_records
          FROM sp_v2_reconciliation_results
          WHERE created_at::date BETWEEN $1 AND $2
        `;

        const resultsData = await client.query(resultsQuery, [from, to]);
        const results = resultsData.rows[0];

        const totalPgRecords = parseInt(results.total_pg_records) || 0;
        const matchedRecords = parseInt(results.matched_count) || 0;
        const totalAmountPaise = BigInt(results.total_amount_paise || '0');
        const reconciledAmountPaise = BigInt(results.reconciled_amount_paise || '0');
        const variancePaise = totalAmountPaise - reconciledAmountPaise;

        if (totalPgRecords === 0) {
          console.log('[Real DB] FALLBACK: No data in reconciliation results either, using zeros');
          return {
            totalTransactions: 0,
            matchedCount: 0,
            unmatchedPgCount: 0,
            unmatchedBankCount: 0,
            exceptionsCount: 0,
            totalAmountPaise: '0',
            reconciledAmountPaise: '0',
            variancePaise: '0',
            matchRatePct: 0
          };
        }

        const matchRatePct = totalPgRecords > 0
          ? Math.round((matchedRecords / totalPgRecords) * 100)
          : 0;

        console.log(`[Real DB] FALLBACK SUCCESS: ${matchedRecords}/${totalPgRecords} matched (${matchRatePct}%)`);

        return {
          totalTransactions: totalPgRecords,
          matchedCount: matchedRecords,
          unmatchedPgCount: parseInt(results.unmatched_pg_count) || 0,
          unmatchedBankCount: parseInt(results.unmatched_bank_count) || 0,
          exceptionsCount: parseInt(results.exception_count) || 0,
          totalAmountPaise: totalAmountPaise.toString(),
          reconciledAmountPaise: reconciledAmountPaise.toString(),
          variancePaise: variancePaise.toString(),
          matchRatePct
        };
      } catch (fallbackError) {
        console.error('[Real DB] FALLBACK FAILED:', fallbackError.message);
        console.log('[Real DB] Using zeros');
        return {
          totalTransactions: 0,
          matchedCount: 0,
          unmatchedPgCount: 0,
          unmatchedBankCount: 0,
          exceptionsCount: 0,
          totalAmountPaise: '0',
          reconciledAmountPaise: '0',
          variancePaise: '0',
          matchRatePct: 0
        };
      }
    }

    const totalPgRecords = parseInt(job.total_pg_records) || 0;
    const matchedRecords = parseInt(job.matched_records) || 0;
    const matchRatePct = totalPgRecords > 0
      ? Math.round((matchedRecords / totalPgRecords) * 100)
      : 0;

    console.log(`[Real DB] Aggregated ${job.job_count} jobs: ${matchedRecords}/${totalPgRecords} matched (${matchRatePct}%)`);

    return {
      totalTransactions: totalPgRecords,
      matchedCount: matchedRecords,
      unmatchedPgCount: parseInt(job.unmatched_pg) || 0,
      unmatchedBankCount: parseInt(job.unmatched_bank) || 0,
      exceptionsCount: parseInt(job.exception_records) || 0,
      totalAmountPaise: job.total_amount_paise?.toString() || '0',
      reconciledAmountPaise: job.reconciled_amount_paise?.toString() || '0',
      variancePaise: job.variance_amount_paise?.toString() || '0',
      matchRatePct
    };
  } catch (error) {
    console.error('[Real DB] Error fetching KPIs:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get settlement pipeline data from database
 */
async function getSettlementPipelineFromDatabase(from, to) {
  const client = await pool.connect();

  try {
    console.log(`[Real DB] Fetching settlement pipeline from ${from} to ${to}`);

    // Get all transactions in the date range and their states
    const pipelineQuery = `
      WITH transaction_states AS (
        SELECT
          t.transaction_id,
          t.amount_paise,
          t.status,
          t.settlement_batch_id,
          CASE
            -- Credited: Has settlement batch that is COMPLETED or CREDITED
            WHEN sb.status IN ('COMPLETED', 'CREDITED') THEN 'CREDITED'
            -- Sent to Bank: Has settlement batch that is SENT_TO_BANK or PROCESSING
            WHEN sb.status IN ('SENT_TO_BANK', 'PROCESSING') THEN 'SENT_TO_BANK'
            -- In Settlement: Has settlement batch that is PENDING_APPROVAL or APPROVED
            WHEN sb.status IN ('PENDING_APPROVAL', 'APPROVED') THEN 'IN_SETTLEMENT'
            -- Reconciled but no settlement batch yet
            WHEN t.status = 'RECONCILED' AND t.settlement_batch_id IS NULL THEN 'IN_SETTLEMENT'
            -- Everything else is unsettled (PENDING, FAILED, EXCEPTION, etc)
            ELSE 'UNSETTLED'
          END AS state
        FROM sp_v2_transactions t
        LEFT JOIN sp_v2_settlement_batches sb ON t.settlement_batch_id = sb.id
        WHERE t.created_at::date BETWEEN $1 AND $2
      )
      SELECT
        COUNT(*) FILTER (WHERE state = 'CREDITED') AS credited_count,
        SUM(amount_paise) FILTER (WHERE state = 'CREDITED') AS credited_amount,
        COUNT(*) FILTER (WHERE state = 'SENT_TO_BANK') AS sent_to_bank_count,
        SUM(amount_paise) FILTER (WHERE state = 'SENT_TO_BANK') AS sent_to_bank_amount,
        COUNT(*) FILTER (WHERE state = 'IN_SETTLEMENT') AS in_settlement_count,
        SUM(amount_paise) FILTER (WHERE state = 'IN_SETTLEMENT') AS in_settlement_amount,
        COUNT(*) FILTER (WHERE state = 'UNSETTLED') AS unsettled_count,
        SUM(amount_paise) FILTER (WHERE state = 'UNSETTLED') AS unsettled_amount,
        COUNT(*) AS total_count,
        SUM(amount_paise) AS total_amount
      FROM transaction_states
    `;

    const result = await client.query(pipelineQuery, [from, to]);
    const row = result.rows[0];

    const pipelineData = {
      captured: {
        count: parseInt(row.total_count) || 0,
        amountPaise: row.total_amount?.toString() || '0'
      },
      inSettlement: {
        count: parseInt(row.in_settlement_count) || 0,
        amountPaise: row.in_settlement_amount?.toString() || '0'
      },
      sentToBank: {
        count: parseInt(row.sent_to_bank_count) || 0,
        amountPaise: row.sent_to_bank_amount?.toString() || '0'
      },
      credited: {
        count: parseInt(row.credited_count) || 0,
        amountPaise: row.credited_amount?.toString() || '0'
      },
      unsettled: {
        count: parseInt(row.unsettled_count) || 0,
        amountPaise: row.unsettled_amount?.toString() || '0'
      }
    };

    console.log(`[Real DB] Pipeline: ${pipelineData.inSettlement.count}/${pipelineData.sentToBank.count}/${pipelineData.credited.count}/${pipelineData.unsettled.count} = ${pipelineData.captured.count}`);

    return pipelineData;
  } catch (error) {
    console.error('[Real DB] Error fetching settlement pipeline:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get exception severity breakdown from database
 */
async function getExceptionSeverityFromDatabase(from, to) {
  const client = await pool.connect();

  try {
    console.log(`[Real DB] Fetching exception severity from ${from} to ${to}`);

    const severityQuery = `
      SELECT
        exception_severity,
        COUNT(*) as count
      FROM sp_v2_reconciliation_results
      WHERE match_status = 'EXCEPTION'
        AND created_at::date BETWEEN $1 AND $2
      GROUP BY exception_severity
    `;

    const result = await client.query(severityQuery, [from, to]);

    const severitySplit = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };

    result.rows.forEach(row => {
      const severity = row.exception_severity?.toLowerCase();
      const count = parseInt(row.count) || 0;

      if (severity === 'critical') {
        severitySplit.critical = count;
      } else if (severity === 'high') {
        severitySplit.high = count;
      } else if (severity === 'medium') {
        severitySplit.medium = count;
      } else if (severity === 'low') {
        severitySplit.low = count;
      }
    });

    console.log(`[Real DB] Exception severity: C=${severitySplit.critical}, H=${severitySplit.high}, M=${severitySplit.medium}, L=${severitySplit.low}`);

    return severitySplit;
  } catch (error) {
    console.error('[Real DB] Error fetching exception severity:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get top exception reasons from database
 */
async function getTopExceptionReasonsFromDatabase(from, to, limit = 5) {
  const client = await pool.connect();

  try {
    console.log(`[Real DB] Fetching top exception reasons from ${from} to ${to}`);

    const reasonsQuery = `
      SELECT
        exception_reason_code,
        exception_severity,
        COUNT(*) as count
      FROM sp_v2_reconciliation_results
      WHERE match_status = 'EXCEPTION'
        AND created_at::date BETWEEN $1 AND $2
      GROUP BY exception_reason_code, exception_severity
      ORDER BY count DESC
      LIMIT $3
    `;

    const result = await client.query(reasonsQuery, [from, to, limit]);

    const topReasons = result.rows.map(row => ({
      code: row.exception_reason_code || 'UNKNOWN',
      label: formatReasonCode(row.exception_reason_code),
      count: parseInt(row.count) || 0,
      severity: row.exception_severity?.toLowerCase() || 'medium'
    }));

    console.log(`[Real DB] Found ${topReasons.length} exception reasons`);

    return topReasons;
  } catch (error) {
    console.error('[Real DB] Error fetching exception reasons:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get source breakdown (CONNECTOR vs MANUAL_UPLOAD) from database
 */
async function getSourceBreakdownFromDatabase(from, to) {
  const client = await pool.connect();

  try {
    console.log(`[Real DB] Fetching source breakdown from ${from} to ${to}`);

    const sourceQuery = `
      SELECT
        source_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'RECONCILED') as matched,
        COUNT(*) FILTER (WHERE status = 'EXCEPTION') as exceptions,
        COUNT(*) FILTER (WHERE status IN ('PENDING', 'UNMATCHED')) as unmatched
      FROM sp_v2_transactions
      WHERE created_at::date BETWEEN $1 AND $2
      GROUP BY source_type
    `;

    const result = await client.query(sourceQuery, [from, to]);

    // Initialize with zeros
    const breakdown = {
      manual: { total: 0, matched: 0, pct: 0 },
      connector: { total: 0, matched: 0, pct: 0 }
    };

    // Process results
    result.rows.forEach(row => {
      const sourceType = row.source_type?.toUpperCase();
      const total = parseInt(row.total) || 0;
      const matched = parseInt(row.matched) || 0;
      const pct = total > 0 ? parseFloat(((matched / total) * 100).toFixed(2)) : 0;

      if (sourceType === 'MANUAL_UPLOAD') {
        breakdown.manual = { total, matched, pct };
      } else if (sourceType === 'CONNECTOR') {
        breakdown.connector = { total, matched, pct };
      }
    });

    console.log(`[Real DB] Source breakdown: Manual=${breakdown.manual.matched}/${breakdown.manual.total} (${breakdown.manual.pct}%), Connector=${breakdown.connector.matched}/${breakdown.connector.total} (${breakdown.connector.pct}%)`);

    return breakdown;
  } catch (error) {
    console.error('[Real DB] Error fetching source breakdown:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Format exception reason code to human-readable label
 */
function formatReasonCode(code) {
  const reasonMap = {
    'UTR_MISSING_OR_INVALID': 'Missing UTR',
    'DUPLICATE_PG_ENTRY': 'Duplicate UTR',
    'AMOUNT_MISMATCH': 'Amount Mismatch',
    'DATE_MISMATCH': 'Date Mismatch',
    'STATUS_MISMATCH': 'Status Mismatch',
    'BANK_FILE_MISSING': 'Bank File Missing',
    'MISSING_UTR': 'Missing UTR',
    'DUPLICATE_UTR': 'Duplicate UTR'
  };

  return reasonMap[code] || code;
}

/**
 * Health check for database connection
 */
async function checkDatabaseConnection() {
  const client = await pool.connect();

  try {
    const result = await client.query('SELECT NOW()');
    console.log('[Real DB] Connection healthy:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('[Real DB] Connection error:', error.message);
    return false;
  } finally {
    client.release();
  }
}

module.exports = {
  getKpisFromDatabase,
  getSettlementPipelineFromDatabase,
  getExceptionSeverityFromDatabase,
  getTopExceptionReasonsFromDatabase,
  getSourceBreakdownFromDatabase,
  checkDatabaseConnection
};
