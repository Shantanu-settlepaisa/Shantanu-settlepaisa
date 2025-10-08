import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatIndianCurrency, getPercentage } from '@/services/overview';

type SegmentKey = 'IN_SETTLEMENT' | 'SENT_TO_BANK' | 'CREDITED' | 'UNSETTLED';

interface SegmentData {
  key: SegmentKey;
  count: number;
  color: string;
  label: string;
  value?: number;
}

interface SettlementPipelineProps {
  captured: number;
  inSettlement: number;
  sentToBank: number;
  credited: number;
  unsettled: number;
  capturedValue?: number;
  creditedValue?: number;
  warnings?: string[];
  onSegmentClick?: (segment: SegmentKey) => void;
  className?: string;
}

export function SettlementPipeline({
  captured,
  inSettlement,
  sentToBank,
  credited,
  unsettled,
  capturedValue,
  creditedValue,
  warnings,
  onSegmentClick,
  className,
}: SettlementPipelineProps) {
  const [mounted, setMounted] = useState(false);
  const [activeSegment, setActiveSegment] = useState<SegmentKey | null>(null);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // Guard against divide-by-zero
  const safeCaptured = Math.max(captured, 1);
  
  const segments: SegmentData[] = [
    {
      key: 'IN_SETTLEMENT',
      count: inSettlement,
      color: 'bg-blue-600',
      label: 'Reconciled',
    },
    {
      key: 'SENT_TO_BANK',
      count: sentToBank,
      color: 'bg-amber-500',
      label: 'Settled',
    },
    {
      key: 'CREDITED',
      count: credited,
      color: 'bg-emerald-500',
      label: 'Credited to Merchant',
      value: creditedValue,
    },
    {
      key: 'UNSETTLED',
      count: unsettled,
      color: 'bg-red-500',
      label: 'Exceptions',
    },
  ];

  const handleSegmentClick = (segment: SegmentKey) => {
    setActiveSegment(segment === activeSegment ? null : segment);
    onSegmentClick?.(segment);
  };

  // Calculate percentages for each segment
  const segmentsWithPercentage = segments.map(seg => ({
    ...seg,
    percentage: getPercentage(seg.count, safeCaptured),
  }));

  // Empty state
  if (captured === 0) {
    return (
      <TooltipProvider>
        <div className={cn('space-y-4', className)}>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-slate-900">Settlement Pipeline</h3>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm p-3">
                  <div className="space-y-2 text-xs">
                    <p className="font-medium">Settlement Lifecycle</p>
                    <p>🟦 <b>Reconciled</b> - Transactions matched with bank statements, ready for settlement</p>
                    <p>🟧 <b>Settled</b> - Settlement batch created with fees/TDS calculated</p>
                    <p>🟩 <b>Credited to Merchant</b> - Final payout completed to merchant account</p>
                    <p>🟥 <b>Exceptions</b> - Reconciliation failed or settlement rejected, needs review</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="text-sm text-slate-500">Captured: 0</span>
          </div>
          <div className="h-12 bg-slate-100 rounded-full flex items-center justify-center ring-1 ring-slate-200">
            <span className="text-sm text-slate-400">No transactions captured in this window</span>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn('space-y-4', className)}>
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-slate-900">Settlement Pipeline</h3>
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm p-3">
                <div className="space-y-2 text-xs">
                  <p className="font-medium">Settlement Lifecycle</p>
                  <p>🟦 <b>In Settlement</b> - Transaction captured and queued for settlement inside the PG system</p>
                  <p>🟧 <b>Sent to Bank</b> - Settlement instruction pushed to the bank, awaiting confirmation</p>
                  <p>🟩 <b>Credited</b> - Bank has confirmed credit to merchant account</p>
                  <p>🟥 <b>Unsettled</b> - Settlement failed/rejected, needs Ops action</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">
              Captured: <span className="font-medium text-slate-900">{(captured || 0).toLocaleString('en-IN')}</span>
            </span>
            {warnings && warnings.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">{warnings.join('. ')}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="relative">
          <div className="h-12 bg-slate-100 rounded-full overflow-hidden ring-1 ring-slate-200 flex">
            {segmentsWithPercentage.map((segment, index) => {
              const width = segment.percentage;
              const showLabel = width >= 8; // Show label if segment is at least 8% wide
              
              if (segment.count === 0) return null;
              
              return (
                <Tooltip key={segment.key}>
                  <TooltipTrigger asChild>
                    <motion.div
                      initial={mounted ? false : { width: 0 }}
                      animate={{ width: `${width}%` }}
                      transition={{ duration: 0.5, delay: index * 0.1, ease: 'easeOut' }}
                      className={cn(
                        segment.color,
                        'relative flex items-center justify-center cursor-pointer transition-opacity hover:opacity-90',
                        activeSegment && activeSegment !== segment.key && 'opacity-50'
                      )}
                      onClick={() => handleSegmentClick(segment.key)}
                      role="button"
                      tabIndex={0}
                      aria-label={`${segment.label}: ${segment.count} transactions`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          handleSegmentClick(segment.key);
                        }
                      }}
                    >
                      {showLabel && (
                        <span className="text-white text-sm font-medium px-2 truncate">
                          {(segment.count || 0).toLocaleString('en-IN')}
                        </span>
                      )}
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="space-y-1">
                      <p className="font-medium">{segment.label}</p>
                      <p className="text-xs">
                        Count: {(segment.count || 0).toLocaleString('en-IN')} ({segment.percentage}%)
                      </p>
                      {segment.value && (
                        <p className="text-xs">
                          Value: {formatIndianCurrency(segment.value)}
                        </p>
                      )}
                      {capturedValue && (
                        <p className="text-xs text-slate-400">
                          {getPercentage(segment.value || segment.count * 10000, capturedValue)}% of total value
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {segmentsWithPercentage.map((segment) => (
            <Badge
              key={segment.key}
              variant="outline"
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all',
                'hover:shadow-sm',
                activeSegment === segment.key && 'ring-2 ring-offset-2 ring-slate-900'
              )}
              onClick={() => handleSegmentClick(segment.key)}
            >
              <span
                className={cn('w-2 h-2 rounded-full', segment.color)}
                aria-hidden="true"
              />
              <span className="text-xs font-medium">
                {segment.label}
              </span>
              <span className="text-xs text-slate-500">
                {(segment.count || 0).toLocaleString('en-IN')}
              </span>
            </Badge>
          ))}
        </div>

        {/* Mobile Legend (shown only on small screens) */}
        <div className="md:hidden space-y-2 pt-2">
          {segmentsWithPercentage.map((segment) => (
            <div
              key={segment.key}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50"
              onClick={() => handleSegmentClick(segment.key)}
            >
              <div className="flex items-center gap-2">
                <span className={cn('w-3 h-3 rounded-full', segment.color)} />
                <span className="text-sm font-medium">{segment.label}</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium">{(segment.count || 0).toLocaleString('en-IN')}</div>
                <div className="text-xs text-slate-500">{segment.percentage}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}