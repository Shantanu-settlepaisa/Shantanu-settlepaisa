import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

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

/**
 * Hook to fetch KPI data with automatic polling
 */
export function useKpis(filters: KpiFilters) {
  return useQuery({
    queryKey: ['kpis', filters],
    queryFn: async () => {
      console.log('Fetching KPIs with filters:', filters);
      const { data } = await apiClient.get<Kpis>('/api/kpis', { 
        params: filters,
        baseURL: 'http://localhost:5105' 
      });
      return data;
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
      const { data } = await apiClient.get<TopReason[]>('/api/exceptions/top-reasons', {
        params: filters,
        baseURL: 'http://localhost:5105'
      });
      return data;
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
      const { data } = await apiClient.get<PipelineSummary>('/api/pipeline/summary', {
        params: filters,
        baseURL: 'http://localhost:5105'
      });
      return data;
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
      const { data } = await apiClient.get<ReconSourceSummary>('/api/recon-sources/summary', {
        params: filters,
        baseURL: 'http://localhost:5105'
      });
      return data;
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