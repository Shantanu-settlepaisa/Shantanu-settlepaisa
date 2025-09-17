const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const {
  createModeStackedEndpoint,
  createGmvTrendV2Endpoint,
  createParetoEndpoint,
  createKpisV2WithDeltasEndpoint
} = require('./analytics-endpoints');
const { registerAnalyticsV3Endpoints } = require('./analytics-v3-endpoints');

const app = express();
const PORT = process.env.PORT || 5105;

app.use(cors());
app.use(bodyParser.json());

// Demo data generation for KPIs
function generateKpiData(filters) {
  const { from, to, merchantId, acquirerId } = filters;
  const dayCount = Math.max(1, Math.floor((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24))) + 1;
  
  // Scale transactions based on date range
  const baseTransactionsPerDay = 150;
  const totalTransactions = Math.floor(baseTransactionsPerDay * dayCount);
  
  // Recon distribution: 70% matched, 20% unmatched, 10% exceptions
  const matchedCount = Math.floor(totalTransactions * 0.70);
  const unmatchedPgCount = Math.floor(totalTransactions * 0.15);
  const unmatchedBankCount = Math.floor(totalTransactions * 0.05);
  const exceptionsCount = totalTransactions - matchedCount - unmatchedPgCount - unmatchedBankCount;
  
  // Generate amounts in paise (avoid floats)
  const avgAmountPaise = 25000; // ₹250 average
  const totalAmountPaise = BigInt(totalTransactions * avgAmountPaise);
  const reconciledAmountPaise = BigInt(matchedCount * avgAmountPaise);
  const variancePaise = totalAmountPaise - reconciledAmountPaise;
  
  const matchRatePct = totalTransactions > 0 ? Math.round((matchedCount / totalTransactions) * 100) : 0;
  
  return {
    totalTransactions,
    matchedCount,
    unmatchedPgCount,
    unmatchedBankCount,
    exceptionsCount,
    totalAmountPaise: totalAmountPaise.toString(),
    reconciledAmountPaise: reconciledAmountPaise.toString(),
    variancePaise: variancePaise.toString(),
    matchRatePct
  };
}

// Store for overview data
const overviewCache = new Map();

// Store for reconciliation results by source
const reconResultsStore = {
  manual: {
    lastUpdated: null,
    jobId: null,
    totalTransactions: 0,
    matchedCount: 0,
    unmatchedPgCount: 0,
    unmatchedBankCount: 0,
    exceptionsCount: 0,
    hasData: false
  },
  connectors: {
    lastUpdated: null,
    jobId: null,
    totalTransactions: 0,
    matchedCount: 0,
    unmatchedPgCount: 0,
    unmatchedBankCount: 0,
    exceptionsCount: 0,
    hasData: false
  }
};

// New KPI endpoints for dynamic dashboard
app.get('/api/kpis', async (req, res) => {
  const role = req.header('X-User-Role') || 'sp-ops';
  const merchantId = req.header('X-Merchant-Id') || req.query.merchantId;
  const { from, to, acquirerId } = req.query;
  
  try {
    console.log(`[KPIs API] Request: role=${role}, from=${from}, to=${to}, merchantId=${merchantId}, acquirerId=${acquirerId}`);
    
    const filters = { from, to, merchantId, acquirerId };
    const kpiData = generateKpiData(filters);
    
    // Connector health simulation
    const connectorHealth = [
      { connector: 'HDFC_SFTP', status: 'ok', lastSyncISO: new Date(Date.now() - 5 * 60 * 1000).toISOString() },
      { connector: 'ICICI_API', status: 'ok', lastSyncISO: new Date(Date.now() - 10 * 60 * 1000).toISOString() },
      { connector: 'AXIS_SFTP', status: 'degraded', lastSyncISO: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
      { connector: 'SBI_API', status: 'down', lastSyncISO: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() }
    ];
    
    const response = {
      timeRange: { 
        fromISO: new Date(from).toISOString(), 
        toISO: new Date(to).toISOString() 
      },
      totals: {
        transactionsCount: kpiData.totalTransactions,
        totalAmountPaise: kpiData.totalAmountPaise,
        reconciledAmountPaise: kpiData.reconciledAmountPaise,
        variancePaise: kpiData.variancePaise
      },
      recon: {
        matchRatePct: kpiData.matchRatePct,
        matchedCount: kpiData.matchedCount,
        unmatchedPgCount: kpiData.unmatchedPgCount,
        unmatchedBankCount: kpiData.unmatchedBankCount,
        exceptionsCount: kpiData.exceptionsCount
      },
      connectorHealth
    };
    
    // Add settlements data only for finance role
    if (role === 'sp-finance') {
      const dayCount = Math.max(1, Math.floor((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24))) + 1;
      const batchCount = Math.ceil(dayCount / 1); // Daily batches
      const netToMerchantsPaise = BigInt(Math.floor(Number(kpiData.reconciledAmountPaise) * 0.95)); // 5% MDR
      
      response.settlements = {
        batchCount,
        lastCycleISO: new Date().toISOString(),
        netToMerchantsPaise: netToMerchantsPaise.toString()
      };
    }
    
    res.json(response);
  } catch (error) {
    console.error('[KPIs API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/exceptions/top-reasons', async (req, res) => {
  try {
    const topReasons = [
      { reasonCode: 'MISSING_UTR', count: 32 },
      { reasonCode: 'DUPLICATE_UTR', count: 16 },
      { reasonCode: 'AMOUNT_MISMATCH', count: 14 },
      { reasonCode: 'BANK_FILE_MISSING', count: 12 },
      { reasonCode: 'STATUS_PENDING', count: 8 }
    ];
    
    res.json(topReasons);
  } catch (error) {
    console.error('[Top Reasons API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/pipeline/summary', async (req, res) => {
  const { from, to, merchantId, acquirerId } = req.query;
  
  try {
    const filters = { from, to, merchantId, acquirerId };
    const kpiData = generateKpiData(filters);
    
    const pipeline = {
      ingested: kpiData.totalTransactions,
      reconciled: kpiData.matchedCount,
      settled: Math.floor(kpiData.matchedCount * 0.85), // 85% of matched are settled
      inSettlement: kpiData.matchedCount - Math.floor(kpiData.matchedCount * 0.85),
      unsettled: kpiData.unmatchedPgCount + kpiData.unmatchedBankCount + kpiData.exceptionsCount
    };
    
    res.json(pipeline);
  } catch (error) {
    console.error('[Pipeline API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// New endpoint for exception severity split
app.get('/api/exceptions/severity-split', async (req, res) => {
  const { from, to, merchantId, acquirerId } = req.query;
  
  try {
    const filters = { from, to, merchantId, acquirerId };
    const kpiData = generateKpiData(filters);
    
    // Distribute exceptions by severity
    const total = kpiData.exceptionsCount;
    const severitySplit = {
      critical: Math.floor(total * 0.15), // 15% critical
      high: Math.floor(total * 0.25),     // 25% high
      medium: Math.floor(total * 0.35),   // 35% medium
      low: Math.floor(total * 0.25)       // 25% low
    };
    
    // Ensure sum equals total
    const sum = severitySplit.critical + severitySplit.high + severitySplit.medium + severitySplit.low;
    if (sum < total) {
      severitySplit.low += (total - sum);
    }
    
    res.json(severitySplit);
  } catch (error) {
    console.error('[Severity Split API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// New endpoint for top reasons with severity
app.get('/api/exceptions/top-reasons-detailed', async (req, res) => {
  const { limit = 5 } = req.query;
  
  try {
    const topReasonsDetailed = [
      { code: 'MISSING_UTR', label: 'Missing UTR', count: 32, severity: 'critical' },
      { code: 'DUPLICATE_UTR', label: 'Duplicate UTR', count: 16, severity: 'high' },
      { code: 'AMOUNT_MISMATCH', label: 'Amount Mismatch', count: 14, severity: 'high' },
      { code: 'BANK_FILE_MISSING', label: 'Bank File Missing', count: 12, severity: 'medium' },
      { code: 'STATUS_PENDING', label: 'Status Pending', count: 8, severity: 'low' }
    ];
    
    res.json(topReasonsDetailed.slice(0, parseInt(limit)));
  } catch (error) {
    console.error('[Top Reasons Detailed API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// New endpoint for connector health summary
app.get('/api/connectors/health-summary', async (req, res) => {
  try {
    const connectors = [
      { 
        id: 'hdfc-sftp', 
        name: 'HDFC SFTP', 
        status: 'healthy', 
        lastSync: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        lag: 5 
      },
      { 
        id: 'icici-api', 
        name: 'ICICI API', 
        status: 'healthy', 
        lastSync: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        lag: 10 
      },
      { 
        id: 'axis-sftp', 
        name: 'AXIS SFTP', 
        status: 'degraded', 
        lastSync: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        lag: 120 
      },
      { 
        id: 'sbi-api', 
        name: 'SBI API', 
        status: 'down', 
        lastSync: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        lag: 360 
      },
      { 
        id: 'kotak-sftp', 
        name: 'Kotak SFTP', 
        status: 'healthy', 
        lastSync: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        lag: 15 
      }
    ];
    
    res.json(connectors);
  } catch (error) {
    console.error('[Connector Health API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST endpoint to receive reconciliation results from Manual Upload or Connectors
app.post('/api/recon-results/:source', async (req, res) => {
  const { source } = req.params;
  const { jobId, results, summary } = req.body;
  
  if (!['manual', 'connectors'].includes(source)) {
    return res.status(400).json({ error: 'Invalid source. Must be "manual" or "connectors"' });
  }
  
  try {
    console.log(`[Overview API] Received recon results from ${source}:`, {
      jobId,
      totalTransactions: summary?.totalTransactions || results?.length || 0,
      matched: summary?.matchedCount || 0
    });
    
    // Parse the results to extract counts
    let matchedCount = 0;
    let unmatchedPgCount = 0;
    let unmatchedBankCount = 0;
    let exceptionsCount = 0;
    let totalTransactions = 0;
    
    if (results && Array.isArray(results)) {
      totalTransactions = results.length;
      
      results.forEach(result => {
        const status = result.status || result.reconciliationStatus || 'UNMATCHED';
        
        switch (status.toUpperCase()) {
          case 'MATCHED':
          case 'RECONCILED':
            matchedCount++;
            break;
          case 'UNMATCHED_PG':
          case 'PG_ONLY':
            unmatchedPgCount++;
            break;
          case 'UNMATCHED_BANK':
          case 'BANK_ONLY':
            unmatchedBankCount++;
            break;
          case 'EXCEPTION':
          case 'ERROR':
            exceptionsCount++;
            break;
          default:
            unmatchedPgCount++;
        }
      });
    }
    
    // Use summary if provided (overrides calculated values)
    if (summary) {
      matchedCount = summary.matchedCount || matchedCount;
      unmatchedPgCount = summary.unmatchedPgCount || unmatchedPgCount;
      unmatchedBankCount = summary.unmatchedBankCount || unmatchedBankCount;
      exceptionsCount = summary.exceptionsCount || exceptionsCount;
      totalTransactions = summary.totalTransactions || totalTransactions;
    }
    
    // Update the store
    reconResultsStore[source] = {
      lastUpdated: new Date().toISOString(),
      jobId,
      totalTransactions,
      matchedCount,
      unmatchedPgCount,
      unmatchedBankCount,
      exceptionsCount,
      hasData: true
    };
    
    console.log(`[Overview API] Updated ${source} store:`, reconResultsStore[source]);
    
    res.json({
      success: true,
      source,
      stored: reconResultsStore[source]
    });
  } catch (error) {
    console.error(`[Overview API] Error storing ${source} results:`, error);
    res.status(500).json({ error: error.message });
  }
});

// New endpoint for reconciliation sources summary
app.get('/api/recon-sources/summary', async (req, res) => {
  const { from, to, merchantId, acquirerId } = req.query;
  
  try {
    const filters = { from, to, merchantId, acquirerId };
    const kpiData = generateKpiData(filters);
    
    // Default demo data for connectors
    let connectorTransactions = Math.floor(kpiData.totalTransactions * 0.7);
    let connectorMatched = Math.floor(kpiData.matchedCount * 0.75);
    let connectorUnmatchedPg = Math.floor(kpiData.unmatchedPgCount * 0.6);
    let connectorUnmatchedBank = Math.floor(kpiData.unmatchedBankCount * 0.6);
    let connectorExceptions = Math.floor(kpiData.exceptionsCount * 0.5);
    
    // Default demo data for manual
    let manualTransactions = kpiData.totalTransactions - connectorTransactions;
    let manualMatched = kpiData.matchedCount - connectorMatched;
    let manualUnmatchedPg = kpiData.unmatchedPgCount - connectorUnmatchedPg;
    let manualUnmatchedBank = kpiData.unmatchedBankCount - connectorUnmatchedBank;
    let manualExceptions = kpiData.exceptionsCount - connectorExceptions;
    
    // Override with actual data if available
    if (reconResultsStore.connectors.hasData) {
      console.log('[Recon Sources API] Using actual connector data');
      connectorTransactions = reconResultsStore.connectors.totalTransactions;
      connectorMatched = reconResultsStore.connectors.matchedCount;
      connectorUnmatchedPg = reconResultsStore.connectors.unmatchedPgCount;
      connectorUnmatchedBank = reconResultsStore.connectors.unmatchedBankCount;
      connectorExceptions = reconResultsStore.connectors.exceptionsCount;
    }
    
    if (reconResultsStore.manual.hasData) {
      console.log('[Recon Sources API] Using actual manual upload data');
      manualTransactions = reconResultsStore.manual.totalTransactions;
      manualMatched = reconResultsStore.manual.matchedCount;
      manualUnmatchedPg = reconResultsStore.manual.unmatchedPgCount;
      manualUnmatchedBank = reconResultsStore.manual.unmatchedBankCount;
      manualExceptions = reconResultsStore.manual.exceptionsCount;
    }
    
    // Calculate overall totals
    const totalTransactions = connectorTransactions + manualTransactions;
    const totalMatched = connectorMatched + manualMatched;
    const totalUnmatchedPg = connectorUnmatchedPg + manualUnmatchedPg;
    const totalUnmatchedBank = connectorUnmatchedBank + manualUnmatchedBank;
    const totalExceptions = connectorExceptions + manualExceptions;
    const matchedPct = totalTransactions > 0 ? Math.round((totalMatched / totalTransactions) * 100) : 0;
    
    const response = {
      timeRange: {
        fromISO: new Date(from).toISOString(),
        toISO: new Date(to).toISOString()
      },
      overall: {
        matchedPct,
        matchedCount: totalMatched,
        unmatchedPgCount: totalUnmatchedPg,
        unmatchedBankCount: totalUnmatchedBank,
        exceptionsCount: totalExceptions,
        totalTransactions
      },
      connectors: {
        totalTransactions: connectorTransactions,
        matchedCount: connectorMatched,
        unmatchedPgCount: connectorUnmatchedPg,
        unmatchedBankCount: connectorUnmatchedBank,
        exceptionsCount: connectorExceptions,
        matchedPct: connectorTransactions > 0 ? Math.round((connectorMatched / connectorTransactions) * 100) : 0,
        lastUpdated: reconResultsStore.connectors.lastUpdated,
        hasActualData: reconResultsStore.connectors.hasData
      },
      manualUpload: {
        totalTransactions: manualTransactions,
        matchedCount: manualMatched,
        unmatchedPgCount: manualUnmatchedPg,
        unmatchedBankCount: manualUnmatchedBank,
        exceptionsCount: manualExceptions,
        matchedPct: manualTransactions > 0 ? Math.round((manualMatched / manualTransactions) * 100) : 0,
        lastUpdated: reconResultsStore.manual.lastUpdated,
        hasActualData: reconResultsStore.manual.hasData
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('[Recon Sources API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Public API endpoint for other services
app.get('/api/overview', async (req, res) => {
  const { from, to, tz = 'Asia/Kolkata' } = req.query;
  
  try {
    // Generate demo data
    const transactions = generateDemoTransactions({ from, to });
    
    let inSettlement = 0;
    let sentToBank = 0;
    let credited = 0;
    let unsettled = 0;
    let capturedValue = 0;
    let creditedValue = 0;

    for (const txn of transactions) {
      const state = determineTransactionState(txn);
      capturedValue += txn.amount;
      
      switch (state) {
        case 'CREDITED':
          credited++;
          creditedValue += txn.amount;
          break;
        case 'SENT_TO_BANK':
          sentToBank++;
          break;
        case 'IN_SETTLEMENT':
          inSettlement++;
          break;
        case 'UNSETTLED':
          unsettled++;
          break;
      }
    }

    const captured = transactions.length;
    
    const result = enforceConsistency({
      captured,
      inSettlement,
      sentToBank,
      credited,
      unsettled,
      capturedValue,
      creditedValue,
    });
    
    res.json(result);
  } catch (error) {
    console.error('[Overview API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
function determineTransactionState(txn) {
  if (txn.creditedAt && txn.utr) return 'CREDITED';
  if (txn.sentToBankAt) return 'SENT_TO_BANK';
  if (txn.reconStatus === 'matched' || txn.reconStatus === 'ok') return 'IN_SETTLEMENT';
  return 'UNSETTLED';
}

function enforceConsistency(counts) {
  const warnings = [];
  
  // Ensure non-negative
  counts.captured = Math.max(0, Math.round(counts.captured));
  counts.inSettlement = Math.max(0, Math.round(counts.inSettlement));
  counts.sentToBank = Math.max(0, Math.round(counts.sentToBank));
  counts.credited = Math.max(0, Math.round(counts.credited));
  counts.unsettled = Math.max(0, Math.round(counts.unsettled));
  
  // Constraint: credited <= sentToBank
  if (counts.credited > counts.sentToBank) {
    warnings.push('Credited count clamped to sent-to-bank for pipeline sanity');
    counts.credited = counts.sentToBank;
  }
  
  // Ensure captured = sum of states
  const stateSum = counts.inSettlement + counts.sentToBank + counts.credited + counts.unsettled;
  
  if (counts.captured !== stateSum) {
    counts.unsettled = Math.max(0, counts.captured - (counts.inSettlement + counts.sentToBank + counts.credited));
    const newSum = counts.inSettlement + counts.sentToBank + counts.credited + counts.unsettled;
    if (counts.captured !== newSum) {
      counts.captured = newSum;
      warnings.push('Captured count adjusted for consistency');
    }
  }
  
  return {
    ...counts,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function generateDemoTransactions(params) {
  const seed = `${params.from}-${params.to}`;
  const baseCount = seed.length * 10;
  const transactions = [];
  const now = new Date();
  
  for (let i = 0; i < baseCount; i++) {
    const dayOffset = i % 7;
    const createdAt = new Date(now);
    createdAt.setDate(createdAt.getDate() - dayOffset);
    
    const txn = {
      id: `TXN${String(i + 1).padStart(6, '0')}`,
      amount: 10000 + (i * 1000),
      createdAt: createdAt.toISOString(),
      reconStatus: i % 10 === 9 ? 'failed' : 'matched',
    };
    
    if (i % 10 < 4) {
      txn.utr = `UTR${String(i + 1).padStart(8, '0')}`;
      txn.creditedAt = createdAt.toISOString();
      txn.sentToBankAt = new Date(createdAt.getTime() - 3600000).toISOString();
    } else if (i % 10 < 6) {
      txn.sentToBankAt = createdAt.toISOString();
    } else if (i % 10 < 8) {
      txn.reconStatus = 'matched';
    } else {
      txn.reconStatus = 'failed';
    }
    
    transactions.push(txn);
  }
  
  return transactions.filter(txn => {
    const txnDate = new Date(txn.createdAt);
    const fromDate = new Date(params.from);
    const toDate = new Date(params.to);
    toDate.setHours(23, 59, 59, 999);
    return txnDate >= fromDate && txnDate <= toDate;
  });
}

// Get consistent overview data
app.get('/api/ops/overview', async (req, res) => {
  const { from, to, tz = 'Asia/Kolkata' } = req.query;
  
  try {
    // Calculate window
    const window = {
      from: from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: to || new Date().toISOString().split('T')[0],
      tz,
      label: calculateWindowLabel(from, to)
    };

    // Fetch reconciliation data
    const reconData = await fetchReconData(window);
    const exceptionData = await fetchExceptionData(window);
    
    // Calculate tiles metrics
    const tiles = calculateTiles(reconData, exceptionData);
    
    // Calculate pipeline with exclusive buckets (pass credited count for consistency)
    const pipeline = calculatePipeline(reconData, tiles.creditedToMerchant.txnCount);
    
    // Calculate by source metrics
    const bySource = calculateBySource(reconData);
    
    // Calculate top exception reasons
    const topReasons = calculateTopReasons(exceptionData, tiles.openExceptions.count);
    
    // Generate warnings
    const warnings = validateConsistency(tiles, pipeline, topReasons);
    
    // Definitions for tooltips
    const definitions = getMetricDefinitions();
    
    const overview = {
      window,
      tiles,
      pipeline: {
        ...pipeline,
        warnings
      },
      bySource,
      topReasons,
      definitions
    };
    
    res.json(overview);
  } catch (error) {
    console.error('[Overview API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
function calculateWindowLabel(from, to) {
  if (!from && !to) return 'Last 7 days';
  
  const start = new Date(from || Date.now() - 7 * 24 * 60 * 60 * 1000);
  const end = new Date(to || Date.now());
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  
  if (days === 1) return 'Today';
  if (days === 7) return 'Last 7 days';
  if (days === 30) return 'Last 30 days';
  return `${days} days`;
}

async function fetchReconData(window) {
  try {
    // Fetch from recon API - using the current date for demo
    const response = await axios.get('http://recon-api:5103/api/reconcile');
    const results = response.data || [];
    
    // Filter by window if results exist
    return results[0] || generateMockReconData(window);
  } catch (error) {
    console.log('[Overview API] Using mock recon data');
    return generateMockReconData(window);
  }
}

async function fetchExceptionData(window) {
  // For now, generate mock exception data
  return generateMockExceptionData(window);
}

function generateMockReconData(window) {
  const totalTransactions = 15430;
  const matched = 12789;
  const unmatchedPG = 1876;
  const unmatchedBank = 765;
  
  return {
    totalPGTransactions: totalTransactions,
    totalBankRecords: totalTransactions - unmatchedPG + unmatchedBank,
    matched: Array(matched).fill(null).map((_, i) => ({
      pgTransaction: {
        transaction_id: `TXN${String(i).padStart(6, '0')}`,
        amount: Math.floor(100000 + Math.random() * 900000)
      },
      confidence: 95 + Math.random() * 5
    })),
    unmatchedPG: Array(unmatchedPG).fill(null).map((_, i) => ({
      transaction_id: `UNMTXN${String(i).padStart(6, '0')}`,
      amount: Math.floor(50000 + Math.random() * 450000),
      reason: ['UTR_NOT_FOUND', 'AMOUNT_MISMATCH', 'DATE_MISMATCH'][i % 3]
    })),
    unmatchedBank: Array(unmatchedBank).fill(null).map((_, i) => ({
      TRANSACTION_ID: `BNKTXN${String(i).padStart(6, '0')}`,
      AMOUNT: Math.floor(75000 + Math.random() * 425000)
    })),
    summary: {
      totalAmount: 1543000000, // 15.43 Cr in paise
      reconciledAmount: 1278900000,
      unreconciledAmount: 264100000,
      matchRate: 82.88
    }
  };
}

function generateMockExceptionData(window) {
  const exceptions = [
    { type: 'MISSING_UTR', severity: 'CRITICAL', count: 5, amount: 2500000 },
    { type: 'DUPLICATE_UTR', severity: 'HIGH', count: 13, amount: 6500000 },
    { type: 'AMOUNT_MISMATCH', severity: 'HIGH', count: 27, amount: 13500000 },
    { type: 'STATUS_MISMATCH', severity: 'MEDIUM', count: 19, amount: 9500000 },
    { type: 'DATE_MISMATCH', severity: 'LOW', count: 8, amount: 4000000 }
  ];
  
  return exceptions.map(ex => ({
    ...ex,
    status: 'open',
    transactions: Array(ex.count).fill(null).map((_, i) => ({
      transaction_id: `EX${ex.type}${i}`,
      amount: Math.floor(ex.amount / ex.count)
    }))
  }));
}

function calculateTiles(reconData, exceptionData) {
  const totalTransactions = reconData.totalPGTransactions;
  const matchedCount = reconData.matched.length;
  const matchRate = totalTransactions > 0 ? (matchedCount / totalTransactions) * 100 : 0;
  
  // Calculate unmatched value
  const unmatchedAmount = reconData.unmatchedPG.reduce((sum, txn) => sum + txn.amount, 0);
  const unmatchedCount = reconData.unmatchedPG.length;
  
  // Calculate open exceptions
  const openExceptions = exceptionData.filter(e => 
    ['open', 'investigating', 'escalated'].includes(e.status)
  );
  const criticalCount = openExceptions.filter(e => e.severity === 'CRITICAL')
    .reduce((sum, e) => sum + e.count, 0);
  const highCount = openExceptions.filter(e => e.severity === 'HIGH')
    .reduce((sum, e) => sum + e.count, 0);
  const totalExceptionCount = openExceptions.reduce((sum, e) => sum + e.count, 0);
  
  // Calculate credited to merchant (simulated)
  const creditedCount = Math.floor(matchedCount * 0.85);
  // Calculate total matched amount from matched transactions
  const totalMatchedAmount = reconData.matched ? 
    reconData.matched.reduce((sum, m) => sum + (m.pgTransaction?.amount || 0), 0) : 0;
  const creditedAmount = Math.floor(totalMatchedAmount * 0.85);
  
  return {
    reconRate: {
      matched: matchedCount,
      total: totalTransactions,
      pct: parseFloat(matchRate.toFixed(2)),
      deltaPct: 2.3 // Mock delta
    },
    unmatchedValue: {
      amount: unmatchedAmount,
      txnCount: unmatchedCount,
      deltaPct: -1.5
    },
    openExceptions: {
      count: totalExceptionCount,
      high: highCount,
      critical: criticalCount,
      deltaPct: -3.2
    },
    creditedToMerchant: {
      amount: creditedAmount,
      txnCount: creditedCount,
      deltaPct: 1.8
    }
  };
}

function calculatePipeline(reconData, creditedTxnCount) {
  const totalCaptured = reconData.totalPGTransactions;
  
  // Generate raw monotonic counts
  const raw = {
    inSettlement: Math.floor(totalCaptured * 0.92),
    sentToBank: Math.floor(totalCaptured * 0.85),
    creditedUtr: creditedTxnCount // Use the actual credited count from tiles
  };
  
  // Sanitize to ensure monotonic order
  const C = Math.min(raw.creditedUtr, raw.sentToBank);
  const B = Math.max(raw.sentToBank, C);
  const I = Math.max(raw.inSettlement, B);
  
  // Calculate exclusive buckets
  const credited = C;
  const sentToBankOnly = Math.max(B - C, 0);
  const inSettlementOnly = Math.max(I - B, 0);
  const unsettled = Math.max(totalCaptured - (credited + sentToBankOnly + inSettlementOnly), 0);
  
  // Verify invariant
  const sum = credited + sentToBankOnly + inSettlementOnly + unsettled;
  if (sum !== totalCaptured) {
    console.warn(`[Overview API] Pipeline sum mismatch: ${sum} != ${totalCaptured}`);
  }
  
  return {
    totalCaptured,
    raw,
    exclusive: {
      inSettlementOnly,
      sentToBankOnly,
      credited,
      unsettled
    }
  };
}

function calculateBySource(reconData) {
  // Simulate source breakdown
  const totalTransactions = reconData.totalPGTransactions;
  const totalMatched = reconData.matched.length;
  
  const manualTotal = Math.floor(totalTransactions * 0.3);
  const manualMatched = Math.floor(totalMatched * 0.28);
  
  const connectorTotal = totalTransactions - manualTotal;
  const connectorMatched = totalMatched - manualMatched;
  
  return {
    manual: {
      matched: manualMatched,
      total: manualTotal,
      pct: manualTotal > 0 ? parseFloat(((manualMatched / manualTotal) * 100).toFixed(2)) : 0
    },
    connector: {
      matched: connectorMatched,
      total: connectorTotal,
      pct: connectorTotal > 0 ? parseFloat(((connectorMatched / connectorTotal) * 100).toFixed(2)) : 0
    }
  };
}

function calculateTopReasons(exceptionData, openExceptionCount) {
  // Priority order for deterministic assignment
  const priorityOrder = [
    'MISSING_UTR',
    'AMOUNT_MISMATCH',
    'DUPLICATE_UTR',
    'STATUS_MISMATCH',
    'DATE_MISMATCH'
  ];
  
  // Group exceptions by type and calculate impacted transactions
  const reasonCounts = {};
  let totalImpacted = 0;
  
  exceptionData.forEach(exception => {
    if (['open', 'investigating', 'escalated'].includes(exception.status)) {
      if (!reasonCounts[exception.type]) {
        reasonCounts[exception.type] = 0;
      }
      reasonCounts[exception.type] += exception.count;
      totalImpacted += exception.count;
    }
  });
  
  // Sort by priority and create rows
  const rows = priorityOrder
    .filter(reason => reasonCounts[reason] > 0)
    .map(reason => ({
      reason: formatReasonText(reason),
      count: reasonCounts[reason],
      pct: parseFloat(((reasonCounts[reason] / totalImpacted) * 100).toFixed(1))
    }));
  
  // Add remainder if needed to match openExceptionCount
  let remainder = openExceptionCount - totalImpacted;
  if (remainder > 0) {
    rows.push({
      reason: 'Other',
      count: remainder,
      pct: parseFloat(((remainder / openExceptionCount) * 100).toFixed(1))
    });
    totalImpacted = openExceptionCount;
  }
  
  return {
    mode: 'impacted',
    rows,
    total: totalImpacted,
    remainder: remainder > 0 ? remainder : undefined
  };
}

function formatReasonText(reason) {
  const reasonMap = {
    'MISSING_UTR': 'UTR Missing',
    'AMOUNT_MISMATCH': 'Amount Mismatch',
    'DUPLICATE_UTR': 'Duplicate UTR',
    'STATUS_MISMATCH': 'Status Mismatch',
    'DATE_MISMATCH': 'Date Mismatch'
  };
  return reasonMap[reason] || reason;
}

function validateConsistency(tiles, pipeline, topReasons) {
  const warnings = [];
  
  // Check pipeline sum invariant
  const sum = pipeline.exclusive.credited + 
              pipeline.exclusive.sentToBankOnly + 
              pipeline.exclusive.inSettlementOnly + 
              pipeline.exclusive.unsettled;
  
  if (sum !== pipeline.totalCaptured) {
    warnings.push({
      code: 'PIPELINE_SUM_MISMATCH',
      message: `Pipeline sum (${sum}) does not equal total captured (${pipeline.totalCaptured})`
    });
  }
  
  // Check credited tile vs pipeline consistency
  if (tiles.creditedToMerchant.txnCount !== pipeline.exclusive.credited) {
    warnings.push({
      code: 'CREDIT_TILE_MISMATCH',
      message: `Credited tile count (${tiles.creditedToMerchant.txnCount}) does not match pipeline credited (${pipeline.exclusive.credited})`
    });
  }
  
  // Check top reasons sum
  if (topReasons.mode === 'impacted' && topReasons.total !== tiles.openExceptions.count) {
    warnings.push({
      code: 'REASONS_SUM_MISMATCH',
      message: `Top reasons total (${topReasons.total}) does not match open exceptions (${tiles.openExceptions.count})`
    });
  }
  
  return warnings;
}

function getMetricDefinitions() {
  return {
    reconRate: 'Percentage of transactions successfully matched between payment gateway and bank records',
    unmatchedValue: 'Total value of transactions that could not be reconciled within the window',
    openExceptions: 'Exceptions requiring manual intervention (open, investigating, or escalated status)',
    creditedToMerchant: 'Confirmed bank credits with UTR posted to merchant accounts',
    inSettlementOnly: 'Transactions initiated for settlement but not yet sent to bank',
    sentToBankOnly: 'Transactions sent to bank but not yet credited',
    credited: 'Transactions successfully credited with confirmed UTR',
    unsettled: 'Transactions not yet in the settlement pipeline'
  };
}

// Disputes and Chargebacks endpoints
app.get('/api/disputes/kpis', async (req, res) => {
  const { from, to, merchantId, acquirerId } = req.query;
  
  try {
    // Generate mock disputes data based on date range
    const dayCount = Math.max(1, Math.floor((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24))) + 1;
    const baseDisputesPerDay = 5;
    const totalDisputes = Math.floor(baseDisputesPerDay * dayCount);
    
    // Distribution of dispute statuses
    const openCount = Math.floor(totalDisputes * 0.25);
    const evidenceRequiredCount = Math.floor(totalDisputes * 0.15);
    const pendingCount = Math.floor(totalDisputes * 0.20);
    const wonCount = Math.floor(totalDisputes * 0.25);
    const lostCount = Math.floor(totalDisputes * 0.15);
    
    // Financial impact (in paise)
    const avgDisputeAmountPaise = 150000; // ₹1,500 average
    const disputedPaise = BigInt(totalDisputes * avgDisputeAmountPaise);
    const recoveredPaise = BigInt(wonCount * avgDisputeAmountPaise);
    const writtenOffPaise = BigInt(lostCount * avgDisputeAmountPaise);
    
    const response = {
      openCount,
      evidenceRequiredCount,
      pendingCount,
      wonCount,
      lostCount,
      disputedPaise: disputedPaise.toString(),
      recoveredPaise: recoveredPaise.toString(),
      writtenOffPaise: writtenOffPaise.toString(),
      totalCount: totalDisputes,
      avgResolutionDays: 12,
      winRatePct: wonCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0
    };
    
    console.log('[Disputes API] KPIs request:', { from, to, merchantId, acquirerId });
    res.json(response);
  } catch (error) {
    console.error('[Disputes API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/disputes/outcome-summary', async (req, res) => {
  const { window, merchantId, acquirerId } = req.query;
  
  try {
    // Calculate based on window (7d, 30d, 90d)
    const days = window === '90d' ? 90 : window === '30d' ? 30 : 7;
    const multiplier = days / 7;
    
    const wonCount = Math.floor(8 * multiplier);
    const lostCount = Math.floor(3 * multiplier);
    const totalResolved = wonCount + lostCount;
    
    const response = {
      wonCount,
      lostCount,
      totalResolved,
      winRatePct: totalResolved > 0 ? Math.round((wonCount / totalResolved) * 100) : 0,
      avgResolutionDays: 12
    };
    
    res.json(response);
  } catch (error) {
    console.error('[Disputes API] Outcome error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/disputes/sla-buckets', async (req, res) => {
  const { from, to, merchantId, acquirerId } = req.query;
  
  try {
    const response = {
      overdue: {
        count: 3,
        amountPaise: '450000'
      },
      today: {
        count: 5,
        amountPaise: '750000'
      },
      twoToThree: {
        count: 8,
        amountPaise: '1200000'
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('[Disputes API] SLA error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chargebacks', async (req, res) => {
  const { status, searchQuery, acquirer, slaBucket, limit = 50 } = req.query;
  
  try {
    // Generate mock chargeback data
    const chargebacks = [];
    const count = parseInt(limit) || 50;
    
    for (let i = 0; i < count; i++) {
      const statuses = status || ['OPEN', 'EVIDENCE_REQUIRED', 'REPRESENTMENT_SUBMITTED', 'PENDING_BANK', 'WON', 'LOST'];
      const randomStatus = Array.isArray(statuses) ? statuses[i % statuses.length] : statuses;
      
      chargebacks.push({
        id: `CB${String(i + 1).padStart(6, '0')}`,
        caseRef: `AXIS-CB-${String(i + 1).padStart(5, '0')}`,
        merchantId: `MERCHANT_${(i % 3) + 1}`,
        merchantName: `Test Merchant ${(i % 3) + 1}`,
        transactionId: `TXN${String(i + 100).padStart(8, '0')}`,
        rrn: `RRN${String(i + 1000).padStart(10, '0')}`,
        amountPaise: BigInt(100000 + (i * 10000)).toString(),
        currency: 'INR',
        status: randomStatus,
        reason: ['Fraud', 'Service not received', 'Product not received', 'Duplicate charge'][i % 4],
        acquirer: acquirer || 'AXIS',
        evidenceDueDate: new Date(Date.now() + (3 - (i % 5)) * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - i * 12 * 60 * 60 * 1000).toISOString()
      });
    }
    
    const response = {
      chargebacks,
      pagination: {
        total: chargebacks.length,
        limit: parseInt(limit),
        offset: 0
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('[Chargebacks API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chargebacks/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const detail = {
      id,
      caseRef: `AXIS-CB-${id}`,
      merchantId: 'MERCHANT_001',
      merchantName: 'Test Merchant 1',
      transactionId: 'TXN00012345',
      rrn: 'RRN1234567890',
      utr: 'UTR987654321',
      amountPaise: '150000',
      currency: 'INR',
      status: 'EVIDENCE_REQUIRED',
      reason: 'Fraud - Card not present',
      reasonCode: 'F29',
      acquirer: 'AXIS',
      issuer: 'HDFC Bank',
      cardMask: '4111********1111',
      evidenceDueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      representmentDueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      owner: 'ops@settlepaisa.com',
      evidence: [
        {
          id: 'EV001',
          type: 'RECEIPT',
          filename: 'transaction_receipt.pdf',
          uploadedBy: 'merchant@test.com',
          uploadedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          size: 245678
        }
      ],
      timeline: [
        {
          id: 'TL001',
          action: 'DISPUTE_RAISED',
          actorEmail: 'system',
          ts: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          payload: { reason: 'Fraud' }
        },
        {
          id: 'TL002',
          action: 'ASSIGNED_TO_OPS',
          actorEmail: 'system',
          ts: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
          payload: { assignee: 'ops@settlepaisa.com' }
        }
      ],
      allocations: [
        {
          id: 'ALLOC001',
          type: 'RESERVE_HOLD',
          amountPaise: '150000',
          journalEntryId: 'JE123456',
          settlementId: null,
          createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
        }
      ],
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    res.json(detail);
  } catch (error) {
    console.error('[Chargeback Detail API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Load mock data if available
const fs = require('fs');
const path = require('path');

let mockTransactions = [];
let mockSettlements = [];
let mockReconciliations = [];

// Load mock data from files
try {
  const dataDir = path.join(__dirname, '../../mock-data');
  if (fs.existsSync(dataDir)) {
    mockTransactions = JSON.parse(fs.readFileSync(path.join(dataDir, 'transactions.json'), 'utf-8'));
    mockSettlements = JSON.parse(fs.readFileSync(path.join(dataDir, 'settlements.json'), 'utf-8'));
    mockReconciliations = JSON.parse(fs.readFileSync(path.join(dataDir, 'reconciliations.json'), 'utf-8'));
    console.log(`[Overview API] Loaded mock data: ${mockTransactions.length} transactions, ${mockSettlements.length} settlements`);
  }
} catch (err) {
  console.log('[Overview API] Mock data not found, using generated data');
}

// Helper to filter data by date range and other params
function filterTransactions(transactions, from, to, merchantId, acquirerId, mode) {
  return transactions.filter(t => {
    const txnDate = new Date(t.txn_date);
    const fromDate = new Date(from);
    const toDate = new Date(to);
    
    return txnDate >= fromDate && 
           txnDate <= toDate &&
           (!merchantId || t.merchant_id === merchantId) &&
           (!acquirerId || t.acquirer_id === acquirerId) &&
           (!mode || t.payment_mode === mode);
  });
}

function filterSettlements(settlements, from, to, merchantId, acquirerId, mode) {
  return settlements.filter(s => {
    const settleDate = new Date(s.settlement_date);
    const fromDate = new Date(from);
    const toDate = new Date(to);
    
    // Find corresponding transaction for filtering
    const txn = mockTransactions.find(t => t.id === s.txn_id);
    
    return settleDate >= fromDate && 
           settleDate <= toDate &&
           txn &&
           (!merchantId || txn.merchant_id === merchantId) &&
           (!acquirerId || txn.acquirer_id === acquirerId) &&
           (!mode || txn.payment_mode === mode);
  });
}

// ===== Analytics Mode Distribution =====
app.get('/api/analytics/mode-distribution', async (req, res) => {
  const { from, to, merchantId, acquirerId } = req.query;
  
  try {
    console.log(`[Analytics Mode Distribution] Request: from=${from}, to=${to}`);
    
    // Filter transactions by date range and other params
    const filtered = filterTransactions(mockTransactions, from, to, merchantId, acquirerId);
    const filteredSettlements = filterSettlements(mockSettlements, from, to);
    
    // Build mode distribution
    const modeStats = {};
    filtered.forEach(txn => {
      const mode = txn.payment_mode;
      if (!modeStats[mode]) {
        modeStats[mode] = {
          mode,
          capturedCount: 0,
          capturedAmount: BigInt(0),
          settledCount: 0,
          settledAmount: BigInt(0)
        };
      }
      
      // Captured transaction
      modeStats[mode].capturedCount++;
      modeStats[mode].capturedAmount += BigInt(txn.amount_paise);
      
      // Check if settled
      const isSettled = filteredSettlements.some(s => s.txn_id === txn.id);
      if (isSettled) {
        modeStats[mode].settledCount++;
        modeStats[mode].settledAmount += BigInt(txn.amount_paise);
      }
    });
    
    // Convert to array and calculate percentages
    const distribution = Object.values(modeStats).map(m => ({
      mode: m.mode,
      captured: {
        count: m.capturedCount,
        amountPaise: m.capturedAmount.toString(),
        share: filtered.length ? parseFloat((m.capturedCount / filtered.length * 100).toFixed(1)) : 0
      },
      settled: {
        count: m.settledCount,
        amountPaise: m.settledAmount.toString(),
        share: filteredSettlements.length ? parseFloat((m.settledCount / filteredSettlements.length * 100).toFixed(1)) : 0
      },
      settlementRate: m.capturedCount ? parseFloat((m.settledCount / m.capturedCount * 100).toFixed(1)) : 0
    }));
    
    res.json({
      distribution,
      totalCaptured: filtered.length,
      totalSettled: filteredSettlements.length
    });
  } catch (error) {
    console.error('[Analytics Mode Distribution] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Analytics GMV Trend =====
app.get('/api/analytics/gmv-trend', async (req, res) => {
  const { from, to, merchantId, acquirerId, mode } = req.query;
  
  try {
    console.log(`[Analytics GMV Trend] Request: from=${from}, to=${to}, mode=${mode}`);
    
    // Filter transactions
    const filtered = filterTransactions(mockTransactions, from, to, merchantId, acquirerId, mode);
    const filteredSettlements = filterSettlements(mockSettlements, from, to);
    
    // Group by date
    const dailyStats = {};
    filtered.forEach(txn => {
      const date = txn.txn_date;
      if (!dailyStats[date]) {
        dailyStats[date] = {
          date,
          capturedCount: 0,
          capturedAmount: BigInt(0),
          settledCount: 0,
          settledAmount: BigInt(0)
        };
      }
      
      dailyStats[date].capturedCount++;
      dailyStats[date].capturedAmount += BigInt(txn.amount_paise);
      
      // Check if settled
      const isSettled = filteredSettlements.some(s => s.txn_id === txn.id);
      if (isSettled) {
        dailyStats[date].settledCount++;
        dailyStats[date].settledAmount += BigInt(txn.amount_paise);
      }
    });
    
    // Convert to sorted array
    const trend = Object.values(dailyStats)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        date: d.date,
        captured: {
          count: d.capturedCount,
          amountPaise: d.capturedAmount.toString()
        },
        settled: {
          count: d.settledCount,
          amountPaise: d.settledAmount.toString()
        },
        settlementRate: d.capturedCount ? parseFloat((d.settledCount / d.capturedCount * 100).toFixed(1)) : 0
      }));
    
    res.json({ trend });
  } catch (error) {
    console.error('[Analytics GMV Trend] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Analytics Settlement Funnel =====
app.get('/api/analytics/settlement-funnel', async (req, res) => {
  const { from, to, merchantId, acquirerId, mode } = req.query;
  
  try {
    console.log(`[Analytics Settlement Funnel] Request: from=${from}, to=${to}, mode=${mode}`);
    
    // Filter data
    const txns = filterTransactions(mockTransactions, from, to, merchantId, acquirerId, mode);
    const settlements = filterSettlements(mockSettlements, from, to);
    const recons = mockReconciliations.filter(r => {
      if (!r.cycle_date) return false;
      if (from && r.cycle_date < from) return false;
      if (to && r.cycle_date > to) return false;
      return true;
    });
    
    // Build funnel stages
    const captured = txns.length;
    const capturedAmount = txns.reduce((sum, t) => sum + BigInt(t.amount_paise), BigInt(0));
    
    // Reconciled (has a recon result)
    const reconciledTxns = txns.filter(t => recons.some(r => r.txn_id === t.id));
    const reconciled = reconciledTxns.length;
    const reconciledAmount = reconciledTxns.reduce((sum, t) => sum + BigInt(t.amount_paise), BigInt(0));
    
    // Matched (recon status = MATCHED)
    const matchedTxns = txns.filter(t => recons.some(r => r.txn_id === t.id && r.status === 'MATCHED'));
    const matched = matchedTxns.length;
    const matchedAmount = matchedTxns.reduce((sum, t) => sum + BigInt(t.amount_paise), BigInt(0));
    
    // Settled
    const settledTxns = txns.filter(t => settlements.some(s => s.txn_id === t.id));
    const settled = settledTxns.length;
    const settledAmount = settledTxns.reduce((sum, t) => sum + BigInt(t.amount_paise), BigInt(0));
    
    const funnel = {
      stages: [
        {
          name: 'Captured',
          count: captured,
          amountPaise: capturedAmount.toString(),
          percentage: 100
        },
        {
          name: 'Reconciled',
          count: reconciled,
          amountPaise: reconciledAmount.toString(),
          percentage: captured ? parseFloat((reconciled / captured * 100).toFixed(1)) : 0
        },
        {
          name: 'Matched',
          count: matched,
          amountPaise: matchedAmount.toString(),
          percentage: captured ? parseFloat((matched / captured * 100).toFixed(1)) : 0
        },
        {
          name: 'Settled',
          count: settled,
          amountPaise: settledAmount.toString(),
          percentage: captured ? parseFloat((settled / captured * 100).toFixed(1)) : 0
        }
      ],
      reconStatuses: {
        MATCHED: recons.filter(r => r.status === 'MATCHED').length,
        UNMATCHED_PG: recons.filter(r => r.status === 'UNMATCHED_PG').length,
        UNMATCHED_BANK: recons.filter(r => r.status === 'UNMATCHED_BANK').length,
        EXCEPTION: recons.filter(r => r.status === 'EXCEPTION').length
      }
    };
    
    res.json(funnel);
  } catch (error) {
    console.error('[Analytics Settlement Funnel] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Register new analytics endpoints =====
createModeStackedEndpoint(app, mockTransactions, mockSettlements, filterTransactions, filterSettlements);
createGmvTrendV2Endpoint(app, mockTransactions, mockSettlements, filterTransactions, filterSettlements);
createParetoEndpoint(app, mockTransactions, mockSettlements, mockReconciliations, filterTransactions, filterSettlements);
createKpisV2WithDeltasEndpoint(app, mockTransactions, mockSettlements, filterTransactions, filterSettlements);

// ===== Register V3 Analytics endpoints =====
// Create mock data stores for the V3 endpoints
const pgDB = {
  data: {
    transactions: {}
  }
};

const bankDB = {
  data: {
    settlements: {}
  }
};

const funnelDB = {
  data: {
    stages: {}
  }
};

// Generate mock transactions for V3 endpoints
function generateMockTransactionsV3() {
  const transactions = {};
  const modes = ['UPI', 'CARD', 'NETBANKING', 'WALLET', 'QR'];
  const acquirers = ['HDFC', 'ICICI', 'AXIS', 'SBI', 'KOTAK'];
  const now = new Date();
  
  for (let i = 0; i < 5000; i++) {
    const id = `TXN${String(i + 1).padStart(8, '0')}`;
    const dayOffset = Math.floor(Math.random() * 30);
    const createdAt = new Date(now);
    createdAt.setDate(createdAt.getDate() - dayOffset);
    
    const status = Math.random() < 0.88 ? 'SETTLED' : 'UNSETTLED';
    
    transactions[id] = {
      id,
      amount_paise: Math.floor(10000 + Math.random() * 990000),
      payment_mode: modes[Math.floor(Math.random() * modes.length)],
      acquirer_id: acquirers[Math.floor(Math.random() * acquirers.length)],
      status,
      created_at: createdAt.toISOString(),
      settled_at: status === 'SETTLED' ? new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString() : null
    };
  }
  
  return transactions;
}

// Initialize mock data
pgDB.data.transactions = generateMockTransactionsV3();

// Register the V3 analytics endpoints
registerAnalyticsV3Endpoints(app, { pgDB, bankDB, funnelDB });

// ===== Analytics Failure Reasons =====
app.get('/api/analytics/failure-reasons', async (req, res) => {
  const { from, to, merchantId, acquirerId, mode } = req.query;
  
  try {
    console.log(`[Analytics Failure Reasons] Request: from=${from}, to=${to}`);
    
    // Filter transactions and get unsettled ones
    const txns = filterTransactions(mockTransactions, from, to, merchantId, acquirerId, mode);
    const settlements = filterSettlements(mockSettlements, from, to);
    const recons = mockReconciliations.filter(r => {
      if (!r.cycle_date) return false;
      if (from && r.cycle_date < from) return false;
      if (to && r.cycle_date > to) return false;
      return true;
    });
    
    // Get unsettled transactions
    const unsettledTxns = txns.filter(t => !settlements.some(s => s.txn_id === t.id));
    const unsettledCount = unsettledTxns.length;
    
    // Categorize failure reasons based on reconciliation status
    const reasons = {
      'Technical Decline': 0,
      'Insufficient Balance': 0,
      'Bank Processing Delay': 0,
      'Missing UTR': 0,
      'Amount Mismatch': 0,
      'File Missing': 0,
      'Network Timeout': 0,
      'Other': 0
    };
    
    unsettledTxns.forEach(txn => {
      const recon = recons.find(r => r.txn_id === txn.id);
      
      if (recon) {
        // Map reconciliation status/reason to failure category
        if (recon.status === 'UNMATCHED_PG') {
          reasons['Technical Decline']++;
        } else if (recon.status === 'UNMATCHED_BANK') {
          reasons['Bank Processing Delay']++;
        } else if (recon.status === 'EXCEPTION') {
          // Map specific exception reasons
          if (recon.reason_code === 'MISSING_UTR') {
            reasons['Missing UTR']++;
          } else if (recon.reason_code === 'AMOUNT_MISMATCH') {
            reasons['Amount Mismatch']++;
          } else if (recon.reason_code === 'BANK_DELAY') {
            reasons['Bank Processing Delay']++;
          } else if (recon.reason_code === 'FILE_MISSING') {
            reasons['File Missing']++;
          } else {
            reasons['Other']++;
          }
        } else {
          reasons['Other']++;
        }
      } else {
        // No reconciliation record - likely technical issue
        if (Math.random() < 0.4) {
          reasons['Technical Decline']++;
        } else if (Math.random() < 0.7) {
          reasons['Insufficient Balance']++;
        } else if (Math.random() < 0.9) {
          reasons['Network Timeout']++;
        } else {
          reasons['Other']++;
        }
      }
    });
    
    // Convert to array format with percentages
    const reasonsArray = Object.entries(reasons)
      .filter(([_, count]) => count > 0)
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: unsettledCount > 0 ? parseFloat((count / unsettledCount * 100).toFixed(1)) : 0,
        impactPaise: Math.round(count * 15000 * 100).toString() // Estimated avg impact
      }))
      .sort((a, b) => b.count - a.count);
    
    res.json({
      reasons: reasonsArray,
      totalUnsettled: unsettledCount,
      totalImpactPaise: reasonsArray.reduce((sum, r) => sum + BigInt(r.impactPaise), BigInt(0)).toString()
    });
  } catch (error) {
    console.error('[Analytics Failure Reasons] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Analytics KPIs V2 =====
app.get('/api/analytics/kpis-v2', async (req, res) => {
  const { from, to, merchantId, acquirerId, mode } = req.query;
  
  try {
    console.log(`[Analytics KPIs V2] Request: from=${from}, to=${to}, merchantId=${merchantId}, acquirerId=${acquirerId}, mode=${mode}`);
    
    // Use mock data if available
    if (mockTransactions.length > 0) {
      const capturedTxns = filterTransactions(mockTransactions, from, to, merchantId, acquirerId, mode);
      const settledTxns = filterSettlements(mockSettlements, from, to, merchantId, acquirerId, mode);
      
      const capturedCount = capturedTxns.length;
      const settledCount = settledTxns.length;
      const unsettledCount = Math.max(0, capturedCount - settledCount);
      
      const capturedAmount = capturedTxns.reduce((sum, t) => sum + BigInt(t.amount_paise), 0n);
      const settledAmount = settledTxns.reduce((sum, s) => sum + BigInt(s.amount_paise), 0n);
      const unsettledAmount = capturedAmount - settledAmount;
      
      const settlementSrPct = capturedCount > 0 
        ? parseFloat(((settledCount / capturedCount) * 100).toFixed(1))
        : 0;
      
      return res.json({
        settled: {
          count: settledCount,
          amountPaise: settledAmount.toString()
        },
        unsettled: {
          count: unsettledCount,
          amountPaise: unsettledAmount.toString()
        },
        settlementSrPct,
        captured: {
          count: capturedCount,
          amountPaise: capturedAmount.toString()
        }
      });
    }
    
    // Fallback to generated data
    const dayCount = Math.max(1, Math.floor((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24))) + 1;
    const baseTransactionsPerDay = 200;
    const totalCaptured = Math.floor(baseTransactionsPerDay * dayCount);
    
    const settlementRate = 0.88 + (Math.random() * 0.07);
    const settledCount = Math.floor(totalCaptured * settlementRate);
    const unsettledCount = totalCaptured - settledCount;
    
    const avgAmountPaise = 35000;
    const capturedAmountPaise = BigInt(totalCaptured * avgAmountPaise);
    const settledAmountPaise = BigInt(settledCount * avgAmountPaise);
    const unsettledAmountPaise = capturedAmountPaise - settledAmountPaise;
    
    const settlementSrPct = totalCaptured > 0 ? parseFloat(((settledCount / totalCaptured) * 100).toFixed(1)) : 0;
    
    res.json({
      settled: {
        count: settledCount,
        amountPaise: settledAmountPaise.toString()
      },
      unsettled: {
        count: unsettledCount,
        amountPaise: unsettledAmountPaise.toString()
      },
      settlementSrPct,
      captured: {
        count: totalCaptured,
        amountPaise: capturedAmountPaise.toString()
      }
    });
  } catch (error) {
    console.error('[Analytics KPIs V2] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Reconciliation Results Endpoints =====
// Endpoint to receive reconciliation results from Manual Upload
app.post('/api/recon-results/manual', async (req, res) => {
  const { jobId, results, summary, timestamp } = req.body;
  
  try {
    console.log(`[Manual Upload] Received recon results for job ${jobId}`);
    
    // Update the reconResultsStore with the summary data
    if (summary) {
      reconResultsStore.manual = {
        lastUpdated: new Date().toISOString(),
        jobId,
        totalTransactions: summary.totalTransactions || 0,
        matchedCount: summary.matchedCount || 0,
        unmatchedPgCount: summary.unmatchedPgCount || 0,
        unmatchedBankCount: summary.unmatchedBankCount || 0,
        exceptionsCount: summary.exceptionsCount || 0,
        hasData: true
      };
      
      console.log(`[Manual Upload] Updated store:`, reconResultsStore.manual);
    }
    
    res.json({
      success: true,
      message: 'Manual upload reconciliation results received',
      jobId,
      stored: reconResultsStore.manual
    });
  } catch (error) {
    console.error('[Manual Upload] Error processing results:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Endpoint to receive reconciliation results from Connectors
app.post('/api/recon-results/connectors', async (req, res) => {
  const { jobId, results, summary, connector, timestamp } = req.body;
  
  try {
    console.log(`[Connectors] Received recon results for job ${jobId} from connector ${connector}`);
    
    // Update the reconResultsStore with the summary data
    if (summary) {
      reconResultsStore.connectors = {
        lastUpdated: new Date().toISOString(),
        jobId,
        totalTransactions: summary.totalTransactions || 0,
        matchedCount: summary.matchedCount || 0,
        unmatchedPgCount: summary.unmatchedPgCount || 0,
        unmatchedBankCount: summary.unmatchedBankCount || 0,
        exceptionsCount: summary.exceptionsCount || 0,
        hasData: true
      };
      
      console.log(`[Connectors] Updated store:`, reconResultsStore.connectors);
    }
    
    res.json({
      success: true,
      message: 'Connector reconciliation results received',
      jobId,
      connector,
      stored: reconResultsStore.connectors
    });
  } catch (error) {
    console.error('[Connectors] Error processing results:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'overview-api',
    port: PORT
  });
});

app.listen(PORT, () => {
  console.log(`[Overview API] Server running on port ${PORT}`);
});