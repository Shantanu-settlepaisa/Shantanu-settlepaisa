const express = require('express');
const router = express.Router();

// GET /recon/jobs/:jobId/summary
router.get('/jobs/:jobId/summary', async (req, res) => {
  const { jobId } = req.params;
  
  try {
    // In production, query from reconciliation_results table
    // For now, use the in-memory job data
    const { getJob } = require('../jobs/runReconciliation');
    const job = getJob(jobId);
    
    // If job not found but it looks like a recon or demo job ID, return demo data
    if (!job && !jobId.startsWith('recon_') && !jobId.startsWith('demo-')) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Use job data if exists, otherwise use demo defaults
    const jobData = job || { status: 'completed', counters: {} };
    
    // Build summary from job counters - use actual values, not defaults
    const matched = jobData.counters?.matched ?? 16;  // Use nullish coalescing to allow 0
    const unmatchedPg = jobData.counters?.unmatchedPg ?? 9;
    const unmatchedBank = jobData.counters?.unmatchedBank ?? 4;
    const exceptions = jobData.counters?.exceptions ?? 6;
    const total = matched + unmatchedPg + unmatchedBank + exceptions;
    
    // Determine source type based on job metadata or default to manual
    const sourceType = jobData.sourceType || 'manual';
    
    const summary = {
      jobId,
      sourceType,
      totals: {
        count: total,
        amountPaise: (total * 150000).toString() // Average 1500 rupees per txn
      },
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
      finalized: jobData.status === 'completed' // Only finalized when job is completed
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
    // In production, query from reconciliation_results table
    // For now, use the in-memory job data or return demo data
    const { getJob } = require('../jobs/runReconciliation');
    const job = getJob(jobId);
    
    // Use job data if exists, otherwise use demo defaults for recon/demo jobs
    const jobData = job || { counters: {} };
    
    const matched = jobData.counters?.matched ?? 16;
    const unmatchedPg = jobData.counters?.unmatchedPg ?? 9;
    const unmatchedBank = jobData.counters?.unmatchedBank ?? 4;
    const exceptions = jobData.counters?.exceptions ?? 6;
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
    const { Pool } = require('pg');
    const pool = new Pool({
      host: 'localhost',
      port: 5433,
      database: 'settlepaisa_v2',
      user: 'postgres',
      password: 'settlepaisa123'
    });
    
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
      const dataQuery = `
        SELECT 
          id,
          job_id,
          pg_transaction_id,
          bank_statement_id,
          match_status,
          match_score,
          exception_reason_code,
          exception_severity,
          exception_message,
          pg_amount_paise,
          bank_amount_paise,
          variance_paise,
          created_at
        FROM sp_v2_reconciliation_results
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
      `;
      
      queryParams.push(parseInt(limit), offset);
      
      const dataResult = await client.query(dataQuery, queryParams);
      
      const results = dataResult.rows.map(row => ({
        id: row.id.toString(),
        txnId: row.pg_transaction_id || 'N/A',
        utr: row.pg_transaction_id || row.bank_statement_id || 'N/A',
        rrn: null,
        pgAmount: row.pg_amount_paise || 0,
        bankAmount: row.bank_amount_paise,
        delta: row.variance_paise,
        pgDate: row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : null,
        bankDate: row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : null,
        status: row.match_status,
        reasonCode: row.exception_reason_code,
        reasonLabel: row.exception_message
      }));
      
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
      await pool.end();
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