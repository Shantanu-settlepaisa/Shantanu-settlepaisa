import { useQuery } from '@tanstack/react-query';
import { apiClient as api } from '@/lib/api-client';

const BASE_URL = 'http://localhost:5105';

// KPIs with deltas
export function useAnalyticsKpisV3(params: { 
  from: string; 
  to: string; 
  merchantId?: string; 
  acquirerId?: string; 
  mode?: string 
}) {
  return useQuery({
    queryKey: ['analytics-kpis-v3', params],
    queryFn: async () => {
      const { data } = await api.get('/api/analytics/kpis-v3', { 
        params,
        baseURL: BASE_URL
      });
      return data;
    },
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 2,
  });
}

// Mode stacked (100% bar)
export function useModeStacked(params: { 
  from: string; 
  to: string; 
  merchantId?: string; 
  acquirerId?: string;
}) {
  return useQuery({
    queryKey: ['analytics-mode-stacked', params],
    queryFn: async () => {
      const { data } = await api.get('/api/analytics/mode-stacked', { 
        params,
        baseURL: BASE_URL
      });
      return data;
    },
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 2,
  });
}

// GMV trend v2 with rolling averages
export function useGmvTrendV2(params: { 
  from: string; 
  to: string; 
  merchantId?: string; 
  acquirerId?: string; 
  mode?: string 
}) {
  return useQuery({
    queryKey: ['analytics-gmv-trend-v2', params],
    queryFn: async () => {
      const { data } = await api.get('/api/analytics/gmv-trend-v2', { 
        params,
        baseURL: BASE_URL
      });
      return data;
    },
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 2,
  });
}

// Settlement funnel (keep existing)
export function useSettlementFunnel(params: { 
  from: string; 
  to: string; 
  merchantId?: string; 
  acquirerId?: string; 
  mode?: string 
}) {
  return useQuery({
    queryKey: ['analytics-settlement-funnel', params],
    queryFn: async () => {
      const { data } = await api.get('/api/analytics/settlement-funnel', { 
        params,
        baseURL: BASE_URL
      });
      return data;
    },
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 2,
  });
}

// Settlement failure pareto
export function usePareto(params: { 
  from: string; 
  to: string; 
  merchantId?: string; 
  acquirerId?: string; 
  mode?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['analytics-pareto', params],
    queryFn: async () => {
      const { data } = await api.get('/api/analytics/settlement-failure-pareto', { 
        params,
        baseURL: BASE_URL
      });
      return data;
    },
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 2,
  });
}