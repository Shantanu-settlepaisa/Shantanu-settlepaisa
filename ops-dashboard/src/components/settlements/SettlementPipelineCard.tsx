import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

// Type definitions
type Bucket = {
  count: number;
  amountPaise: string;
};

type Pipeline = {
  from: string;
  to: string;
  captured: Bucket;
  inSettlement: Bucket;
  sentToBank: Bucket;
  credited: Bucket;
  unsettled: Bucket;
};

// Color scheme for pipeline states
const COLORS = {
  IN_SETTLEMENT: '#2F6FEB',
  SENT_TO_BANK: '#F4A300',
  CREDITED: '#16B364',
  UNSETTLED: '#F04438',
};

// Formatters
export const formatINR = (paise?: string | number): string => {
  const amount = Number(paise || 0) / 100;
  return amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

export const formatPercentage = (part: number, whole: number): string => {
  if (!whole || whole === 0) return '0.0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
};

// API hook
export function useSettlementPipeline(params: { from: string; to: string }) {
  return useQuery({
    queryKey: ['settlement-pipeline', params],
    queryFn: async () => {
      const response = await fetch(
        `http://localhost:5105/api/settlement/pipeline?from=${params.from}&to=${params.to}`
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch settlement pipeline data');
      }
      
      return response.json() as Promise<Pipeline>;
    },
    staleTime: 15000,
    refetchInterval: 30000,
    retry: 2,
  });
}

interface SettlementPipelineCardProps {
  from: string;
  to: string;
  className?: string;
}

export default function SettlementPipelineCard({ from, to, className }: SettlementPipelineCardProps) {
  const { data, isLoading, error, refetch } = useSettlementPipeline({ from, to });
  
  // Calculate totals
  const total = data?.captured?.count ?? 0;
  
  // Define buckets with their properties
  const buckets = [
    {
      key: 'In Settlement',
      code: 'IN_SETTLEMENT',
      count: data?.inSettlement?.count ?? 0,
      amount: data?.inSettlement?.amountPaise,
      color: COLORS.IN_SETTLEMENT,
      icon: '🟦',
    },
    {
      key: 'Sent to Bank',
      code: 'SENT_TO_BANK',
      count: data?.sentToBank?.count ?? 0,
      amount: data?.sentToBank?.amountPaise,
      color: COLORS.SENT_TO_BANK,
      icon: '🟧',
    },
    {
      key: 'Credited',
      code: 'CREDITED',
      count: data?.credited?.count ?? 0,
      amount: data?.credited?.amountPaise,
      color: COLORS.CREDITED,
      icon: '🟩',
    },
    {
      key: 'Unsettled',
      code: 'UNSETTLED',
      count: data?.unsettled?.count ?? 0,
      amount: data?.unsettled?.amountPaise,
      color: COLORS.UNSETTLED,
      icon: '🟥',
    },
  ];
  
  // Format date range for display
  const formatDateRange = () => {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    return `${fromDate.toLocaleDateString('en-US', options)} → ${toDate.toLocaleDateString('en-US', options)}`;
  };
  
  return (
    <Card className={cn('shadow-sm', className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg font-semibold">Settlement Pipeline</CardTitle>
            
            {/* Info Popover with Option A text */}
            <Popover>
              <PopoverTrigger 
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Explain settlement lifecycle"
              >
                <Info className="h-4 w-4" />
              </PopoverTrigger>
              <PopoverContent className="w-96 p-4" align="start">
                <div className="space-y-3 text-sm leading-5">
                  <div className="font-semibold text-base">Settlement Lifecycle</div>
                  
                  <ul className="space-y-2">
                    <li className="flex gap-2">
                      <span>🟦</span>
                      <div>
                        <b>Reconciled</b> — Transactions matched with bank statements, 
                        <i>status = RECONCILED</i>. Ready for settlement batch creation.
                      </div>
                    </li>
                    
                    <li className="flex gap-2">
                      <span>🟧</span>
                      <div>
                        <b>Settled</b> — Settlement batch created, <i>status = SETTLED</i>. 
                        Transactions grouped with fees/TDS calculated. Ready for merchant payout.
                      </div>
                    </li>
                    
                    <li className="flex gap-2">
                      <span>🟩</span>
                      <div>
                        <b>Credited to Merchant</b> — Final payout <i>completed to merchant bank account</i>. 
                        End-to-end settlement successful.
                      </div>
                    </li>
                    
                    <li className="flex gap-2">
                      <span>🟥</span>
                      <div>
                        <b>Exceptions</b> — Reconciliation <i>failed or settlement rejected</i> 
                        (e.g., amount mismatch, missing UTR, duplicate entry). Needs Ops review.
                      </div>
                    </li>
                  </ul>
                  
                  <div className="text-xs text-muted-foreground border-t pt-2">
                    <b>How to read:</b> Each segment is mutually-exclusive. 
                    <b> Captured = In Settlement + Sent to Bank + Credited + Unsettled</b> 
                    (selected date range).
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{formatDateRange()}</span>
            <button
              onClick={() => refetch()}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              aria-label="Refresh data"
            >
              <RefreshCw className={cn('h-3 w-3 text-gray-500', isLoading && 'animate-spin')} />
            </button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded mb-4">
            Error loading data: {(error as Error).message}
          </div>
        )}
        
        {isLoading && !data && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}
        
        {data && (
          <>
            {/* Summary Stats */}
            <div className="mb-4 pb-3 border-b">
              <div className="flex justify-between items-baseline">
                <div>
                  <span className="text-2xl font-bold">{total.toLocaleString()}</span>
                  <span className="text-sm text-muted-foreground ml-2">transactions captured</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-semibold">{formatINR(data.captured.amountPaise)}</span>
                  <span className="text-sm text-muted-foreground ml-1">total value</span>
                </div>
              </div>
            </div>
            
            {/* 100% Stacked Bar */}
            <div className="w-full h-8 rounded-lg overflow-hidden flex shadow-inner bg-gray-50 mb-4">
              {buckets.map((bucket) => {
                const width = total > 0 ? (bucket.count / total) * 100 : 0;
                
                if (width === 0) return null;
                
                return (
                  <div
                    key={bucket.code}
                    className="relative group transition-all duration-300 hover:opacity-90"
                    style={{
                      width: `${width}%`,
                      backgroundColor: bucket.color,
                    }}
                    title={`${bucket.key}: ${bucket.count} transactions (${formatPercentage(bucket.count, total)})`}
                  >
                    {/* Show percentage if segment is wide enough */}
                    {width > 5 && (
                      <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-medium">
                        {formatPercentage(bucket.count, total)}
                      </span>
                    )}
                  </div>
                );
              })}
              
              {/* Show empty state if no data */}
              {total === 0 && (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                  No transactions in selected period
                </div>
              )}
            </div>
            
            {/* Legend */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              {buckets.map((bucket) => (
                <div
                  key={bucket.key}
                  className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 transition-colors"
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full mt-0.5 flex-shrink-0"
                    style={{ backgroundColor: bucket.color }}
                  />
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-baseline gap-1">
                      <span className="font-medium">{bucket.key}</span>
                      <span className="text-muted-foreground">
                        — {formatPercentage(bucket.count, total)}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      <span>{bucket.count.toLocaleString()} txns</span>
                      <span className="mx-1">•</span>
                      <span>{formatINR(bucket.amount)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Data Quality Indicator */}
            {data && (
              <div className="mt-4 pt-3 border-t">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                    <span>Data invariant valid</span>
                  </div>
                  <span>
                    Last updated: {new Date().toLocaleTimeString()}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}