import { useQuery } from '@tanstack/react-query';

// Type definitions matching backend contract
export interface KpiFilters {
  from: string;
  to: string;
  merchantId?: string;
  acquirerId?: string;
}

export interface Kpis {
  timeRange: {
    fromISO: string;
    toISO: string;
  };
  totals: {
    transactionsCount: number;
    totalAmountPaise: string; // BigInt serialized
    reconciledAmountPaise: string;
    variancePaise: string; // total - reconciled
  };
  recon: {
    matchRatePct: number; // 0-100
    matchedCount: number;
    unmatchedPgCount: number;
    unmatchedBankCount: number;
    exceptionsCount: number; // sum of exception buckets
  };
  settlements?: {
    batchCount: number;
    lastCycleISO?: string;
    netToMerchantsPaise?: string;
  }; // include only if role=sp-finance
  connectorHealth: Array<{
    connector: string;
    status: 'ok' | 'degraded' | 'down';
    lastSyncISO?: string;
  }>;
}

export interface TopReason {
  reasonCode: string;
  count: number;
}

export interface PipelineSummary {
  ingested: number;
  reconciled: number;
  settled: number;
  inSettlement: number;
  unsettled: number;
}

export interface ReconSourceSummary {
  timeRange: {
    fromISO: string;
    toISO: string;
  };
  overall: {
    matchedPct: number;
    matchedCount: number;
    unmatchedPgCount: number;
    unmatchedBankCount: number;
    exceptionsCount: number;
    totalTransactions: number;
  };
  connectors: {
    totalTransactions: number;
    matchedCount: number;
    unmatchedPgCount: number;
    unmatchedBankCount: number;
    exceptionsCount: number;
    matchedPct: number;
  };
  manualUpload: {
    totalTransactions: number;
    matchedCount: number;
    unmatchedPgCount: number;
    unmatchedBankCount: number;
    exceptionsCount: number;
    matchedPct: number;
  };
}

// V2 API Response Interface (actual structure)
interface V2OverviewResponse {
  period: {
    from: string;
    to: string;
    type: string;
  };
  summary: {
    totalTransactions: number;
    totalAmount: number;
    matchedTransactions: number;
    unmatchedTransactions: number;
    exceptionTransactions: number;
    matchRate: number;
    reconciledAmount: number;
    unreconciledAmount: number;
  };
  sources: {
    connectors: {
      transactions: number;
      matched: number;
      matchRate: number;
    };
    manual_upload: {
      transactions: number;
      matched: number;
      matchRate: number;
    };
  };
  timeline: any[];
  lastUpdated: string;
}

/**
 * Transform V2 API data to match expected interfaces
 */
function transformV2ToKpis(v2Data: V2OverviewResponse): Kpis {
  const totalAmount = v2Data.summary.totalAmount || 0;
  const reconciledAmount = v2Data.summary.reconciledAmount || 0;
  const variance = totalAmount - reconciledAmount;

  return {
    timeRange: {
      fromISO: v2Data.period.from,
      toISO: v2Data.period.to,
    },
    totals: {
      transactionsCount: v2Data.summary.totalTransactions,
      totalAmountPaise: (totalAmount * 100).toString(), // Convert to paise
      reconciledAmountPaise: (reconciledAmount * 100).toString(),
      variancePaise: (variance * 100).toString(),
    },
    recon: {
      matchRatePct: v2Data.summary.matchRate || 0,
      matchedCount: v2Data.summary.matchedTransactions || 0,
      unmatchedPgCount: Math.floor((v2Data.summary.unmatchedTransactions || 0) / 2), // Estimate
      unmatchedBankCount: Math.ceil((v2Data.summary.unmatchedTransactions || 0) / 2), // Estimate
      exceptionsCount: v2Data.summary.exceptionTransactions || 0,
    },
    connectorHealth: [
      {
        connector: 'Connectors',
        status: v2Data.sources.connectors.matchRate > 80 ? 'ok' : v2Data.sources.connectors.matchRate > 50 ? 'degraded' : 'down' as 'ok' | 'degraded' | 'down',
        lastSyncISO: v2Data.lastUpdated,
      },
      {
        connector: 'Manual Upload',
        status: v2Data.sources.manual_upload.matchRate > 80 ? 'ok' : v2Data.sources.manual_upload.matchRate > 50 ? 'degraded' : 'down' as 'ok' | 'degraded' | 'down',
        lastSyncISO: v2Data.lastUpdated,
      }
    ],
  };
}

function transformV2ToTopReasons(v2Data: V2OverviewResponse): TopReason[] {
  // V2 API doesn't have top reasons data yet, return mock data
  return [
    { reasonCode: 'NO_BANK_REF', count: Math.floor(v2Data.summary.exceptionTransactions * 0.4) },
    { reasonCode: 'AMOUNT_MISMATCH', count: Math.floor(v2Data.summary.exceptionTransactions * 0.3) },
    { reasonCode: 'DATE_MISMATCH', count: Math.floor(v2Data.summary.exceptionTransactions * 0.2) },
    { reasonCode: 'DUPLICATE_TXN', count: Math.floor(v2Data.summary.exceptionTransactions * 0.1) },
  ].filter(r => r.count > 0);
}

function transformV2ToPipeline(v2Data: V2OverviewResponse): PipelineSummary {
  const totalTxns = v2Data.summary.totalTransactions;
  const matchedTxns = v2Data.summary.matchedTransactions;
  const unmatchedTxns = v2Data.summary.unmatchedTransactions;
  
  return {
    ingested: totalTxns,
    reconciled: matchedTxns,
    settled: Math.floor(matchedTxns * 0.8), // Estimate 80% settled
    inSettlement: Math.floor(matchedTxns * 0.2), // Estimate 20% in settlement
    unsettled: unmatchedTxns,
  };
}

function transformV2ToReconSources(v2Data: V2OverviewResponse): ReconSourceSummary {
  return {
    timeRange: {
      fromISO: v2Data.period.from,
      toISO: v2Data.period.to,
    },
    overall: {
      matchedPct: v2Data.summary.matchRate || 0,
      matchedCount: v2Data.summary.matchedTransactions || 0,
      unmatchedPgCount: Math.floor((v2Data.summary.unmatchedTransactions || 0) / 2),
      unmatchedBankCount: Math.ceil((v2Data.summary.unmatchedTransactions || 0) / 2),
      exceptionsCount: v2Data.summary.exceptionTransactions || 0,
      totalTransactions: v2Data.summary.totalTransactions,
    },
    connectors: {
      totalTransactions: v2Data.sources.connectors.transactions,
      matchedCount: v2Data.sources.connectors.matched,
      unmatchedPgCount: v2Data.sources.connectors.transactions - v2Data.sources.connectors.matched,
      unmatchedBankCount: 0,
      exceptionsCount: v2Data.sources.connectors.transactions - v2Data.sources.connectors.matched,
      matchedPct: v2Data.sources.connectors.matchRate,
    },
    manualUpload: {
      totalTransactions: v2Data.sources.manual_upload.transactions,
      matchedCount: v2Data.sources.manual_upload.matched,
      unmatchedPgCount: v2Data.sources.manual_upload.transactions - v2Data.sources.manual_upload.matched,
      unmatchedBankCount: 0,
      exceptionsCount: v2Data.sources.manual_upload.transactions - v2Data.sources.manual_upload.matched,
      matchedPct: v2Data.sources.manual_upload.matchRate,
    },
  };
}

/**
 * Fetch V2 analytics data
 */
async function fetchV2Analytics(filters: KpiFilters): Promise<V2OverviewResponse> {
  console.log('🔍 [V2 Hooks] Fetching analytics data with filters:', filters);
  
  const apiUrl = `http://localhost:5106/api/analytics/overview?from=${filters.from}&to=${filters.to}`;
  console.log('📡 [V2 Hooks] Calling API:', apiUrl);
  
  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ [V2 Hooks] API Error:', {
      status: response.status,
      statusText: response.statusText,
      body: errorText,
    });
    throw new Error(`V2 API failed with status ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  console.log('✅ [V2 Hooks] Received data:', data);
  return data;
}

/**
 * Hook to fetch KPI data with automatic polling
 */
export function useKpis(filters: KpiFilters) {
  return useQuery({
    queryKey: ['kpis', filters],
    queryFn: async () => {
      const v2Data = await fetchV2Analytics(filters);
      return transformV2ToKpis(v2Data);
    },
    refetchInterval: 30000, // Poll every 30 seconds
    staleTime: 20000, // Consider data stale after 20 seconds
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook to fetch top exception reasons
 */
export function useTopReasons(filters: KpiFilters) {
  return useQuery({
    queryKey: ['top-reasons', filters],
    queryFn: async () => {
      const v2Data = await fetchV2Analytics(filters);
      return transformV2ToTopReasons(v2Data);
    },
    refetchInterval: 60000, // Poll every 60 seconds (less frequent)
    staleTime: 30000,
    retry: 2,
  });
}

/**
 * Hook to fetch pipeline summary data
 */
export function usePipelineSummary(filters: KpiFilters) {
  return useQuery({
    queryKey: ['pipeline-summary', filters],
    queryFn: async () => {
      const v2Data = await fetchV2Analytics(filters);
      return transformV2ToPipeline(v2Data);
    },
    refetchInterval: 30000,
    staleTime: 20000,
    retry: 2,
  });
}

/**
 * Hook to fetch reconciliation sources summary data
 */
export function useReconSourceSummary(filters: KpiFilters) {
  return useQuery({
    queryKey: ['recon-sources-summary', filters],
    queryFn: async () => {
      const v2Data = await fetchV2Analytics(filters);
      return transformV2ToReconSources(v2Data);
    },
    refetchInterval: 30000,
    staleTime: 20000,
    retry: 2,
  });
}

/**
 * Generate query parameters for drill-through navigation
 */
export function generateDrillThroughParams(filters: KpiFilters, additionalParams?: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams();
  
  params.set('from', filters.from);
  params.set('to', filters.to);
  
  if (filters.merchantId) {
    params.set('merchantId', filters.merchantId);
  }
  
  if (filters.acquirerId) {
    params.set('acquirerId', filters.acquirerId);
  }
  
  if (additionalParams) {
    Object.entries(additionalParams).forEach(([key, value]) => {
      params.set(key, value);
    });
  }
  
  return params;
}

/**
 * Helper to check if user has finance role access
 */
export function hasFinanceAccess(userRole?: string): boolean {
  return userRole === 'sp-finance';
}