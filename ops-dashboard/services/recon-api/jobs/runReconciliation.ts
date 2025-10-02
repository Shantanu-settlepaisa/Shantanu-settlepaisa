import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

export interface ReconciliationJob {
  id: string;
  correlationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  stage?: string;
  startedAt?: Date;
  finishedAt?: Date;
  error?: {
    code: string;
    message: string;
    stack?: string;
    userSafeHint?: string;
  };
  counters?: {
    pgFetched: number;
    bankFetched: number;
    normalized: number;
    matched: number;
    unmatchedPg: number;
    unmatchedBank: number;
    exceptions: number;
  };
}

// In-memory job store (replace with DB in production)
const jobs = new Map<string, ReconciliationJob>();
const jobLogs = new Map<string, string[]>();

// Error mapping for user-friendly hints
const ERROR_MAPPINGS: Record<string, { code: string; hint: string }> = {
  'ECONNREFUSED': {
    code: 'PG_UNREACHABLE',
    hint: 'PG API at http://localhost:5101 not reachable. Check service up & network/port.'
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

function logStructured(jobId: string, level: string, message: string, data?: any) {
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
  const logs = jobLogs.get(jobId)!;
  logs.push(logEntry);
  if (logs.length > 500) {
    logs.shift(); // Keep only last 500 lines
  }
  
  // Also write to console
  console.log(logEntry);
}

function mapErrorToUserSafe(error: any): { code: string; message: string; hint: string } {
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

export async function runReconciliation(params: {
  date: string;
  merchantId?: string;
  acquirerId?: string;
  dryRun?: boolean;
  limit?: number;
}): Promise<ReconciliationJob> {
  const jobId = uuidv4();
  const correlationId = uuidv4();
  
  const job: ReconciliationJob = {
    id: jobId,
    correlationId,
    status: 'pending',
    startedAt: new Date(),
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
    
    // Stage 1: Validate inputs
    job.stage = 'validation';
    logStructured(jobId, 'info', 'Validating inputs');
    
    if (!params.date || !isValidDate(params.date)) {
      throw new Error('ZERO_DATA: Invalid or empty date window');
    }
    
    // Stage 2: Fetch PG transactions
    job.stage = 'fetch_pg';
    logStructured(jobId, 'info', 'Fetching PG transactions');
    
    const pgTransactions = await fetchPGTransactions(params);
    job.counters!.pgFetched = pgTransactions.length;
    logStructured(jobId, 'info', `Fetched ${pgTransactions.length} PG transactions`);
    
    // Stage 3: Fetch Bank records
    job.stage = 'fetch_bank';
    logStructured(jobId, 'info', 'Fetching bank records');
    
    const bankRecords = await fetchBankRecords(params);
    job.counters!.bankFetched = bankRecords.length;
    logStructured(jobId, 'info', `Fetched ${bankRecords.length} bank records`);
    
    if (pgTransactions.length === 0 && bankRecords.length === 0) {
      throw new Error('ZERO_DATA: No data found for reconciliation');
    }
    
    // Stage 4: Normalize data
    job.stage = 'normalize';
    logStructured(jobId, 'info', 'Normalizing data');
    
    const normalizedPg = normalizeTransactions(pgTransactions);
    const normalizedBank = normalizeBankRecords(bankRecords);
    job.counters!.normalized = normalizedPg.length + normalizedBank.length;
    
    // Stage 5: Match records
    job.stage = 'matching';
    logStructured(jobId, 'info', 'Matching records');
    
    const matchResult = matchRecords(normalizedPg, normalizedBank);
    job.counters!.matched = matchResult.matched.length;
    job.counters!.unmatchedPg = matchResult.unmatchedPg.length;
    job.counters!.unmatchedBank = matchResult.unmatchedBank.length;
    job.counters!.exceptions = matchResult.exceptions.length;
    
    logStructured(jobId, 'info', 'Matching completed', {
      matched: matchResult.matched.length,
      unmatchedPg: matchResult.unmatchedPg.length,
      unmatchedBank: matchResult.unmatchedBank.length,
      exceptions: matchResult.exceptions.length
    });
    
    // Stage 6: Persist results (skip if dry run)
    if (!params.dryRun) {
      job.stage = 'persist';
      logStructured(jobId, 'info', 'Persisting results');
      await persistResults(matchResult);
    }
    
    // Mark as completed
    job.status = 'completed';
    job.finishedAt = new Date();
    job.stage = 'completed';
    
    logStructured(jobId, 'info', 'Reconciliation job completed successfully', {
      duration: job.finishedAt.getTime() - job.startedAt!.getTime(),
      counters: job.counters
    });
    
  } catch (error: any) {
    const errorInfo = mapErrorToUserSafe(error);
    
    job.status = 'failed';
    job.finishedAt = new Date();
    job.error = {
      code: errorInfo.code,
      message: errorInfo.message,
      stack: error.stack?.substring(0, 2048), // Limit stack trace to 2KB
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

// Helper functions (implement with actual logic)
function isValidDate(date: string): boolean {
  const d = new Date(date);
  return !isNaN(d.getTime()) && date.length === 10;
}

async function fetchPGTransactions(params: any): Promise<any[]> {
  // Mock implementation - replace with actual PG API call
  try {
    const response = await fetch(`http://localhost:5101/transactions?date=${params.date}`);
    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`ECONNREFUSED: PG API returned ${response.status}`);
    }
    return await response.json();
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
      throw new Error('ECONNREFUSED: Cannot connect to PG API');
    }
    throw error;
  }
}

async function fetchBankRecords(params: any): Promise<any[]> {
  // Mock implementation - replace with actual SFTP logic
  const pattern = `AXIS_RECON_${params.date.replace(/-/g, '')}.csv`;
  
  // Simulate checking for files
  const filesFound = Math.random() > 0.3; // 70% chance of finding files
  
  if (!filesFound) {
    throw new Error(`NO_BANK_FILES: No files match ${pattern} for ${params.date}`);
  }
  
  // Return mock data
  return Array.from({ length: 120 }, (_, i) => ({
    id: `bank_${i}`,
    amount: Math.floor(Math.random() * 100000),
    utr: `UTR${Date.now()}${i}`,
    date: params.date
  }));
}

function normalizeTransactions(transactions: any[]): any[] {
  return transactions.map(t => ({
    ...t,
    normalized: true,
    transaction_id: t['Transaction ID'] || t.transaction_id || t.TXN_ID || '',
    merchant_id: t['Merchant ID'] || t.merchant_id || t.CLIENT_CODE || '',
    amount: Number(t.Amount || t.AMOUNT || t.amount || 0),
    currency: t.Currency || t.currency || 'INR',
    transaction_date: t['Transaction Date'] || t.transaction_date || t.TXN_DATE || '',
    transaction_time: t['Transaction Time'] || t.transaction_time || '',
    payment_method: t['Payment Method'] || t.payment_method || t.PAYMENT_MODE || '',
    utr: t.UTR || t.utr || '',
    rrn: t.RRN || t.rrn || '',
    status: t.Status || t.status || 'SUCCESS'
  }));
}

function normalizeBankRecords(records: any[]): any[] {
  return records.map(r => ({
    ...r,
    normalized: true,
    bank_reference: r['Bank Reference'] || r.bank_reference || r.TRANSACTION_ID || '',
    bank_name: r['Bank Name'] || r.bank_name || r.BANK || '',
    amount: Number(r.Amount || r.AMOUNT || r.amount || 0),
    transaction_date: r['Transaction Date'] || r.transaction_date || r.DATE || r.TXN_DATE || '',
    value_date: r['Value Date'] || r.value_date || '',
    utr: r.UTR || r.utr || '',
    remarks: r.Remarks || r.remarks || '',
    debit_credit: r['Debit/Credit'] || r.debit_credit || 'CREDIT'
  }));
}

function matchRecords(pgRecords: any[], bankRecords: any[]): any {
  const matched: any[] = [];
  const unmatchedPg = [...pgRecords];
  const unmatchedBank = [...bankRecords];
  const exceptions: any[] = [];
  
  const AMOUNT_TOLERANCE = 0.01;
  
  pgRecords.forEach(pg => {
    const utrToMatch = pg.utr?.trim();
    if (!utrToMatch) return;
    
    const bankMatch = bankRecords.find(b => b.utr?.trim() === utrToMatch);
    if (bankMatch) {
      const pgAmount = Number(pg.amount) || 0;
      const bankAmount = Number(bankMatch.amount) || 0;
      const amountDiff = Math.abs(pgAmount - bankAmount);
      
      if (amountDiff <= AMOUNT_TOLERANCE) {
        matched.push({ pg, bank: bankMatch });
        unmatchedPg.splice(unmatchedPg.indexOf(pg), 1);
        unmatchedBank.splice(unmatchedBank.indexOf(bankMatch), 1);
      } else {
        exceptions.push({
          pg,
          bank: bankMatch,
          reasonCode: 'AMOUNT_MISMATCH',
          reason: `Amount mismatch: PG ₹${pgAmount.toFixed(2)} vs Bank ₹${bankAmount.toFixed(2)} (Δ ₹${amountDiff.toFixed(2)})`,
          delta: amountDiff
        });
        unmatchedPg.splice(unmatchedPg.indexOf(pg), 1);
        unmatchedBank.splice(unmatchedBank.indexOf(bankMatch), 1);
      }
    }
  });
  
  return { matched, unmatchedPg, unmatchedBank, exceptions };
}

async function persistResults(results: any): Promise<void> {
  // Mock persistence - replace with actual DB logic
  await new Promise(resolve => setTimeout(resolve, 100));
}

// Export helper functions for API access
export function getJob(jobId: string): ReconciliationJob | undefined {
  return jobs.get(jobId);
}

export function getJobLogs(jobId: string): string[] {
  return jobLogs.get(jobId) || [];
}