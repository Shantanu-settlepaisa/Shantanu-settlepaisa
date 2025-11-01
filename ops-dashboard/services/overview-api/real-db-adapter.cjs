const { Pool } = require('pg');
const path = require('path');

// Load environment variables from .env file in this directory
// Note: This ensures DB_PORT and other env vars are loaded before Pool creation
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Database connection pool
const dbHost = process.env.DB_HOST || 'localhost';
const isRDS = dbHost.includes('.rds.amazonaws.com');

const pool = new Pool({
  host: dbHost,
  port: parseInt(process.env.DB_PORT) || 5432,  // Fixed: was 5433 (wrong port)
  database: process.env.DB_NAME || 'settlepaisa_v2',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'settlepaisa123',
  // Always use SSL for RDS instances
  ssl: isRDS ? { rejectUnauthorized: false } : (process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false),
});

/**
 * Get real KPI data from database
 */
async function getKpisFromDatabase(from, to) {
  const client = await pool.connect();

  try {
    console.log(`[Real DB] Fetching KPIs from ${from} to ${to}`);

    // NEW APPROACH (Oct 24): Query sp_v2_transactions table directly for real-time data
    // This replaces the old approach of using sp_v2_reconciliation_jobs snapshots
    const transactionQuery = `
      SELECT
        COUNT(*) as total_transactions,
        COUNT(*) FILTER (WHERE status IN ('RECONCILED', 'SETTLED')) as matched_count,
        COUNT(*) FILTER (WHERE status IN ('PENDING', 'UNMATCHED')) as unmatched_count,
        COUNT(*) FILTER (WHERE status = 'EXCEPTION') as exception_count,
        COALESCE(SUM(amount_paise), 0) as total_amount_paise,
        COALESCE(SUM(amount_paise) FILTER (WHERE status IN ('RECONCILED', 'SETTLED')), 0) as reconciled_amount_paise
      FROM sp_v2_transactions
      WHERE created_at::date BETWEEN $1 AND $2
    `;

    const txnResult = await client.query(transactionQuery, [from, to]);
    const txn = txnResult.rows[0];

    const totalTransactions = parseInt(txn.total_transactions) || 0;
    const matchedCount = parseInt(txn.matched_count) || 0;
    const unmatchedCount = parseInt(txn.unmatched_count) || 0;
    const exceptionCount = parseInt(txn.exception_count) || 0;
    const totalAmountPaise = BigInt(txn.total_amount_paise || '0');
    const reconciledAmountPaise = BigInt(txn.reconciled_amount_paise || '0');
    const variancePaise = totalAmountPaise - reconciledAmountPaise;

    const matchRatePct = totalTransactions > 0
      ? Math.round((matchedCount / totalTransactions) * 100)
      : 0;

    console.log(`[Real DB] Transactions: ${matchedCount}/${totalTransactions} matched (${matchRatePct}%), ${unmatchedCount} unmatched, ${exceptionCount} exceptions`);

    return {
      totalTransactions,
      matchedCount,
      unmatchedPgCount: unmatchedCount, // All unmatched treated as PG unmatched
      unmatchedBankCount: 0, // Can't distinguish from transaction table alone
      exceptionsCount: exceptionCount,
      totalAmountPaise: totalAmountPaise.toString(),
      reconciledAmountPaise: reconciledAmountPaise.toString(),
      variancePaise: variancePaise.toString(),
      matchRatePct
    };
  } catch (error) {
    console.error('[Real DB] Error fetching KPIs from transactions:', error.message);

    // FALLBACK: Try old approach with reconciliation jobs
    console.log('[Real DB] FALLBACK: Trying sp_v2_reconciliation_jobs table...');

    try {
      const jobQuery = `
        SELECT
          SUM(total_pg_records) as total_pg_records,
          SUM(matched_records) as matched_records,
          SUM(unmatched_pg) as unmatched_pg,
          SUM(unmatched_bank) as unmatched_bank,
          SUM(exception_records) as exception_records,
          SUM(total_amount_paise) as total_amount_paise,
          SUM(reconciled_amount_paise) as reconciled_amount_paise,
          SUM(variance_amount_paise) as variance_amount_paise,
          COUNT(*) as job_count
        FROM (
          SELECT DISTINCT ON (date_from, date_to)
            total_pg_records,
            matched_records,
            unmatched_pg,
            unmatched_bank,
            exception_records,
            total_amount_paise,
            reconciled_amount_paise,
            variance_amount_paise,
            date_from,
            date_to
          FROM sp_v2_reconciliation_jobs
          WHERE (date_from <= $2 AND date_to >= $1)
          ORDER BY date_from, date_to, created_at DESC
        ) AS unique_jobs
      `;

      const jobResult = await client.query(jobQuery, [from, to]);
      const job = jobResult.rows[0];

      if (!job || parseInt(job.job_count) === 0) {
        console.log('[Real DB] FALLBACK: No reconciliation jobs found, using zeros');
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

      const totalPgRecords = parseInt(job.total_pg_records) || 0;
      const matchedRecords = parseInt(job.matched_records) || 0;
      const matchRatePct = totalPgRecords > 0
        ? Math.round((matchedRecords / totalPgRecords) * 100)
        : 0;

      console.log(`[Real DB] FALLBACK: Aggregated ${job.job_count} jobs: ${matchedRecords}/${totalPgRecords} matched (${matchRatePct}%)`);

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

    // Query sp_v2_transactions instead of sp_v2_reconciliation_results
    // Note: exception_severity column doesn't exist, so we default all to 'high'
    const severityQuery = `
      SELECT
        COUNT(*) as count
      FROM sp_v2_transactions
      WHERE status = 'EXCEPTION'
        AND created_at::date BETWEEN $1 AND $2
    `;

    const result = await client.query(severityQuery, [from, to]);

    const totalExceptions = parseInt(result.rows[0]?.count) || 0;

    // Since exception_severity doesn't exist in the table, mark all as 'high' severity
    const severitySplit = {
      critical: 0,
      high: totalExceptions,  // All exceptions marked as high severity
      medium: 0,
      low: 0
    };

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

    // Query sp_v2_transactions instead of sp_v2_reconciliation_results
    // Use exception_reason column (not exception_reason_code)
    const reasonsQuery = `
      SELECT
        exception_reason,
        COUNT(*) as count
      FROM sp_v2_transactions
      WHERE status = 'EXCEPTION'
        AND created_at::date BETWEEN $1 AND $2
      GROUP BY exception_reason
      ORDER BY count DESC
      LIMIT $3
    `;

    const result = await client.query(reasonsQuery, [from, to, limit]);

    const topReasons = result.rows.map(row => ({
      code: row.exception_reason || 'UNKNOWN',
      label: formatReasonCode(row.exception_reason),
      count: parseInt(row.count) || 0,
      severity: 'high'  // Default to high since exception_severity column doesn't exist
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
        COUNT(*) FILTER (WHERE status IN ('RECONCILED', 'SETTLED')) as matched,
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

/**
 * Get financial analytics data from settlement batches
 * @param {string} from - Start date (YYYY-MM-DD) - filters by cycle_date by default
 * @param {string} to - End date (YYYY-MM-DD) - filters by cycle_date by default
 * @param {string} merchantId - Optional merchant filter
 * @param {string} groupBy - Optional grouping: 'day' | 'week' | 'month'
 * @param {Object} options - Optional parameters
 * @param {string} options.transactionFrom - Start date for transaction_date filter (overrides from/to)
 * @param {string} options.transactionTo - End date for transaction_date filter (overrides from/to)
 * @returns {Promise<Object>} Financial analytics with summary and trends
 */
async function getFinancialAnalytics(from, to, merchantId = null, groupBy = null, options = {}) {
  const client = await pool.connect();

  try {
    // Determine filtering mode: transaction_date or cycle_date
    const useTransactionDate = options.transactionFrom && options.transactionTo;
    const filterType = useTransactionDate ? 'transaction_date' : 'cycle_date';
    const dateFrom = useTransactionDate ? options.transactionFrom : from;
    const dateTo = useTransactionDate ? options.transactionTo : to;

    console.log(`[Real DB] Fetching financial analytics from ${dateFrom} to ${dateTo}, merchantId=${merchantId}, groupBy=${groupBy}, filterBy=${filterType}`);

    // Build summary query with support for both cycle_date and transaction_date filtering
    // When filtering by transaction_date, use CTE to avoid duplicate aggregation
    const summaryQuery = useTransactionDate ? `
      WITH distinct_batches AS (
        SELECT DISTINCT
          b.id,
          b.gross_amount_paise,
          b.total_commission_paise,
          b.total_gst_paise,
          b.total_bank_charges_paise,
          b.settlepaisa_revenue_paise,
          b.net_amount_paise,
          b.total_transactions,
          b.merchant_id
        FROM sp_v2_settlement_batches b
        INNER JOIN sp_v2_settlement_items si ON b.id = si.settlement_batch_id
        INNER JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id
        WHERE DATE(t.transaction_date) BETWEEN $1 AND $2
          AND ($3::VARCHAR IS NULL OR b.merchant_id = $3)
          AND b.status IN ('COMPLETED', 'SENT_TO_BANK', 'APPROVED', 'PENDING_APPROVAL')
      )
      SELECT
        SUM(gross_amount_paise) as total_gmv,
        SUM(total_commission_paise) as total_mdr,
        SUM(total_gst_paise) as total_gst,
        SUM(COALESCE(total_bank_charges_paise, 0)) as total_bank_charges,
        SUM(
          CASE
            WHEN COALESCE(settlepaisa_revenue_paise, 0) = 0
            THEN (total_commission_paise - COALESCE(total_bank_charges_paise, 0))
            ELSE settlepaisa_revenue_paise
          END
        ) as total_revenue,
        SUM(net_amount_paise) as total_net_settled,
        SUM(total_transactions) as total_txn_count,
        COUNT(DISTINCT merchant_id) as merchant_count,
        COUNT(*) as batch_count,
        ((SUM(total_commission_paise) + SUM(total_gst_paise))::FLOAT /
         NULLIF(SUM(gross_amount_paise), 0) * 100) as margin_percent
      FROM distinct_batches
    ` : `
      SELECT
        SUM(gross_amount_paise) as total_gmv,
        SUM(total_commission_paise) as total_mdr,
        SUM(total_gst_paise) as total_gst,
        SUM(COALESCE(total_bank_charges_paise, 0)) as total_bank_charges,
        SUM(
          CASE
            WHEN COALESCE(settlepaisa_revenue_paise, 0) = 0
            THEN (total_commission_paise - COALESCE(total_bank_charges_paise, 0))
            ELSE settlepaisa_revenue_paise
          END
        ) as total_revenue,
        SUM(net_amount_paise) as total_net_settled,
        SUM(total_transactions) as total_txn_count,
        COUNT(DISTINCT merchant_id) as merchant_count,
        COUNT(*) as batch_count,
        ((SUM(total_commission_paise) + SUM(total_gst_paise))::FLOAT /
         NULLIF(SUM(gross_amount_paise), 0) * 100) as margin_percent
      FROM sp_v2_settlement_batches
      WHERE cycle_date BETWEEN $1 AND $2
        AND ($3::UUID IS NULL OR merchant_id = $3)
        AND status IN ('COMPLETED', 'SENT_TO_BANK', 'APPROVED', 'PENDING_APPROVAL')
    `;

    const summaryResult = await client.query(summaryQuery, [dateFrom, dateTo, merchantId]);
    const summary = summaryResult.rows[0];

    // Calculate period info using the actual date range being queried
    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);
    const daysDiff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;

    // Calculate previous period dates for delta comparison
    const previousToDate = new Date(fromDate);
    previousToDate.setDate(previousToDate.getDate() - 1);
    const previousFromDate = new Date(previousToDate);
    previousFromDate.setDate(previousFromDate.getDate() - daysDiff + 1);

    const previousFrom = previousFromDate.toISOString().split('T')[0];
    const previousTo = previousToDate.toISOString().split('T')[0];

    console.log(`[Real DB] Querying previous period for comparison: ${previousFrom} to ${previousTo} (using ${filterType})`);

    // Query previous period for delta calculation (use same filter type)
    const previousResult = await client.query(summaryQuery, [previousFrom, previousTo, merchantId]);
    const previousSummary = previousResult.rows[0];

    // Calculate delta percentages
    const calculateDelta = (current, previous) => {
      const currentVal = parseFloat(current) || 0;
      const previousVal = parseFloat(previous) || 0;
      if (previousVal === 0) return undefined; // No comparison possible
      return parseFloat((((currentVal - previousVal) / previousVal) * 100).toFixed(1));
    };

    const deltas = {
      gmvPct: calculateDelta(summary.total_gmv, previousSummary.total_gmv),
      mdrPct: calculateDelta(summary.total_mdr, previousSummary.total_mdr),
      bankChargesPct: calculateDelta(summary.total_bank_charges, previousSummary.total_bank_charges),
      revenuePct: calculateDelta(summary.total_revenue, previousSummary.total_revenue),
      marginPct: calculateDelta(summary.margin_percent, previousSummary.margin_percent),
      netSettledPct: calculateDelta(summary.total_net_settled, previousSummary.total_net_settled)
    };

    console.log(`[Real DB] Deltas calculated: GMV=${deltas.gmvPct}%, MDR=${deltas.mdrPct}%, Revenue=${deltas.revenuePct}%`);

    // Build response
    const response = {
      period: {
        from,
        to,
        days: daysDiff
      },
      summary: {
        gmv: {
          paise: summary.total_gmv?.toString() || '0',
          rupees: parseFloat((BigInt(summary.total_gmv || 0) / BigInt(100)).toString()),
          formatted: formatCurrency(summary.total_gmv || 0)
        },
        mdrCollected: {
          paise: (BigInt(summary.total_mdr || 0) + BigInt(summary.total_gst || 0)).toString(),
          rupees: parseFloat((BigInt(summary.total_mdr || 0) + BigInt(summary.total_gst || 0)) / BigInt(100)),
          formatted: formatCurrency((BigInt(summary.total_mdr || 0) + BigInt(summary.total_gst || 0)).toString())
        },
        gst: {
          paise: summary.total_gst?.toString() || '0',
          rupees: parseFloat((BigInt(summary.total_gst || 0) / BigInt(100)).toString()),
          formatted: formatCurrency(summary.total_gst || 0)
        },
        commission: {
          paise: summary.total_mdr?.toString() || '0',
          rupees: parseFloat((BigInt(summary.total_mdr || 0) / BigInt(100)).toString()),
          formatted: formatCurrency(summary.total_mdr || 0)
        },
        bankChargesPaid: {
          paise: summary.total_bank_charges?.toString() || '0',
          rupees: parseFloat((BigInt(summary.total_bank_charges || 0) / BigInt(100)).toString()),
          formatted: formatCurrency(summary.total_bank_charges || 0)
        },
        settlepaisaRevenue: {
          paise: summary.total_revenue?.toString() || '0',
          rupees: parseFloat((BigInt(summary.total_revenue || 0) / BigInt(100)).toString()),
          formatted: formatCurrency(summary.total_revenue || 0)
        },
        grossMarginPercent: parseFloat((summary.margin_percent || 0).toFixed(2)),
        netSettled: {
          paise: summary.total_net_settled?.toString() || '0',
          rupees: parseFloat((BigInt(summary.total_net_settled || 0) / BigInt(100)).toString()),
          formatted: formatCurrency(summary.total_net_settled || 0)
        },
        transactionCount: parseInt(summary.total_txn_count) || 0,
        merchantCount: parseInt(summary.merchant_count) || 0,
        batchCount: parseInt(summary.batch_count) || 0,
        avgTransactionValue: {
          paise: summary.total_txn_count > 0
            ? Math.round(parseInt(summary.total_gmv || 0) / parseInt(summary.total_txn_count)).toString()
            : '0',
          rupees: summary.total_txn_count > 0
            ? parseFloat((parseInt(summary.total_gmv || 0) / parseInt(summary.total_txn_count) / 100).toFixed(2))
            : 0
        }
      },
      deltas: deltas
    };

    // Add trends if groupBy is specified
    if (groupBy) {
      let dateGroup;
      switch (groupBy) {
        case 'day':
          dateGroup = 'cycle_date';
          break;
        case 'week':
          dateGroup = "DATE_TRUNC('week', cycle_date)::date";
          break;
        case 'month':
          dateGroup = "DATE_TRUNC('month', cycle_date)::date";
          break;
        default:
          dateGroup = 'cycle_date';
      }

      const trendQuery = `
        SELECT
          ${dateGroup} as date,
          SUM(gross_amount_paise) as gmv,
          SUM(total_commission_paise) as mdr,
          SUM(total_gst_paise) as gst,
          SUM(total_bank_charges_paise) as bank_charges,
          SUM(settlepaisa_revenue_paise) as revenue,
          SUM(net_amount_paise) as net_settled,
          SUM(total_transactions) as txn_count,
          ((SUM(total_commission_paise) + SUM(total_gst_paise))::FLOAT /
           NULLIF(SUM(gross_amount_paise), 0) * 100) as margin_percent
        FROM sp_v2_settlement_batches
        WHERE cycle_date BETWEEN $1 AND $2
          AND ($3::UUID IS NULL OR merchant_id = $3)
          AND status IN ('COMPLETED', 'SENT_TO_BANK', 'APPROVED', 'PENDING_APPROVAL')
        GROUP BY ${dateGroup}
        ORDER BY date ASC
      `;

      const trendResult = await client.query(trendQuery, [from, to, merchantId]);

      response.trends = trendResult.rows.map(row => ({
        date: row.date,
        gmv: row.gmv?.toString() || '0',
        mdr: row.mdr?.toString() || '0',
        gst: row.gst?.toString() || '0',
        bankCharges: row.bank_charges?.toString() || '0',
        revenue: row.revenue?.toString() || '0',
        netSettled: row.net_settled?.toString() || '0',
        txnCount: parseInt(row.txn_count) || 0,
        marginPercent: parseFloat((row.margin_percent || 0).toFixed(2))
      }));
    }

    console.log(`[Real DB] Financial analytics: GMV=${formatCurrency(summary.total_gmv || 0)}, Revenue=${formatCurrency(summary.total_revenue || 0)}, Margin=${(summary.margin_percent || 0).toFixed(1)}%`);

    return response;
  } catch (error) {
    console.error('[Real DB] Error fetching financial analytics:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Format currency amount in paise to human-readable string
 * @param {number|string} paise - Amount in paise
 * @returns {string} Formatted currency (e.g., "₹1.50 Cr", "₹45.00 L")
 */
function formatCurrency(paise) {
  const amount = parseInt(paise) || 0;
  const rupees = amount / 100;

  if (rupees >= 10000000) {
    return `₹${(rupees / 10000000).toFixed(2)} Cr`;
  } else if (rupees >= 100000) {
    return `₹${(rupees / 100000).toFixed(2)} L`;
  } else if (rupees >= 1000) {
    return `₹${(rupees / 1000).toFixed(2)} K`;
  } else {
    return `₹${rupees.toFixed(2)}`;
  }
}

/**
 * Get database pool for direct queries (used by auth system)
 */
async function getDbPool() {
  return pool;
}

module.exports = {
  getKpisFromDatabase,
  getSettlementPipelineFromDatabase,
  getExceptionSeverityFromDatabase,
  getTopExceptionReasonsFromDatabase,
  getSourceBreakdownFromDatabase,
  getFinancialAnalytics,
  checkDatabaseConnection,
  getDbPool
};
