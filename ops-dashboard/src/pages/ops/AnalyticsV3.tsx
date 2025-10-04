import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TimeRangePicker, TimeRange, getTimeRangeBounds } from '@/components/TimeRangePicker';
import { 
  useAnalyticsKpisV3,
  useGmvTrendV3,
  useSettlementFunnelV3,
  useSettlementParetoV3,
  useAcquirers,
  usePaymentModes
} from '@/hooks/useAnalyticsV3';
import { formatINR } from '@/lib/currency';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown, Minus, Download, Filter, X } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { PaymentModeSummary } from '@/components/Analytics/PaymentModeSummary';
import { FailureReasonsSummary } from '@/components/Analytics/FailureReasonsSummary';

// Professional color palette
const CHART_COLORS = {
  primary: '#4F46E5',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
  purple: '#8B5CF6',
  pink: '#EC4899',
  gray: '#6B7280',
  modes: {
    UPI: '#4F46E5',
    CARD: '#10B981',
    NETBANKING: '#F59E0B',
    WALLET: '#EF4444',
    QR: '#8B5CF6'
  }
};

// Delta indicator component with professional styling
function DeltaIndicator({ value, type = 'count', good = 'up' }: { 
  value?: number; 
  type?: 'count' | 'amount' | 'percent';
  good?: 'up' | 'down';
}) {
  if (!value || value === 0) {
    return <Minus className="w-3 h-3 text-gray-400 inline" />;
  }
  
  const isPositive = value > 0;
  const isGood = (good === 'up' && isPositive) || (good === 'down' && !isPositive);
  const color = isGood ? 'text-green-600' : 'text-red-600';
  const bgColor = isGood ? 'bg-green-50' : 'bg-red-50';
  const Icon = isPositive ? TrendingUp : TrendingDown;
  
  const formattedValue = type === 'percent' 
    ? `${isPositive ? '+' : ''}${value.toFixed(1)}%`
    : type === 'amount'
    ? formatINR(Math.abs(value), true)
    : `${isPositive ? '+' : ''}${Math.abs(value).toLocaleString('en-IN')}`;
  
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${color} ${bgColor}`}>
      <Icon className="w-3 h-3" />
      {formattedValue}
    </span>
  );
}

// Professional KPI Card
function KpiCard({ 
  title, 
  value, 
  subValue, 
  delta, 
  deltaType = 'count',
  goodDirection = 'up',
  loading = false,
  icon
}: {
  title: string;
  value: string | number;
  subValue?: string;
  delta?: number;
  deltaType?: 'count' | 'amount' | 'percent';
  goodDirection?: 'up' | 'down';
  loading?: boolean;
  icon?: React.ReactNode;
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
              {icon && <span className="text-gray-400">{icon}</span>}
              <p className="text-sm font-medium text-gray-600">{title}</p>
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-1">
              {value}
            </p>
            {subValue && (
              <p className="text-xs text-gray-500">
                {subValue}
              </p>
            )}
          </div>
          {delta !== undefined && (
            <DeltaIndicator value={delta} type={deltaType} good={goodDirection} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsV3() {
  const [timeRange, setTimeRange] = useState<TimeRange>('last7d');
  const [selectedAcquirers, setSelectedAcquirers] = useState<string[]>([]);
  const [selectedModes, setSelectedModes] = useState<string[]>([]);
  
  // Convert TimeRange to date bounds
  const bounds = getTimeRangeBounds(timeRange);
  const scope = {
    from: bounds.start.toISOString().split('T')[0],
    to: bounds.end.toISOString().split('T')[0],
    acquirerIds: selectedAcquirers.length > 0 ? selectedAcquirers : undefined,
    modes: selectedModes.length > 0 ? selectedModes : undefined
  };
  
  // Fetch all data
  const { data: kpis, isLoading: kpisLoading } = useAnalyticsKpisV3(scope);
  // const { data: modeData, isLoading: modeLoading } = useModeStackedV3(scope); // No longer needed
  const { data: trendData, isLoading: trendLoading } = useGmvTrendV3(scope);
  const { data: funnelData, isLoading: funnelLoading } = useSettlementFunnelV3(scope);
  const { data: paretoData, isLoading: paretoLoading } = useSettlementParetoV3({ ...scope, limit: 8 });
  const { data: acquirers } = useAcquirers();
  const { data: paymentModes } = usePaymentModes();

  // GMV trend chart options
  const gmvChartOptions = useMemo(() => {
    if (!trendData?.points) return {};
    
    const dates = trendData.points.map((p: any) => format(new Date(p.date), 'MMM d'));
    const captured = trendData.points.map((p: any) => p.capturedPaise / 100);
    const settled = trendData.points.map((p: any) => p.settledPaise / 100);
    const capturedAvg = trendData.points.map((p: any) => p.capturedPaiseAvg7 / 100);
    const settledAvg = trendData.points.map((p: any) => p.settledPaiseAvg7 / 100);
    
    return {
      tooltip: {
        trigger: 'axis',
        formatter: function(params: any) {
          const date = params[0].axisValue;
          const point = trendData.points[params[0].dataIndex];
          return `
            <div style="padding: 8px;">
              <div style="font-weight: 600; margin-bottom: 4px;">${date}</div>
              <div style="color: ${CHART_COLORS.primary};">Captured: ${formatINR(point.capturedPaise)} (${point.capturedTxns} txns)</div>
              <div style="color: ${CHART_COLORS.success};">Settled: ${formatINR(point.settledPaise)} (${point.settledTxns} txns)</div>
            </div>
          `;
        }
      },
      legend: {
        data: ['Captured GMV', 'Settled GMV', '7d Avg (Captured)', '7d Avg (Settled)'],
        bottom: 0
      },
      grid: { left: 70, right: 30, bottom: 60, top: 20 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { rotate: 45 }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: function(value: number) {
            if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
            if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
            return `₹${(value / 1000).toFixed(0)}K`;
          }
        }
      },
      series: [
        {
          name: 'Captured GMV',
          type: 'line',
          smooth: true,
          lineStyle: { width: 3, color: CHART_COLORS.primary },
          itemStyle: { color: CHART_COLORS.primary },
          data: captured,
          emphasis: { focus: 'series' }
        },
        {
          name: 'Settled GMV',
          type: 'line',
          smooth: true,
          lineStyle: { width: 3, color: CHART_COLORS.success },
          itemStyle: { color: CHART_COLORS.success },
          data: settled,
          emphasis: { focus: 'series' }
        },
        {
          name: '7d Avg (Captured)',
          type: 'line',
          smooth: true,
          lineStyle: { width: 1, type: 'dashed', color: CHART_COLORS.primary, opacity: 0.5 },
          itemStyle: { opacity: 0 },
          data: capturedAvg,
          emphasis: { focus: 'series' }
        },
        {
          name: '7d Avg (Settled)',
          type: 'line',
          smooth: true,
          lineStyle: { width: 1, type: 'dashed', color: CHART_COLORS.success, opacity: 0.5 },
          itemStyle: { opacity: 0 },
          data: settledAvg,
          emphasis: { focus: 'series' }
        }
      ]
    };
  }, [trendData]);

  // Settlement funnel chart options
  const funnelChartOptions = useMemo(() => {
    if (!funnelData?.funnel) return {};
    
    // Build stages array with only meaningful distinct stages
    const stageData = [
      { name: 'Captured', value: parseFloat(funnelData.funnel.captured.percentage), color: CHART_COLORS.primary },
      { name: 'Reconciled', value: parseFloat(funnelData.funnel.reconciled.percentage), color: CHART_COLORS.info },
      { name: 'Settled', value: parseFloat(funnelData.funnel.settled.percentage), color: CHART_COLORS.success },
    ];
    
    // Only add "Paid Out" if it's different from "Settled" (has actual payout data)
    const paidOutPct = parseFloat(funnelData.funnel.paid_out.percentage);
    const settledPct = parseFloat(funnelData.funnel.settled.percentage);
    if (paidOutPct > 0 && paidOutPct !== settledPct) {
      stageData.push({ name: 'Paid Out', value: paidOutPct, color: CHART_COLORS.purple });
    }
    
    return {
      tooltip: {
        trigger: 'item',
        formatter: function(params: any) {
          return `
            <div style="padding: 8px;">
              <div style="font-weight: 600;">${params.name}</div>
              <div>${params.value}% of captured</div>
            </div>
          `;
        }
      },
      series: [
        {
          type: 'funnel',
          left: '10%',
          top: 20,
          bottom: 20,
          width: '80%',
          min: 0,
          max: 100,
          minSize: '0%',
          maxSize: '100%',
          sort: 'descending',
          gap: 2,
          label: {
            show: true,
            position: 'inside',
            formatter: '{b}: {c}%'
          },
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 1
          },
          emphasis: {
            label: {
              fontSize: 20
            }
          },
          data: stageData.map(stage => ({
            value: stage.value,
            name: stage.name,
            itemStyle: {
              color: stage.color
            }
          }))
        }
      ]
    };
  }, [funnelData]);

  // Pareto chart options
  const paretoChartOptions = useMemo(() => {
    if (!paretoData?.bars) return {};
    
    const reasons = paretoData.bars.map((b: any) => b.reason);
    const counts = paretoData.bars.map((b: any) => b.txns);
    const cumulative = paretoData.cumulative.map((c: any) => c.cumPct);
    
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          crossStyle: {
            color: '#999'
          }
        }
      },
      legend: {
        data: ['Transaction Count', 'Cumulative %'],
        bottom: 0
      },
      grid: { left: 60, right: 60, bottom: 60, top: 20 },
      xAxis: [
        {
          type: 'category',
          data: reasons,
          axisPointer: {
            type: 'shadow'
          },
          axisLabel: { rotate: 45 }
        }
      ],
      yAxis: [
        {
          type: 'value',
          name: 'Transactions',
          position: 'left',
          axisLabel: {
            formatter: '{value}'
          }
        },
        {
          type: 'value',
          name: 'Cumulative %',
          position: 'right',
          axisLabel: {
            formatter: '{value}%'
          }
        }
      ],
      series: [
        {
          name: 'Transaction Count',
          type: 'bar',
          data: counts,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: CHART_COLORS.danger },
              { offset: 1, color: '#FCA5A5' }
            ])
          }
        },
        {
          name: 'Cumulative %',
          type: 'line',
          yAxisIndex: 1,
          data: cumulative,
          smooth: true,
          lineStyle: {
            width: 3,
            color: CHART_COLORS.primary
          },
          itemStyle: {
            color: CHART_COLORS.primary
          }
        }
      ]
    };
  }, [paretoData]);

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="bg-white border-b sticky top-0 z-10 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settlement Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">Real-time settlement performance metrics</p>
          </div>
          <div className="flex items-center gap-3">
            <TimeRangePicker 
              value={timeRange} 
              onChange={setTimeRange} 
            />
            
            <Select 
              value={selectedAcquirers.length === 0 ? "all" : selectedAcquirers[0]}
              onValueChange={(value) => {
                if (value === "all") {
                  setSelectedAcquirers([]);
                } else {
                  setSelectedAcquirers([value]);
                }
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Acquirers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Acquirers</SelectItem>
                {acquirers?.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="flex items-center gap-2">
                      {a.logo} {a.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select
              value={selectedModes.length === 0 ? "all" : selectedModes[0]}
              onValueChange={(value) => {
                if (value === "all") {
                  setSelectedModes([]);
                } else {
                  setSelectedModes([value]);
                }
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Modes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modes</SelectItem>
                {paymentModes?.map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      {m.icon} {m.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
        
        {/* Active filters */}
        {(selectedAcquirers.length > 0 || selectedModes.length > 0) && (
          <div className="flex items-center gap-2 mt-3">
            <Filter className="w-4 h-4 text-gray-400" />
            {selectedAcquirers.map(a => (
              <Badge key={a} variant="secondary">
                {a}
                <X className="w-3 h-3 ml-1 cursor-pointer" 
                   onClick={() => setSelectedAcquirers(selectedAcquirers.filter(id => id !== a))} />
              </Badge>
            ))}
            {selectedModes.map(m => (
              <Badge key={m} variant="secondary">
                {m}
                <X className="w-3 h-3 ml-1 cursor-pointer" 
                   onClick={() => setSelectedModes(selectedModes.filter(id => id !== m))} />
              </Badge>
            ))}
          </div>
        )}
      </div>
      
      <div className="px-6">
        {/* KPI Cards */}
        <div className="grid gap-4 lg:grid-cols-4 mb-6">
          <KpiCard
            title="Settled Transactions"
            value={kpisLoading ? '...' : (kpis?.settled?.count ?? 0).toLocaleString('en-IN')}
            subValue={kpisLoading ? '...' : formatINR(kpis?.settled?.amountPaise ?? '0')}
            delta={kpis?.deltas?.settled?.count}
            deltaType="count"
            goodDirection="up"
            loading={kpisLoading}
            icon="✅"
          />
          
          <KpiCard
            title="Unsettled Transactions"
            value={kpisLoading ? '...' : (kpis?.unsettled?.count ?? 0).toLocaleString('en-IN')}
            subValue={kpisLoading ? '...' : formatINR(kpis?.unsettled?.amountPaise ?? '0')}
            delta={kpis?.deltas?.unsettled?.count}
            deltaType="count"
            goodDirection="down"
            loading={kpisLoading}
            icon="⚠️"
          />
          
          <KpiCard
            title="Settlement Rate"
            value={kpisLoading ? '...' : `${kpis?.settlementSrPct ?? 0}%`}
            subValue={`${format(bounds.start, 'MMM d')} - ${format(bounds.end, 'MMM d')}`}
            delta={kpis?.deltas?.settlementSrPctPoints}
            deltaType="percent"
            goodDirection="up"
            loading={kpisLoading}
            icon="📊"
          />
          
          <KpiCard
            title="Avg Settlement Time"
            value={kpisLoading ? '...' : `${((kpis?.avgSettlementHrs ?? 0) / 24).toFixed(1)} days`}
            subValue="From capture to credit"
            delta={kpis?.deltas?.avgSettlementHrs}
            deltaType="count"
            goodDirection="down"
            loading={kpisLoading}
            icon="⏱️"
          />
        </div>
        
        {/* Charts Row 1 */}
        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          <PaymentModeSummary scope={scope} />
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">GMV Trend Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              {trendLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <ReactECharts option={gmvChartOptions} style={{ height: '300px' }} />
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Charts Row 2 */}
        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Settlement Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              {funnelLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <ReactECharts option={funnelChartOptions} style={{ height: '300px' }} />
              )}
            </CardContent>
          </Card>
          
          <FailureReasonsSummary scope={scope} />
        </div>
      </div>
    </div>
  );
}