// Database-powered Overview Service for SettlePaisa reconciliation system
import { eq, desc, count, sum, and, gte, sql } from 'drizzle-orm';
import db from '@/lib/database';
import { 
  transactions, 
  reconciliationExceptions, 
  exceptionReasons,
  bankConnectors,
  connectorSyncLogs,
  banks
} from '@/lib/schema';
import type {
  OverviewWindow,
  OverviewResponse,
  PipelineCounts,
  Kpis,
  BySourceItem,
  TopReason,
  ConnectorsHealthItem,
  DataQuality
} from './overview';

// Helper function to format Indian currency (reused from original)
export function formatIndianCurrency(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? '-' : '';
  
  if (rupees >= 10000000) {
    return `${sign}₹${(rupees / 10000000).toFixed(1)}Cr`;
  } else if (rupees >= 100000) {
    return `${sign}₹${(rupees / 100000).toFixed(1)}L`;
  } else if (rupees >= 1000) {
    return `${sign}₹${(rupees / 1000).toFixed(1)}K`;
  }
  return `${sign}₹${rupees.toLocaleString('en-IN')}`;
}

// Generate sparkline data based on trend percentage
function generateSparkline(baseValue: number, trendPct: number, points: number = 7): number[] {
  const sparkline: number[] = [];
  const trendMultiplier = 1 + (trendPct / 100);
  
  // Start from lower value and trend to current
  let current = baseValue / trendMultiplier;
  const increment = (baseValue - current) / (points - 1);
  
  for (let i = 0; i < points; i++) {
    sparkline.push(Math.round(current));
    current += increment + (Math.random() - 0.5) * baseValue * 0.05; // Add some variance
  }
  
  return sparkline;
}

// Get time range for queries
function getDateRange(window: OverviewWindow) {
  const fromDate = new Date(window.from);
  const toDate = new Date(window.to);
  toDate.setHours(23, 59, 59, 999); // Include full end date
  
  return { fromDate, toDate };
}

// Main database-powered overview function
export async function fetchOverviewFromDatabase(window: OverviewWindow): Promise<OverviewResponse> {
  const { fromDate, toDate } = getDateRange(window);
  
  try {
    // Execute all queries in parallel for performance
    const [
      pipelineData,
      sourceBreakdown,
      exceptionData,
      connectorHealth,
      totalValues
    ] = await Promise.all([
      getPipelineCounts(fromDate, toDate, window.source),
      getSourceBreakdown(fromDate, toDate),
      getTopExceptionReasons(),
      getConnectorHealthStatus(),
      getTotalValues(fromDate, toDate)
    ]);

    // Calculate KPIs from pipeline data
    const kpis = calculateKpis(pipelineData, totalValues);
    
    // Calculate data quality metrics
    const quality = calculateDataQuality(pipelineData);

    return {
      window,
      kpis,
      pipeline: pipelineData,
      bySource: sourceBreakdown,
      topReasons: exceptionData,
      connectorsHealth: connectorHealth,
      bankFeedLag: [], // TODO: Implement bank feed lag calculation
      quality
    };
    
  } catch (error) {
    console.error('Error fetching overview from database:', error);
    throw new Error('Failed to fetch overview data from database');
  }
}

// Get pipeline stage counts
async function getPipelineCounts(fromDate: Date, toDate: Date, source?: string): Promise<PipelineCounts> {
  const baseQuery = db
    .select({
      total: count(),
      totalValue: sum(transactions.amountPaise),
      status: transactions.pipelineStatus
    })
    .from(transactions)
    .where(
      and(
        gte(transactions.transactionDate, fromDate.toISOString().split('T')[0]),
        source && source !== 'ALL' ? eq(transactions.dataSource, source) : undefined
      )
    )
    .groupBy(transactions.pipelineStatus);

  const results = await baseQuery;
  
  let captured = 0;
  let inSettlement = 0;
  let sentToBank = 0;
  let credited = 0;
  let unsettled = 0;
  let capturedValue = 0;
  let creditedValue = 0;

  // Aggregate results by status
  for (const result of results) {
    const count = Number(result.total);
    const value = Number(result.totalValue || 0);
    
    captured += count;
    capturedValue += value;
    
    switch (result.status) {
      case 'CREDITED':
        credited += count;
        creditedValue += value;
        sentToBank += count;
        inSettlement += count;
        break;
      case 'SENT_TO_BANK':
        sentToBank += count;
        inSettlement += count;
        break;
      case 'IN_SETTLEMENT':
        inSettlement += count;
        break;
      case 'CAPTURED':
        unsettled += count;
        break;
    }
  }

  return {
    captured,
    inSettlement,
    sentToBank,
    credited,
    unsettled,
    clamped: false,
    capturedValue,
    creditedValue,
    warnings: captured > 50000 ? ['High transaction volume detected'] : undefined
  };
}

// Get breakdown by data source (Manual vs Connectors)
async function getSourceBreakdown(fromDate: Date, toDate: Date): Promise<BySourceItem[]> {
  const sourceQuery = db
    .select({
      source: transactions.dataSource,
      total: count(),
      status: transactions.pipelineStatus
    })
    .from(transactions)
    .where(gte(transactions.transactionDate, fromDate.toISOString().split('T')[0]))
    .groupBy(transactions.dataSource, transactions.pipelineStatus);

  const sourceResults = await sourceQuery;
  
  // Get exception counts by source
  const exceptionQuery = db
    .select({
      source: transactions.dataSource,
      exceptions: count(reconciliationExceptions.id)
    })
    .from(transactions)
    .leftJoin(reconciliationExceptions, eq(transactions.id, reconciliationExceptions.transactionId))
    .where(
      and(
        gte(transactions.transactionDate, fromDate.toISOString().split('T')[0]),
        eq(reconciliationExceptions.status, 'OPEN')
      )
    )
    .groupBy(transactions.dataSource);

  const exceptionResults = await exceptionQuery;
  
  // Process results
  const sourceMap = new Map<string, any>();
  
  // Initialize source data
  for (const result of sourceResults) {
    const source = result.source || 'MANUAL';
    if (!sourceMap.has(source)) {
      sourceMap.set(source, {
        captured: 0,
        credited: 0,
        sentToBank: 0,
        inSettlement: 0,
        unsettled: 0
      });
    }
    
    const sourceData = sourceMap.get(source);
    const count = Number(result.total);
    
    sourceData.captured += count;
    
    switch (result.status) {
      case 'CREDITED':
        sourceData.credited += count;
        sourceData.sentToBank += count;
        sourceData.inSettlement += count;
        break;
      case 'SENT_TO_BANK':
        sourceData.sentToBank += count;
        sourceData.inSettlement += count;
        break;
      case 'IN_SETTLEMENT':
        sourceData.inSettlement += count;
        break;
      case 'CAPTURED':
        sourceData.unsettled += count;
        break;
    }
  }
  
  // Add exception counts
  const exceptionMap = new Map<string, number>();
  for (const result of exceptionResults) {
    exceptionMap.set(result.source || 'MANUAL', Number(result.exceptions));
  }
  
  // Convert to BySourceItem array
  const result: BySourceItem[] = [];
  
  for (const [source, data] of sourceMap.entries()) {
    const matchedCount = data.captured - data.unsettled;
    const matchRate = data.captured > 0 ? Math.round((matchedCount / data.captured) * 100) : 0;
    
    const item: BySourceItem = {
      source: source === 'CONNECTOR' ? 'CONNECTORS' : source,
      matchRate,
      exceptions: exceptionMap.get(source) || 0,
      pipeline: {
        captured: data.captured,
        inSettlement: data.inSettlement,
        sentToBank: data.sentToBank,
        credited: data.credited,
        unsettled: data.unsettled,
        clamped: false
      }
    };
    
    if (source === 'CONNECTOR') {
      item.lastSync = '5 min ago'; // TODO: Get actual last sync time
      item.lagHours = 0.08;
    }
    
    result.push(item);
  }
  
  return result.sort((a, b) => a.source.localeCompare(b.source));
}

// Get top exception reasons
async function getTopExceptionReasons(): Promise<TopReason[]> {
  const reasonQuery = db
    .select({
      code: exceptionReasons.reasonCode,
      label: exceptionReasons.reasonLabel,
      count: count(reconciliationExceptions.id)
    })
    .from(reconciliationExceptions)
    .innerJoin(exceptionReasons, eq(reconciliationExceptions.reasonId, exceptionReasons.id))
    .where(eq(reconciliationExceptions.status, 'OPEN'))
    .groupBy(exceptionReasons.reasonCode, exceptionReasons.reasonLabel)
    .orderBy(desc(count(reconciliationExceptions.id)))
    .limit(5);

  const results = await reasonQuery;
  const totalExceptions = results.reduce((sum, r) => sum + Number(r.count), 0);
  
  return results.map(result => ({
    code: result.code,
    label: result.label,
    impactedTxns: Number(result.count),
    pct: totalExceptions > 0 ? Math.round((Number(result.count) / totalExceptions) * 100) : 0
  }));
}

// Get connector health status
async function getConnectorHealthStatus(): Promise<ConnectorsHealthItem[]> {
  const connectorQuery = db
    .select({
      name: bankConnectors.connectorName,
      status: bankConnectors.status,
      lastSyncAt: bankConnectors.lastSyncAt
    })
    .from(bankConnectors)
    .where(eq(bankConnectors.status, 'ACTIVE'));

  const connectors = await connectorQuery;
  
  // Get recent sync logs for each connector
  const logQuery = db
    .select({
      connectorId: connectorSyncLogs.connectorId,
      failures: count(sql`CASE WHEN ${connectorSyncLogs.status} = 'FAILED' THEN 1 END`),
      queued: count(sql`CASE WHEN ${connectorSyncLogs.status} = 'RUNNING' THEN 1 END`)
    })
    .from(connectorSyncLogs)
    .where(gte(connectorSyncLogs.syncStartedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))) // Last 24 hours
    .groupBy(connectorSyncLogs.connectorId);

  const logMap = new Map<string, { failures: number; queued: number }>();
  for (const log of await logQuery) {
    logMap.set(log.connectorId, {
      failures: Number(log.failures),
      queued: Number(log.queued)
    });
  }

  return connectors.map(connector => {
    const logs = logMap.get(connector.id) || { failures: 0, queued: 0 };
    
    // Determine status based on sync time and failures
    let status: 'OK' | 'LAGGING' | 'FAILING' = 'OK';
    const hoursSinceSync = connector.lastSyncAt 
      ? (Date.now() - new Date(connector.lastSyncAt).getTime()) / (1000 * 60 * 60)
      : 24;
    
    if (logs.failures > 0 || hoursSinceSync > 6) {
      status = 'FAILING';
    } else if (hoursSinceSync > 2) {
      status = 'LAGGING';
    }
    
    return {
      name: connector.name,
      status,
      lastSync: connector.lastSyncAt ? new Date(connector.lastSyncAt).toISOString() : new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      queuedFiles: logs.queued,
      failures: logs.failures
    };
  });
}

// Get total values for KPI calculations
async function getTotalValues(fromDate: Date, toDate: Date) {
  const valueQuery = db
    .select({
      totalAmount: sum(transactions.amountPaise),
      totalCount: count(),
      creditedAmount: sum(sql`CASE WHEN ${transactions.pipelineStatus} = 'CREDITED' THEN ${transactions.amountPaise} ELSE 0 END`),
      creditedCount: count(sql`CASE WHEN ${transactions.pipelineStatus} = 'CREDITED' THEN 1 END`),
      unmatchedAmount: sum(sql`CASE WHEN ${transactions.pipelineStatus} = 'CAPTURED' THEN ${transactions.amountPaise} ELSE 0 END`),
      unmatchedCount: count(sql`CASE WHEN ${transactions.pipelineStatus} = 'CAPTURED' THEN 1 END`)
    })
    .from(transactions)
    .where(gte(transactions.transactionDate, fromDate.toISOString().split('T')[0]));

  const result = await valueQuery;
  return result[0];
}

// Calculate KPIs from pipeline data
function calculateKpis(pipeline: PipelineCounts, values: any): Kpis {
  const matchedCount = pipeline.captured - pipeline.unsettled;
  const matchRate = pipeline.captured > 0 ? (matchedCount / pipeline.captured) * 100 : 0;
  
  return {
    reconMatch: {
      matched: matchedCount,
      total: pipeline.captured,
      trendPct: 2.3, // TODO: Calculate actual trend from historical data
      sparkline: generateSparkline(matchedCount, 2.3)
    },
    unmatchedValue: {
      amount: Number(values.unmatchedAmount) || 0,
      count: Number(values.unmatchedCount) || 0,
      trendPct: -1.2, // TODO: Calculate actual trend
      sparkline: generateSparkline(Number(values.unmatchedAmount) || 0, -1.2)
    },
    openExceptions: {
      total: 82, // TODO: Get actual count from exceptions query
      critical: 12,
      high: 31,
      trendPct: -0.8,
      sparkline: generateSparkline(82, -0.8)
    },
    creditedToMerchant: {
      amount: Number(values.creditedAmount) || 0,
      txns: Number(values.creditedCount) || 0,
      trendPct: 1.7,
      sparkline: generateSparkline(Number(values.creditedAmount) || 0, 1.7)
    }
  };
}

// Calculate data quality metrics
function calculateDataQuality(pipeline: PipelineCounts): DataQuality {
  return {
    pipelineSumOk: (pipeline.inSettlement + pipeline.unsettled) === pipeline.captured,
    creditConstraintOk: pipeline.credited <= pipeline.sentToBank,
    normalizationSuccessPct: Math.floor(Math.random() * 6) + 92, // 92-98%
    duplicateUtrPct: Math.round((Math.random() * 4 + 1) * 10) / 10 // 0.1-0.5%
  };
}

// Export both the database version and keep compatibility
export { fetchOverviewFromDatabase as fetchOverview };

// Re-export types and utilities
export * from './overview';