const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Environment-driven API URLs for inter-service communication
const PG_API_URL = process.env.PG_API_URL || 'http://localhost:5101';
const BANK_API_URL = process.env.BANK_API_URL || 'http://localhost:5102';

// In-memory job store (replace with DB in production)
const jobs = new Map();
const jobLogs = new Map();

// Error mapping for user-friendly hints
const ERROR_MAPPINGS = {
  'ECONNREFUSED': {
    code: 'PG_UNREACHABLE',
    hint: `PG API at ${PG_API_URL} not reachable. Check service up & network/port.`
  },
  'ETIMEDOUT': {
    code: 'PG_TIMEOUT',
    hint: 'PG API request timed out. Check network connectivity and service health.'
  },
  'SFTP_AUTH_FAILED': {
    code: 'BANK_AUTH_FAILED',
    hint: 'SFTP login failed or directory /home/sp-sftp/incoming is unavailable.'
  },
  'NO_BANK_FILES': {
    code: 'NO_BANK_FILES',
    hint: 'No files match pattern for the selected date.'
  },
  'SCHEMA_MISMATCH': {
    code: 'SCHEMA_ERROR',
    hint: 'Bank file columns don\'t match recon config. Validate mapping.'
  },
  'ZERO_DATA': {
    code: 'EMPTY_DATASET',
    hint: 'Selected cycle has zero PG & Bank records. Try a different date or load demo data.'
  },
  'DB_ERROR': {
    code: 'DATABASE_ERROR',
    hint: 'Database migration may be pending. Run migrations and retry.'
  }
};

function logStructured(jobId, level, message, data = {}) {
  const logEntry = JSON.stringify({
    level,
    jobId,
    timestamp: new Date().toISOString(),
    message,
    ...data
  });
  
  // Store in memory
  if (!jobLogs.has(jobId)) {
    jobLogs.set(jobId, []);
  }
  const logs = jobLogs.get(jobId);
  logs.push(logEntry);
  if (logs.length > 500) {
    logs.shift(); // Keep only last 500 lines
  }
  
  // Also write to console
  console.log(logEntry);
}

function mapErrorToUserSafe(error) {
  const errorStr = error.toString();
  const errorCode = error.code || '';

  // Check for known error patterns
  for (const [pattern, mapping] of Object.entries(ERROR_MAPPINGS)) {
    if (errorStr.includes(pattern) || errorCode === pattern) {
      return {
        code: mapping.code,
        message: error.message || errorStr,
        hint: mapping.hint
      };
    }
  }

  // Default error
  return {
    code: 'UNKNOWN_ERROR',
    message: error.message || 'An unexpected error occurred',
    hint: 'Please check the logs for more details or contact support.'
  };
}

// PRODUCTION SAFEGUARD: Database health check
async function checkDatabaseHealth(config, jobId) {
  const { Pool } = require('pg');
  const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000
  });

  try {
    logStructured(jobId, 'info', 'Running database health check');

    const client = await pool.connect();

    // Test 1: Connection works
    await client.query('SELECT 1');
    logStructured(jobId, 'info', 'Database connection: ✅ OK');

    // Test 2: Check if sp_v2_reconciliation_jobs table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'sp_v2_reconciliation_jobs'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      client.release();
      await pool.end();
      throw new Error('DB_ERROR: Table sp_v2_reconciliation_jobs does not exist');
    }
    logStructured(jobId, 'info', 'Required tables: ✅ OK');

    // Test 3: Test write permissions
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO sp_v2_reconciliation_jobs (
          job_id, job_name, date_from, date_to, status
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        `healthcheck-${Date.now()}`,
        'Health Check',
        '2000-01-01',
        '2000-01-01',
        'PENDING'
      ]);
      await client.query('ROLLBACK');
      logStructured(jobId, 'info', 'Database write permissions: ✅ OK');
    } catch (writeError) {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
      throw new Error(`DB_ERROR: Database write test failed - ${writeError.message}`);
    }

    client.release();
    await pool.end();

    logStructured(jobId, 'info', 'Database health check: ✅ All checks passed');
    return true;

  } catch (error) {
    await pool.end().catch(() => {});
    logStructured(jobId, 'error', 'Database health check failed', {
      error: error.message
    });
    throw error;
  }
}

// PRODUCTION SAFEGUARD: Retry with exponential backoff
async function retryWithBackoff(fn, maxRetries = 3, baseDelayMs = 100, context = 'operation') {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry certain errors
      const nonRetryableErrors = ['SCHEMA_MISMATCH', 'VALIDATION_ERROR'];
      if (nonRetryableErrors.some(code => error.message.includes(code))) {
        throw error;
      }

      if (attempt < maxRetries) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(`[Retry] ${context} failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms...`);
        console.log(`[Retry] Error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  console.error(`[Retry] ${context} failed after ${maxRetries} attempts`);
  throw lastError;
}

async function runReconciliation(config, params) {
  const jobId = uuidv4();
  const correlationId = uuidv4();

  const isManualUpload = !!(params.pgTransactions || params.bankRecords);
  const sourceType = isManualUpload ? 'MANUAL_UPLOAD' : 'CONNECTOR';
  
  // For testing - create a mock completed job with proper counters
  if (params.test === true) {
    const mockJob = {
      id: jobId,
      correlationId,
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
      counters: {
        pgFetched: 35,
        bankFetched: 32,
        normalized: 35,
        matched: 16,
        unmatchedPg: 9,
        unmatchedBank: 4,
        exceptions: 6
      },
      sourceType,
      params,
      stage: 'completed'
    };
    
    jobs.set(jobId, mockJob);
    logStructured(jobId, 'info', 'Mock job created for testing', { jobId });
    return mockJob;
  }
  
  const job = {
    id: jobId,
    correlationId,
    status: 'pending',
    startedAt: new Date(),
    sourceType,
    counters: {
      pgFetched: 0,
      bankFetched: 0,
      normalized: 0,
      matched: 0,
      unmatchedPg: 0,
      unmatchedBank: 0,
      exceptions: 0
    }
  };
  
  jobs.set(jobId, job);
  
  logStructured(jobId, 'info', 'Reconciliation job started', {
    correlationId,
    params
  });
  
  try {
    job.status = 'running';

    // Stage 0: Database Health Check (PRODUCTION SAFEGUARD)
    job.stage = 'healthcheck';
    try {
      await checkDatabaseHealth(config, jobId);
    } catch (healthError) {
      throw new Error(`Database health check failed: ${healthError.message}`);
    }

    // Stage 1: Validate inputs (Preflight checks)
    job.stage = 'validation';
    logStructured(jobId, 'info', 'Running preflight validators');
    
    // Date validation
    if (!params.date || !isValidDate(params.date)) {
      throw new Error('ZERO_DATA: Invalid or empty date window');
    }
    
    // Date range validation (not too far in past or future)
    const inputDate = new Date(params.date);
    const today = new Date();
    const daysDiff = Math.abs((today.getTime() - inputDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff > 90) {
      throw new Error('ZERO_DATA: Date is more than 90 days from today. Use a more recent date.');
    }

    // Allow T+1 dates (transactions can be dated next day)
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (inputDate > tomorrow) {
      throw new Error('ZERO_DATA: Cannot reconcile dates more than T+1');
    }
    
    // Check connector availability (preflight)
    logStructured(jobId, 'info', 'Checking connector availability');
    
    try {
      // Quick PG API health check
      const pgHealthCheck = await axios.get(`${PG_API_URL}/api/pg/transactions`, { 
        params: { cycle: params.date },
        timeout: 2000 
      }).catch(() => null);
      
      if (!pgHealthCheck) {
        logStructured(jobId, 'warn', 'PG API health check failed - service may be down');
        if (!params.dryRun) {
          throw new Error('ECONNREFUSED: PG API is not responding. Check if service is running.');
        }
      }
    } catch (error) {
      logStructured(jobId, 'warn', 'Preflight check warning', { error: error.message });
      // Continue anyway for dry run
    }
    
    logStructured(jobId, 'info', 'Preflight validators passed');
    
    // Stage 2: Fetch PG transactions
    job.stage = 'fetch_pg';
    logStructured(jobId, 'info', 'Fetching PG transactions');
    
    let pgTransactions;
    if (params.pgTransactions && params.pgTransactions.length > 0) {
      pgTransactions = params.pgTransactions;
      logStructured(jobId, 'info', `Using uploaded PG transactions: ${pgTransactions.length}`);
    } else {
      // Try to fetch from database first (for manual uploads), then fall back to API
      pgTransactions = await fetchPGFromDatabase(config, params, jobId);
      if (pgTransactions.length === 0) {
        pgTransactions = await fetchPGTransactions(params);
        logStructured(jobId, 'info', `Fetched ${pgTransactions.length} PG transactions from API`);
      } else {
        logStructured(jobId, 'info', `Fetched ${pgTransactions.length} PG transactions from database`);
      }
    }
    job.counters.pgFetched = pgTransactions.length;
    
    // Stage 3: Fetch Bank records
    job.stage = 'fetch_bank';
    logStructured(jobId, 'info', 'Fetching bank records');
    
    let bankRecords;
    let bankFilename = null;
    if (params.bankRecords && params.bankRecords.length > 0) {
      bankRecords = params.bankRecords;
      bankFilename = params.bankFilename; // Pass filename for bank detection
      logStructured(jobId, 'info', `Using uploaded bank records: ${bankRecords.length}`, { filename: bankFilename });
    } else {
      // Try to fetch from database first (for manual uploads), then fall back to API
      bankRecords = await fetchBankFromDatabase(config, params, jobId);
      if (bankRecords.length === 0) {
        bankRecords = await fetchBankRecords(params);
        logStructured(jobId, 'info', `Fetched ${bankRecords.length} bank records from API`);
      } else {
        logStructured(jobId, 'info', `Fetched ${bankRecords.length} bank records from database`);
      }
    }
    job.counters.bankFetched = bankRecords.length;
    
    if (pgTransactions.length === 0 && bankRecords.length === 0) {
      throw new Error('ZERO_DATA: No data found for reconciliation');
    }
    
    // Stage 4: Normalize data
    job.stage = 'normalize';
    logStructured(jobId, 'info', 'Normalizing data');
    
    const normalizedPg = await normalizeTransactions(pgTransactions);
    const normalizedBank = await normalizeBankRecords(bankRecords, bankFilename, jobId);
    job.counters.normalized = normalizedPg.length + normalizedBank.length;
    
    // Stage 5: Match records
    job.stage = 'matching';
    logStructured(jobId, 'info', 'Matching records');
    logStructured(jobId, 'info', 'Sample normalized PG', { sample: normalizedPg[0] });
    logStructured(jobId, 'info', 'Sample normalized Bank', { sample: normalizedBank[0] });
    
    const matchResult = matchRecords(normalizedPg, normalizedBank, params.date);
    job.counters.matched = matchResult.matched.length;
    job.counters.unmatchedPg = matchResult.unmatchedPg.length;
    job.counters.unmatchedBank = matchResult.unmatchedBank.length;
    job.counters.exceptions = matchResult.exceptions.length;
    
    logStructured(jobId, 'info', 'Matching completed', {
      matched: matchResult.matched.length,
      unmatchedPg: matchResult.unmatchedPg.length,
      unmatchedBank: matchResult.unmatchedBank.length,
      exceptions: matchResult.exceptions.length
    });
    
    // Stage 6: Persist results (skip if dry run)
    if (!params.dryRun) {
      job.stage = 'persist';
      logStructured(jobId, 'info', 'Persisting results to database');
      logStructured(jobId, 'info', 'About to call persistResults', {
        matchedCount: matchResult.matched.length,
        unmatchedPgCount: matchResult.unmatchedPg.length,
        unmatchedBankCount: matchResult.unmatchedBank.length,
        exceptionsCount: matchResult.exceptions.length
      });

      // PRODUCTION FIX: Persistence is critical - fail job if it fails
      // Use retry with exponential backoff for transient errors
      await retryWithBackoff(
        () => persistResults(matchResult, jobId, job, params),
        3,
        100,
        `Persistence for job ${jobId}`
      );

      logStructured(jobId, 'info', 'Persistence completed successfully', {
        jobId: jobId,
        tablePersisted: 'sp_v2_reconciliation_jobs'
      });
    } else {
      logStructured(jobId, 'info', 'Dry run mode - skipping persistence');
    }
    
    // Store results for settlement calculation
    job.results = matchResult;
    
    // Mark as completed
    job.status = 'completed';
    job.finishedAt = new Date();
    job.stage = 'completed';
    
    console.log('>>>>>> ABOUT TO LOG COMPLETION');
    
    logStructured(jobId, 'info', 'Reconciliation job completed successfully', {
      duration: job.finishedAt.getTime() - job.startedAt.getTime(),
      counters: job.counters
    });
    
    console.log('>>>>>> LOGGED COMPLETION, NOW CHECKING SETTLEMENT');
    
    // TRIGGER SETTLEMENT CALCULATION
    console.log('========== SETTLEMENT TRIGGER CHECK ==========');
    console.log('Matched count:', job.counters.matched);
    console.log('Has matchResult:', !!matchResult);
    console.log('Has matched array:', !!matchResult.matched);
    console.log('Matched array length:', matchResult.matched ? matchResult.matched.length : 0);
    console.log('===============================================');
    
    logStructured(jobId, 'info', 'Checking settlement trigger conditions', {
      matchedCount: job.counters.matched,
      hasMatchResult: !!matchResult,
      hasMatchedArray: !!matchResult.matched,
      matchedArrayLength: matchResult.matched ? matchResult.matched.length : 0
    });
    
    if (job.counters.matched > 0 && matchResult.matched && matchResult.matched.length > 0) {
      try {
        logStructured(jobId, 'info', 'Triggering settlement calculation for matched transactions', {
          matchedCount: matchResult.matched.length,
          sampleMatch: matchResult.matched[0] ? {
            hasPg: !!matchResult.matched[0].pg,
            pgKeys: matchResult.matched[0].pg ? Object.keys(matchResult.matched[0].pg) : []
          } : null
        });
        
        const { SettlementCalculatorV1Logic } = require('../../settlement-engine/settlement-calculator-v1-logic.cjs');
        const calculator = new SettlementCalculatorV1Logic();
        
        // Group matched transactions by merchant
        const merchantGroups = {};
        matchResult.matched.forEach(match => {
          const pg = match.pg || {};
          const merchantId = pg.merchant_id || pg.client_code || 'UNKNOWN';
          if (!merchantGroups[merchantId]) {
            merchantGroups[merchantId] = [];
          }
          merchantGroups[merchantId].push({
            transaction_id: pg.transaction_id || pg.pgw_ref || pg.TXN_ID || '',
            paid_amount: (pg.amount || 0) / 100,
            payee_amount: (pg.amount || 0) / 100,
            payment_mode: pg.payment_mode || pg.payment_method || '',
            paymode_id: pg.paymode_id || null,
            ...pg
          });
        });
        
        // Calculate settlement for each merchant
        let settlementBatchIds = [];
        for (const [merchantId, transactions] of Object.entries(merchantGroups)) {
          const settlementBatch = await calculator.calculateSettlement(
            merchantId,
            transactions,
            params.toDate || params.date
          );
          
          const batchId = await calculator.persistSettlement(settlementBatch);
          settlementBatchIds.push(batchId);
          
          logStructured(jobId, 'info', `Settlement batch created for merchant ${merchantId}`, {
            batchId,
            transactionCount: transactions.length,
            netAmount: settlementBatch.net_settlement_amount
          });
        }
        
        job.settlementBatchIds = settlementBatchIds;
        logStructured(jobId, 'info', `Settlement calculation completed. Created ${settlementBatchIds.length} batches`);
        
        await calculator.close();
      } catch (settlementError) {
        logStructured(jobId, 'error', 'Settlement calculation failed', {
          error: settlementError.message,
          stack: settlementError.stack
        });
        // Don't fail the recon job if settlement fails
        job.settlementError = settlementError.message;
      }
    }
    
  } catch (error) {
    const errorInfo = mapErrorToUserSafe(error);
    
    job.status = 'failed';
    job.finishedAt = new Date();
    job.error = {
      code: errorInfo.code,
      message: errorInfo.message,
      stack: error.stack ? error.stack.substring(0, 2048) : undefined, // Limit stack trace to 2KB
      userSafeHint: errorInfo.hint
    };
    
    logStructured(jobId, 'error', 'Reconciliation job failed', {
      correlationId,
      stage: job.stage,
      error: {
        name: error.name,
        message: error.message
      },
      cause: error.cause,
      hint: errorInfo.hint
    });
    
    // Optionally write error to disk
    const errorLogPath = path.join(process.cwd(), 'logs', 'recon-errors', `${jobId}.json`);
    try {
      fs.mkdirSync(path.dirname(errorLogPath), { recursive: true });
      fs.writeFileSync(errorLogPath, JSON.stringify({
        jobId,
        correlationId,
        error: job.error,
        timestamp: new Date().toISOString()
      }, null, 2));
    } catch (writeError) {
      console.error('Failed to write error log to disk:', writeError);
    }
  }
  
  return job;
}

// Database fetch functions for manual uploads
async function fetchPGFromDatabase(config, params, jobId) {
  const { Pool } = require('pg');
  const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000
  });

  try {
    const query = `
      SELECT
        transaction_id,
        merchant_id,
        amount_paise,
        gross_amount_paise,
        utr,
        rrn,
        payment_method,
        transaction_date,
        transaction_timestamp,
        status,
        source_type
      FROM sp_v2_transactions
      WHERE DATE(transaction_date) = $1
        AND source_type = 'MANUAL_UPLOAD'
        -- No status filter for manual uploads - CSV files can have any status (SUCCESS, PENDING, etc.)
      ORDER BY transaction_date
    `;

    const result = await pool.query(query, [params.date]);
    await pool.end();

    // Convert to format expected by reconciliation engine
    const pgRecords = result.rows.map(row => ({
      transaction_id: row.transaction_id,
      merchant_id: row.merchant_id,
      amount: row.amount_paise,
      gross_amount: row.gross_amount_paise,
      utr: row.utr,
      rrn: row.rrn,
      payment_method: row.payment_method,
      transaction_date: row.transaction_date,
      captured_at: row.transaction_timestamp,
      status: row.status,
      source_type: row.source_type
    }));

    console.log(`[fetchPGFromDatabase] First record:`, JSON.stringify(pgRecords[0]));
    return pgRecords;
  } catch (error) {
    await pool.end().catch(() => {});
    logStructured(jobId, 'warn', 'Failed to fetch PG from database', { error: error.message });
    return [];
  }
}

async function fetchBankFromDatabase(config, params, jobId) {
  const { Pool } = require('pg');
  const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000
  });

  try {
    const query = `
      SELECT
        bank_ref,
        bank_name,
        amount_paise,
        gross_amount_paise,
        bank_fee_paise,
        bank_gst_paise,
        transaction_date,
        value_date,
        utr,
        remarks,
        source_type
      FROM sp_v2_bank_statements
      WHERE DATE(transaction_date) = $1
        AND source_type = 'MANUAL_UPLOAD'
        AND processed = false
      ORDER BY transaction_date
    `;

    const result = await pool.query(query, [params.date]);
    await pool.end();

    // Convert to format expected by reconciliation engine
    const bankRecords = result.rows.map(row => ({
      bank_ref: row.bank_ref,
      bank_name: row.bank_name,
      amount: row.amount_paise,
      amount_paise: row.amount_paise, // Also include for normalization
      gross_amount: row.gross_amount_paise,
      gross_amount_paise: row.gross_amount_paise, // Also include for normalization
      bank_fee: row.bank_fee_paise,
      bank_gst: row.bank_gst_paise,
      transaction_date: row.transaction_date,
      value_date: row.value_date,
      utr: row.utr,
      remarks: row.remarks,
      source_type: row.source_type
    }));

    console.log(`[fetchBankFromDatabase] First record:`, JSON.stringify(bankRecords[0]));
    return bankRecords;
  } catch (error) {
    await pool.end().catch(() => {});
    logStructured(jobId, 'warn', 'Failed to fetch bank from database', { error: error.message });
    return [];
  }
}

// Helper functions (implement with actual logic)
function isValidDate(date) {
  const d = new Date(date);
  return !isNaN(d.getTime()) && date.length === 10;
}

async function fetchPGTransactions(params) {
  const { convertV1CSVToV2 } = require('../../shared/v1-column-mapper.cjs');
  
  try {
    const response = await axios.get(`${PG_API_URL}/api/pg/transactions`, {
      params: { cycle: params.date },
      timeout: 5000
    });
    
    if (response.status === 404) {
      return [];
    }
    
    let transactions = response.data?.transactions || [];
    
    if (transactions.length > 0) {
      try {
        // Use 'recon' mode: transaction_id → utr (for reconciliation)
        transactions = await convertV1CSVToV2(transactions, 'pg_transactions', null, 'recon');
        console.log(`[Recon] Converted ${transactions.length} PG transactions from V1 to V2 format`);
      } catch (conversionError) {
        console.warn('[Recon] V1→V2 conversion failed, using data as-is:', conversionError.message);
      }
    }
    
    return transactions;
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
      throw new Error('ECONNREFUSED: Cannot connect to PG API');
    }
    if (error.code === 'ETIMEDOUT') {
      throw new Error('ETIMEDOUT: PG API request timed out');
    }
    throw error;
  }
}

async function fetchBankRecords(params) {
  const { convertV1CSVToV2 } = require('../../shared/v1-column-mapper.cjs');
  
  try {
    const response = await axios.get(`${BANK_API_URL}/api/bank/axis/recon`, {
      params: { cycle: params.date },
      timeout: 5000
    });
    
    if (response.status === 404) {
      return [];
    }
    
    let records = response.data?.records || [];
    
    if (records.length > 0) {
      try {
        console.log('[Recon] BEFORE conversion, first record:', JSON.stringify(records[0]));
        // Use 'recon' mode: transaction_id → utr (for reconciliation matching)
        records = await convertV1CSVToV2(records, 'bank_statements', null, 'recon');
        console.log(`[Recon] Converted ${records.length} bank records from V1 to V2 format`);
        console.log('[Recon] AFTER conversion, first record:', JSON.stringify(records[0]));
      } catch (conversionError) {
        console.warn('[Recon] V1→V2 bank conversion failed, using data as-is:', conversionError.message);
      }
    }
    
    return records;
  } catch (error) {
    console.error('[Recon Job] CRITICAL: Bank API unreachable', {
      jobId: params.jobId,
      bankType: params.bankType,
      error: error.message,
      url: bankApiUrl,
      timestamp: new Date().toISOString()
    });

    // Mark job as FAILED if job tracking exists
    if (jobs && jobs.has(params.jobId)) {
      const job = jobs.get(params.jobId);
      job.status = 'FAILED';
      job.error = `Bank API failed: ${error.message}. Cannot proceed with reconciliation without bank data.`;
      job.failedAt = new Date().toISOString();
    }

    throw new Error(`Bank API failed: ${error.message}. Cannot proceed with reconciliation without bank data.`);
  }
}

async function normalizeTransactions(transactions) {
  const { convertV1CSVToV2 } = require('../../shared/v1-column-mapper.cjs');
  
  // Check if this is V1 format by looking for V1 column names
  if (transactions.length > 0) {
    const firstRow = transactions[0];
    const hasV1Columns =
      firstRow['Transaction ID'] ||
      firstRow['Client Code'] ||
      firstRow['Payee Amount'] ||
      firstRow['Paid Amount'] ||
      firstRow['Trans Complete Date'] ||
      // Also check lowercase_underscore format
      firstRow['transaction_id'] && (firstRow['payee_amount'] || firstRow['paid_amount']) && firstRow['trans_complete_date'];

    if (hasV1Columns) {
      console.log('[PG Normalization] Detected V1 format, converting to V2');
      
      // Normalize V1 CSV headers to lowercase_with_underscores
      const normalizedV1 = transactions.map(row => {
        const normalized = {};
        for (const [key, value] of Object.entries(row)) {
          // Convert "Transaction ID" -> "transaction_id"
          const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, '_');
          normalized[normalizedKey] = value;
        }
        return normalized;
      });
      
      // Apply V1 -> V2 conversion with 'recon' mode
      const v2Data = await convertV1CSVToV2(normalizedV1, 'pg_transactions', null, 'recon');
      
      // Convert to reconciliation engine format
      return v2Data.map(t => ({
        ...t,
        normalized: true,
        transaction_id: t.transaction_id || '',
        merchant_id: t.merchant_id || '',
        amount: t.amount_paise || 0,
        gross_amount: t.gross_amount_paise || 0, // 🆕 Add gross_amount for bank fee matching
        bank_fee: t.bank_fee_paise || 0,
        settlement_amount: t.settlement_amount_paise || 0,
        currency: t.currency || 'INR',
        transaction_date: t.transaction_date || t.transaction_timestamp || '',
        transaction_time: t.transaction_time || '',
        payment_method: t.payment_method || '',
        utr: (t.utr || '').toString().trim().toUpperCase(),
        rrn: t.rrn || '',
        status: t.status || 'SUCCESS'
      }));
    }
  }
  
  // Fallback: V2 format or unknown format (for API/CSV data, not database)
  return transactions.map(t => {
    // Convert amounts from rupees to paise (for CSV/API data)
    const amountInRupees = Number(t.Amount || t.AMOUNT || 0);
    const amountInPaise = Math.round(amountInRupees * 100);

    const grossAmountInRupees = Number(t.GROSS_AMT || 0);
    const grossAmountInPaise = Math.round(grossAmountInRupees * 100);

    const bankFeeInRupees = Number(t['Bank Fee'] || t.BANK_FEE || 0);
    const bankFeeInPaise = Math.round(bankFeeInRupees * 100);

    const settlementAmountInRupees = Number(t['Settlement Amount'] || t.SETTLEMENT_AMOUNT || 0);
    const settlementAmountInPaise = Math.round(settlementAmountInRupees * 100);

    return {
      ...t,  // Preserve all original fields (including amount, gross_amount from database)
      normalized: true,
      transaction_id: t['Transaction ID'] || t.transaction_id || t.TXN_ID || '',
      merchant_id: t['Merchant ID'] || t.merchant_id || t.CLIENT_CODE || '',
      // Only override amount/gross if they don't exist or use uppercase format (CSV)
      amount: t.amount || t.amount_paise || amountInPaise,
      gross_amount: t.gross_amount || t.gross_amount_paise || grossAmountInPaise,
      bank_fee: t.bank_fee || bankFeeInPaise,
      settlement_amount: t.settlement_amount || settlementAmountInPaise,
      currency: t.Currency || t.currency || 'INR',
      transaction_date: t['Transaction Date'] || t.transaction_date || t.TXN_DATE || '',
      transaction_time: t['Transaction Time'] || t.transaction_time || '',
      payment_method: t['Payment Method'] || t.payment_method || t.PAYMENT_MODE || '',
      utr: t.UTR || t.utr || '',
      rrn: t.RRN || t.rrn || '',
      status: t.Status || t.status || 'SUCCESS'
    };
  });
}

async function normalizeBankRecords(records, bankFilename = null, jobId = null) {
  console.log('[normalizeBankRecords] ENTRY:', records.length, 'records, bankFilename =', bankFilename);
  // Two-stage normalization if bank filename is available
  if (bankFilename) {
    try {
      const { detectBankFromFilename, normalizeBankData } = require('../utils/bank-normalizer');
      const { Pool } = require('pg');
      const config = require('../../config/env.cjs');

      // Detect bank from filename
      const bankConfigName = detectBankFromFilename(bankFilename);

      if (bankConfigName) {
        if (jobId) {
          logStructured(jobId, 'info', `Detected bank: ${bankConfigName} from filename: ${bankFilename}`);
        }

        // Fetch bank mapping from database using centralized config
        const pool = new Pool({
          host: config.db.host,
          port: config.db.port,
          database: config.db.database,
          user: config.db.user,
          password: config.db.password
        });
        
        const result = await pool.query(`
          SELECT 
            config_name,
            bank_name,
            file_type,
            delimiter,
            v1_column_mappings,
            special_fields
          FROM sp_v2_bank_column_mappings
          WHERE config_name = $1 AND is_active = TRUE
        `, [bankConfigName]);
        
        await pool.end();
        
        if (result.rows.length > 0) {
          const bankMapping = result.rows[0];
          if (jobId) {
            logStructured(jobId, 'info', `Applying two-stage normalization (Bank → V1 → V2) for ${bankMapping.bank_name}`);
          }

          // Apply two-stage normalization
          const v2Data = await normalizeBankData(records, bankMapping);

          // Defensive check - ensure v2Data is an array
          if (!Array.isArray(v2Data)) {
            console.error('[Bank Normalization] ERROR: normalizeBankData did not return an array!', typeof v2Data, v2Data);
            if (jobId) {
              logStructured(jobId, 'error', `Two-stage normalization failed: Result is not an array (${typeof v2Data})`);
            }
            // Fall through to fallback normalization
          } else {
            if (jobId) {
              logStructured(jobId, 'info', `Two-stage normalization complete: ${v2Data.length} records`);
            }

            // Convert V2 format to reconciliation engine format
            return v2Data.map(r => ({
            ...r,
            normalized: true,
            bank_reference: r.utr || r.rrn || '',
            bank_name: r.bank_name || bankMapping.bank_name,
            amount: r.amount_paise || r.amount || 0,
            transaction_date: r.transaction_date || '',
            value_date: r.value_date || r.transaction_date || '',
            utr: (r.utr || '').toString().trim().toUpperCase(),
            rrn: r.rrn || '',
            remarks: r.remarks || '',
            debit_credit: 'CREDIT'
          }));
          }
        } else {
          if (jobId) {
            logStructured(jobId, 'warn', `Bank mapping not found for ${bankConfigName}, using fallback normalization`);
          }
        }
      } else {
        if (jobId) {
          logStructured(jobId, 'warn', `Could not detect bank from filename: ${bankFilename}, using fallback normalization`);
        }
      }
    } catch (error) {
      if (jobId) {
        logStructured(jobId, 'error', `Two-stage normalization failed: ${error.message}, using fallback`);
      }
      console.error('[Bank Normalization] Error:', error);
    }
  }
  
  // Fallback: Basic normalization (existing logic)
  return records.map((r, idx) => {
    // DEBUG: Log first record to see what we're getting
    if (idx === 0) {
      console.log('[Bank Normalizer] First record before normalization:', JSON.stringify(r));
    }
    
    // Check if amount is already in paise (from v1-column-mapper)
    const amountPaise = r.amount_paise || 0;
    const amountOther = Number(r.Amount || r.AMOUNT || r.amount || 0);
    
    if (idx === 0) {
      console.log('[Bank Normalizer] amountPaise =', amountPaise, ', amountOther =', amountOther);
    }
    
    // If amount_paise exists, use it; otherwise convert from rupees to paise
    const finalAmount = amountPaise > 0 ? amountPaise : Math.round(amountOther * 100);

    // 🆕 Handle gross_amount_paise (for bank fee tracking)
    const grossAmountPaise = r.gross_amount_paise || r.gross_amount || 0;
    const finalGrossAmount = grossAmountPaise > 0 ? grossAmountPaise : (r.GROSS_AMT ? Math.round(r.GROSS_AMT * 100) : 0);

    const normalized = {
      ...r,
      normalized: true,
      bank_reference: r['Bank Reference'] || r.bank_reference || r.TRANSACTION_ID || r.bank_ref || '',
      bank_name: r['Bank Name'] || r.bank_name || r.BANK || '',
      amount: finalAmount,
      gross_amount: finalGrossAmount, // 🆕 Add gross_amount for matching
      transaction_date: r['Transaction Date'] || r.transaction_date || r.DATE || r.TXN_DATE || r.date || '',
      value_date: r['Value Date'] || r.value_date || r.date || '',
      utr: (r.utr || r.bank_ref || '').toString().trim().toUpperCase(),  // After V1→V2 mapping, UTR is in 'utr' or 'bank_ref' field
      remarks: r.Remarks || r.remarks || '',
      debit_credit: r['Debit/Credit'] || r.debit_credit || 'CREDIT'
    };

    if (idx === 0) {
      console.log('[Bank Normalizer] Normalized first record:', JSON.stringify(normalized));
    }

    return normalized;
  });
}

// V1-Style Reconciliation Engine with 11 Exception Types
function matchRecords(pgRecords, bankRecords, cycleDate = null) {
  const matched = [];
  const unmatchedPg = [...pgRecords];
  const unmatchedBank = [...bankRecords];
  const exceptions = [];
  
  // V1 Tolerances
  const AMOUNT_TOLERANCE_PAISE = 100;        // ₹1.00
  const AMOUNT_TOLERANCE_PERCENT = 0.001;    // 0.1%
  const DATE_WINDOW_DAYS = 2;                // T+2 window
  const FEE_MISMATCH_MIN = 200;              // ₹2.00 (200 paise)
  const FEE_MISMATCH_MAX = 500;              // ₹5.00 (500 paise)
  const ROUNDING_ERROR_EXACT = 1;            // ₹0.01 (1 paisa)
  
  console.log(`[V1 Recon] Starting reconciliation...`);
  console.log(`[V1 Recon] PG Records: ${pgRecords.length}, Bank Records: ${bankRecords.length}`);
  
  // ========================================================================
  // STEP 1: BANK_FILE_MISSING Check
  // ========================================================================
  if (!bankRecords || bankRecords.length === 0) {
    console.log(`[V1 Recon] BANK_FILE_MISSING detected - no bank records`);
    pgRecords.forEach(pg => {
      exceptions.push({
        pg,
        bank: null,
        reasonCode: 'BANK_FILE_MISSING',
        reason: 'No bank file uploaded for this reconciliation cycle',
        delta: 0
      });
    });
    return { matched, unmatchedPg: [], unmatchedBank: [], exceptions };
  }
  
  // ========================================================================
  // STEP 2: UTR_MISSING_OR_INVALID (MISSING_UTR)
  // ========================================================================
  const pgWithoutUtr = [];
  pgRecords.forEach(pg => {
    const utr = pg.utr?.trim();
    if (!utr || utr === '' || utr === 'null' || utr === 'NULL' || utr === 'undefined') {
      pgWithoutUtr.push(pg);
      exceptions.push({
        pg,
        bank: null,
        reasonCode: 'UTR_MISSING_OR_INVALID',
        reason: `PG transaction missing UTR (Transaction ID: ${pg.transaction_id || pg.pgw_ref || 'UNKNOWN'})`,
        delta: 0
      });
    }
  });
  
  // Remove from unmatched pool
  pgWithoutUtr.forEach(pg => {
    const index = unmatchedPg.indexOf(pg);
    if (index > -1) unmatchedPg.splice(index, 1);
  });
  
  console.log(`[V1 Recon] MISSING_UTR: ${pgWithoutUtr.length}`);
  
  // ========================================================================
  // STEP 3: DUPLICATE_PG_ENTRY (DUPLICATE_UTR in PG)
  // ========================================================================
  const pgUtrCounts = {};
  pgRecords.forEach(pg => {
    const utr = pg.utr?.trim();
    if (utr && utr !== 'null' && utr !== 'NULL') {
      pgUtrCounts[utr] = (pgUtrCounts[utr] || 0) + 1;
    }
  });
  
  const duplicatePgUtrs = Object.keys(pgUtrCounts).filter(utr => pgUtrCounts[utr] > 1);
  const pgWithDuplicateUtr = [];
  
  if (duplicatePgUtrs.length > 0) {
    pgRecords.forEach(pg => {
      const utr = pg.utr?.trim();
      if (duplicatePgUtrs.includes(utr)) {
        pgWithDuplicateUtr.push(pg);
        exceptions.push({
          pg,
          bank: null,
          reasonCode: 'DUPLICATE_PG_ENTRY',
          reason: `Duplicate UTR in PG: ${utr} appears ${pgUtrCounts[utr]} times`,
          delta: 0
        });
      }
    });
    
    pgWithDuplicateUtr.forEach(pg => {
      const index = unmatchedPg.indexOf(pg);
      if (index > -1) unmatchedPg.splice(index, 1);
    });
  }
  
  console.log(`[V1 Recon] DUPLICATE_PG_ENTRY: ${pgWithDuplicateUtr.length}`);
  
  // ========================================================================
  // STEP 4: DUPLICATE_BANK_ENTRY (DUPLICATE_UTR in Bank)
  // ========================================================================
  const bankUtrCounts = {};
  bankRecords.forEach(bank => {
    const utr = bank.utr?.trim();
    if (utr && utr !== 'null' && utr !== 'NULL') {
      bankUtrCounts[utr] = (bankUtrCounts[utr] || 0) + 1;
    }
  });
  
  const duplicateBankUtrs = Object.keys(bankUtrCounts).filter(utr => bankUtrCounts[utr] > 1);
  const bankWithDuplicateUtr = [];
  
  if (duplicateBankUtrs.length > 0) {
    bankRecords.forEach(bank => {
      const utr = bank.utr?.trim();
      if (duplicateBankUtrs.includes(utr)) {
        bankWithDuplicateUtr.push(bank);
        exceptions.push({
          pg: null,
          bank,
          reasonCode: 'DUPLICATE_BANK_ENTRY',
          reason: `Duplicate UTR in Bank: ${utr} appears ${bankUtrCounts[utr]} times`,
          delta: 0
        });
      }
    });
    
    bankWithDuplicateUtr.forEach(bank => {
      const index = unmatchedBank.indexOf(bank);
      if (index > -1) unmatchedBank.splice(index, 1);
    });
  }
  
  console.log(`[V1 Recon] DUPLICATE_BANK_ENTRY: ${bankWithDuplicateUtr.length}`);
  
  // ========================================================================
  // STEP 5: UTR Matching with Enhanced Exception Detection
  // ========================================================================
  const usedBankRecords = new Set();
  
  unmatchedPg.forEach(pg => {
    const pgUtr = pg.utr?.trim();
    if (!pgUtr) return; // Already handled in MISSING_UTR
    
    // Find bank record with matching UTR
    const bankMatch = unmatchedBank.find(b => {
      if (usedBankRecords.has(b)) return false;
      const bankUtr = b.utr?.trim();
      return bankUtr === pgUtr;
    });
    
    if (!bankMatch) {
      // Check for UTR_MISMATCH (RRN vs UTR format)
      const pgRrn = pg.rrn?.trim();
      if (pgRrn && pgRrn !== pgUtr) {
        const bankMatchByRrn = unmatchedBank.find(b => {
          if (usedBankRecords.has(b)) return false;
          const bankUtr = b.utr?.trim();
          return bankUtr === pgRrn;
        });
        
        if (bankMatchByRrn) {
          exceptions.push({
            pg,
            bank: bankMatchByRrn,
            reasonCode: 'UTR_MISMATCH',
            reason: `UTR format mismatch: PG UTR=${pgUtr}, PG RRN=${pgRrn} matches Bank UTR`,
            delta: 0
          });
          usedBankRecords.add(bankMatchByRrn);
          return;
        }
      }
      // No match found - will be handled as UNMATCHED_IN_BANK later
      return;
    }
    
    // Found UTR match - now validate date and amount
    // 🆕 Use gross amounts when available for matching, fallback to net (backward compatible)
    // This fixes the ambiguity: match by customer-paid amount (gross), not merchant-received (net)
    // For old records without gross_amount, falls back to net amount (pg.amount / bankMatch.amount)
    const pgAmount = Number(pg.gross_amount || pg.amount) || 0;
    const bankAmount = Number(bankMatch.gross_amount || bankMatch.amount) || 0;
    const amountDiff = Math.abs(pgAmount - bankAmount);

    console.log(`[Matching] ${pg.transaction_id}: PG(gross=${pg.gross_amount}, net=${pg.amount}, used=${pgAmount}) vs Bank(gross=${bankMatch.gross_amount}, net=${bankMatch.amount}, used=${bankAmount}) => diff=${amountDiff}`);
    
    // ========================================================================
    // STEP 5a: DATE_OUT_OF_WINDOW Check
    // ========================================================================
    const pgDate = pg.transaction_date || pg.captured_at || cycleDate;
    const bankDate = bankMatch.transaction_date || bankMatch.value_date || cycleDate;
    
    if (pgDate && bankDate) {
      try {
        const pgTime = new Date(pgDate).getTime();
        const bankTime = new Date(bankDate).getTime();
        
        if (!isNaN(pgTime) && !isNaN(bankTime)) {
          const daysDiff = Math.abs(pgTime - bankTime) / (1000 * 60 * 60 * 24);
          
          if (daysDiff > DATE_WINDOW_DAYS) {
            exceptions.push({
              pg,
              bank: bankMatch,
              reasonCode: 'DATE_OUT_OF_WINDOW',
              reason: `Date exceeds T+${DATE_WINDOW_DAYS} window: PG ${pgDate} vs Bank ${bankDate} (${Math.round(daysDiff)} days apart)`,
              delta: amountDiff
            });
            usedBankRecords.add(bankMatch);
            return;
          }
        }
      } catch (e) {
        console.warn(`[V1 Recon] Date parsing error for UTR ${pgUtr}:`, e.message);
      }
    }
    
    // ========================================================================
    // STEP 5b: FEES_VARIANCE Detection (V2.10.0)
    // ========================================================================
    // Check if PG transaction has explicit bank fee and settlement amount
    const pgBankFee = pg.bank_fee || 0;
    const pgSettlementAmount = pg.settlement_amount || 0;
    
    if (pgBankFee > 0 || pgSettlementAmount > 0) {
      // We have explicit fee data - perform FEES_VARIANCE checks
      const FEE_VARIANCE_TOLERANCE = 100; // ₹1.00 (100 paise)
      
      // Check 1: Internal consistency (PG amount - bank fee = settlement amount)
      if (pgSettlementAmount > 0) {
        const expectedSettlement = pgAmount - pgBankFee;
        const settlementVariance = Math.abs(expectedSettlement - pgSettlementAmount);
        
        if (settlementVariance > FEE_VARIANCE_TOLERANCE) {
          exceptions.push({
            pg,
            bank: bankMatch,
            reasonCode: 'FEES_VARIANCE',
            reason: `PG fee calculation mismatch: Amount ₹${(pgAmount / 100).toFixed(2)} - Fee ₹${(pgBankFee / 100).toFixed(2)} ≠ Settlement ₹${(pgSettlementAmount / 100).toFixed(2)} (Δ ₹${(settlementVariance / 100).toFixed(2)})`,
            delta: settlementVariance
          });
          usedBankRecords.add(bankMatch);
          return;
        }
      }
      
      // Check 2: Bank credit validation (settlement amount matches what bank credited)
      const expectedBankCredit = pgSettlementAmount || (pgAmount - pgBankFee);
      // 🆕 Use actual bank net amount for credit validation (not the matched gross amount)
      const actualBankCredit = Number(bankMatch.amount);
      const bankCreditVariance = Math.abs(expectedBankCredit - actualBankCredit);
      
      if (bankCreditVariance > FEE_VARIANCE_TOLERANCE) {
        exceptions.push({
          pg,
          bank: bankMatch,
          reasonCode: 'FEES_VARIANCE',
          reason: `Bank credit mismatch: Expected ₹${(expectedBankCredit / 100).toFixed(2)} vs Actual ₹${(bankAmount / 100).toFixed(2)} (Δ ₹${(bankCreditVariance / 100).toFixed(2)})`,
          delta: bankCreditVariance
        });
        usedBankRecords.add(bankMatch);
        return;
      }
      
      // Check 3: Fee calculation validation (calculated fee vs recorded fee)
      if (pgBankFee > 0) {
        // 🆕 Bank fee = PG gross - Bank net (what was actually credited)
        // Use gross for PG (when available), net for bank (actual credit)
        const calculatedBankFee = Number(pg.gross_amount || pg.amount) - Number(bankMatch.amount);
        const feeVariance = Math.abs(calculatedBankFee - pgBankFee);
        
        if (feeVariance > FEE_VARIANCE_TOLERANCE) {
          exceptions.push({
            pg,
            bank: bankMatch,
            reasonCode: 'FEES_VARIANCE',
            reason: `Bank fee mismatch: Recorded ₹${(pgBankFee / 100).toFixed(2)} vs Calculated ₹${(calculatedBankFee / 100).toFixed(2)} (Δ ₹${(feeVariance / 100).toFixed(2)})`,
            delta: feeVariance
          });
          usedBankRecords.add(bankMatch);
          return;
        }
      }
      
      // If all fee checks pass, this is a perfect match
      matched.push({ pg, bank: bankMatch });
      usedBankRecords.add(bankMatch);
      return;
    }
    
    // ========================================================================
    // STEP 5c: Amount Matching with Enhanced Classification (No explicit fees)
    // ========================================================================
    const tolerance = Math.max(AMOUNT_TOLERANCE_PAISE, pgAmount * AMOUNT_TOLERANCE_PERCENT);
    
    if (amountDiff === 0) {
      // Perfect match
      matched.push({ pg, bank: bankMatch });
      usedBankRecords.add(bankMatch);
    } else if (amountDiff === ROUNDING_ERROR_EXACT) {
      // ROUNDING_ERROR (₹0.01)
      exceptions.push({
        pg,
        bank: bankMatch,
        reasonCode: 'ROUNDING_ERROR',
        reason: `Rounding difference: PG ₹${(pgAmount / 100).toFixed(2)} vs Bank ₹${(bankAmount / 100).toFixed(2)} (Δ ₹0.01)`,
        delta: amountDiff
      });
      usedBankRecords.add(bankMatch);
    } else if (amountDiff >= FEE_MISMATCH_MIN && amountDiff <= FEE_MISMATCH_MAX) {
      // FEE_MISMATCH (₹2-₹5 bank fee)
      exceptions.push({
        pg,
        bank: bankMatch,
        reasonCode: 'FEE_MISMATCH',
        reason: `Likely bank fee: PG ₹${(pgAmount / 100).toFixed(2)} vs Bank ₹${(bankAmount / 100).toFixed(2)} (Δ ₹${(amountDiff / 100).toFixed(2)})`,
        delta: amountDiff
      });
      usedBankRecords.add(bankMatch);
    } else if (amountDiff <= tolerance) {
      // Within tolerance - match
      matched.push({ pg, bank: bankMatch });
      usedBankRecords.add(bankMatch);
    } else {
      // AMOUNT_MISMATCH (beyond tolerance)
      exceptions.push({
        pg,
        bank: bankMatch,
        reasonCode: 'AMOUNT_MISMATCH',
        reason: `Amount mismatch: PG ₹${(pgAmount / 100).toFixed(2)} vs Bank ₹${(bankAmount / 100).toFixed(2)} (Δ ₹${(amountDiff / 100).toFixed(2)})`,
        delta: amountDiff
      });
      usedBankRecords.add(bankMatch);
    }
  });
  
  // ========================================================================
  // STEP 6: Clean up matched/exception records from unmatched pools
  // ========================================================================
  matched.forEach(m => {
    const pgIndex = unmatchedPg.indexOf(m.pg);
    if (pgIndex > -1) unmatchedPg.splice(pgIndex, 1);
    
    const bankIndex = unmatchedBank.indexOf(m.bank);
    if (bankIndex > -1) unmatchedBank.splice(bankIndex, 1);
  });
  
  exceptions.forEach(ex => {
    if (ex.pg) {
      const pgIndex = unmatchedPg.indexOf(ex.pg);
      if (pgIndex > -1) unmatchedPg.splice(pgIndex, 1);
    }
    if (ex.bank) {
      const bankIndex = unmatchedBank.indexOf(ex.bank);
      if (bankIndex > -1) unmatchedBank.splice(bankIndex, 1);
    }
  });
  
  // ========================================================================
  // STEP 7: Remaining records are unmatched (handled in persistence)
  // - unmatchedPg → PG_TXN_MISSING_IN_BANK (UNMATCHED_IN_BANK)
  // - unmatchedBank → BANK_TXN_MISSING_IN_PG (UNMATCHED_IN_PG)
  // ========================================================================
  
  console.log(`[V1 Recon] ========== RESULTS ==========`);
  console.log(`[V1 Recon] Matched: ${matched.length}`);
  console.log(`[V1 Recon] Exceptions: ${exceptions.length}`);
  console.log(`[V1 Recon] Unmatched PG: ${unmatchedPg.length}`);
  console.log(`[V1 Recon] Unmatched Bank: ${unmatchedBank.length}`);
  
  // Count exception types
  const exceptionCounts = {};
  exceptions.forEach(ex => {
    exceptionCounts[ex.reasonCode] = (exceptionCounts[ex.reasonCode] || 0) + 1;
  });
  console.log(`[V1 Recon] Exception breakdown:`, exceptionCounts);
  
  return { matched, unmatchedPg, unmatchedBank, exceptions };
}

async function persistResults(results, jobId = 'UNKNOWN', job = {}, params = {}) {
  const startTime = Date.now();
  console.log('[Persistence] ========== PERSISTENCE STARTED ==========');
  console.log('[Persistence] Job ID:', jobId);
  console.log('[Persistence] Matched:', results.matched.length);
  console.log('[Persistence] Unmatched PG:', results.unmatchedPg.length);
  console.log('[Persistence] Unmatched Bank:', results.unmatchedBank.length);
  console.log('[Persistence] Exceptions:', results.exceptions?.length || 0);

  const { Pool } = require('pg');
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433'),
    database: process.env.DB_NAME || 'settlepaisa_v2',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'settlepaisa123'
  };

  console.log('[Persistence] Database config:', {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user
  });

  const pool = new Pool(dbConfig);

  try {
    console.log('[Persistence] Connecting to database...');
    const client = await pool.connect();
    console.log('[Persistence] ✅ Connected successfully');

    try {
      console.log('[Persistence] Starting transaction...');
      await client.query('BEGIN');
      console.log('[Persistence] ✅ Transaction started');

      // Calculate financial amounts from reconciliation results
      console.log('[Persistence] Calculating financial amounts...');

      // Total amount: All PG transactions (matched + unmatched + exceptions with PG data)
      const totalAmountPaise = [
        ...results.matched.map(m => Number(m.pg.amount) || 0),
        ...results.unmatchedPg.map(u => Number(u.amount) || 0),
        ...results.exceptions.filter(e => e.pg).map(e => Number(e.pg.amount) || 0)
      ].reduce((sum, amt) => sum + amt, 0);

      // Reconciled amount: Only matched transactions
      const reconciledAmountPaise = results.matched
        .map(m => Number(m.pg.amount) || 0)
        .reduce((sum, amt) => sum + amt, 0);

      // Variance: Total - Reconciled
      const varianceAmountPaise = totalAmountPaise - reconciledAmountPaise;

      console.log(`[Persistence] Financial Summary:`);
      console.log(`[Persistence]   Total Amount: ₹${(totalAmountPaise / 100).toFixed(2)} (${totalAmountPaise} paise)`);
      console.log(`[Persistence]   Reconciled Amount: ₹${(reconciledAmountPaise / 100).toFixed(2)} (${reconciledAmountPaise} paise)`);
      console.log(`[Persistence]   Variance: ₹${(varianceAmountPaise / 100).toFixed(2)} (${varianceAmountPaise} paise)`);

      // Count exceptions with PG data
      console.log(`[Persistence] DEBUG: results.exceptions =`, JSON.stringify(results.exceptions, null, 2));
      console.log(`[Persistence] DEBUG: Checking each exception for pg property:`);
      results.exceptions.forEach((e, idx) => {
        console.log(`[Persistence]   Exception ${idx}: hasPg=${!!e.pg}, reasonCode=${e.reasonCode}`);
      });

      const exceptionsWithPg = results.exceptions.filter(e => e.pg).length;
      const totalPgRecords = results.matched.length + results.unmatchedPg.length + exceptionsWithPg;

      console.log(`[Persistence] Total PG Records Calculation:`);
      console.log(`[Persistence]   Matched: ${results.matched.length}`);
      console.log(`[Persistence]   Unmatched PG: ${results.unmatchedPg.length}`);
      console.log(`[Persistence]   Exceptions with PG: ${exceptionsWithPg}`);
      console.log(`[Persistence]   Total PG: ${totalPgRecords}`);

      console.log('[Persistence] Inserting job record into sp_v2_reconciliation_jobs...');
      console.log('[Persistence] Job data:', {
        jobId,
        date: params.date,
        totalPgRecords,
        totalBankRecords: results.matched.length + results.unmatchedBank.length,
        matched: results.matched.length,
        unmatchedPg: results.unmatchedPg.length,
        unmatchedBank: results.unmatchedBank.length,
        exceptions: results.exceptions.length,
        totalAmountPaise,
        reconciledAmountPaise,
        varianceAmountPaise
      });

      const insertResult = await client.query(`
        INSERT INTO sp_v2_reconciliation_jobs (
          job_id,
          job_name,
          date_from,
          date_to,
          total_pg_records,
          total_bank_records,
          matched_records,
          unmatched_pg,
          unmatched_bank,
          exception_records,
          total_amount_paise,
          reconciled_amount_paise,
          variance_amount_paise,
          status,
          processing_start,
          processing_end
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
        ON CONFLICT (job_id) DO UPDATE SET
          matched_records = EXCLUDED.matched_records,
          unmatched_pg = EXCLUDED.unmatched_pg,
          unmatched_bank = EXCLUDED.unmatched_bank,
          exception_records = EXCLUDED.exception_records,
          total_amount_paise = EXCLUDED.total_amount_paise,
          reconciled_amount_paise = EXCLUDED.reconciled_amount_paise,
          variance_amount_paise = EXCLUDED.variance_amount_paise,
          status = EXCLUDED.status,
          processing_end = NOW()
      `, [
        jobId,
        `Reconciliation Job ${params.date || 'Unknown'}`,
        params.date || new Date().toISOString().split('T')[0],
        params.date || new Date().toISOString().split('T')[0],
        totalPgRecords,
        results.matched.length + results.unmatchedBank.length,
        results.matched.length,
        results.unmatchedPg.length,
        results.unmatchedBank.length,
        results.exceptions.length,
        totalAmountPaise,
        reconciledAmountPaise,
        varianceAmountPaise,
        'COMPLETED'
      ]);

      console.log(`[Persistence] ✅ Job record saved successfully:`, {
        jobId,
        rowCount: insertResult.rowCount,
        command: insertResult.command
      });
      
      // REPLACE logic for manual uploads: delete existing data for this date
      if (job.sourceType === 'MANUAL_UPLOAD' && params.date) {
        console.log(`[Persistence] REPLACE mode: Deleting existing MANUAL_UPLOAD data for ${params.date}`);
        
        const deleteTxnResult = await client.query(`
          DELETE FROM sp_v2_transactions 
          WHERE source_type = 'MANUAL_UPLOAD' 
            AND transaction_date = $1
        `, [params.date]);
        
        const deleteBankResult = await client.query(`
          DELETE FROM sp_v2_bank_statements 
          WHERE source_type = 'MANUAL_UPLOAD' 
            AND transaction_date = $1
        `, [params.date]);
        
        console.log(`[Persistence] Deleted ${deleteTxnResult.rowCount} transactions and ${deleteBankResult.rowCount} bank statements`);
      }
      
      // Insert matched records into sp_v2_recon_matches
      for (const match of results.matched) {
        // First ensure the PG transaction exists in sp_v2_transactions
        const pgTxn = match.pg;
        const bankTxn = match.bank;

        // 🆕 Calculate bank fee: PG gross - Bank net (what was actually credited)
        // Use gross_amount when available (for new uploads), fallback to amount (for old records)
        const pgGrossPaise = parseInt(pgTxn.gross_amount || pgTxn.amount) || 0;
        const pgAmountPaise = parseInt(pgTxn.amount) || 0; // Net amount (merchant receives)
        // Bank amount is already in paise from database, only convert if it's in uppercase (API format)
        const bankCreditedPaise = parseInt(bankTxn.amount) || Math.round(parseFloat(bankTxn.AMOUNT || bankTxn.CREDIT_AMT || 0) * 100);
        const bankFeePaise = pgGrossPaise - bankCreditedPaise;
        const settlementAmountPaise = bankCreditedPaise;

        console.log(`[Bank Fee Calc] ${pgTxn.transaction_id}: PG gross=${pgGrossPaise}, Bank net=${bankCreditedPaise}, Fee=${bankFeePaise}`);

        // Calculate fee variance (warn if > 5%)
        const feeVariancePaise = Math.abs(bankFeePaise);
        const expectedFeeRate = 0.02; // 2% typical MDR
        const expectedFeePaise = Math.round(pgAmountPaise * expectedFeeRate);
        const variancePercent = expectedFeePaise > 0 ? Math.abs((bankFeePaise - expectedFeePaise) / expectedFeePaise) * 100 : 0;

        if (variancePercent > 5 && bankFeePaise > 0) {
          console.log(`⚠️  [Bank Fee] High variance for ${pgTxn.transaction_id}: ${variancePercent.toFixed(2)}% (expected: ₹${(expectedFeePaise/100).toFixed(2)}, actual: ₹${(bankFeePaise/100).toFixed(2)})`);
        }

        await client.query(`
          INSERT INTO sp_v2_transactions (
            transaction_id,
            merchant_id,
            amount_paise,
            bank_fee_paise,
            settlement_amount_paise,
            fee_variance_paise,
            currency,
            transaction_date,
            transaction_timestamp,
            source_type,
            source_name,
            payment_method,
            utr,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
            bank_fee_paise = EXCLUDED.bank_fee_paise,
            settlement_amount_paise = EXCLUDED.settlement_amount_paise,
            fee_variance_paise = EXCLUDED.fee_variance_paise,
            updated_at = NOW()
          WHERE sp_v2_transactions.source_type != 'API_SYNC'
        `, [
          pgTxn.transaction_id || pgTxn.pgw_ref,
          pgTxn.merchant_id || 'UNKNOWN',
          pgAmountPaise,                    // $3: amount_paise
          bankFeePaise,                     // $4: bank_fee_paise (NEW)
          settlementAmountPaise,            // $5: settlement_amount_paise (NEW)
          feeVariancePaise,                 // $6: fee_variance_paise (NEW)
          'INR',                            // $7: currency
          pgTxn.transaction_date || new Date().toISOString().split('T')[0],
          pgTxn.transaction_timestamp || pgTxn.created_at || new Date().toISOString(),
          job.sourceType,
          job.sourceType === 'MANUAL_UPLOAD' ? 'MANUAL_UPLOAD' : 'PG_API',
          pgTxn.payment_method || pgTxn.payment_mode || 'UNKNOWN',
          pgTxn.utr,
          'RECONCILED'
        ]);
        
        // Get the transaction ID for foreign key
        const txnResult = await client.query(
          'SELECT id FROM sp_v2_transactions WHERE transaction_id = $1',
          [pgTxn.transaction_id || pgTxn.pgw_ref]
        );
        
        if (txnResult.rows.length > 0) {
          const txnId = txnResult.rows[0].id;
          
          // Ensure bank statement exists
          const bankStmt = match.bank;
          await client.query(`
            INSERT INTO sp_v2_bank_statements (
              bank_ref,
              bank_name,
              amount_paise,
              transaction_date,
              value_date,
              utr,
              remarks,
              debit_credit,
              source_type,
              source_file,
              processed
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (bank_ref) DO UPDATE SET
              processed = EXCLUDED.processed
          `, [
            bankStmt.bank_reference || bankStmt.utr || bankStmt.TRANSACTION_ID || bankStmt.UTR || `BANK_${Date.now()}`,
            bankStmt.bank_name || bankStmt.BANK || 'UNKNOWN',
            bankStmt.amount || Math.round(parseFloat(bankStmt.AMOUNT || bankStmt.CREDIT_AMT || 0) * 100),
            bankStmt.transaction_date || bankStmt.DATE || bankStmt.VALUE_DATE || new Date().toISOString().split('T')[0],
            bankStmt.value_date || bankStmt.VALUE_DATE || bankStmt.DATE || new Date().toISOString().split('T')[0],
            bankStmt.utr || bankStmt.UTR,
            bankStmt.remarks || bankStmt.REMARKS || '',
            'CREDIT',
            job.sourceType === 'MANUAL' ? 'MANUAL_UPLOAD' : 'SFTP_CONNECTOR',
            job.sourceType === 'MANUAL' ? 'MANUAL_UPLOAD' : 'BANK_API',
            true
          ]);
          
          // Get bank statement ID
          const bankResult = await client.query(
            'SELECT id FROM sp_v2_bank_statements WHERE bank_ref = $1',
            [bankStmt.bank_reference || bankStmt.utr || bankStmt.TRANSACTION_ID || bankStmt.UTR || `BANK_${Date.now()}`]
          );
          
          if (bankResult.rows.length > 0) {
            const bankId = bankResult.rows[0].id;
            
            // NOTE: sp_v2_recon_matches insertion skipped due to schema design difference
            // - sp_v2_recon_matches (V1 schema): expects UUID FKs to sp_v2_settlement_items & sp_v2_utr_credits
            // - Current workflow (V2): uses sp_v2_transactions (BIGINT id) & sp_v2_bank_statements (BIGINT id)
            //
            // Audit trail maintained via:
            // 1. Transaction status = 'RECONCILED' (line 1598 above)
            // 2. Bank statement metadata includes reconciliation details
            // 3. Settlement items table links transactions to batches (separate workflow)
            //
            // Future enhancement: Create sp_v2_recon_audit table with BIGINT FKs for V2 schema
            console.log('[Persistence] Matched transaction and bank statement saved (IDs:', txnId, bankId, ')');
          }
        }
      }
      
      // Insert exception transactions FIRST (all exception types with specific reasons)
      console.log(`[Persistence] Processing ${results.exceptions?.length || 0} exceptions with specific reasons`);
      console.log(`[Persistence] Exceptions array:`, JSON.stringify(results.exceptions?.slice(0, 3), null, 2));
      if (results.exceptions && results.exceptions.length > 0) {
        for (const exception of results.exceptions) {
          console.log(`[Persistence] Exception ${exception.pg?.transaction_id}: reasonCode=${exception.reasonCode}, hasPg=${!!exception.pg}, hasBank=${!!exception.bank}`);
          // Handle PG-based exceptions
          if (exception.pg) {
            const exceptionPg = exception.pg;
            console.log(`[Persistence] Saving PG exception: ${exceptionPg.transaction_id}, UTR: ${exceptionPg.utr}, Reason: ${exception.reasonCode}`);
            // Calculate fee variance if applicable (V2.10.0)
            const bankFeePaise = exceptionPg.bank_fee || 0;
            const settlementAmountPaise = exceptionPg.settlement_amount || 0;
            let feeVariancePaise = 0;
            let feeVariancePercentage = null;
            
            if (exception.reasonCode === 'FEES_VARIANCE') {
              feeVariancePaise = exception.delta || 0;
              const pgAmount = exceptionPg.amount || 0;
              if (pgAmount > 0) {
                feeVariancePercentage = (feeVariancePaise / pgAmount) * 100;
              }
            }
            
            await client.query(`
              INSERT INTO sp_v2_transactions (
                transaction_id,
                merchant_id,
                amount_paise,
                bank_fee_paise,
                settlement_amount_paise,
                fee_variance_paise,
                fee_variance_percentage,
                currency,
                transaction_date,
                transaction_timestamp,
                source_type,
                source_name,
                payment_method,
                utr,
                status,
                exception_reason
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
              ON CONFLICT (transaction_id) DO UPDATE SET
                status = 'EXCEPTION',
                exception_reason = EXCLUDED.exception_reason,
                bank_fee_paise = EXCLUDED.bank_fee_paise,
                settlement_amount_paise = EXCLUDED.settlement_amount_paise,
                fee_variance_paise = EXCLUDED.fee_variance_paise,
                fee_variance_percentage = EXCLUDED.fee_variance_percentage,
                updated_at = NOW()
            `, [
              exceptionPg.transaction_id || exceptionPg.pgw_ref || `PG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              exceptionPg.merchant_id || 'UNKNOWN',
              exceptionPg.amount || 0,
              bankFeePaise,
              settlementAmountPaise,
              feeVariancePaise,
              feeVariancePercentage,
              'INR',
              exceptionPg.transaction_date || new Date().toISOString().split('T')[0],
              exceptionPg.transaction_timestamp || exceptionPg.created_at || new Date().toISOString(),
              job.sourceType,
              job.sourceType === 'MANUAL_UPLOAD' ? 'MANUAL_UPLOAD' : 'PG_API',
              exceptionPg.payment_method || exceptionPg.payment_mode || 'UNKNOWN',
              exceptionPg.utr,
              'EXCEPTION',
              exception.reasonCode || 'AMOUNT_MISMATCH'
            ]);
          }
          
          // Handle Bank-only exceptions (DUPLICATE_BANK_ENTRY)
          if (exception.bank && !exception.pg) {
            const exceptionBank = exception.bank;
            console.log(`[Persistence] Saving Bank-only exception: Bank Ref ${exceptionBank.bank_ref || exceptionBank.TRANSACTION_ID}, UTR: ${exceptionBank.utr || exceptionBank.UTR}, Reason: ${exception.reasonCode}`);
            await client.query(`
              INSERT INTO sp_v2_bank_statements (
                bank_ref,
                bank_name,
                amount_paise,
                transaction_date,
                value_date,
                utr,
                remarks,
                debit_credit,
                source_type,
                source_file,
                processed
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
              ON CONFLICT (bank_ref) DO UPDATE SET
                processed = false,
                remarks = CONCAT(COALESCE(sp_v2_bank_statements.remarks, ''), ' [', $12::text, ']')
            `, [
              exceptionBank.bank_reference || exceptionBank.bank_ref || exceptionBank.utr || exceptionBank.TRANSACTION_ID || exceptionBank.UTR || `BANK_${Date.now()}`,
              exceptionBank.bank_name || exceptionBank.BANK || 'UNKNOWN',
              exceptionBank.amount || Math.round(parseFloat(exceptionBank.AMOUNT || exceptionBank.CREDIT_AMT || 0)),
              exceptionBank.transaction_date || exceptionBank.DATE || exceptionBank.VALUE_DATE || new Date().toISOString().split('T')[0],
              exceptionBank.value_date || exceptionBank.VALUE_DATE || exceptionBank.DATE || new Date().toISOString().split('T')[0],
              exceptionBank.utr || exceptionBank.UTR,
              exceptionBank.remarks || exceptionBank.REMARKS || '',
              'CREDIT',
              job.sourceType === 'MANUAL' ? 'MANUAL_UPLOAD' : 'SFTP_CONNECTOR',
              job.sourceType === 'MANUAL' ? 'MANUAL_UPLOAD' : 'BANK_API',
              false,  // Not processed (it's an exception)
              exception.reasonCode  // Add reason to remarks via parameter $12
            ]);
          }
        }
        console.log(`[Persistence] Saved ${results.exceptions.length} exception transactions`);
      } else {
        console.log('[Persistence] No exceptions to persist');
      }
      
      // Insert unmatched PG transactions (only those NOT in exceptions)
      // These are truly unmatched - no bank record found, no specific exception reason
      console.log(`[Persistence] Processing ${results.unmatchedPg?.length || 0} unmatched PG transactions`);
      for (const unmatchedPg of results.unmatchedPg) {
        await client.query(`
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
            status,
            exception_reason
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (transaction_id) DO UPDATE SET
            status = CASE 
              WHEN sp_v2_transactions.status = 'RECONCILED' THEN sp_v2_transactions.status
              WHEN sp_v2_transactions.status = 'EXCEPTION' AND sp_v2_transactions.exception_reason IS NOT NULL 
                THEN sp_v2_transactions.status
              ELSE EXCLUDED.status 
            END,
            exception_reason = CASE 
              WHEN sp_v2_transactions.status = 'RECONCILED' THEN sp_v2_transactions.exception_reason
              WHEN sp_v2_transactions.status = 'EXCEPTION' AND sp_v2_transactions.exception_reason IS NOT NULL 
                THEN sp_v2_transactions.exception_reason
              ELSE EXCLUDED.exception_reason 
            END,
            updated_at = NOW()
        `, [
          unmatchedPg.transaction_id || unmatchedPg.pgw_ref,
          unmatchedPg.merchant_id || 'UNKNOWN',
          unmatchedPg.amount || 0,
          'INR',
          unmatchedPg.transaction_date || new Date().toISOString().split('T')[0],
          unmatchedPg.transaction_timestamp || unmatchedPg.created_at || new Date().toISOString(),
          job.sourceType,
          job.sourceType === 'MANUAL_UPLOAD' ? 'MANUAL_UPLOAD' : 'PG_API',
          unmatchedPg.payment_method || unmatchedPg.payment_mode || 'UNKNOWN',
          unmatchedPg.utr,
          'UNMATCHED',
          null
        ]);
      }
      console.log(`[Persistence] Saved ${results.unmatchedPg?.length || 0} unmatched PG transactions as UNMATCHED`);
      
      // Insert unmatched bank records
      for (const unmatchedBank of results.unmatchedBank) {
        await client.query(`
          INSERT INTO sp_v2_bank_statements (
            bank_ref,
            bank_name,
            amount_paise,
            transaction_date,
            value_date,
            utr,
            remarks,
            debit_credit,
            source_type,
            source_file,
            processed
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (bank_ref) DO NOTHING
        `, [
          unmatchedBank.bank_reference || unmatchedBank.utr || unmatchedBank.TRANSACTION_ID || unmatchedBank.UTR || `BANK_${Date.now()}_${Math.random()}`,
          unmatchedBank.bank_name || unmatchedBank.BANK || 'UNKNOWN',
          unmatchedBank.amount || Math.round(parseFloat(unmatchedBank.AMOUNT || unmatchedBank.CREDIT_AMT || 0) * 100),
          unmatchedBank.transaction_date || unmatchedBank.DATE || unmatchedBank.VALUE_DATE || new Date().toISOString().split('T')[0],
          unmatchedBank.value_date || unmatchedBank.VALUE_DATE || unmatchedBank.DATE || new Date().toISOString().split('T')[0],
          unmatchedBank.utr || unmatchedBank.UTR,
          unmatchedBank.remarks || unmatchedBank.REMARKS || '',
          'CREDIT',
          job.sourceType === 'MANUAL_UPLOAD' ? 'MANUAL_UPLOAD' : 'SFTP_CONNECTOR',
          job.sourceType === 'MANUAL_UPLOAD' ? 'MANUAL_UPLOAD' : 'BANK_API',
          false
        ]);
      }
      
      console.log(`[Persistence] Saving reconciliation results to sp_v2_reconciliation_results...`);
      
      for (const match of results.matched) {
        const pgTxnId = match.pg.transaction_id || match.pg.pgw_ref;
        const pgAmount = Number(match.pg.gross_amount || match.pg.amount) || 0;
        const bankAmount = Number(match.bank.gross_amount || match.bank.amount) || 0;
        const variance = bankAmount - pgAmount;
        const matchScore = match.matchScore || 100;
        
        // Fetch bank statement ID from database
        const bankRef = match.bank.bank_reference || match.bank.bank_ref || match.bank.utr || match.bank.TRANSACTION_ID || match.bank.UTR;
        const bankIdResult = await client.query(
          'SELECT id FROM sp_v2_bank_statements WHERE bank_ref = $1',
          [bankRef]
        );
        
        if (bankIdResult.rows.length === 0) {
          console.error(`[Persistence] MATCHED - Bank statement not found for bank_ref: ${bankRef}, skipping`);
          continue;
        }
        
        const bankStmtId = bankIdResult.rows[0].id;
        
        console.log(`[Persistence] MATCHED - pgTxnId: ${pgTxnId}, bankStmtId: ${bankStmtId}, pgAmount: ${pgAmount}, bankAmount: ${bankAmount}, jobId: ${jobId}`);
        
        const existing = await client.query(
          'SELECT id FROM sp_v2_reconciliation_results WHERE pg_transaction_id = $1',
          [pgTxnId]
        );
        
        if (existing.rows.length > 0) {
          console.log(`[Persistence] MATCHED - Updating existing record ID: ${existing.rows[0].id}`);
          const updateResult = await client.query(`
            UPDATE sp_v2_reconciliation_results SET
              job_id = $1,
              bank_statement_id = $2,
              match_status = $3,
              match_score = $4,
              pg_amount_paise = $5,
              bank_amount_paise = $6,
              variance_paise = $7,
              created_at = NOW()
            WHERE pg_transaction_id = $8
          `, [jobId, bankStmtId, 'MATCHED', matchScore, pgAmount, bankAmount, variance, pgTxnId]);
          console.log(`[Persistence] MATCHED - UPDATE affected ${updateResult.rowCount} rows`);
        } else {
          console.log(`[Persistence] MATCHED - Inserting new record`);
          const insertResult = await client.query(`
            INSERT INTO sp_v2_reconciliation_results (
              job_id, pg_transaction_id, bank_statement_id, match_status,
              match_score, pg_amount_paise, bank_amount_paise, variance_paise, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          `, [jobId, pgTxnId, bankStmtId, 'MATCHED', matchScore, pgAmount, bankAmount, variance]);
          console.log(`[Persistence] MATCHED - INSERT affected ${insertResult.rowCount} rows`);
        }
      }
      console.log(`[Persistence] Saved ${results.matched.length} MATCHED results`);
      
      for (const unmatchedPg of results.unmatchedPg) {
        const pgTxnId = unmatchedPg.transaction_id || unmatchedPg.pgw_ref;
        const pgAmount = unmatchedPg.amount || 0;
        
        const existing = await client.query(
          'SELECT id FROM sp_v2_reconciliation_results WHERE pg_transaction_id = $1',
          [pgTxnId]
        );
        
        if (existing.rows.length > 0) {
          await client.query(`
            UPDATE sp_v2_reconciliation_results SET
              job_id = $1,
              match_status = $2,
              pg_amount_paise = $3,
              variance_paise = $4,
              created_at = NOW()
            WHERE pg_transaction_id = $5
          `, [jobId, 'UNMATCHED_PG', pgAmount, pgAmount, pgTxnId]);
        } else {
          await client.query(`
            INSERT INTO sp_v2_reconciliation_results (
              job_id, pg_transaction_id, bank_statement_id, match_status,
              pg_amount_paise, bank_amount_paise, variance_paise, created_at
            ) VALUES ($1, $2, NULL, $3, $4, NULL, $5, NOW())
          `, [jobId, pgTxnId, 'UNMATCHED_PG', pgAmount, pgAmount]);
        }
      }
      console.log(`[Persistence] Saved ${results.unmatchedPg.length} UNMATCHED_PG results`);
      
      for (const unmatchedBank of results.unmatchedBank) {
        // Get bank statement ID from database if it exists
        const bankRef = unmatchedBank.bank_reference || unmatchedBank.utr || unmatchedBank.TRANSACTION_ID || unmatchedBank.UTR || `BANK_${Date.now()}_${Math.random()}`;

        let bankStmtId = null;
        try {
          const bankIdResult = await client.query(
            'SELECT id FROM sp_v2_bank_statements WHERE bank_ref = $1',
            [bankRef]
          );

          if (bankIdResult.rows.length > 0) {
            bankStmtId = bankIdResult.rows[0].id;
          }
        } catch (err) {
          console.log(`[Persistence] Could not fetch bank statement ID for ${bankRef}:`, err.message);
        }

        const bankUtr = unmatchedBank.utr || unmatchedBank.UTR || unmatchedBank.TRANSACTION_ID || 'N/A';
        const pgTxnId = `BANK_${bankUtr}`;
        const bankAmount = Number(unmatchedBank.gross_amount || unmatchedBank.amount) || Math.round(parseFloat(unmatchedBank.AMOUNT || unmatchedBank.CREDIT_AMT || 0) * 100);

        const existing = await client.query(
          'SELECT id FROM sp_v2_reconciliation_results WHERE pg_transaction_id = $1',
          [pgTxnId]
        );

        if (existing.rows.length > 0) {
          await client.query(`
            UPDATE sp_v2_reconciliation_results SET
              job_id = $1,
              bank_statement_id = $2,
              match_status = $3,
              bank_amount_paise = $4,
              variance_paise = $5,
              created_at = NOW()
            WHERE pg_transaction_id = $6
          `, [jobId, bankStmtId, 'UNMATCHED_BANK', bankAmount, bankAmount, pgTxnId]);
        } else {
          await client.query(`
            INSERT INTO sp_v2_reconciliation_results (
              job_id, pg_transaction_id, bank_statement_id, match_status,
              pg_amount_paise, bank_amount_paise, variance_paise, created_at
            ) VALUES ($1, $2, $3, $4, NULL, $5, $6, NOW())
          `, [jobId, pgTxnId, bankStmtId, 'UNMATCHED_BANK', bankAmount, bankAmount]);
        }
      }
      console.log(`[Persistence] Saved ${results.unmatchedBank.length} UNMATCHED_BANK results`);
      
      for (const exception of results.exceptions) {
        const pgTxnId = exception.pg ? (exception.pg.transaction_id || exception.pg.pgw_ref) : null;

        // Get bank statement ID from database if exception has bank record
        let bankStmtId = null;
        if (exception.bank) {
          const bankRef = exception.bank.bank_reference || exception.bank.bank_ref || exception.bank.utr || exception.bank.TRANSACTION_ID || exception.bank.UTR;
          try {
            const bankIdResult = await client.query(
              'SELECT id FROM sp_v2_bank_statements WHERE bank_ref = $1',
              [bankRef]
            );
            if (bankIdResult.rows.length > 0) {
              bankStmtId = bankIdResult.rows[0].id;
            }
          } catch (err) {
            console.log(`[Persistence] EXCEPTION - Could not fetch bank statement ID for ${bankRef}:`, err.message);
          }
        }

        const pgAmount = exception.pg ? (Number(exception.pg.gross_amount || exception.pg.amount) || 0) : null;
        const bankAmount = exception.bank ? (Number(exception.bank.gross_amount || exception.bank.amount) || 0) : null;
        const variance = exception.delta || 0;
        
        const severityMap = {
          'BANK_FILE_MISSING': 'CRITICAL',
          'UTR_MISSING_OR_INVALID': 'HIGH',
          'DUPLICATE_PG_ENTRY': 'CRITICAL',
          'DUPLICATE_BANK_ENTRY': 'CRITICAL',
          'AMOUNT_MISMATCH': 'MEDIUM',
          'DATE_OUT_OF_WINDOW': 'MEDIUM'
        };
        
        const severity = severityMap[exception.reasonCode] || 'MEDIUM';
        
        if (pgTxnId) {
          const existing = await client.query(
            'SELECT id FROM sp_v2_reconciliation_results WHERE pg_transaction_id = $1',
            [pgTxnId]
          );
          
          if (existing.rows.length > 0) {
            await client.query(`
              UPDATE sp_v2_reconciliation_results SET
                job_id = $1,
                bank_statement_id = $2,
                match_status = $3,
                exception_reason_code = $4,
                exception_severity = $5,
                exception_message = $6,
                pg_amount_paise = $7,
                bank_amount_paise = $8,
                variance_paise = $9,
                created_at = NOW()
              WHERE pg_transaction_id = $10
            `, [jobId, bankStmtId, 'EXCEPTION', exception.reasonCode, severity, exception.reason, pgAmount, bankAmount, variance, pgTxnId]);
          } else {
            await client.query(`
              INSERT INTO sp_v2_reconciliation_results (
                job_id, pg_transaction_id, bank_statement_id, match_status,
                exception_reason_code, exception_severity, exception_message,
                pg_amount_paise, bank_amount_paise, variance_paise, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            `, [jobId, pgTxnId, bankStmtId, 'EXCEPTION', exception.reasonCode, severity, exception.reason, pgAmount, bankAmount, variance]);
          }
        }
      }
      console.log(`[Persistence] Saved ${results.exceptions.length} EXCEPTION results`);

      // NEW (Oct 26): Update sp_v2_transactions.status to sync with reconciliation results
      // This ensures the Overview API KPIs show correct match rates
      console.log('[Persistence] Updating sp_v2_transactions status based on reconciliation results...');

      // Update MATCHED transactions
      if (results.matched.length > 0) {
        const matchedTxnIds = results.matched.map(m => m.pg?.transaction_id || m.pg?.pgw_ref).filter(Boolean);
        if (matchedTxnIds.length > 0) {
          const matchedUpdateResult = await client.query(`
            UPDATE sp_v2_transactions
            SET status = 'RECONCILED',
                updated_at = NOW()
            WHERE transaction_id = ANY($1)
              AND status != 'RECONCILED'
          `, [matchedTxnIds]);
          console.log(`[Persistence] Updated ${matchedUpdateResult.rowCount} transactions to RECONCILED`);
        }
      }

      // Update UNMATCHED_PG transactions
      if (results.unmatchedPg.length > 0) {
        const unmatchedTxnIds = results.unmatchedPg.map(u => u.transaction_id || u.pgw_ref).filter(Boolean);
        if (unmatchedTxnIds.length > 0) {
          const unmatchedUpdateResult = await client.query(`
            UPDATE sp_v2_transactions
            SET status = 'UNMATCHED',
                updated_at = NOW()
            WHERE transaction_id = ANY($1)
              AND status != 'UNMATCHED'
          `, [unmatchedTxnIds]);
          console.log(`[Persistence] Updated ${unmatchedUpdateResult.rowCount} transactions to UNMATCHED`);
        }
      }

      // Update EXCEPTION transactions
      if (results.exceptions.length > 0) {
        const exceptionTxnIds = results.exceptions
          .map(e => e.pg?.transaction_id || e.pg?.pgw_ref)
          .filter(Boolean);
        if (exceptionTxnIds.length > 0) {
          const exceptionUpdateResult = await client.query(`
            UPDATE sp_v2_transactions
            SET status = 'EXCEPTION',
                updated_at = NOW()
            WHERE transaction_id = ANY($1)
              AND status != 'EXCEPTION'
          `, [exceptionTxnIds]);
          console.log(`[Persistence] Updated ${exceptionUpdateResult.rowCount} transactions to EXCEPTION`);
        }
      }

      console.log('[Persistence] ✅ Transaction statuses updated successfully');

      await client.query('COMMIT');
      console.log(`[Persistence] ✅ Transaction COMMITTED successfully`);

      // Release client back to pool
      client.release();
      console.log('[Persistence] Client released back to pool');

      // await pool.end();  // DON'T end pool - settlement calculator needs it!
      console.log('[Persistence] Pool kept alive for settlement (cleaned up by calculator.close())');

      const duration = Date.now() - startTime;
      console.log('[Persistence] ========== PERSISTENCE COMPLETED ==========');
      console.log(`[Persistence] ✅ All data persisted successfully in ${duration}ms`);
      console.log(`[Persistence] Summary:`, {
        jobId,
        matched: results.matched.length,
        unmatchedPg: results.unmatchedPg.length,
        unmatchedBank: results.unmatchedBank.length,
        exceptions: results.exceptions.length,
        durationMs: duration
      });
      
    } catch (error) {
      try {
        await client.query('ROLLBACK');
        console.error('[Persistence] ❌ Transaction ROLLED BACK');
      } catch (rbError) {
        console.error('[Persistence] ❌ Rollback failed:', rbError.message);
      }

      const duration = Date.now() - startTime;
      console.error('[Persistence] ========== PERSISTENCE FAILED ==========');
      console.error('[Persistence] ❌ Error after', duration, 'ms');
      console.error('[Persistence] Error name:', error.name);
      console.error('[Persistence] Error message:', error.message);
      console.error('[Persistence] Error code:', error.code);
      console.error('[Persistence] Stack trace:', error.stack);
      console.error('[Persistence] Job ID:', jobId);
      console.error('[Persistence] ================================================');

      client.release();
      // await pool.end();  // DON'T end pool even on error - settlement may still run

      // Re-throw with enhanced context
      const enhancedError = new Error(`Persistence failed for job ${jobId}: ${error.message}`);
      enhancedError.originalError = error;
      enhancedError.jobId = jobId;
      enhancedError.code = error.code;
      throw enhancedError;
    }
  } catch (poolError) {
    console.error('[Persistence] ========== DATABASE CONNECTION FAILED ==========');
    console.error('[Persistence] ❌ Could not connect to database');
    console.error('[Persistence] Error:', poolError.message);
    console.error('[Persistence] Config:', {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database
    });
    console.error('[Persistence] =================================================');

    // Re-throw with enhanced context
    const enhancedError = new Error(`Database connection failed: ${poolError.message}`);
    enhancedError.originalError = poolError;
    enhancedError.jobId = jobId;
    throw enhancedError;
  }
}

// Export helper functions for API access
function getJob(jobId) {
  return jobs.get(jobId);
}

function getJobLogs(jobId) {
  return jobLogs.get(jobId) || [];
}

module.exports = {
  runReconciliation,
  getJob,
  getJobLogs
};