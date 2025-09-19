import { useQuery } from '@tanstack/react-query';
import { SettlementCycle } from '@/types/settlementCycle';
import { getSettlementCycle } from '@/services/settlementCycleService';

export function useSettlementCycle() {
  const { data, error, isLoading, refetch } = useQuery<SettlementCycle>({
    queryKey: ['settlement-cycle'],
    queryFn: getSettlementCycle,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  return {
    cycle: data,
    isLoading,
    isError: !!error,
    refresh: refetch,
  };
}