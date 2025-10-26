import { useQuery } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5108';

interface FinancialSummary {
  gmv: {
    paise: string;
    rupees: number;
    formatted: string;
  };
  mdrCollected: {
    paise: string;
    rupees: number;
    formatted: string;
  };
  bankChargesPaid: {
    paise: string;
    rupees: number;
    formatted: string;
  };
  settlepaisaRevenue: {
    paise: string;
    rupees: number;
    formatted: string;
  };
  grossMarginPercent: number;
  netSettled: {
    paise: string;
    rupees: number;
    formatted: string;
  };
  transactionCount: number;
  merchantCount: number;
  batchCount: number;
  avgTransactionValue: {
    paise: string;
    rupees: number;
  };
}

interface TrendPoint {
  date: string;
  gmv: string;
  mdr: string;
  bankCharges: string;
  revenue: string;
  netSettled: string;
  txnCount: number;
  marginPercent: number;
}

interface FinancialAnalyticsResponse {
  period: {
    from: string;
    to: string;
    days: number;
  };
  summary: FinancialSummary;
  deltas?: {
    gmvPct?: number;
    mdrPct?: number;
    bankChargesPct?: number;
    revenuePct?: number;
    marginPct?: number;
    netSettledPct?: number;
  };
  trends?: TrendPoint[];
}

interface UseFinancialAnalyticsParams {
  from: string;
  to: string;
  merchantId?: string;
  groupBy?: 'day' | 'week' | 'month';
}

export function useFinancialAnalytics({
  from,
  to,
  merchantId,
  groupBy = 'day'
}: UseFinancialAnalyticsParams) {
  return useQuery<FinancialAnalyticsResponse>({
    queryKey: ['financial-analytics', from, to, merchantId, groupBy],
    queryFn: async () => {
      const params = new URLSearchParams({
        from,
        to,
        ...(merchantId && { merchantId }),
        ...(groupBy && { groupBy })
      });

      const response = await fetch(`${API_BASE}/api/analytics/financial?${params}`);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch financial analytics' }));
        throw new Error(error.message || 'Failed to fetch financial analytics');
      }

      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2
  });
}
