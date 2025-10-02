import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { format } from 'date-fns';

const API_BASE = 'http://localhost:5107/analytics';

export interface AnalyticsScope {
  from: string;
  to: string;
  acquirerIds?: string[];
  modes?: string[];
}

// KPIs with deltas
export function useAnalyticsKpisV3(scope: AnalyticsScope) {
  return useQuery({
    queryKey: ['analytics', 'kpis-v3', scope],
    queryFn: async () => {
      const params = new URLSearchParams({
        dateFrom: scope.from,
        dateTo: scope.to,
      });
      const { data } = await axios.get(`${API_BASE}/kpis?${params}`);
      
      // Transform to match frontend expectations
      return {
        settled: {
          count: data.settled.count,
          amountPaise: data.settled.amountPaise
        },
        unsettled: {
          count: data.unsettled.count,
          amountPaise: data.unsettled.amountPaise
        },
        settlementSrPct: data.settlementRate,
        avgSettlementHrs: parseFloat(data.avgSettlementTimeHours),
        paidOutCount: data.paidOutCount,
        deltas: {} // No delta data yet
      };
    },
    refetchInterval: 30000,
  });
}

// Mode stacked distribution
export function useModeStackedV3(scope: AnalyticsScope) {
  return useQuery({
    queryKey: ['analytics', 'mode-stacked-v3', scope],
    queryFn: async () => {
      const params = new URLSearchParams({
        from: scope.from,
        to: scope.to,
      });
      if (scope.acquirerIds?.length) {
        params.append('acquirerIds', scope.acquirerIds.join(','));
      }
      const { data } = await axios.get(`${API_BASE}/mode-stacked?${params}`);
      return data;
    },
    refetchInterval: 30000,
  });
}

// GMV Trend with rolling averages
export function useGmvTrendV3(scope: AnalyticsScope) {
  return useQuery({
    queryKey: ['analytics', 'gmv-trend-v3', scope],
    queryFn: async () => {
      const params = new URLSearchParams({
        days: '30',
      });
      const { data } = await axios.get(`${API_BASE}/gmv-trend?${params}`);
      
      // Transform to expected format with rolling averages
      const points = data.trend.map((item: any, idx: number, arr: any[]) => {
        // Calculate 7-day rolling average
        const start = Math.max(0, idx - 6);
        const window = arr.slice(start, idx + 1);
        const capturedAvg = window.reduce((sum: number, d: any) => sum + d.capturedAmountPaise, 0) / window.length;
        const settledAvg = window.reduce((sum: number, d: any) => sum + (d.capturedAmountPaise * d.settlementRate / 100), 0) / window.length;
        
        return {
          date: item.date,
          capturedPaise: item.capturedAmountPaise,
          settledPaise: Math.floor(item.capturedAmountPaise * item.settlementRate / 100),
          capturedPaiseAvg7: Math.floor(capturedAvg),
          settledPaiseAvg7: Math.floor(settledAvg),
          capturedCount: item.capturedCount,
          settledCount: item.settledCount,
          settlementRate: item.settlementRate
        };
      });
      
      return { points };
    },
    refetchInterval: 30000,
  });
}

// Settlement funnel
export function useSettlementFunnelV3(scope: AnalyticsScope) {
  return useQuery({
    queryKey: ['analytics', 'settlement-funnel-v3', scope],
    queryFn: async () => {
      const params = new URLSearchParams({
        dateFrom: scope.from,
        dateTo: scope.to,
      });
      const { data } = await axios.get(`${API_BASE}/funnel?${params}`);
      return data;
    },
    refetchInterval: 30000,
  });
}

// Settlement failure Pareto
export function useSettlementParetoV3(scope: AnalyticsScope & { limit?: number }) {
  return useQuery({
    queryKey: ['analytics', 'settlement-pareto-v3', scope],
    queryFn: async () => {
      const params = new URLSearchParams({
        dateFrom: scope.from,
        dateTo: scope.to,
      });
      const { data } = await axios.get(`${API_BASE}/failure-analysis?${params}`);
      
      // Transform failures array to expected format
      const reasons = data.failures.map((item: any) => ({
        reason: item.reason,
        count: item.count,
        amountPaise: parseInt(item.amount_paise) || 0,
        srImpactPct: 0 // We don't have this data yet
      }));
      
      return { reasons };
    },
    refetchInterval: 30000,
  });
}

// Acquirer list for filters
export function useAcquirers() {
  return useQuery({
    queryKey: ['analytics', 'acquirers'],
    queryFn: async () => {
      // Mock acquirer list for now
      return [
        { id: 'HDFC', name: 'HDFC Bank', logo: '🏦' },
        { id: 'ICICI', name: 'ICICI Bank', logo: '🏦' },
        { id: 'AXIS', name: 'Axis Bank', logo: '🏦' },
        { id: 'SBI', name: 'State Bank', logo: '🏦' },
        { id: 'KOTAK', name: 'Kotak Bank', logo: '🏦' },
      ];
    },
    staleTime: Infinity,
  });
}

// Payment modes for filters
export function usePaymentModes() {
  return useQuery({
    queryKey: ['analytics', 'payment-modes'],
    queryFn: async () => {
      return [
        { id: 'UPI', name: 'UPI', icon: '📱' },
        { id: 'CARD', name: 'Cards', icon: '💳' },
        { id: 'NETBANKING', name: 'Net Banking', icon: '🏦' },
        { id: 'WALLET', name: 'Wallets', icon: '👛' },
        { id: 'QR', name: 'QR Code', icon: '📱' },
      ];
    },
    staleTime: Infinity,
  });
}

// Settlement failure reasons breakup for donut chart
export function useSettlementFailureBreakup(scope: AnalyticsScope) {
  return useQuery({
    queryKey: ['analytics', 'settlement-failure-breakup', scope],
    queryFn: async () => {
      const params = new URLSearchParams({
        dateFrom: scope.from,
        dateTo: scope.to,
      });
      const { data } = await axios.get(`${API_BASE}/failure-analysis?${params}`);
      
      if (!data.failures || data.failures.length === 0) {
        return { slices: [] };
      }
      
      // Calculate total for percentages
      const totalCount = data.failures.reduce((sum: number, f: any) => sum + f.count, 0);
      
      // Transform to expected format with owner categorization and resolution tracking
      const slices = data.failures.map((failure: any) => ({
        code: failure.reason,
        label: failure.label || failure.reason,
        owner: failure.owner || 'System',
        txns: failure.count,
        affectedBatches: failure.affectedBatches || 0,
        openCount: failure.openCount || 0,
        resolvedCount: failure.resolvedCount || 0,
        impactPaise: failure.amount_paise,
        sharePct: totalCount > 0 ? parseFloat(((failure.count / totalCount) * 100).toFixed(1)) : 0
      }));
      
      return { slices };
    },
    refetchInterval: 30000,
  });
}

// Settlement failure reasons performance metrics
export function useSettlementFailurePerformance(scope: AnalyticsScope & { anchor?: string, limit?: number }) {
  return useQuery({
    queryKey: ['analytics', 'settlement-failure-performance', scope],
    queryFn: async () => {
      // Return mock performance data for failure reasons
      // In production, this would show trend data for each failure reason
      return {
        reasons: [
          { code: 'EXCEPTION', weeklyTrend: [120, 125, 130, 136, 140, 145, 136] },
        ]
      };
    },
    refetchInterval: 30000,
  });
}

// Mode share data for donut chart
export function useModeShare(scope: AnalyticsScope) {
  return useQuery({
    queryKey: ['analytics', 'mode-share', scope],
    queryFn: async () => {
      const params = new URLSearchParams({
        dateFrom: scope.from,
        dateTo: scope.to,
      });
      const { data } = await axios.get(`${API_BASE}/payment-modes?${params}`);
      
      // Calculate totals
      const totalTxns = data.breakdown.reduce((sum: number, item: any) => sum + item.count, 0);
      const totalGmvPaise = data.breakdown.reduce((sum: number, item: any) => sum + item.amountPaise, 0);
      
      // Transform to expected format
      const slices = data.breakdown.map((item: any) => ({
        mode: item.mode,
        txns: item.count,
        gmvPaise: item.amountPaise,
        sharePct: totalTxns > 0 ? parseFloat(((item.count / totalTxns) * 100).toFixed(1)) : 0
      }));
      
      return { 
        slices,
        totalTxns,
        totalGmvPaise: totalGmvPaise.toString()
      };
    },
    refetchInterval: 30000,
  });
}

// Mode performance metrics
export function useModePerformance(scope: AnalyticsScope) {
  return useQuery({
    queryKey: ['analytics', 'mode-performance', scope],
    queryFn: async () => {
      // Return mock performance data for now
      // In production, this would call a real endpoint
      return {
        yesterday: { srPct: 85.5, deltaPctPoints: 2.1 },
        thisWeek: { srPct: 87.2, deltaPctPoints: 1.5 },
        thisMonth: { srPct: 86.8, deltaPctPoints: 0.8 }
      };
    },
    refetchInterval: 30000,
  });
}