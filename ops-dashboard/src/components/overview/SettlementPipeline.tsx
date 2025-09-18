import React, { useState } from 'react';
import { formatIndianCurrency } from '@/services/overview';
import { Info } from 'lucide-react';

// Types for the new prop structure
interface PipelineExclusive {
  inSettlementOnly: number;
  sentToBankOnly: number;
  credited: number;
  unsettled: number;
}

interface PipelineWarning {
  code: string;
  message: string;
}

interface OverviewPipeline {
  totalCaptured: number;
  raw: {
    inSettlement: number;
    sentToBank: number;
    creditedUtr: number;
  };
  exclusive: PipelineExclusive;
  warnings: PipelineWarning[];
}

interface SettlementPipelineProps {
  pipeline?: OverviewPipeline;
  definitions?: any;
  // Legacy props for backward compatibility
  captured?: number;
  inSettlement?: number;
  sentToBank?: number;
  credited?: number;
  unsettled?: number;
  capturedValue?: number;
  creditedValue?: number;
  warnings?: string[];
  onSegmentClick?: (segment: string) => void;
}

export function SettlementPipeline(props: SettlementPipelineProps) {
  // Handle both new pipeline structure and legacy props
  const captured = props.pipeline?.totalCaptured ?? props.captured ?? 0;
  const inSettlement = props.pipeline?.exclusive.inSettlementOnly ?? props.inSettlement ?? 0;
  const sentToBank = props.pipeline?.exclusive.sentToBankOnly ?? props.sentToBank ?? 0;
  const credited = props.pipeline?.exclusive.credited ?? props.credited ?? 0;
  const unsettled = props.pipeline?.exclusive.unsettled ?? props.unsettled ?? 0;
  const warnings = props.pipeline?.warnings ?? props.warnings;
  const onSegmentClick = props.onSegmentClick;
  
  const totalCaptured = captured || 1;
  
  // Calculate percentages for width
  const getWidth = (value: number) => {
    return totalCaptured > 0 ? (value / totalCaptured) * 100 : 0;
  };

  const formatNumber = (num: number): string => {
    return num.toLocaleString('en-IN');
  };

  // Debug log to check values
  console.log('[SettlementPipeline] Values:', {
    inSettlement,
    sentToBank,
    credited,
    unsettled,
    totalCaptured,
    sum: inSettlement + sentToBank + credited + unsettled
  });

  // Define segment colors and labels - now using mutually exclusive values directly
  const segments = [
    {
      key: 'inSettlement',
      value: inSettlement,
      color: 'bg-blue-500',
      label: 'In Settlement',
      emoji: '🟦'
    },
    {
      key: 'sentToBank',
      value: sentToBank,
      color: 'bg-amber-500',
      label: 'Sent to Bank',
      emoji: '🟧'
    },
    {
      key: 'credited',
      value: credited,
      color: 'bg-green-500',
      label: 'Credited',
      emoji: '🟩'
    },
    {
      key: 'unsettled',
      value: unsettled,
      color: 'bg-red-500',
      label: 'Unsettled',
      emoji: '🟥'
    }
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900">Settlement Pipeline</h3>
          
          {/* Info Icon with Tooltip */}
          <div className="relative group">
            <button
              className="text-gray-400 hover:text-gray-600 transition-colors cursor-help"
              aria-label="Explain settlement lifecycle"
              onClick={(e) => {
                e.stopPropagation();
                // Toggle tooltip on click for mobile
              }}
            >
              <Info className="h-4 w-4" />
            </button>
            
            {/* Custom Tooltip/Popover */}
            <div className="absolute left-0 top-6 z-50 hidden group-hover:block">
              <div className="w-96 bg-white border border-gray-200 rounded-lg shadow-lg p-4">
                <div className="space-y-3 text-sm leading-5">
                  <div className="font-semibold text-base">Settlement Lifecycle</div>
                  
                  <ul className="space-y-2">
                    <li className="flex gap-2">
                      <span>🟦</span>
                      <div>
                        <b>In Settlement</b> — Transaction captured and queued for settlement 
                        <i> inside the PG system</i>. Preparing batch & validations.
                      </div>
                    </li>
                    
                    <li className="flex gap-2">
                      <span>🟧</span>
                      <div>
                        <b>Sent to Bank</b> — Settlement instruction <i>pushed to the bank</i> 
                        (API/file). Awaiting bank confirmation; funds are in transit.
                      </div>
                    </li>
                    
                    <li className="flex gap-2">
                      <span>🟩</span>
                      <div>
                        <b>Credited</b> — Bank has <i>confirmed credit</i> to the merchant 
                        account (final success).
                      </div>
                    </li>
                    
                    <li className="flex gap-2">
                      <span>🟥</span>
                      <div>
                        <b>Unsettled</b> — Settlement <i>failed/rejected/expired</i> 
                        (e.g., invalid IFSC, account blocked, cut-off missed). Needs Ops action.
                      </div>
                    </li>
                  </ul>
                  
                  <div className="text-xs text-gray-500 border-t pt-2 mt-2">
                    <b>How to read:</b> Each segment is mutually-exclusive. 
                    <b> Captured = In Settlement + Sent to Bank + Credited + Unsettled</b> 
                    (selected date range).
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <span className="text-sm text-gray-500">
          Captured: <span className="font-semibold text-gray-900">{formatNumber(totalCaptured)}</span>
        </span>
      </div>

      {/* Pipeline Bar */}
      <div className="relative">
        <div className="flex h-12 rounded-lg overflow-hidden bg-gray-100">
          {segments.map((segment, index) => {
            const width = getWidth(segment.value);
            if (width === 0 && segment.value === 0) return null;
            
            return (
              <div
                key={segment.key}
                className={`${segment.color} relative flex items-center justify-center transition-all duration-300 hover:opacity-90 cursor-pointer`}
                style={{ width: `${Math.max(width, 0.1)}%` }}
                onClick={() => onSegmentClick?.(segment.key)}
                title={`${segment.label}: ${formatNumber(segment.value)} (${((segment.value / totalCaptured) * 100).toFixed(1)}%)`}
              >
                {width > 5 && (
                  <span className="text-white text-sm font-medium px-2">
                    {formatNumber(segment.value)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Labels below the bar */}
        <div className="flex gap-4 mt-3">
          {segments.map((segment) => {
            return (
              <div
                key={`${segment.key}-label`}
                className="flex items-center gap-2"
              >
                <div className={`w-3 h-3 rounded-full ${segment.color}`} />
                <span className="text-sm text-gray-600">
                  {segment.label}
                  <span className="ml-1 text-gray-400">
                    ({((segment.value / totalCaptured) * 100).toFixed(1)}%)
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mt-6 pt-4 border-t border-gray-200">
        {segments.map((segment) => (
          <div key={`${segment.key}-stat`} className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {formatNumber(segment.value)}
            </div>
            <div className="text-sm text-gray-500">{segment.label}</div>
            <div className="text-xs text-gray-400">
              {((segment.value / totalCaptured) * 100).toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}