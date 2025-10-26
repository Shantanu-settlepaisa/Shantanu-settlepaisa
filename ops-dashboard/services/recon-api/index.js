const config = require('../config/env.cjs');
const express = require('express')
const cors = require('cors')
const { v4: uuidv4 } = require('uuid')
const axios = require('axios')
const { Pool } = require('pg')
const { runReconciliation, getJob, getJobLogs } = require('./jobs/runReconciliation')
// const { createHealthCheckEndpoint } = require('../health-check')
const jobRoutes = require('./routes/jobRoutes')
const exceptionsRoutes = require('./routes/exceptions')
const exceptionsV2Routes = require('./routes/exceptions-v2')
const exceptionSavedViewsRoutes = require('./routes/exception-saved-views')
const exceptionRulesRoutes = require('./routes/exception-rules')
const reportsRoutes = require('./routes/reports')
const bankMappingsRoutes = require('./routes/bank-mappings')
const pgTransactionsRoutes = require('./routes/pg-transactions')
const connectorsRoutes = require('./routes/connectors')

// Development logging (gated in production)
const isDev = config.app.nodeEnv !== 'production'
const log = (...args) => isDev && console.log(...args)

// Environment-driven API URLs for inter-service communication
const PG_API_URL = process.env.PG_API_URL || 'http://localhost:5101';
const BANK_API_URL = process.env.BANK_API_URL || 'http://localhost:5102';

const app = express()
app.use(cors())
app.use(express.json())

// Database pool for health checks with production-ready configuration
const pool = new Pool({
  user: config.db.user,
  host: config.db.host,
  database: config.db.database,
  password: config.db.password,
  port: config.db.port,
  max: 20,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => console.error('[Recon Pool Error]', err))

// Mount routes
app.use('/recon', jobRoutes)
app.use('/exceptions', exceptionsRoutes)  // Legacy route
app.use('/exceptions-v2', exceptionsV2Routes)  // New workflow-based route
app.use('/exception-saved-views', exceptionSavedViewsRoutes)
app.use('/exception-rules', exceptionRulesRoutes)
app.use('/reports', reportsRoutes)
app.use('/bank-mappings', bankMappingsRoutes)
app.use('/pg-transactions', pgTransactionsRoutes)
app.use('/connectors', connectorsRoutes)

// Store reconciliation results in memory
const reconResults = new Map()

// Health check cache
let lastHealthCheck = null
const HEALTH_CHECK_CACHE_MS = 5000

// New reconciliation endpoint using job runner
app.post('/recon/run', async (req, res) => {
  const { date, cycle_date, merchantId, merchant_id, acquirerId, dryRun, limit, test, pgTransactions, bankRecords, bankFilename } = req.body
  // Support both naming conventions: date/cycle_date and merchantId/merchant_id
  const reconDate = date || cycle_date
  const reconMerchantId = merchantId || merchant_id
  log('[Recon API] Starting reconciliation job:', { date: reconDate, merchantId: reconMerchantId, acquirerId, dryRun, test, bankFilename })
  
  if (pgTransactions) {
    log('[Recon API] Using uploaded PG transactions:', pgTransactions.length);
  }
  if (bankRecords) {
    log('[Recon API] Using uploaded bank records:', bankRecords.length);
  }
  
  try {
    const job = await runReconciliation({
      date: reconDate,
      merchantId: reconMerchantId,
      acquirerId,
      dryRun,
      limit,
      test,
      pgTransactions,  // Pass uploaded data
      bankRecords,     // Pass uploaded data
      bankFilename     // Pass filename for bank detection
    })
    
    res.json({
      success: true,
      jobId: job.id,
      correlationId: job.correlationId,
      status: job.status,
      stage: job.stage,
      counters: job.counters,
      error: job.error
    })
  } catch (error) {
    console.error('[Recon API] Failed to start job:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Get job status
app.get('/recon/jobs/:jobId', (req, res) => {
  const job = getJob(req.params.jobId)
  if (!job) {
    return res.status(404).json({ error: 'Job not found' })
  }
  res.json(job)
})

// Get job logs
app.get('/recon/jobs/:jobId/logs', (req, res) => {
  const logs = getJobLogs(req.params.jobId)
  if (!logs || logs.length === 0) {
    return res.status(404).json({ error: 'No logs found for job' })
  }
  res.json({ jobId: req.params.jobId, logs })
})

// Health check endpoint with database connectivity test
// createHealthCheckEndpoint(app, 'recon-api', pool)
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'recon-api' }))

// Connector health checks
app.get('/connectors/pg/health', async (req, res) => {
  try {
    const startTime = Date.now()
    const response = await axios.get(`${PG_API_URL}/health`, { timeout: 3000 })
    const responseTime = Date.now() - startTime

    res.json({
      status: 'healthy',
      connector: 'pg_api',
      endpoint: PG_API_URL,
      responseTime,
      lastChecked: new Date().toISOString(),
      details: response.data
    })
  } catch (error) {
    const errorCode = error.code || 'UNKNOWN'
    res.status(503).json({
      status: 'unhealthy',
      connector: 'pg_api',
      endpoint: PG_API_URL,
      error: errorCode === 'ECONNREFUSED' 
        ? 'PG API service is not running or not accessible'
        : error.message,
      errorCode,
      hint: errorCode === 'ECONNREFUSED'
        ? 'Start PG API service on port 5101'
        : 'Check network connectivity and service logs',
      lastChecked: new Date().toISOString()
    })
  }
})

app.get('/connectors/bank/health', async (req, res) => {
  const Client = require('ssh2-sftp-client');
  const client = new Client();

  const sftpConfig = {
    host: process.env.SFTP_HOST || 'localhost',
    port: parseInt(process.env.SFTP_PORT || '2222'),
    username: process.env.SFTP_USERNAME || 'sp-sftp',
    password: process.env.SFTP_PASSWORD || 'sp-sftp'
  };

  const inboundDir = process.env.SFTP_INBOUND_DIR || '/inbound';

  try {
    // Attempt real SFTP connection
    await client.connect(sftpConfig);

    // List files in inbound directory
    const files = await client.list(inboundDir);
    await client.end();

    // Sort files by modification time (newest first)
    files.sort((a, b) => b.modifyTime - a.modifyTime);

    res.json({
      status: 'healthy',
      connector: 'bank_sftp',
      host: sftpConfig.host,
      port: sftpConfig.port,
      directory: inboundDir,
      filesAvailable: files.length,
      latestFile: files[0]?.name || null,
      lastFileReceived: files[0]?.modifyTime || null,
      lastChecked: new Date().toISOString()
    });

  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      connector: 'bank_sftp',
      host: sftpConfig.host,
      port: sftpConfig.port,
      error: error.message,
      errorCode: error.code || 'SFTP_CONNECTION_FAILED',
      hint: 'Check SFTP credentials and network connectivity',
      lastChecked: new Date().toISOString()
    });
  }
})

// Legacy reconciliation endpoint (keep for backward compatibility)
app.post('/api/reconcile', async (req, res) => {
  const { cycleDate, pgSource, bankSource } = req.body
  log('[Recon API] Request received:', { cycleDate, pgSource, bankSource })
  
  try {
    // Fetch PG data
    const pgResponse = await axios.get(`${PG_API_URL}/api/pg/transactions?cycle=${cycleDate}`)
    const pgData = pgResponse.data
    log('[Recon API] PG data fetched:', pgData.transactions?.length || 0, 'transactions')
    
    // Fetch Bank data (try different banks)
    let bankData = { records: [] }
    
    if (bankSource.toLowerCase().includes('axis') || bankSource === 'api') {
      log('[Recon API] Fetching AXIS bank data...')
      const bankResponse = await axios.get(`${BANK_API_URL}/api/bank/axis/recon?cycle=${cycleDate}`)
      bankData = bankResponse.data
      log('[Recon API] Bank data fetched:', bankData.records?.length || 0, 'records')
    } else if (bankSource.toLowerCase().includes('hdfc')) {
      const bankResponse = await axios.get(`${BANK_API_URL}/api/bank/hdfc/recon?cycle=${cycleDate}`)
      bankData = bankResponse.data
    } else if (bankSource.toLowerCase().includes('icici')) {
      const bankResponse = await axios.get(`${BANK_API_URL}/api/bank/icici/recon?cycle=${cycleDate}`)
      bankData = bankResponse.data
    }
    
    // Perform reconciliation
    const result = reconcile(
      pgData.transactions || [],
      bankData.records || [],
      cycleDate,
      pgSource,
      bankSource
    )
    
    // Store result
    reconResults.set(result.id, result)
    
    res.json({
      success: true,
      resultId: result.id,
      summary: generateSummary(result)
    })
  } catch (error) {
    console.error('[Recon API] Reconciliation error:', error.message)
    console.error('[Recon API] Stack trace:', error.stack)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Get reconciliation result
app.get('/api/reconcile/:id', (req, res) => {
  const result = reconResults.get(req.params.id)
  if (!result) {
    return res.status(404).json({ error: 'Result not found' })
  }
  res.json(result)
})

// Get all results
// Test endpoint
app.get('/api/test', async (req, res) => {
  try {
    const bankResponse = await axios.get(`${BANK_API_URL}/api/bank/axis/recon?cycle=2025-01-14`)
    res.json({
      success: true,
      records: bankResponse.data.records?.length || 0,
      data: bankResponse.data
    })
  } catch (error) {
    res.json({ error: error.message })
  }
})

app.get('/api/reconcile', (req, res) => {
  const results = Array.from(reconResults.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  res.json(results)
})

// Reconciliation logic
function reconcile(pgTransactions, bankRecords, cycleDate, pgSource, bankSource) {
  const matched = []
  const unmatchedPG = []
  const unmatchedBank = []
  const exceptions = []
  
  // Create maps for faster lookup
  const bankByUTR = new Map()
  const usedBankRecords = new Set()
  
  // Index bank records by UTR
  bankRecords.forEach(record => {
    const utr = (record.UTR || '').toUpperCase()
    if (!bankByUTR.has(utr)) {
      bankByUTR.set(utr, [])
    }
    bankByUTR.get(utr).push(record)
  })
  
  // Add validation exceptions
  pgTransactions.forEach(txn => {
    // Check for missing critical fields
    if (!txn.utr || txn.utr === '') {
      exceptions.push({
        type: 'MISSING_UTR',
        severity: 'CRITICAL',
        pgTransaction: txn,
        message: `Transaction ${txn.transaction_id} missing UTR`,
        resolution: 'Contact payment gateway for UTR'
      })
    }
    
    // Check for duplicate transactions
    const duplicates = pgTransactions.filter(t => 
      t.utr === txn.utr && t.transaction_id !== txn.transaction_id
    )
    if (duplicates.length > 0) {
      exceptions.push({
        type: 'DUPLICATE_UTR',
        severity: 'HIGH',
        pgTransaction: txn,
        message: `Duplicate UTR ${txn.utr} found in ${duplicates.length + 1} transactions`,
        details: { duplicateIds: duplicates.map(d => d.transaction_id) },
        resolution: 'Investigate duplicate transactions'
      })
    }
  })
  
  // Match PG transactions with Bank records
  pgTransactions.forEach(pgTxn => {
    const utr = (pgTxn.utr || '').toUpperCase()
    const potentialMatches = bankByUTR.get(utr) || []
    
    if (potentialMatches.length === 0) {
      unmatchedPG.push({
        ...pgTxn,
        reason: 'No matching UTR found in bank records',
        reasonCode: 'UTR_NOT_FOUND'
      })
      return
    }
    
    // Find best match based on amount
    let bestMatch = null
    let bestScore = 0
    
    potentialMatches.forEach(bankRecord => {
      if (usedBankRecords.has(bankRecord)) return
      
      // Calculate match score
      let score = 0
      const matchedOn = ['utr']
      
      // Check amount match
      const pgAmount = pgTxn.amount
      const bankAmount = bankRecord.AMOUNT
      const amountDiff = Math.abs(pgAmount - bankAmount)
      const amountVariancePercent = (amountDiff / pgAmount) * 100
      
      if (amountDiff === 0) {
        score += 100
        matchedOn.push('amount_exact')
      } else if (amountVariancePercent <= 1) {
        score += 90
        matchedOn.push('amount_close')
      } else if (amountVariancePercent <= 5) {
        score += 70
        matchedOn.push('amount_variance')
      } else {
        // Create exception for large amount mismatch
        exceptions.push({
          type: 'AMOUNT_MISMATCH',
          severity: 'HIGH',
          pgTransaction: pgTxn,
          bankRecord,
          message: `Amount mismatch: PG ₹${(pgAmount/100).toFixed(2)} vs Bank ₹${(bankAmount/100).toFixed(2)}`,
          details: {
            difference: amountDiff,
            variancePercent: amountVariancePercent.toFixed(2),
            utr: utr
          },
          resolution: 'Manual verification required'
        })
        return
      }
      
      if (score > bestScore) {
        bestScore = score
        bestMatch = bankRecord
      }
    })
    
    if (bestMatch && bestScore >= 70) {
      usedBankRecords.add(bestMatch)
      matched.push({
        pgTransaction: pgTxn,
        bankRecord: bestMatch,
        matchedOn: ['utr', 'amount'],
        confidence: bestScore
      })
    } else {
      unmatchedPG.push({
        ...pgTxn,
        reason: bestScore > 0 ? 'Amount variance exceeded threshold' : 'No UTR match found',
        reasonCode: bestScore > 0 ? 'AMOUNT_MISMATCH' : 'UTR_NOT_FOUND'
      })
    }
  })
  
  // Find unmatched bank records
  bankRecords.forEach(record => {
    if (!usedBankRecords.has(record)) {
      unmatchedBank.push({
        ...record,
        reason: 'No corresponding PG transaction found',
        reasonCode: 'NO_PG_TXN'
      })
    }
  })
  
  // Calculate totals
  const totalAmount = pgTransactions.reduce((sum, txn) => sum + (txn.amount || 0), 0)
  const reconciledAmount = matched.reduce((sum, m) => sum + (m.pgTransaction.amount || 0), 0)
  const matchRate = pgTransactions.length > 0 
    ? (matched.length / pgTransactions.length) * 100 
    : 0
  
  return {
    id: uuidv4(),
    cycleDate,
    pgSource,
    bankSource,
    totalPGTransactions: pgTransactions.length,
    totalBankRecords: bankRecords.length,
    matched,
    unmatchedPG,
    unmatchedBank,
    exceptions,
    matchRate,
    totalAmount,
    reconciledAmount,
    createdAt: new Date().toISOString()
  }
}

function generateSummary(result) {
  return {
    totalTransactions: result.totalPGTransactions,
    totalBankRecords: result.totalBankRecords,
    matched: result.matched.length,
    unmatchedPG: result.unmatchedPG.length,
    unmatchedBank: result.unmatchedBank.length,
    exceptions: result.exceptions.length,
    matchRate: `${result.matchRate.toFixed(2)}%`,
    totalAmount: formatAmount(result.totalAmount),
    reconciledAmount: formatAmount(result.reconciledAmount),
    unreconciledAmount: formatAmount(result.totalAmount - result.reconciledAmount)
  }
}

function formatAmount(amount) {
  const amountInRupees = amount / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amountInRupees)
}

const PORT = 5103
app.listen(PORT, () => {
  log(`Reconciliation API running on port ${PORT}`)
  log(`Health check: http://localhost:${PORT}/recon/health`)
  log(`Job runner: POST http://localhost:${PORT}/recon/run`)
  
  const { scheduleDailyPgSync } = require('./jobs/daily-pg-sync')
  scheduleDailyPgSync()
  
  const { scheduleConnectorSync } = require('./jobs/daily-connector-sync')
  scheduleConnectorSync()
})

module.exports = app