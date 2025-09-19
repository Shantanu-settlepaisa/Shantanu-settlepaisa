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
      if (scope.acquirerIds?.length) {
        params.append('acquirerIds', scope.acquirerIds.join(','));
      }
      if (scope.modes?.length) {
        params.append('modes', scope.modes.join(','));
      }
      const { data } = await axios.get(`${API_BASE}/kpis-v2?${params}`);
      return data;
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
        from: scope.from,
        to: scope.to,
      });
      if (scope.acquirerIds?.length) {
        params.append('acquirerIds', scope.acquirerIds.join(','));
      }
      if (scope.modes?.length) {
        params.append('modes', scope.modes.join(','));
      }
      const { data } = await axios.get(`${API_BASE}/gmv-trend-v2?${params}`);
      return data;
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
      if (scope.acquirerIds?.length) {
        params.append('acquirerIds', scope.acquirerIds.join(','));
      }
      if (scope.modes?.length) {
        params.append('modes', scope.modes.join(','));
      }
      const { data } = await axios.get(`${API_BASE}/settlement-funnel?${params}`);
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
        from: scope.from,
        to: scope.to,
      });
      if (scope.acquirerIds?.length) {
        params.append('acquirerIds', scope.acquirerIds.join(','));
      }
      if (scope.modes?.length) {
        params.append('modes', scope.modes.join(','));
      }
      if (scope.limit) {
        params.append('limit', scope.limit.toString());
      }
      const { data } = await axios.get(`${API_BASE}/settlement-failure-pareto?${params}`);
      return data;
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
      if (scope.acquirerIds?.length) {
        params.append('acquirerIds', scope.acquirerIds.join(','));
      }
      if (scope.modes?.length) {
        params.append('modes', scope.modes.join(','));
      }
      const { data } = await axios.get(`${API_BASE}/settlement-failures/breakup?${params}`);
      return data;
    },
    refetchInterval: 30000,
  });
}

// Settlement failure reasons performance metrics
export function useSettlementFailurePerformance(scope: AnalyticsScope & { anchor?: string, limit?: number }) {
  return useQuery({
    queryKey: ['analytics', 'settlement-failure-performance', scope],
    queryFn: async () => {
      const params = new URLSearchParams({
        from: scope.from,
        to: scope.to,
      });
      if (scope.acquirerIds?.length) {
        params.append('acquirerIds', scope.acquirerIds.join(','));
      }
      if (scope.modes?.length) {
        params.append('modes', scope.modes.join(','));
      }
      if (scope.anchor) {
        params.append('anchor', scope.anchor);
      }
      if (scope.limit) {
        params.append('limit', scope.limit.toString());
      }
      const { data } = await axios.get(`${API_BASE}/settlement-failures/performance?${params}`);
      return data;
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
      if (scope.acquirerIds?.length) {
        params.append('acquirerIds', scope.acquirerIds.join(','));
      }
      if (scope.modes?.length) {
        params.append('modes', scope.modes.join(','));
      }
      const { data } = await axios.get(`${API_BASE}/modes/share?${params}`);
      return data;
    },
    refetchInterval: 30000,
  });
}

// Mode performance metrics
export function useModePerformance(scope: AnalyticsScope) {
  return useQuery({
    queryKey: ['analytics', 'mode-performance', scope],
    queryFn: async () => {
      const params = new URLSearchParams({
        from: scope.from,
        to: scope.to,
      });
      if (scope.acquirerIds?.length) {
        params.append('acquirerIds', scope.acquirerIds.join(','));
      }
      if (scope.modes?.length) {
        params.append('modes', scope.modes.join(','));
      }
      const { data } = await axios.get(`${API_BASE}/modes/performance?${params}`);
      return data;
    },
    refetchInterval: 30000,
  });
}