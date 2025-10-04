import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { format } from 'date-fns';

const API_BASE = 'http://localhost:5105/api/analytics';

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
        from: scope.from,
        to: scope.to,
      });
      const { data } = await axios.get(`${API_BASE}/kpis-v2?${params}`);
      
      // API already returns correct format
      return {
        settled: data.settled,
        unsettled: data.unsettled,
        settlementSrPct: data.settlementSrPct,
        avgSettlementHrs: data.avgSettlementHrs || 0,
        paidOutCount: data.paidOutCount || 0,
        deltas: data.deltas || {}
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
      const { data } = await axios.get(`${API_BASE}/mode-distribution?${params}`);
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
        from: scope.from,
        to: scope.to,
      });
      const { data } = await axios.get(`${API_BASE}/gmv-trend?${params}`);
      
      // Transform to expected format with rolling averages
      const points = data.trend.map((item: any, idx: number, arr: any[]) => {
        const capturedPaise = parseInt(item.captured?.amountPaise || '0');
        const settledPaise = parseInt(item.settled?.amountPaise || '0');
        const capturedCount = item.captured?.count || 0;
        const settledCount = item.settled?.count || 0;
        
        // Calculate 7-day rolling average
        const start = Math.max(0, idx - 6);
        const window = arr.slice(start, idx + 1);
        const capturedAvg = window.reduce((sum: number, d: any) => sum + parseInt(d.captured?.amountPaise || '0'), 0) / window.length;
        const settledAvg = window.reduce((sum: number, d: any) => sum + parseInt(d.settled?.amountPaise || '0'), 0) / window.length;
        
        return {
          date: item.date,
          capturedPaise,
          settledPaise,
          capturedPaiseAvg7: Math.floor(capturedAvg),
          settledPaiseAvg7: Math.floor(settledAvg),
          capturedCount,
          settledCount,
          settlementRate: capturedCount > 0 ? (settledCount / capturedCount * 100) : 0
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
        from: scope.from,
        to: scope.to,
      });
      const { data } = await axios.get(`${API_BASE}/settlement-funnel?${params}`);
      
      // Transform stages array to funnel object expected by frontend
      const captured = data.stages.find((s: any) => s.name === 'Captured') || { count: 0, percentage: 100 };
      const credited = data.stages.find((s: any) => s.name === 'Credited') || { count: 0, percentage: 0 };
      const inSettlement = data.stages.find((s: any) => s.name === 'In Settlement') || { count: 0, percentage: 0 };
      const sentToBank = data.stages.find((s: any) => s.name === 'Sent to Bank') || { count: 0, percentage: 0 };
      
      return {
        funnel: {
          captured: {
            count: captured.count,
            percentage: captured.percentage
          },
          reconciled: {
            count: data.reconStatuses?.MATCHED || 0,
            percentage: captured.count > 0 ? Math.round((data.reconStatuses?.MATCHED || 0) / captured.count * 100) : 0
          },
          settled: {
            count: credited.count,
            percentage: credited.percentage
          },
          paid_out: {
            count: credited.count, // Assuming credited = paid out for now
            percentage: credited.percentage
          }
        },
        stages: data.stages,
        reconStatuses: data.reconStatuses
      };
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
        from: scope.from,
        to: scope.to,
      });
      const { data } = await axios.get(`${API_BASE}/failure-reasons?${params}`);
      
      // Transform reasons array to expected format
      const reasons = data.reasons.map((item: any) => ({
        reason: item.reason,
        count: item.count,
        amountPaise: parseInt(item.impactPaise) || 0,
        srImpactPct: item.percentage || 0
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
        from: scope.from,
        to: scope.to,
      });
      const { data } = await axios.get(`${API_BASE}/failure-reasons?${params}`);
      
      if (!data.reasons || data.reasons.length === 0) {
        return { slices: [] };
      }
      
      // Transform to expected format with owner categorization and resolution tracking
      const slices = data.reasons.map((failure: any) => ({
        code: failure.reason,
        label: failure.label || failure.reason,
        owner: failure.owner || 'System',
        txns: failure.count,
        affectedBatches: failure.affectedBatches || 0,
        openCount: failure.openCount || 0,
        resolvedCount: failure.resolvedCount || 0,
        impactPaise: failure.impactPaise,
        sharePct: failure.percentage || 0
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
      // Calculate date ranges
      const today = new Date(scope.to || new Date());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - 7);
      
      const monthStart = new Date(today);
      monthStart.setDate(monthStart.getDate() - 30);
      
      // Fetch failure data AND KPIs for different periods to calculate actual failure rates
      const [yesterdayData, yesterdayKpis, currentWeekData, currentWeekKpis, currentMonthData, currentMonthKpis] = await Promise.all([
        axios.get(`${API_BASE}/failure-reasons?${new URLSearchParams({
          from: yesterday.toISOString().split('T')[0],
          to: yesterday.toISOString().split('T')[0],
        })}`),
        axios.get(`${API_BASE}/kpis-v2?${new URLSearchParams({
          from: yesterday.toISOString().split('T')[0],
          to: yesterday.toISOString().split('T')[0],
        })}`),
        axios.get(`${API_BASE}/failure-reasons?${new URLSearchParams({
          from: weekStart.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0],
        })}`),
        axios.get(`${API_BASE}/kpis-v2?${new URLSearchParams({
          from: weekStart.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0],
        })}`),
        axios.get(`${API_BASE}/failure-reasons?${new URLSearchParams({
          from: monthStart.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0],
        })}`),
        axios.get(`${API_BASE}/kpis-v2?${new URLSearchParams({
          from: monthStart.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0],
        })}`),
      ]);
      
      // Calculate total transactions for each period
      const yesterdayTotal = (yesterdayKpis.data.settled?.count || 0) + (yesterdayKpis.data.unsettled?.count || 0);
      const weekTotal = (currentWeekKpis.data.settled?.count || 0) + (currentWeekKpis.data.unsettled?.count || 0);
      const monthTotal = (currentMonthKpis.data.settled?.count || 0) + (currentMonthKpis.data.unsettled?.count || 0);
      
      // Build rows from current week data (main data source)
      const rows = currentWeekData.data.reasons.map((reason: any) => {
        const yesterdayReason = yesterdayData.data.reasons.find((r: any) => r.reason === reason.reason);
        const monthReason = currentMonthData.data.reasons.find((r: any) => r.reason === reason.reason);
        
        // Calculate actual failure rate as % of total transactions (not % of failures)
        const yesterdayFailureRate = yesterdayTotal > 0 ? ((yesterdayReason?.count || 0) / yesterdayTotal * 100) : 0;
        const weekFailureRate = weekTotal > 0 ? (reason.count / weekTotal * 100) : 0;
        const monthFailureRate = monthTotal > 0 ? ((monthReason?.count || 0) / monthTotal * 100) : 0;
        
        return {
          code: reason.reason,
          label: reason.reason.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l: string) => l.toUpperCase()),
          owner: 'System', // TODO: Categorize by owner
          yesterday: {
            failureRatePct: yesterdayFailureRate,
            deltaPctPoints: 0 // Would need previous day data to calculate
          },
          currentWeek: {
            failureRatePct: weekFailureRate,
            deltaPctPoints: 0 // Would need previous week data to calculate
          },
          currentMonth: {
            failureRatePct: monthFailureRate,
            deltaPctPoints: 0 // Would need previous month data to calculate
          }
        };
      });
      
      return { rows };
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
        from: scope.from,
        to: scope.to,
      });
      const { data } = await axios.get(`${API_BASE}/mode-distribution?${params}`);
      
      // Calculate totals from distribution array
      const totalTxns = data.distribution.reduce((sum: number, item: any) => sum + item.captured.count, 0);
      const totalGmvPaise = data.distribution.reduce((sum: number, item: any) => sum + parseInt(item.captured.amountPaise || '0'), 0);
      
      // Transform to expected format
      const slices = data.distribution.map((item: any) => ({
        mode: item.mode,
        txns: item.captured.count,
        gmvPaise: parseInt(item.captured.amountPaise || '0'),
        sharePct: totalTxns > 0 ? parseFloat(((item.captured.count / totalTxns) * 100).toFixed(1)) : 0
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