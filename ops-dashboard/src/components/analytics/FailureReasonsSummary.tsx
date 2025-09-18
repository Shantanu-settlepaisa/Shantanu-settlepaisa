import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card } from '../ui/card';
import { ArrowUp, ArrowDown, Minus, Info, ChevronRight } from 'lucide-react';
import { useSettlementFailureBreakup, useSettlementFailurePerformance } from '../../hooks/useAnalyticsV3';
import type { AnalyticsScope } from '../../hooks/useAnalyticsV3';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface FailureReasonsSummaryProps {
  scope: AnalyticsScope;
}

// Owner category colors (from Cashfree taxonomy)
const OWNER_COLORS: Record<string, string> = {
  Bank: '#0EA5A5',        // Teal
  Beneficiary: '#22C55E', // Green
  Gateway: '#6366F1',     // Indigo
  Ops: '#F59E0B',        // Amber
  System: '#EF4444',     // Red
  Other: '#94A3B8',      // Slate
};

// Text colors for owners
const OWNER_TEXT_COLORS: Record<string, string> = {
  Bank: 'text-teal-600',
  Beneficiary: 'text-green-600',
  Gateway: 'text-indigo-600',
  Ops: 'text-amber-600',
  System: 'text-red-600',
  Other: 'text-slate-600',
};

export function FailureReasonsSummary({ scope }: FailureReasonsSummaryProps) {
  const { data: breakupData, isLoading: isLoadingBreakup } = useSettlementFailureBreakup(scope);
  const { data: perfData, isLoading: isLoadingPerf } = useSettlementFailurePerformance({ ...scope, anchor: scope.to, limit: 8 });
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<Set<string>>(new Set());

  // Build donut chart options
  const chartOption = useMemo(() => {
    if (!breakupData?.slices?.length) {
      return null;
    }

    const slices = breakupData.slices;
    const largestSlice = slices[0]; // Already sorted by sharePct
    const displaySlice = hoveredSlice ? 
      slices.find(s => s.code === hoveredSlice) : 
      largestSlice;

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const slice = slices[params.dataIndex];
          const impact = (BigInt(slice.impactPaise) / BigInt(10000000)).toString();
          return `
            <div class="p-2">
              <div class="font-semibold">${slice.label}</div>
              <div class="text-xs text-gray-500">${slice.owner}</div>
              <div class="text-sm mt-1">
                <div>Share: ${params.value}%</div>
                <div>Failed Txns: ${slice.txns.toLocaleString('en-IN')}</div>
                <div>Impact: ₹${impact} Cr</div>
              </div>
            </div>
          `;
        },
      },
      series: [
        {
          type: 'pie',
          radius: ['55%', '78%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 8,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: false,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
          data: slices.map(slice => ({
            value: slice.sharePct,
            name: slice.label,
            code: slice.code,
            txns: slice.txns,
            impactPaise: slice.impactPaise,
            itemStyle: {
              color: OWNER_COLORS[slice.owner] || OWNER_COLORS.Other,
            },
          })),
        },
      ],
      graphic: [
        {
          type: 'text',
          left: 'center',
          top: '42%',
          style: {
            text: displaySlice?.label || '',
            fontSize: 14,
            fontWeight: 'bold',
            fill: '#1F2937',
          },
        },
        {
          type: 'text',
          left: 'center',
          top: '50%',
          style: {
            text: `${displaySlice?.sharePct || 0}%`,
            fontSize: 20,
            fontWeight: 'bold',
            fill: OWNER_COLORS[displaySlice?.owner || 'Other'],
          },
        },
        {
          type: 'text',
          left: 'center',
          top: '58%',
          style: {
            text: `(${displaySlice?.txns.toLocaleString('en-IN') || 0})`,
            fontSize: 12,
            fill: '#6B7280',
          },
        },
      ],
    };
  }, [breakupData, hoveredSlice]);

  // Format delta with proper color and arrow
  const formatDelta = (delta: number) => {
    // For failure rates, positive delta is bad (red), negative is good (green)
    if (delta > 0) {
      return (
        <span className="text-red-600 flex items-center gap-0.5 text-xs">
          <ArrowUp className="w-3 h-3" />
          {Math.abs(delta).toFixed(1)}%
        </span>
      );
    } else if (delta < 0) {
      return (
        <span className="text-green-600 flex items-center gap-0.5 text-xs">
          <ArrowDown className="w-3 h-3" />
          {Math.abs(delta).toFixed(1)}%
        </span>
      );
    }
    return (
      <span className="text-gray-500 flex items-center gap-0.5 text-xs">
        <Minus className="w-3 h-3" />
        0%
      </span>
    );
  };

  // Toggle reason selection for filtering
  const toggleReasonSelection = (code: string) => {
    const newSelection = new Set(selectedReasons);
    if (newSelection.has(code)) {
      newSelection.delete(code);
    } else {
      newSelection.add(code);
    }
    setSelectedReasons(newSelection);
  };

  // Filter performance data based on selected reasons
  const filteredPerfData = useMemo(() => {
    if (!perfData || selectedReasons.size === 0) return perfData;
    return {
      ...perfData,
      rows: perfData.rows.filter((row: any) => selectedReasons.has(row.code)),
    };
  }, [perfData, selectedReasons]);

  if (isLoadingBreakup || isLoadingPerf) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="h-64 bg-gray-100 rounded"></div>
        </div>
      </Card>
    );
  }

  if (!breakupData || !perfData) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-500">No failure data available</div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900">Settlement Failure Analysis</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-4 h-4 text-gray-400" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Distribution and trend of settlement failure reasons based on Cashfree taxonomy. Rates are failure rate (failed ÷ due) for the selected acquirer(s) and date window. Deltas compare with the previous comparable window.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-sm text-gray-500 mt-1">Analysis of payout/settlement failure patterns based on Cashfree codes</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel - Donut Chart & Legend */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Failure Breakup (Settlement)</h4>
          
          {/* Donut Chart */}
          {chartOption && (
            <div 
              className="relative"
              onMouseEnter={(e) => {
                const target = (e.target as any).closest('[data-reason]');
                if (target) setHoveredSlice(target.dataset.reason);
              }}
              onMouseLeave={() => setHoveredSlice(null)}
            >
              <ReactECharts
                option={chartOption}
                style={{ height: '280px', width: '100%' }}
                opts={{ renderer: 'svg' }}
                onEvents={{
                  'mouseover': (params: any) => {
                    if (params.data?.code) {
                      setHoveredSlice(params.data.code);
                    }
                  },
                  'mouseout': () => {
                    setHoveredSlice(null);
                  },
                }}
              />
            </div>
          )}

          {/* Legend List */}
          <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
            {breakupData.slices.slice(0, 10).map((slice) => (
              <div
                key={slice.code}
                className={`flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors ${
                  selectedReasons.has(slice.code) ? 'bg-blue-50 border border-blue-200' : ''
                }`}
                onClick={() => toggleReasonSelection(slice.code)}
                onMouseEnter={() => setHoveredSlice(slice.code)}
                onMouseLeave={() => setHoveredSlice(null)}
                data-code={slice.code}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: OWNER_COLORS[slice.owner] || OWNER_COLORS.Other }}
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900">{slice.label}</div>
                    <div className={`text-xs ${OWNER_TEXT_COLORS[slice.owner] || 'text-gray-500'}`}>
                      {slice.owner}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900">{slice.sharePct}%</div>
                  <div className="text-xs text-gray-500">
                    {slice.txns.toLocaleString('en-IN')} txns
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedReasons.size > 0 && (
            <div className="mt-3 text-xs text-blue-600">
              {selectedReasons.size} reason{selectedReasons.size > 1 ? 's' : ''} selected - click to toggle
            </div>
          )}
        </div>

        {/* Right Panel - Performance Table */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Top Failure Reasons</h4>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Failure Reason
                  </th>
                  <th className="text-center py-3 px-2 text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Yesterday
                  </th>
                  <th className="text-center py-3 px-2 text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Current Week
                  </th>
                  <th className="text-center py-3 px-2 text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Current Month
                  </th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {(filteredPerfData?.rows || []).map((row: any, idx: number) => (
                  <tr
                    key={row.code}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      idx === (filteredPerfData?.rows?.length || 0) - 1 && row.code === 'FAILED' ? 'bg-gray-50' : ''
                    }`}
                  >
                    <td className="py-3 px-2">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{row.label}</div>
                        <div className={`text-xs ${OWNER_TEXT_COLORS[row.owner] || 'text-gray-500'}`}>
                          {row.owner}
                        </div>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <div className="text-sm font-medium text-gray-900">{row.yesterday.failureRatePct.toFixed(1)}%</div>
                      <div className="mt-1">{formatDelta(row.yesterday.deltaPctPoints)}</div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <div className="text-sm font-medium text-gray-900">{row.currentWeek.failureRatePct.toFixed(1)}%</div>
                      <div className="mt-1">{formatDelta(row.currentWeek.deltaPctPoints)}</div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <div className="text-sm font-medium text-gray-900">{row.currentMonth.failureRatePct.toFixed(1)}%</div>
                      <div className="mt-1">{formatDelta(row.currentMonth.deltaPctPoints)}</div>
                    </td>
                    <td className="py-3 px-2">
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedReasons.size > 0 && (
            <div className="mt-3 p-2 bg-blue-50 rounded text-xs text-blue-600">
              Showing {filteredPerfData?.rows?.length || 0} of {perfData?.rows?.length || 0} reasons
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}