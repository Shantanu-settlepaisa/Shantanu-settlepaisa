const express = require('express')
const cors = require('cors')
const { v4: uuidv4 } = require('uuid')
const axios = require('axios')
const { runReconciliation, getJob, getJobLogs } = require('./jobs/runReconciliation')
const jobRoutes = require('./routes/jobRoutes')
const exceptionsRoutes = require('./routes/exceptions')

const app = express()
app.use(cors())
app.use(express.json())

// Mount routes
app.use('/recon', jobRoutes)
app.use('/exceptions', exceptionsRoutes)

// Store reconciliation results in memory
const reconResults = new Map()

// Health check cache
let lastHealthCheck = null
const HEALTH_CHECK_CACHE_MS = 5000

// New reconciliation endpoint using job runner
app.post('/recon/run', async (req, res) => {
  const { date, merchantId, acquirerId, dryRun, limit, test, pgTransactions, bankRecords } = req.body
  console.log('[Recon API] Starting reconciliation job:', { date, merchantId, acquirerId, dryRun, test })
  
  if (pgTransactions) {
    console.log('[Recon API] Using uploaded PG transactions:', pgTransactions.length);
  }
  if (bankRecords) {
    console.log('[Recon API] Using uploaded bank records:', bankRecords.length);
  }
  
  try {
    const job = await runReconciliation({
      date,
      merchantId,
      acquirerId,
      dryRun,
      limit,
      test,
      pgTransactions,  // Pass uploaded data
      bankRecords      // Pass uploaded data
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

// Health check endpoint
app.get('/recon/health', async (req, res) => {
  // Use cached result if available
  if (lastHealthCheck && Date.now() - lastHealthCheck.timestamp < HEALTH_CHECK_CACHE_MS) {
    return res.json(lastHealthCheck.data)
  }
  
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      service: 'up',
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        limit: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      activeJobs: 0,
      recentErrors: 0
    }
  }
  
  // Cache the result
  lastHealthCheck = { timestamp: Date.now(), data: health }
  res.json(health)
})

// Connector health checks
app.get('/connectors/pg/health', async (req, res) => {
  try {
    const startTime = Date.now()
    const response = await axios.get('http://localhost:5101/health', { timeout: 3000 })
    const responseTime = Date.now() - startTime
    
    res.json({
      status: 'healthy',
      connector: 'pg_api',
      endpoint: 'http://localhost:5101',
      responseTime,
      lastChecked: new Date().toISOString(),
      details: response.data
    })
  } catch (error) {
    const errorCode = error.code || 'UNKNOWN'
    res.status(503).json({
      status: 'unhealthy',
      connector: 'pg_api',
      endpoint: 'http://localhost:5101',
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
  // Mock SFTP health check
  const mockSftpConnected = Math.random() > 0.2 // 80% success rate
  
  if (mockSftpConnected) {
    res.json({
      status: 'healthy',
      connector: 'bank_sftp',
      host: 'sftp.bank.internal',
      directory: '/home/sp-sftp/incoming',
      filesAvailable: Math.floor(Math.random() * 10) + 1,
      lastChecked: new Date().toISOString(),
      lastFileReceived: new Date(Date.now() - Math.random() * 3600000).toISOString()
    })
  } else {
    res.status(503).json({
      status: 'unhealthy',
      connector: 'bank_sftp',
      host: 'sftp.bank.internal',
      error: 'SFTP connection failed',
      errorCode: 'SFTP_AUTH_FAILED',
      hint: 'Check SFTP credentials and network connectivity',
      lastChecked: new Date().toISOString()
    })
  }
})

// Legacy reconciliation endpoint (keep for backward compatibility)
app.post('/api/reconcile', async (req, res) => {
  const { cycleDate, pgSource, bankSource } = req.body
  console.log('[Recon API] Request received:', { cycleDate, pgSource, bankSource })
  
  try {
    // Fetch PG data
    const pgResponse = await axios.get(`http://localhost:5101/api/pg/transactions?cycle=${cycleDate}`)
    const pgData = pgResponse.data
    console.log('[Recon API] PG data fetched:', pgData.transactions?.length || 0, 'transactions')
    
    // Fetch Bank data (try different banks)
    let bankData = { records: [] }
    
    if (bankSource.toLowerCase().includes('axis') || bankSource === 'api') {
      console.log('[Recon API] Fetching AXIS bank data...')
      const bankResponse = await axios.get(`http://localhost:5102/api/bank/axis/recon?cycle=${cycleDate}`)
      bankData = bankResponse.data
      console.log('[Recon API] Bank data fetched:', bankData.records?.length || 0, 'records')
    } else if (bankSource.toLowerCase().includes('hdfc')) {
      const bankResponse = await axios.get(`http://localhost:5102/api/bank/hdfc/recon?cycle=${cycleDate}`)
      bankData = bankResponse.data
    } else if (bankSource.toLowerCase().includes('icici')) {
      const bankResponse = await axios.get(`http://localhost:5102/api/bank/icici/recon?cycle=${cycleDate}`)
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
    const bankResponse = await axios.get('http://localhost:5102/api/bank/axis/recon?cycle=2025-01-14')
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
  console.log(`Reconciliation API running on port ${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/recon/health`)
  console.log(`Job runner: POST http://localhost:${PORT}/recon/run`)
})

module.exports = app