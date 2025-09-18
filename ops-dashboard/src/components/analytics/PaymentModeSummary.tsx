import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card } from '../ui/card';
import { ArrowUp, ArrowDown, Minus, TrendingUp } from 'lucide-react';
import { useModeShare, useModePerformance } from '../../hooks/useAnalyticsV3';
import type { AnalyticsScope } from '../../hooks/useAnalyticsV3';

interface PaymentModeSummaryProps {
  scope: AnalyticsScope;
}

const MODE_COLORS: Record<string, string> = {
  UPI: '#6366F1',       // Indigo - Most popular
  CARD: '#14B8A6',      // Teal
  NETBANKING: '#F59E0B', // Amber
  WALLET: '#8B5CF6',    // Purple
  QR: '#EC4899',        // Pink
  OTHER: '#6B7280',     // Gray
};

const MODE_ICONS: Record<string, string> = {
  UPI: '📱',
  CARD: '💳',
  NETBANKING: '🏦',
  WALLET: '👛',
  QR: '📷',
  OTHER: '💰',
};

export function PaymentModeSummary({ scope }: PaymentModeSummaryProps) {
  const { data: shareData, isLoading: isLoadingShare } = useModeShare(scope);
  const { data: perfData, isLoading: isLoadingPerf } = useModePerformance(scope);

  const chartOption = useMemo(() => {
    if (!shareData?.slices?.length) {
      return null;
    }

    const sortedSlices = [...shareData.slices].sort((a, b) => b.sharePct - a.sharePct);
    
    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const slice = sortedSlices[params.dataIndex];
          const gmv = (BigInt(slice.gmvPaise) / BigInt(10000000)).toString();
          return `
            <div class="p-2">
              <div class="font-semibold">${params.name}</div>
              <div class="text-sm">
                <div>Share: ${params.value}%</div>
                <div>Txns: ${slice.txns.toLocaleString('en-IN')}</div>
                <div>GMV: ₹${gmv} Cr</div>
              </div>
            </div>
          `;
        },
      },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: false,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: '14',
              fontWeight: 'bold',
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
          data: sortedSlices.map(slice => ({
            value: slice.sharePct,
            name: slice.mode,
            itemStyle: {
              color: MODE_COLORS[slice.mode] || MODE_COLORS.OTHER,
            },
          })),
        },
      ],
    };
  }, [shareData]);

  const formatDelta = (delta: number) => {
    if (delta > 0) {
      return (
        <span className="text-green-600 flex items-center gap-0.5">
          <ArrowUp className="w-3 h-3" />
          {delta.toFixed(1)}%
        </span>
      );
    } else if (delta < 0) {
      return (
        <span className="text-red-600 flex items-center gap-0.5">
          <ArrowDown className="w-3 h-3" />
          {Math.abs(delta).toFixed(1)}%
        </span>
      );
    }
    return (
      <span className="text-gray-500 flex items-center gap-0.5">
        <Minus className="w-3 h-3" />
        0%
      </span>
    );
  };

  const formatBigIntCurrency = (value: string) => {
    const crores = BigInt(value) / BigInt(10000000);
    return `₹${crores.toLocaleString('en-IN')} Cr`;
  };

  if (isLoadingShare || isLoadingPerf) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="h-64 bg-gray-100 rounded"></div>
        </div>
      </Card>
    );
  }

  if (!shareData || !perfData) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-500">No data available</div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Payment Source Level Summary</h3>
        <p className="text-sm text-gray-500 mt-1">Transaction distribution by payment mode</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut Chart */}
        <div>
          {/* Total Stats Above Chart */}
          <div className="text-center mb-4">
            <div className="text-2xl font-bold text-gray-900">
              {shareData.totalTxns.toLocaleString('en-IN')} Transactions
            </div>
            <div className="text-lg text-gray-600">
              Total Volume: {formatBigIntCurrency(shareData.totalGmvPaise)}
            </div>
          </div>
          {chartOption && (
            <ReactECharts
              option={chartOption}
              style={{ height: '280px', width: '100%' }}
              opts={{ renderer: 'svg' }}
            />
          )}
        </div>

        {/* Stats Table */}
        <div className="space-y-3">
          {/* Mode Distribution */}
          <div className="space-y-2">
            {shareData.slices
              .sort((a, b) => b.sharePct - a.sharePct)
              .slice(0, 5)
              .map((slice) => (
                <div
                  key={slice.mode}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: MODE_COLORS[slice.mode] || MODE_COLORS.OTHER }}
                    />
                    <span className="text-2xl">{MODE_ICONS[slice.mode] || MODE_ICONS.OTHER}</span>
                    <div>
                      <div className="font-medium text-gray-900">{slice.mode}</div>
                      <div className="text-xs text-gray-500">
                        {slice.txns.toLocaleString('en-IN')} txns
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">{slice.sharePct}%</div>
                    <div className="text-xs text-gray-500">
                      {formatBigIntCurrency(slice.gmvPaise)}
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {/* Recent Performance */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-gray-600" />
              <h4 className="font-medium text-gray-900">Recent Performance</h4>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 rounded-lg bg-blue-50">
                <div className="text-xs text-gray-600 mb-1">Yesterday</div>
                <div className="font-semibold text-gray-900">{perfData.yesterday.srPct}%</div>
                <div className="text-xs mt-1">
                  {formatDelta(perfData.yesterday.deltaPctPoints)}
                </div>
              </div>
              <div className="text-center p-2 rounded-lg bg-green-50">
                <div className="text-xs text-gray-600 mb-1">This Week</div>
                <div className="font-semibold text-gray-900">{perfData.thisWeek.srPct}%</div>
                <div className="text-xs mt-1">
                  {formatDelta(perfData.thisWeek.deltaPctPoints)}
                </div>
              </div>
              <div className="text-center p-2 rounded-lg bg-purple-50">
                <div className="text-xs text-gray-600 mb-1">This Month</div>
                <div className="font-semibold text-gray-900">{perfData.thisMonth.srPct}%</div>
                <div className="text-xs mt-1">
                  {formatDelta(perfData.thisMonth.deltaPctPoints)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}