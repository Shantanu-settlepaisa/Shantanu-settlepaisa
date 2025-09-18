import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, AlertTriangle } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  Legend,
  Cell
} from 'recharts';
import { formatIndianCurrency } from '@/lib/utils';
import { buildExceptionsLink, getAgeBucketHours } from '@/lib/linking';
import { MetricToggle, useMetricMode } from './MetricToggle';
import type { AgeingResponse, MetricMode, Window } from '@/types/metrics';

// Reason code display mapping with colors
const REASON_COLORS: Record<string, string> = {
  BANK_FILE_MISSING: '#ef4444',
  PG_TXN_MISSING_IN_BANK: '#f97316',
  BANK_TXN_MISSING_IN_PG: '#f97316',
  UTR_MISSING_OR_INVALID: '#ef4444',
  DATE_OUT_OF_WINDOW: '#eab308',
  AMOUNT_MISMATCH: '#f59e0b',
  STATUS_MISMATCH: '#eab308',
  DUPLICATE_BANK_ENTRY: '#a855f7',
  DUPLICATE_PG_ENTRY: '#a855f7',
  CURRENCY_MISMATCH: '#6366f1',
  SCHEME_OR_MID_MISMATCH: '#3b82f6',
  FEES_VARIANCE: '#06b6d4',
  PARTIAL_CAPTURE_OR_REFUND_PENDING: '#14b8a6',
  SPLIT_SETTLEMENT_UNALLOCATED: '#6b7280'
};

interface ExceptionAgeingChartProps {
  data: AgeingResponse;
  window: Window;
  onShowSLAHeatmap?: () => void;
}

export function ExceptionAgeingChart({ 
  data, 
  window,
  onShowSLAHeatmap 
}: ExceptionAgeingChartProps) {
  const navigate = useNavigate();
  const [metricMode, setMetricMode] = useMetricMode();
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  // Transform data for chart
  const chartData = data.buckets.map(bucket => {
    const baseData: any = {
      bucket: bucket.bucket,
      total: metricMode === 'count' ? bucket.total.count : bucket.total.amount / 100,
      totalCount: bucket.total.count,
      totalAmount: bucket.total.amount
    };

    // Add reason breakdown
    bucket.reasons.forEach(reason => {
      baseData[reason.code] = metricMode === 'count' 
        ? reason.count 
        : reason.amount / 100;
      baseData[`${reason.code}_data`] = reason;
    });

    return baseData;
  });

  // Get all unique reason codes
  const allReasons = Array.from(new Set(
    data.buckets.flatMap(b => b.reasons.map(r => r.code))
  ));

  // Handle bar click for drill-through
  const handleBarClick = (data: any, reason?: string) => {
    const { min, max } = getAgeBucketHours(data.bucket);
    const link = buildExceptionsLink({
      from: window.from,
      to: window.to,
      ageMinHours: min,
      ageMaxHours: max,
      reasonCode: reason || undefined
    });
    navigate(link);
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload[0]) return null;
    
    const data = payload[0].payload;
    const relevantReasons = payload.filter((p: any) => 
      p.dataKey !== 'total' && p.value > 0
    );

    return (
      <div className="bg-white p-3 border rounded-lg shadow-lg">
        <p className="font-semibold mb-2">{data.bucket}</p>
        <p className="text-sm mb-2">
          Total: {data.totalCount} exceptions • {formatIndianCurrency(data.totalAmount)}
        </p>
        <div className="space-y-1">
          {relevantReasons.map((entry: any) => {
            const reasonData = data[`${entry.dataKey}_data`];
            if (!reasonData) return null;
            
            return (
              <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
                <div 
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: entry.fill }}
                />
                <span>{reasonData.label}</span>
                <span className="font-medium">
                  {reasonData.count} ({reasonData.percentOpen.toFixed(0)}%)
                </span>
                {metricMode === 'amount' && (
                  <span className="text-gray-500">
                    • {formatIndianCurrency(reasonData.amount)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Format value for display
  const formatValue = (value: number) => {
    if (metricMode === 'count') {
      return value.toString();
    }
    return formatIndianCurrency(value * 100);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900">Exception Ageing</h3>
          <div className="group relative">
            <Info className="h-4 w-4 text-gray-400" />
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-80">
              <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3">
                Backlog of open exceptions by age and reason. Goal: keep &gt;7d = 0 and minimize 2–7d. 
                Click any bar slice to open the filtered queue.
                <div className="absolute top-full left-4 -mt-1">
                  <div className="border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <MetricToggle value={metricMode} onChange={setMetricMode} />
          {onShowSLAHeatmap && (
            <button
              onClick={onShowSLAHeatmap}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Show SLA Heatmap
            </button>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart 
            data={chartData}
            onClick={(e) => {
              if (e && e.activePayload) {
                const payload = e.activePayload[0];
                handleBarClick(payload.payload, payload.dataKey);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket" />
            <YAxis 
              tickFormatter={(value) => 
                metricMode === 'count' ? value : `₹${(value / 1000).toFixed(0)}K`
              }
            />
            <ChartTooltip content={<CustomTooltip />} />
            <Legend 
              onClick={(e) => {
                const reason = e.dataKey as string;
                setSelectedReason(selectedReason === reason ? null : reason);
              }}
              wrapperStyle={{ cursor: 'pointer' }}
            />
            
            {allReasons.map(reason => (
              <Bar
                key={reason}
                dataKey={reason}
                stackId="1"
                fill={REASON_COLORS[reason] || '#6b7280'}
                opacity={selectedReason && selectedReason !== reason ? 0.3 : 1}
                cursor="pointer"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>

        {/* SLA Breach Indicators */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Red band for >7d */}
          <div 
            className="absolute bg-red-50 border-l-2 border-red-500"
            style={{
              right: 0,
              width: '25%',
              height: 'calc(100% - 40px)',
              opacity: 0.3
            }}
          >
            <AlertTriangle className="absolute top-2 right-2 h-4 w-4 text-red-500" />
          </div>
          
          {/* Amber border for 2-7d */}
          <div 
            className="absolute border-l-2 border-amber-400"
            style={{
              right: '25%',
              width: '25%',
              height: 'calc(100% - 40px)',
              borderRight: '2px solid rgb(251 191 36)',
              opacity: 0.5
            }}
          />
        </div>

        {/* Bar totals */}
        <div className="absolute inset-x-0 bottom-10 flex justify-around pointer-events-none">
          {chartData.map((item, index) => (
            <div 
              key={item.bucket}
              className="text-xs font-semibold text-gray-700"
              style={{ width: `${100 / chartData.length}%`, textAlign: 'center' }}
            >
              {formatValue(item.total)}
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm">
        <div className="text-gray-600">
          Total Open: <span className="font-semibold text-gray-900">
            {data.openTotal.count} exceptions
          </span>
          <span className="mx-2">•</span>
          <span className="font-semibold text-gray-900">
            {formatIndianCurrency(data.openTotal.amount)}
          </span>
        </div>
        
        {data.buckets.find(b => b.bucket === '>7d')?.total.count > 0 && (
          <button
            onClick={() => {
              const link = buildExceptionsLink({
                from: window.from,
                to: window.to,
                ageMinHours: 168
              });
              navigate(link);
            }}
            className="px-3 py-1 bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors"
          >
            Assign all &gt;7d ({data.buckets.find(b => b.bucket === '>7d')?.total.count})
          </button>
        )}
      </div>
    </div>
  );
}