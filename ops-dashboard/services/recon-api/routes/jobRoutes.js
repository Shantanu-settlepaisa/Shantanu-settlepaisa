const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const config = require('../../config/env.cjs');

// Create database pool at module level (not inside route handlers)
// This ensures config is loaded once when module is first required
const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  ssl: config.db.ssl  // Required for RDS connections
});

console.log('[jobRoutes] Database pool initialized:', {
  host: config.db.host,
  port: config.db.port,
  database: config.db.database
});

// GET /recon/jobs/:jobId/summary
router.get('/jobs/:jobId/summary', async (req, res) => {
  const { jobId } = req.params;

  try {
    // First try in-memory job data
    const { getJob } = require('../jobs/runReconciliation');
    const job = getJob(jobId);

    let matched = 0, unmatchedPg = 0, unmatchedBank = 0, exceptions = 0;
    let finalized = false;

    if (job) {
      // Use in-memory job data
      matched = job.counters?.matched ?? 0;
      unmatchedPg = job.counters?.unmatchedPg ?? 0;
      unmatchedBank = job.counters?.unmatchedBank ?? 0;
      exceptions = job.counters?.exceptions ?? 0;
      finalized = job.status === 'completed';
    } else {
      // Fallback: Query database for persisted results
      console.log(`[Summary API] Job ${jobId} not in memory, querying database...`);
      const client = await pool.connect();
      try {
        const countsResult = await client.query(`
          SELECT
            match_status,
            COUNT(*) as count,
            COALESCE(SUM(pg_amount_paise), 0) as amount_paise
          FROM sp_v2_reconciliation_results
          WHERE job_id = $1
          GROUP BY match_status
        `, [jobId]);

        if (countsResult.rows.length === 0) {
          console.log(`[Summary API] No results found for job ${jobId}`);
          return res.status(404).json({ error: 'Job not found' });
        }

        // Parse database results
        for (const row of countsResult.rows) {
          const count = parseInt(row.count) || 0;
          switch (row.match_status) {
            case 'MATCHED':
              matched = count;
              break;
            case 'UNMATCHED_PG':
              unmatchedPg = count;
              break;
            case 'UNMATCHED_BANK':
              unmatchedBank = count;
              break;
            case 'EXCEPTION':
              exceptions = count;
              break;
          }
        }
        finalized = true; // If in DB, it's finalized
        console.log(`[Summary API] Found in DB: matched=${matched}, unmatchedPg=${unmatchedPg}, unmatchedBank=${unmatchedBank}, exceptions=${exceptions}`);
      } finally {
        client.release();
      }
    }

    const total = matched + unmatchedPg + unmatchedBank + exceptions;

    // Determine source type based on job metadata or default to manual
    const sourceType = job?.sourceType || 'manual';
    
    const summary = {
      jobId,
      sourceType,
      totals: {
        count: total,
        amountPaise: (total * 150000).toString() // Average 1500 rupees per txn
      },
      // Top-level fields for frontend compatibility (fixes invariant violation)
      matched: {
        count: matched,
        amountPaise: (matched * 150000).toString()
      },
      unmatched: {
        count: unmatchedPg + unmatchedBank,
        amountPaise: ((unmatchedPg + unmatchedBank) * 150000).toString()
      },
      exceptions: {
        count: exceptions,
        amountPaise: (exceptions * 150000).toString()
      },
      // Detailed breakdown (existing structure)
      breakdown: {
        matched: {
          count: matched,
          amountPaise: (matched * 150000).toString()
        },
        unmatchedPg: {
          count: unmatchedPg,
          amountPaise: (unmatchedPg * 150000).toString()
        },
        unmatchedBank: {
          count: unmatchedBank,
          amountPaise: (unmatchedBank * 150000).toString()
        },
        exceptions: {
          count: exceptions,
          amountPaise: (exceptions * 150000).toString()
        }
      },
      byExceptionReason: exceptions > 0 ? [
        { reasonCode: 'AMOUNT_MISMATCH', reasonLabel: 'Amount mismatch', count: Math.ceil(exceptions * 0.4) },
        { reasonCode: 'MISSING_UTR', reasonLabel: 'Missing UTR', count: Math.ceil(exceptions * 0.3) },
        { reasonCode: 'DUPLICATE_UTR', reasonLabel: 'Duplicate UTR', count: Math.floor(exceptions * 0.3) }
      ] : [],
      finalized: finalized // Use the variable we set earlier
    };
    
    res.json(summary);
  } catch (error) {
    console.error('Error fetching job summary:', error);
    res.status(500).json({ error: 'Failed to fetch job summary' });
  }
});

// GET /recon/jobs/:jobId/counts
router.get('/jobs/:jobId/counts', async (req, res) => {
  const { jobId } = req.params;

  try {
    // First try in-memory job data
    const { getJob } = require('../jobs/runReconciliation');
    const job = getJob(jobId);

    let matched = 0, unmatchedPg = 0, unmatchedBank = 0, exceptions = 0;

    if (job) {
      // Use in-memory job data
      matched = job.counters?.matched ?? 0;
      unmatchedPg = job.counters?.unmatchedPg ?? 0;
      unmatchedBank = job.counters?.unmatchedBank ?? 0;
      exceptions = job.counters?.exceptions ?? 0;
    } else {
      // Fallback: Query database for persisted results
      console.log(`[Counts API] Job ${jobId} not in memory, querying database...`);
      const client = await pool.connect();
      try {
        const countsResult = await client.query(`
          SELECT
            match_status,
            COUNT(*) as count
          FROM sp_v2_reconciliation_results
          WHERE job_id = $1
          GROUP BY match_status
        `, [jobId]);

        if (countsResult.rows.length === 0) {
          console.log(`[Counts API] No results found for job ${jobId}`);
          return res.status(404).json({ error: 'Job not found' });
        }

        // Parse database results
        for (const row of countsResult.rows) {
          const count = parseInt(row.count) || 0;
          switch (row.match_status) {
            case 'MATCHED':
              matched = count;
              break;
            case 'UNMATCHED_PG':
              unmatchedPg = count;
              break;
            case 'UNMATCHED_BANK':
              unmatchedBank = count;
              break;
            case 'EXCEPTION':
              exceptions = count;
              break;
          }
        }
        console.log(`[Counts API] Found in DB: matched=${matched}, unmatchedPg=${unmatchedPg}, unmatchedBank=${unmatchedBank}, exceptions=${exceptions}`);
      } finally {
        client.release();
      }
    }

    const all = matched + unmatchedPg + unmatchedBank + exceptions;

    res.json({
      all,
      matched,
      unmatchedPg,
      unmatchedBank,
      exceptions
    });
  } catch (error) {
    console.error('Error fetching job counts:', error);
    res.status(500).json({ error: 'Failed to fetch job counts' });
  }
});

// GET /recon/sources/summary - Overview aggregation by source type (finalized only)
router.get('/sources/summary', async (req, res) => {
  const { from, to, merchantId, acquirerId } = req.query;
  
  try {
    // In production, query from reconciliation_results table grouped by source_type
    // WHERE finalized = true AND created_at BETWEEN :from AND :to
    // For demo, return mock data representing finalized jobs only
    
    const manualMatched = 210;
    const manualUnmatchedPg = 72;
    const manualUnmatchedBank = 24;
    const manualExceptions = 60;
    const manualTotal = manualMatched + manualUnmatchedPg + manualUnmatchedBank + manualExceptions;
    
    const connectorMatched = 630;
    const connectorUnmatchedPg = 108;
    const connectorUnmatchedBank = 36;
    const connectorExceptions = 60;
    const connectorTotal = connectorMatched + connectorUnmatchedPg + connectorUnmatchedBank + connectorExceptions;
    
    const totalCount = manualTotal + connectorTotal;
    const matchedPct = totalCount > 0 ? 
      Math.round(((manualMatched + connectorMatched) / totalCount) * 100) : 0;
    
    const sources = [
      {
        sourceType: 'manual',
        totals: { 
          count: manualTotal, 
          amountPaise: (manualTotal * 150000).toString() 
        },
        breakdown: {
          matched: { count: manualMatched, amountPaise: (manualMatched * 150000).toString() },
          unmatchedPg: { count: manualUnmatchedPg, amountPaise: (manualUnmatchedPg * 150000).toString() },
          unmatchedBank: { count: manualUnmatchedBank, amountPaise: (manualUnmatchedBank * 150000).toString() },
          exceptions: { count: manualExceptions, amountPaise: (manualExceptions * 150000).toString() }
        }
      },
      {
        sourceType: 'connector',
        totals: { 
          count: connectorTotal, 
          amountPaise: (connectorTotal * 150000).toString() 
        },
        breakdown: {
          matched: { count: connectorMatched, amountPaise: (connectorMatched * 150000).toString() },
          unmatchedPg: { count: connectorUnmatchedPg, amountPaise: (connectorUnmatchedPg * 150000).toString() },
          unmatchedBank: { count: connectorUnmatchedBank, amountPaise: (connectorUnmatchedBank * 150000).toString() },
          exceptions: { count: connectorExceptions, amountPaise: (connectorExceptions * 150000).toString() }
        }
      }
    ];
    
    res.json({ 
      matchedPct,
      sources 
    });
  } catch (error) {
    console.error('Error fetching source summary:', error);
    res.status(500).json({ error: 'Failed to fetch source summary' });
  }
});

// GET /recon/jobs/:jobId/results
router.get('/jobs/:jobId/results', async (req, res) => {
  const { jobId } = req.params;
  const { status, reason_code, page = 1, limit = 50 } = req.query;

  try {
    // Use module-level pool (initialized at top of file)
    const client = await pool.connect();
    
    try {
      console.log(`[Results API] Fetching results from database for job: ${jobId}, status: ${status}`);
      
      let whereClause = 'WHERE job_id = $1';
      const queryParams = [jobId];
      
      if (status === 'matched') {
        whereClause += ' AND match_status = $2';
        queryParams.push('MATCHED');
      } else if (status === 'unmatchedPg') {
        whereClause += ' AND match_status = $2';
        queryParams.push('UNMATCHED_PG');
      } else if (status === 'unmatchedBank') {
        whereClause += ' AND match_status = $2';
        queryParams.push('UNMATCHED_BANK');
      } else if (status === 'exceptions') {
        whereClause += ' AND match_status = $2';
        queryParams.push('EXCEPTION');
      } else if (status === 'unmatched') {
        whereClause += ' AND match_status IN ($2, $3)';
        queryParams.push('UNMATCHED_PG', 'UNMATCHED_BANK');
      }
      
      if (reason_code) {
        whereClause += ` AND exception_reason_code = $${queryParams.length + 1}`;
        queryParams.push(reason_code);
      }
      
      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM sp_v2_reconciliation_results ${whereClause}`,
        queryParams
      );
      
      const total = parseInt(countResult.rows[0].total);
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      // JOIN with source tables to get actual transaction dates
      // Use DISTINCT ON to avoid duplicates when multiple PG records have same transaction_id
      const dataQuery = `
        SELECT DISTINCT ON (rr.id)
          rr.id,
          rr.job_id,
          rr.pg_transaction_id,
          rr.bank_statement_id,
          rr.match_status,
          rr.match_score,
          rr.exception_reason_code,
          rr.exception_severity,
          rr.exception_message,
          rr.pg_amount_paise,
          rr.bank_amount_paise,
          rr.variance_paise,
          rr.created_at,
          pg.transaction_date as pg_txn_date,
          pg.utr as pg_utr,
          bank.transaction_date as bank_txn_date
        FROM sp_v2_reconciliation_results rr
        LEFT JOIN sp_v2_transactions pg ON pg.transaction_id = rr.pg_transaction_id
        LEFT JOIN sp_v2_bank_statements bank ON bank.id = rr.bank_statement_id
        ${whereClause.replace('job_id', 'rr.job_id').replace('match_status', 'rr.match_status').replace('exception_reason_code', 'rr.exception_reason_code')}
        ORDER BY rr.id, rr.created_at DESC
        LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
      `;

      queryParams.push(parseInt(limit), offset);

      const dataResult = await client.query(dataQuery, queryParams);

      const results = dataResult.rows.map(row => {
        // Determine if UTR is valid (not null, not empty, and not same as transaction ID)
        const txnId = row.pg_transaction_id || 'N/A';
        const rawUtr = row.pg_utr;

        // UTR is invalid if: null, empty, or equals transaction ID
        const isValidUtr = rawUtr &&
                          rawUtr !== '' &&
                          rawUtr !== 'null' &&
                          rawUtr !== txnId;

        // For display: show actual UTR if valid, otherwise null (frontend will show "—")
        const displayUtr = isValidUtr ? rawUtr : null;

        // Improve exception reason label for UTR issues
        let reasonLabel = row.exception_message;
        if (row.exception_reason_code === 'UTR_MISSING_OR_INVALID') {
          if (!rawUtr || rawUtr === '' || rawUtr === 'null') {
            reasonLabel = 'UTR is missing from PG transaction';
          } else if (rawUtr === txnId) {
            reasonLabel = 'UTR equals Transaction ID (not a valid bank reference)';
          }
        }

        return {
          id: row.id.toString(),
          txnId: txnId,
          utr: displayUtr,
          rrn: null,
          pgAmount: row.pg_amount_paise || 0,
          bankAmount: row.bank_amount_paise,
          delta: row.variance_paise,
          pgDate: row.pg_txn_date ? new Date(row.pg_txn_date).toISOString().split('T')[0] : null,
          bankDate: row.bank_txn_date ? new Date(row.bank_txn_date).toISOString().split('T')[0] : null,
          status: row.match_status,
          reasonCode: row.exception_reason_code,
          reasonLabel: reasonLabel
        };
      });
      
      console.log(`[Results API] Found ${results.length} results in database (total: ${total})`);
      
      res.json({
        jobId,
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        results
      });
      
    } finally {
      client.release();
      // DON'T end pool - it's shared and needs to stay open for future requests
    }
  } catch (error) {
    console.error('Error fetching job results from database:', error);
    
    const { getJob } = require('../jobs/runReconciliation');
    const job = getJob(jobId);
    
    if (job && job.results) {
      console.log(`[Results API] Falling back to in-memory results`);
      let results = [];
      
      if (status === 'matched') {
        results = (job.results.matched || []).map(m => formatMatchedResult(m, jobId));
      } else if (status === 'unmatchedPg') {
        results = (job.results.unmatchedPg || []).map(u => formatUnmatchedPgResult(u, jobId));
      } else if (status === 'unmatchedBank') {
        results = (job.results.unmatchedBank || []).map(u => formatUnmatchedBankResult(u, jobId));
      } else if (status === 'exceptions') {
        results = (job.results.exceptions || []).map(e => formatExceptionResult(e, jobId));
      } else {
        const matched = (job.results.matched || []).map(m => formatMatchedResult(m, jobId));
        const unmatchedPg = (job.results.unmatchedPg || []).map(u => formatUnmatchedPgResult(u, jobId));
        const unmatchedBank = (job.results.unmatchedBank || []).map(u => formatUnmatchedBankResult(u, jobId));
        const exceptions = (job.results.exceptions || []).map(e => formatExceptionResult(e, jobId));
        results = [...matched, ...unmatchedPg, ...unmatchedBank, ...exceptions];
      }
      
      return res.json({
        jobId,
        page: parseInt(page),
        limit: parseInt(limit),
        total: results.length,
        results: results.slice(0, parseInt(limit))
      });
    }
    
    res.status(500).json({ error: 'Failed to fetch job results' });
  }
});

function generateMockResults(jobId, status, limit) {
  const results = [];
  const baseAmount = 100000; // 1000 rupees in paise
  
  // Ensure we generate some exceptions for demo
  const exceptionReasons = [
    { code: 'AMOUNT_MISMATCH', label: 'Amount mismatch detected' },
    { code: 'MISSING_UTR', label: 'UTR not found in bank records' },
    { code: 'DUPLICATE_UTR', label: 'Duplicate UTR found' },
    { code: 'DATE_MISMATCH', label: 'Transaction date mismatch' }
  ];
  
  const unmatchedPgReasons = [
    { code: 'NO_BANK_RECORD', label: 'No corresponding bank record found' },
    { code: 'PENDING_SETTLEMENT', label: 'Pending settlement from bank' },
    { code: 'BANK_DELAY', label: 'Bank processing delay' }
  ];
  
  const unmatchedBankReasons = [
    { code: 'NO_PG_RECORD', label: 'No corresponding PG transaction found' },
    { code: 'REFUND_PROCESSED', label: 'Refund processed but not reflected in PG' },
    { code: 'MANUAL_SETTLEMENT', label: 'Manual settlement entry' }
  ];
  
  // If no specific status, generate a mix of all statuses
  if (!status) {
    // Generate 16 matched, 9 unmatched PG, 4 unmatched Bank, 6 exceptions
    const statuses = [];
    for (let i = 0; i < 16; i++) statuses.push('MATCHED');
    for (let i = 0; i < 9; i++) statuses.push('UNMATCHED_PG');
    for (let i = 0; i < 4; i++) statuses.push('UNMATCHED_BANK');
    for (let i = 0; i < 6; i++) statuses.push('EXCEPTION');
    
    for (let i = 0; i < Math.min(limit, statuses.length); i++) {
      const resultStatus = statuses[i];
      results.push(generateSingleResult(jobId, i, resultStatus, baseAmount, 
        exceptionReasons, unmatchedPgReasons, unmatchedBankReasons));
    }
  } else {
    // Generate only the requested status based on the expected count
    let maxCount = 20; // Default limit
    if (status === 'MATCHED') maxCount = 16;
    else if (status === 'UNMATCHED_PG') maxCount = 9;
    else if (status === 'UNMATCHED_BANK') maxCount = 4;
    else if (status === 'EXCEPTION') maxCount = 6;
    
    const actualLimit = Math.min(limit, maxCount);
    for (let i = 0; i < actualLimit; i++) {
      results.push(generateSingleResult(jobId, i, status, baseAmount, 
        exceptionReasons, unmatchedPgReasons, unmatchedBankReasons));
    }
  }
  
  return results;
}

function generateSingleResult(jobId, index, status, baseAmount, 
  exceptionReasons, unmatchedPgReasons, unmatchedBankReasons) {
  
  let reasonCode = null;
  let reasonLabel = null;
  let pgAmount = baseAmount + Math.floor(Math.random() * 500000);
  let bankAmount = pgAmount;
  
  // Create unique identifiers based on status and index to avoid duplicates
  const statusPrefix = {
    'MATCHED': 'M',
    'UNMATCHED_PG': 'UP',
    'UNMATCHED_BANK': 'UB',
    'EXCEPTION': 'E'
  }[status] || 'T';
  
  const uniqueId = `${statusPrefix}${jobId.slice(-8)}${String(index).padStart(3, '0')}`;
  const txnIdBase = `TXN11/09/202${statusPrefix}${String(index).padStart(3, '0')}`;
  const utrBase = `UTR11/09/202${statusPrefix}${String(index).padStart(3, '0')}`;
  
  // Assign reason codes based on status
  if (status === 'EXCEPTION') {
    const reason = exceptionReasons[index % exceptionReasons.length];
    reasonCode = reason.code;
    reasonLabel = reason.label;
    if (reasonCode === 'AMOUNT_MISMATCH') {
      bankAmount = pgAmount + Math.floor(Math.random() * 10000) - 5000;
    } else if (reasonCode === 'MISSING_UTR') {
      reasonCode = 'UTR_MISSING_OR_INVALID';
      reasonLabel = 'Transaction missing UTR reference';
    } else if (reasonCode === 'DUPLICATE_UTR') {
      reasonCode = 'DUPLICATE_PG_ENTRY';
      reasonLabel = `Duplicate UTR ${utrBase} found in 2 PG transactions`;
    }
  } else if (status === 'UNMATCHED_PG') {
    const reason = unmatchedPgReasons[index % unmatchedPgReasons.length];
    reasonCode = reason.code;
    reasonLabel = reason.label;
    bankAmount = null; // No bank record for unmatched PG
  } else if (status === 'UNMATCHED_BANK') {
    const reason = unmatchedBankReasons[index % unmatchedBankReasons.length];
    reasonCode = 'BANK_TXN_MISSING_IN_PG';
    reasonLabel = 'No corresponding PG transaction found';
    // For unmatched bank, we have bank amount but no PG amount
    bankAmount = pgAmount;
    pgAmount = 0;
  }
  
  return {
    id: uniqueId,
    txnId: status === 'UNMATCHED_BANK' ? txnIdBase : txnIdBase,
    utr: reasonCode === 'UTR_MISSING_OR_INVALID' ? '' : utrBase,
    rrn: '',
    pgAmount: pgAmount,  // Return amounts in paise as numbers for frontend conversion
    bankAmount: bankAmount,
    delta: (pgAmount && bankAmount) ? (pgAmount - bankAmount) : null,
    pgDate: pgAmount > 0 ? '2025-09-18' : null,
    bankDate: bankAmount ? '2025-09-18' : null,
    status: status.toLowerCase(), // Return lowercase to match frontend expectations
    reasonCode: reasonCode,
    reasonLabel: reasonLabel
  };
}

// Formatter functions to convert reconciliation results to API format
function formatMatchedResult(match, jobId) {
  const pg = match.pg || match.pgTransaction || {};
  const bank = match.bank || match.bankRecord || {};
  
  return {
    id: `M-${jobId.slice(-8)}-${pg.transaction_id || pg.pgw_ref || Math.random().toString(36).substr(2, 9)}`,
    txnId: pg.transaction_id || pg.pgw_ref || pg.order_id || '',
    utr: pg.utr || bank.utr || '',
    rrn: pg.rrn || '',
    pgAmount: pg.amount || 0,
    bankAmount: bank.amount || bank.AMOUNT || 0,
    delta: 0,
    pgDate: pg.transaction_date || pg.txn_date || '',
    bankDate: bank.transaction_date || bank.TXN_DATE || '',
    status: 'matched',
    reasonCode: null,
    reasonLabel: null
  };
}

function formatUnmatchedPgResult(unmatchedPg, jobId) {
  const pg = unmatchedPg.pg || unmatchedPg;
  
  return {
    id: `UP-${jobId.slice(-8)}-${pg.transaction_id || pg.pgw_ref || Math.random().toString(36).substr(2, 9)}`,
    txnId: pg.transaction_id || pg.pgw_ref || pg.order_id || '',
    utr: pg.utr || '',
    rrn: pg.rrn || '',
    pgAmount: pg.amount || 0,
    bankAmount: null,
    delta: null,
    pgDate: pg.transaction_date || pg.txn_date || '',
    bankDate: null,
    status: 'unmatched_pg',
    reasonCode: unmatchedPg.reasonCode || 'NO_BANK_RECORD',
    reasonLabel: unmatchedPg.reason || 'No corresponding bank record found'
  };
}

function formatUnmatchedBankResult(unmatchedBank, jobId) {
  const bank = unmatchedBank.bank || unmatchedBank;
  
  return {
    id: `UB-${jobId.slice(-8)}-${bank.utr || bank.bank_reference || Math.random().toString(36).substr(2, 9)}`,
    txnId: bank.bank_reference || bank['Bank Reference'] || bank.TRANSACTION_ID || '',
    utr: bank.utr || bank.UTR || '',
    rrn: '',
    pgAmount: null,
    bankAmount: bank.amount || bank.Amount || bank.AMOUNT || 0,
    delta: null,
    pgDate: null,
    bankDate: bank.transaction_date || bank['Transaction Date'] || bank.DATE || bank.TXN_DATE || '',
    status: 'unmatched_bank',
    reasonCode: unmatchedBank.reasonCode || 'NO_PG_RECORD',
    reasonLabel: unmatchedBank.reason || 'No corresponding PG transaction found'
  };
}

function formatExceptionResult(exception, jobId) {
  const pg = exception.pgTransaction || exception.pg || {};
  const bank = exception.bankRecord || exception.bank || {};
  
  return {
    id: `E-${jobId.slice(-8)}-${pg.transaction_id || pg.pgw_ref || Math.random().toString(36).substr(2, 9)}`,
    txnId: pg.transaction_id || pg.pgw_ref || pg.order_id || '',
    utr: pg.utr || bank.utr || bank.UTR || '',
    rrn: pg.rrn || '',
    pgAmount: pg.amount || 0,
    bankAmount: bank.amount || bank.AMOUNT || 0,
    delta: (pg.amount || 0) - (bank.amount || bank.AMOUNT || 0),
    pgDate: pg.transaction_date || pg.txn_date || '',
    bankDate: bank.transaction_date || bank.TXN_DATE || '',
    status: 'exception',
    reasonCode: exception.type || exception.reasonCode || 'UNKNOWN',
    reasonLabel: exception.message || exception.reason || 'Exception detected'
  };
}

module.exports = router;