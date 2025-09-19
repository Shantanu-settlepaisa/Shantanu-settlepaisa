import { useQuery } from '@tanstack/react-query';
import { apiClient as api } from '@/lib/api-client';

export function useAnalyticsKpisV2(params: { 
  from: string; 
  to: string; 
  merchantId?: string; 
  acquirerId?: string; 
  mode?: string 
}) {
  return useQuery({
    queryKey: ['analytics-kpis-v2', params],
    queryFn: async () => {
      const { data } = await api.get('/api/analytics/kpis-v2', { 
        params,
        baseURL: 'http://localhost:5105'
      });
      return data;
    },
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 2,
  });
}

export function useAnalyticsModeDistribution(params: { 
  from: string; 
  to: string; 
  merchantId?: string; 
  acquirerId?: string;
}) {
  return useQuery({
    queryKey: ['analytics-mode-distribution', params],
    queryFn: async () => {
      const { data } = await api.get('/api/analytics/mode-distribution', { 
        params,
        baseURL: 'http://localhost:5105'
      });
      return data;
    },
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 2,
  });
}

export function useAnalyticsGmvTrend(params: { 
  from: string; 
  to: string; 
  merchantId?: string; 
  acquirerId?: string; 
  mode?: string 
}) {
  return useQuery({
    queryKey: ['analytics-gmv-trend', params],
    queryFn: async () => {
      const { data } = await api.get('/api/analytics/gmv-trend', { 
        params,
        baseURL: 'http://localhost:5105'
      });
      return data;
    },
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 2,
  });
}

export function useAnalyticsSettlementFunnel(params: { 
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
        baseURL: 'http://localhost:5105'
      });
      return data;
    },
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 2,
  });
}

export function useAnalyticsFailureReasons(params: { 
  from: string; 
  to: string; 
  merchantId?: string; 
  acquirerId?: string; 
  mode?: string 
}) {
  return useQuery({
    queryKey: ['analytics-failure-reasons', params],
    queryFn: async () => {
      const { data } = await api.get('/api/analytics/failure-reasons', { 
        params,
        baseURL: 'http://localhost:5105'
      });
      return data;
    },
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 2,
  });
}