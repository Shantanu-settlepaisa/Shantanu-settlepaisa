import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type OutcomeWindow = '7d' | '30d';

interface Filters {
  from: string;
  to: string;
  merchantId?: string;
  acquirerId?: string;
}

export interface DisputesKpis {
  openCount: number;
  evidenceRequiredCount: number;
  disputedPaise: string;
  recoveredPaise: string;
  writtenOffPaise: string;
  avgResolutionDays: number;
}

export interface OutcomeSummary {
  window: OutcomeWindow;
  wonCount: number;
  lostCount: number;
  winRatePct: number;
  avgResolutionDays: number;
}

export interface SlaBuckets {
  overdue: { count: number; amountPaise: string };
  today: { count: number; amountPaise: string };
  twoToThree: { count: number; amountPaise: string };
}

export function useDisputesKpis(filters: Filters) {
  return useQuery<DisputesKpis>({ 
    queryKey: ['cb-kpis', filters], 
    queryFn: async () => {
      const { data } = await apiClient.get('/api/disputes/kpis', { 
        params: filters,
        baseURL: 'http://localhost:5105'
      });
      return data;
    }, 
    refetchInterval: 30000, 
    staleTime: 20000, 
    retry: 2 
  });
}

export function useOutcomeSummary(window: OutcomeWindow, scope: { merchantId?: string; acquirerId?: string }) {
  return useQuery<OutcomeSummary>({ 
    queryKey: ['cb-outcome', window, scope], 
    queryFn: async () => {
      const { data } = await apiClient.get('/api/disputes/outcome-summary', { 
        params: { window, ...scope },
        baseURL: 'http://localhost:5105'
      });
      return data;
    }, 
    refetchInterval: 30000, 
    staleTime: 20000, 
    retry: 2 
  });
}

export function useSlaBuckets(filters: Filters) {
  return useQuery<SlaBuckets>({ 
    queryKey: ['cb-sla', filters], 
    queryFn: async () => {
      const { data } = await apiClient.get('/api/disputes/sla-buckets', { 
        params: filters,
        baseURL: 'http://localhost:5105'
      });
      return data;
    }, 
    refetchInterval: 30000, 
    staleTime: 20000, 
    retry: 2 
  });
}