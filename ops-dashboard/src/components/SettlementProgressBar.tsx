import React from 'react';
import { Info } from 'lucide-react';
import type { SettlementProgressData } from '@/types/settlementProgress';

interface SegmentProps {
  value: number;
  total: number;
  className: string;
  title: string;
}

const Segment: React.FC<SegmentProps> = ({ value, total, className, title }) => {
  const pct = total > 0 ? (value / total) * 100 : 0;
  if (pct <= 0) return null; // Don't render if no data
  
  return (
    <div
      className={`transition-all duration-500 ${className}`}
      style={{ width: `${pct}%` }}
      title={`${title}: ${value.toLocaleString()}`}
      aria-label={`${title}: ${value.toLocaleString()}`}
    />
  );
};

interface LegendDotProps {
  color: string;
  label: string;
  count?: number;
  tooltip?: string;
}

const LegendDot: React.FC<LegendDotProps> = ({ color, label, count, tooltip }) => (
  <div className="flex items-center gap-2 group">
    <span className={`h-2.5 w-2.5 rounded-full ${color} ring-2 ring-offset-1 ring-transparent group-hover:ring-gray-300`} />
    <div className="flex items-center gap-1">
      <span className="text-sm font-medium">{label}</span>
      {count !== undefined && (
        <span className="text-sm text-gray-500">({count.toLocaleString()})</span>
      )}
      {tooltip && (
        <div className="relative">
          <Info className="w-3 h-3 text-gray-400" />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
            <div className="bg-gray-900 text-white text-xs rounded-lg py-1 px-2 whitespace-nowrap">
              {tooltip}
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                <div className="border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
);

interface SettlementProgressBarProps {
  data: SettlementProgressData;
  showCounts?: boolean;
  className?: string;
}

export function SettlementProgressBar({ data, showCounts = true, className = '' }: SettlementProgressBarProps) {
  const total = data.captured_count || 0;
  
  // Define segments with exact OPS labels
  const segments = [
    {
      value: data.captured_count,
      className: 'bg-slate-400',
      label: 'Captured',
      tooltip: undefined
    },
    {
      value: data.in_settlement_count,
      className: 'bg-blue-500',
      label: 'In Settlement',
      tooltip: undefined
    },
    {
      value: data.sent_to_bank_count,
      className: 'bg-amber-500',
      label: 'Sent to Bank',
      tooltip: 'We have sent the payout file to the bank. Awaiting credit confirmation.'
    },
    {
      value: data.credited_count,
      className: 'bg-emerald-500',
      label: 'Credited (UTR)',
      tooltip: 'The bank confirmed credit. UTR available.'
    },
    {
      value: data.unsettled_count,
      className: 'bg-orange-600',
      label: 'Unsettled',
      tooltip: undefined
    }
  ];
  
  return (
    <div className={`w-full ${className}`}>
      {/* Progress Bar */}
      <div className="relative">
        <div className="flex h-8 w-full overflow-hidden rounded-lg bg-gray-100">
          {segments.map((segment, index) => (
            <Segment
              key={segment.label}
              value={segment.value}
              total={total}
              className={segment.className}
              title={segment.label}
            />
          ))}
        </div>
        
        {/* Zero state */}
        {total === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
            No transactions in selected period
          </div>
        )}
      </div>
      
      {/* Legend */}
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 lg:grid-cols-5">
        {segments.map((segment) => (
          <LegendDot
            key={segment.label}
            color={segment.className}
            label={segment.label}
            count={showCounts ? segment.value : undefined}
            tooltip={segment.tooltip}
          />
        ))}
      </div>
      
      {/* Summary Stats */}
      {showCounts && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Total Captured:</span>
              <span className="ml-2 font-semibold">{data.captured_count.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-gray-500">Credited:</span>
              <span className="ml-2 font-semibold text-emerald-600">
                {data.credited_count.toLocaleString()} ({((data.credited_count / total) * 100).toFixed(1)}%)
              </span>
            </div>
            <div>
              <span className="text-gray-500">Unsettled:</span>
              <span className="ml-2 font-semibold text-orange-600">
                {data.unsettled_count.toLocaleString()} ({((data.unsettled_count / total) * 100).toFixed(1)}%)
              </span>
            </div>
            {data.window && (
              <div>
                <span className="text-gray-500">Window:</span>
                <span className="ml-2 text-xs text-gray-600">
                  {new Date(data.window.from).toLocaleDateString()} - {new Date(data.window.to).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}