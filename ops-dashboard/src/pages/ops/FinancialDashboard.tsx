import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TimeRangePicker, TimeRange, getTimeRangeBounds } from '@/components/TimeRangePicker';
import { useFinancialAnalytics } from '@/hooks/useFinancialAnalytics';
import { TrendingUp, TrendingDown, Minus, Download, DollarSign, CreditCard, Building2, Target, BarChart3, Wallet, RefreshCw } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { format, formatDistanceToNow } from 'date-fns';
import { safeParseInt, safeToFixed } from '@/lib/mathUtils';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Color palette
const COLORS = {
  revenue: '#4F46E5',
  margin: '#10B981',
  bankCharges: '#F59E0B',
  positive: '#10B981',
  negative: '#EF4444',
  neutral: '#6B7280'
};

// Delta indicator component
function DeltaIndicator({ value, type = 'percent' }: { value?: number; type?: 'amount' | 'percent' }) {
  if (value === undefined || value === 0) {
    return <Minus className="w-3 h-3 text-gray-400 inline" />;
  }

  const isPositive = value > 0;
  const color = isPositive ? 'text-green-600' : 'text-red-600';
  const bgColor = isPositive ? 'bg-green-50' : 'bg-red-50';
  const Icon = isPositive ? TrendingUp : TrendingDown;

  const formattedValue = type === 'percent'
    ? `${isPositive ? '+' : ''}${value.toFixed(1)}%`
    : `${isPositive ? '+' : ''}${Math.abs(value).toLocaleString('en-IN')}`;

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${color} ${bgColor}`}>
      <Icon className="w-3 h-3" />
      {formattedValue}
    </span>
  );
}

// KPI Card component
function KpiCard({
  title,
  value,
  icon,
  delta,
  loading = false
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  delta?: number;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card className="hover:shadow-lg transition-all duration-200">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
            <div className="h-3 bg-gray-200 rounded w-1/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-lg transition-all duration-200 border-gray-200">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-gray-400">{icon}</span>
              <p className="text-sm font-medium text-gray-600">{title}</p>
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-1">
              {value}
            </p>
            <p className="text-xs text-gray-500">vs prev period</p>
          </div>
          {delta !== undefined && (
            <DeltaIndicator value={delta} type="percent" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FinancialDashboard() {
  const queryClient = useQueryClient();
  const [timeRange, setTimeRange] = useState<TimeRange>('last7d');

  // Convert TimeRange to date bounds
  const bounds = getTimeRangeBounds(timeRange);
  const from = bounds.start.toISOString().split('T')[0];
  const to = bounds.end.toISOString().split('T')[0];

  // Fetch financial analytics
  const { data, isLoading, error, dataUpdatedAt } = useFinancialAnalytics({
    from,
    to,
    groupBy: 'day'
  });

  // Handle manual refresh
  const handleRefresh = () => {
    queryClient.invalidateQueries(['financial-analytics']);
    toast.success('Refreshing financial data...');
  };

  // Chart options for revenue trends
  const chartOptions = useMemo(() => {
    if (!data?.trends) return {};

    const dates = data.trends.map((p) => format(new Date(p.date), 'MMM d'));
    const revenue = data.trends.map((p) => safeParseInt(p.revenue) / 100);
    const margin = data.trends.map((p) => p.marginPercent);
    const bankCharges = data.trends.map((p) => safeParseInt(p.bankCharges) / 100);

    return {
      tooltip: {
        trigger: 'axis',
        formatter: function (params: any) {
          const date = params[0].axisValue;
          const point = data.trends![params[0].dataIndex];
          return `
            <div style="padding: 8px;">
              <div style="font-weight: 600; margin-bottom: 4px;">${date}</div>
              <div style="color: ${COLORS.revenue};">Revenue: ₹${(safeParseInt(point.revenue) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              <div style="color: ${COLORS.margin};">Margin: ${point.marginPercent.toFixed(2)}%</div>
              <div style="color: ${COLORS.bankCharges};">Bank Charges: ₹${(safeParseInt(point.bankCharges) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            </div>
          `;
        }
      },
      legend: {
        data: ['Revenue (₹)', 'Margin (%)', 'Bank Charges (₹)'],
        bottom: 0
      },
      grid: { left: 70, right: 70, bottom: 60, top: 20 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { rotate: 45 }
      },
      yAxis: [
        {
          type: 'value',
          name: 'Amount (₹)',
          position: 'left',
          axisLabel: {
            formatter: function (value: number) {
              if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
              if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
              return `₹${value.toFixed(0)}`;
            }
          }
        },
        {
          type: 'value',
          name: 'Margin (%)',
          position: 'right',
          min: 0,
          max: 100,
          axisLabel: {
            formatter: '{value}%'
          }
        }
      ],
      series: [
        {
          name: 'Revenue (₹)',
          type: 'line',
          smooth: true,
          lineStyle: { width: 3, color: COLORS.revenue },
          itemStyle: { color: COLORS.revenue },
          data: revenue,
          yAxisIndex: 0
        },
        {
          name: 'Margin (%)',
          type: 'line',
          smooth: true,
          lineStyle: { width: 3, color: COLORS.margin },
          itemStyle: { color: COLORS.margin },
          data: margin,
          yAxisIndex: 1
        },
        {
          name: 'Bank Charges (₹)',
          type: 'line',
          smooth: true,
          lineStyle: { width: 2, type: 'dashed', color: COLORS.bankCharges },
          itemStyle: { color: COLORS.bankCharges },
          data: bankCharges,
          yAxisIndex: 0
        }
      ]
    };
  }, [data]);

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          Error loading financial analytics: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Analytics</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-gray-500">Revenue, margins, and financial performance</p>
            {dataUpdatedAt && (
              <span className="text-xs text-gray-400">
                • Updated {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <TimeRangePicker value={timeRange} onChange={setTimeRange} />
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Key Financial Metrics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard
            title="GMV"
            value={data?.summary.gmv.formatted || '₹0'}
            icon={<DollarSign className="w-4 h-4" />}
            delta={data?.deltas?.gmvPct}
            loading={isLoading}
          />
          <KpiCard
            title="MDR Collected"
            value={data?.summary.mdrCollected.formatted || '₹0'}
            icon={<CreditCard className="w-4 h-4" />}
            delta={data?.deltas?.mdrPct}
            loading={isLoading}
          />
          <KpiCard
            title="Bank Charges"
            value={data?.summary.bankChargesPaid.formatted || '₹0'}
            icon={<Building2 className="w-4 h-4" />}
            delta={data?.deltas?.bankChargesPct}
            loading={isLoading}
          />
          <KpiCard
            title="SettlePaisa Revenue"
            value={data?.summary.settlepaisaRevenue.formatted || '₹0'}
            icon={<Target className="w-4 h-4" />}
            delta={data?.deltas?.revenuePct}
            loading={isLoading}
          />
          <KpiCard
            title="Gross Margin"
            value={data ? `${safeToFixed(data.summary.grossMarginPercent, 2)}%` : '0%'}
            icon={<BarChart3 className="w-4 h-4" />}
            delta={data?.deltas?.marginPct}
            loading={isLoading}
          />
          <KpiCard
            title="Net Settled"
            value={data?.summary.netSettled.formatted || '₹0'}
            icon={<Wallet className="w-4 h-4" />}
            delta={data?.deltas?.netSettledPct}
            loading={isLoading}
          />
        </div>
      </div>

      {/* Revenue Trends Chart */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue & Margin Trends</h2>
          {isLoading ? (
            <div className="h-96 flex items-center justify-center">
              <div className="animate-pulse text-gray-400">Loading trends...</div>
            </div>
          ) : data?.trends && data.trends.length > 0 ? (
            <ReactECharts option={chartOptions} style={{ height: '400px' }} />
          ) : (
            <div className="h-96 flex items-center justify-center text-gray-400">
              No trend data available for selected period
            </div>
          )}
        </CardContent>
      </Card>

      {/* Business Summary */}
      {data && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Business Summary</h2>
            <div className="space-y-2 text-sm text-gray-600">
              <p>
                <span className="font-medium text-gray-700">Period:</span>{' '}
                {format(new Date(data.period.from), 'MMM d, yyyy')} - {format(new Date(data.period.to), 'MMM d, yyyy')} ({data.period.days} days)
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Transactions</p>
                  <p className="text-2xl font-bold text-gray-900">{data.summary.transactionCount.toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Merchants</p>
                  <p className="text-2xl font-bold text-gray-900">{data.summary.merchantCount}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Avg Transaction</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ₹{data.summary.avgTransactionValue.rupees.toLocaleString('en-IN')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Batches</p>
                  <p className="text-2xl font-bold text-gray-900">{data.summary.batchCount}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
