import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TimeRangePicker, TimeRange, getTimeRangeBounds } from '@/components/TimeRangePicker'
import { 
  useAnalyticsKpisV3,
  useModeStacked,
  useGmvTrendV2,
  useSettlementFunnel,
  usePareto
} from '@/hooks/useAnalyticsV2'
import { formatINR } from '@/lib/currency'
import { format } from 'date-fns'
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, 
  LabelList, Cell, ComposedChart, Area
} from 'recharts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { SettlementFailureChart } from '@/components/analytics/SettlementFailureChart'

// Format percentage helper
function formatPct(n?: number, digits = 1): string {
  if (n === undefined || n === null) return '0%';
  return `${n.toFixed(digits)}%`;
}

// Delta indicator component
function DeltaIndicator({ value, type = 'count', good = 'up' }: { 
  value?: number; 
  type?: 'count' | 'amount' | 'percent';
  good?: 'up' | 'down';
}) {
  if (!value || value === 0) {
    return <Minus className="w-4 h-4 text-gray-400 inline" />;
  }
  
  const isPositive = value > 0;
  const isGood = (good === 'up' && isPositive) || (good === 'down' && !isPositive);
  const color = isGood ? 'text-green-600' : 'text-red-600';
  const Icon = isPositive ? TrendingUp : TrendingDown;
  
  const formattedValue = type === 'percent' 
    ? `${isPositive ? '+' : ''}${value.toFixed(1)}pp`
    : type === 'amount'
    ? formatINR(Math.abs(value), true)
    : `${isPositive ? '+' : ''}${Math.abs(value).toLocaleString('en-IN')}`;
  
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${color}`}>
      <Icon className="w-4 h-4" />
      {formattedValue}
    </span>
  );
}

// KPI Tile with Delta
function KpiTileWithDelta({ 
  title, 
  value, 
  subValue, 
  delta, 
  deltaType = 'count',
  goodDirection = 'up',
  color = 'text-gray-900'
}: {
  title: string;
  value: string | number;
  subValue?: string;
  delta?: number;
  deltaType?: 'count' | 'amount' | 'percent';
  goodDirection?: 'up' | 'down';
  color?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground font-medium">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold ${color}`}>
          {value}
        </div>
        {subValue && (
          <div className="text-xs text-muted-foreground mt-1">
            {subValue}
          </div>
        )}
        {delta !== undefined && (
          <div className="mt-2">
            <DeltaIndicator value={delta} type={deltaType} good={goodDirection} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Main Analytics V2 Component
export default function AnalyticsV2() {
  const [timeRange, setTimeRange] = useState<TimeRange>('last7d');
  
  // Convert TimeRange to date bounds
  const bounds = getTimeRangeBounds(timeRange);
  const scope = {
    from: bounds.start.toISOString().split('T')[0],
    to: bounds.end.toISOString().split('T')[0]
  };
  
  // Fetch all data
  const { data: kpis, isLoading: kpisLoading } = useAnalyticsKpisV3(scope);
  const { data: modeData, isLoading: modeLoading } = useModeStacked(scope);
  const { data: trendData, isLoading: trendLoading } = useGmvTrendV2(scope);
  const { data: funnelData, isLoading: funnelLoading } = useSettlementFunnel(scope);
  const { data: paretoData, isLoading: paretoLoading } = usePareto({ ...scope, limit: 7 });
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <TimeRangePicker 
          value={timeRange} 
          onChange={setTimeRange} 
        />
      </div>
      
      {/* KPI Tiles with Deltas */}
      <div className="grid gap-4 lg:grid-cols-3">
        <KpiTileWithDelta
          title="Settled Transactions"
          value={kpisLoading ? '...' : (kpis?.settled?.count ?? 0).toLocaleString('en-IN')}
          subValue={kpisLoading ? '...' : formatINR(kpis?.settled?.amountPaise ?? '0')}
          delta={kpis?.deltas?.settledCount}
          deltaType="count"
          goodDirection="up"
          color="text-green-700"
        />
        
        <KpiTileWithDelta
          title="Unsettled Transactions"
          value={kpisLoading ? '...' : (kpis?.unsettled?.count ?? 0).toLocaleString('en-IN')}
          subValue={kpisLoading ? '...' : formatINR(kpis?.unsettled?.amountPaise ?? '0')}
          delta={kpis?.deltas?.unsettledCount}
          deltaType="count"
          goodDirection="down"
          color="text-amber-600"
        />
        
        <KpiTileWithDelta
          title="Settlement SR%"
          value={kpisLoading ? '...' : formatPct(kpis?.settlementSrPct)}
          subValue={`Window: ${format(bounds.start, 'MMM d')} - ${format(bounds.end, 'MMM d')}`}
          delta={kpis?.deltas?.settlementSrPctPoints}
          deltaType="percent"
          goodDirection="up"
        />
      </div>
      
      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Mode Stacked 100% Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settlement by Mode</CardTitle>
          </CardHeader>
          <CardContent>
            {modeLoading ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : modeData?.slices ? (
              <ResponsiveContainer width="100%" height={256}>
                <BarChart 
                  data={modeData.slices}
                  layout="vertical"
                  margin={{ left: 80, right: 30 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <YAxis dataKey="mode" type="category" />
                  <Tooltip 
                    formatter={(value: any, name: string) => {
                      const slice = modeData.slices.find((s: any) => 
                        value === s.settled?.pct || value === s.unsettled?.pct
                      );
                      if (name === 'Settled %') {
                        return [`${value}% (${slice?.settled?.count} txns, ${formatINR(slice?.settled?.amountPaise)})`, name];
                      } else {
                        return [`${value}% (${slice?.unsettled?.count} txns, ${formatINR(slice?.unsettled?.amountPaise)})`, name];
                      }
                    }}
                    contentStyle={{ fontSize: '12px' }}
                  />
                  <Legend />
                  <Bar dataKey="settled.pct" name="Settled %" stackId="a" fill="#10b981" />
                  <Bar dataKey="unsettled.pct" name="Unsettled %" stackId="a" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* GMV Trend with Rolling Averages */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">GMV Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {trendLoading ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : trendData?.points ? (
              <ResponsiveContainer width="100%" height={256}>
                <LineChart data={trendData.points}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => format(new Date(date), 'MMM d')}
                  />
                  <YAxis 
                    tickFormatter={(value) => {
                      const amt = value / 100;
                      if (amt >= 10000000) return `₹${(amt / 10000000).toFixed(1)}Cr`;
                      if (amt >= 100000) return `₹${(amt / 100000).toFixed(1)}L`;
                      return `₹${(amt / 1000).toFixed(0)}K`;
                    }}
                  />
                  <Tooltip 
                    labelFormatter={(date) => format(new Date(date), 'MMM d, yyyy')}
                    formatter={(value: any, name: string) => {
                      const point = trendData.points.find((p: any) => 
                        p.capturedPaise === value || p.settledPaise === value ||
                        p.capturedPaiseAvg7 === value || p.settledPaiseAvg7 === value
                      );
                      if (name.includes('Captured')) {
                        return [formatINR(value) + ` (${point?.capturedTxns} txns)`, name];
                      } else if (name.includes('Settled')) {
                        return [formatINR(value) + ` (${point?.settledTxns} txns)`, name];
                      }
                      return [formatINR(value), name];
                    }}
                    contentStyle={{ fontSize: '12px' }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="capturedPaise" 
                    name="Captured GMV" 
                    stroke="#8884d8" 
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="settledPaise" 
                    name="Settled GMV" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="capturedPaiseAvg7" 
                    name="7d Avg (Captured)" 
                    stroke="#8884d8" 
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    opacity={0.5}
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="settledPaiseAvg7" 
                    name="7d Avg (Settled)" 
                    stroke="#10b981" 
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    opacity={0.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Settlement Funnel - Vertical */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settlement Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          {funnelLoading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              Loading...
            </div>
          ) : funnelData?.stages ? (
            <div className="space-y-4">
              {funnelData.stages.map((stage: any, idx: number) => {
                const prevStage = idx > 0 ? funnelData.stages[idx - 1] : null;
                const dropOffPct = prevStage 
                  ? ((prevStage.count - stage.count) / prevStage.count * 100).toFixed(1)
                  : null;
                const widthPct = `${stage.percentage}%`;
                
                return (
                  <div key={stage.name} className="space-y-2">
                    {/* Drop-off annotation */}
                    {dropOffPct && parseFloat(dropOffPct) > 0 && (
                      <div className="text-xs text-red-600 pl-4">
                        ↓ -{dropOffPct}% from {prevStage.name}
                      </div>
                    )}
                    
                    {/* Stage bar */}
                    <div className="flex items-center gap-4">
                      <div className="w-24 text-sm font-medium">{stage.name}</div>
                      <div className="flex-1">
                        <div className="relative">
                          <div className="w-full bg-gray-100 rounded h-10">
                            <div 
                              className="h-10 bg-gradient-to-r from-blue-500 to-blue-600 rounded flex items-center px-3 text-white transition-all"
                              style={{ width: widthPct }}
                            >
                              <span className="text-xs font-medium">
                                {stage.count.toLocaleString('en-IN')} ({stage.percentage}%)
                              </span>
                            </div>
                          </div>
                          <div className="absolute right-2 top-2 text-xs text-gray-600">
                            {formatINR(stage.amountPaise)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              No data available
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Settlement Failure Reasons - Donut Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settlement Failure Reasons</CardTitle>
        </CardHeader>
        <CardContent>
          <SettlementFailureChart data={paretoData} loading={paretoLoading} />
        </CardContent>
      </Card>
    </div>
  );
}