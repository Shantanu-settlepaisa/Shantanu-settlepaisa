import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TimeRangePicker, TimeRange, getTimeRangeBounds } from '@/components/TimeRangePicker'
import { 
  useAnalyticsKpisV2,
  useAnalyticsModeDistribution,
  useAnalyticsGmvTrend,
  useAnalyticsSettlementFunnel,
  useAnalyticsFailureReasons 
} from '@/hooks/useAnalytics'
import { formatINR } from '@/lib/currency'
import { pct } from '@/lib/number'
import { format } from 'date-fns'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, FunnelChart, Funnel, LabelList, Cell } from 'recharts'

// Helper to humanize date range for display
function humanizeRange(range: { from: string; to: string }): string {
  const start = new Date(range.from)
  const end = new Date(range.to)
  
  if (range.from === range.to) {
    return format(start, 'MMM d, yyyy')
  }
  
  // Calculate diff in days
  const dayDiff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  
  if (dayDiff === 7) return 'Last 7 days'
  if (dayDiff === 30) return 'Last 30 days'
  
  return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`
}

// Helper to get today's date range
function getTodayRange(): { from: string; to: string } {
  const today = new Date()
  const dateStr = today.toISOString().split('T')[0]
  return { from: dateStr, to: dateStr }
}

// Analytics page component
export default function Analytics() {
  // Date range state (today by default)
  const [timeRange, setTimeRange] = useState<TimeRange>('today')
  
  // Convert TimeRange to date bounds
  const bounds = getTimeRangeBounds(timeRange)
  const range = {
    from: bounds.start.toISOString().split('T')[0],
    to: bounds.end.toISOString().split('T')[0]
  }
  
  // Query params (could add merchantId, acquirerId, mode later)
  const scope = { 
    from: range.from, 
    to: range.to,
    // merchantId: undefined,
    // acquirerId: undefined,
    // mode: undefined
  }
  
  // Fetch all analytics data
  const { data: kpis, isLoading: kpisLoading } = useAnalyticsKpisV2(scope)
  const { data: modeData, isLoading: modeLoading } = useAnalyticsModeDistribution(scope)
  const { data: trendData, isLoading: trendLoading } = useAnalyticsGmvTrend(scope)
  const { data: funnelData, isLoading: funnelLoading } = useAnalyticsSettlementFunnel(scope)
  const { data: failureData, isLoading: failureLoading } = useAnalyticsFailureReasons(scope)
  
  const isLoading = kpisLoading
  
  return (
    <div className="space-y-6">
      {/* Header with date filter */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <TimeRangePicker 
          value={timeRange} 
          onChange={setTimeRange} 
          data-testid="analytics-date-filter" 
        />
      </div>
      
      {/* KPI Row: 3 tiles (or 4 with captured) */}
      <div className="grid gap-4 lg:grid-cols-3 md:grid-cols-2 grid-cols-1" data-testid="analytics-kpi-row">
        {/* Settled Transactions */}
        <Card data-testid="kpi-settled">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground font-medium">
              Settled Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mt-1 text-3xl font-semibold text-emerald-700">
              {isLoading ? '...' : (kpis?.settled?.count ?? 0).toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {isLoading ? '...' : formatINR(kpis?.settled?.amountPaise ?? '0')}
            </div>
          </CardContent>
        </Card>
        
        {/* Unsettled Transactions */}
        <Card data-testid="kpi-unsettled">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground font-medium">
              Unsettled Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mt-1 text-3xl font-semibold text-amber-600">
              {isLoading ? '...' : (kpis?.unsettled?.count ?? 0).toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {isLoading ? '...' : formatINR(kpis?.unsettled?.amountPaise ?? '0')}
            </div>
          </CardContent>
        </Card>
        
        {/* Settlement SR% */}
        <Card data-testid="kpi-sr">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground font-medium">
              Settlement SR
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mt-1 text-3xl font-semibold">
              {isLoading ? '...' : pct(kpis?.settlementSrPct)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Window: {humanizeRange(range)}
            </div>
          </CardContent>
        </Card>
        
        {/* Optional 4th tile: Captured Transactions
        <Card data-testid="kpi-captured">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground font-medium">
              Captured Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mt-1 text-3xl font-semibold">
              {isLoading ? '...' : (kpis?.captured?.count ?? 0).toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {isLoading ? '...' : formatINR(kpis?.captured?.amountPaise ?? '0')}
            </div>
          </CardContent>
        </Card>
        */}
      </div>
      
      {/* Charts section with real data */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Mode Distribution Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settlement by Mode</CardTitle>
          </CardHeader>
          <CardContent>
            {modeLoading ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : modeData?.distribution ? (
              <ResponsiveContainer width="100%" height={256}>
                <BarChart data={modeData.distribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mode" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: any, name: string) => {
                      if (name === 'settlementRate') return `${value}%`;
                      return value.toLocaleString('en-IN');
                    }}
                  />
                  <Legend />
                  <Bar dataKey="captured.count" name="Captured" fill="#8884d8" />
                  <Bar dataKey="settled.count" name="Settled" fill="#82ca9d" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* GMV Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">GMV Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {trendLoading ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : trendData?.trend ? (
              <ResponsiveContainer width="100%" height={256}>
                <LineChart data={trendData.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => format(new Date(date), 'MMM d')}
                  />
                  <YAxis 
                    tickFormatter={(value) => `₹${(value / 100000).toFixed(0)}L`}
                  />
                  <Tooltip 
                    labelFormatter={(date) => format(new Date(date), 'MMM d, yyyy')}
                    formatter={(value: any) => formatINR(value)}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="captured.amountPaise" 
                    name="Captured GMV" 
                    stroke="#8884d8" 
                    strokeWidth={2}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="settled.amountPaise" 
                    name="Settled GMV" 
                    stroke="#82ca9d" 
                    strokeWidth={2}
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
      
      {/* Settlement Funnel */}
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
            <div className="space-y-3">
              {funnelData.stages.map((stage: any, index: number) => {
                const barWidth = `${stage.percentage}%`;
                const colors = ['#8884d8', '#7366ef', '#6366f1', '#10b981'];
                return (
                  <div key={stage.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{stage.name}</span>
                      <span className="text-muted-foreground">
                        {stage.count.toLocaleString('en-IN')} ({stage.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-8">
                      <div 
                        className="h-8 rounded-full flex items-center px-3 text-white text-xs font-medium transition-all"
                        style={{ 
                          width: barWidth, 
                          backgroundColor: colors[index] || '#94a3b8' 
                        }}
                      >
                        {formatINR(stage.amountPaise)}
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Recon Status Breakdown */}
              {funnelData.reconStatuses && (
                <div className="mt-6 pt-4 border-t">
                  <h4 className="text-sm font-medium mb-3">Reconciliation Status</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Matched:</span>
                      <span className="font-medium">{funnelData.reconStatuses.MATCHED.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Unmatched PG:</span>
                      <span className="font-medium">{funnelData.reconStatuses.UNMATCHED_PG.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Unmatched Bank:</span>
                      <span className="font-medium">{funnelData.reconStatuses.UNMATCHED_BANK.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Exception:</span>
                      <span className="font-medium">{funnelData.reconStatuses.EXCEPTION.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              No data available
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Settlement Failure Reasons Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settlement Failure Reasons</CardTitle>
        </CardHeader>
        <CardContent>
          {failureLoading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              Loading...
            </div>
          ) : failureData?.reasons && failureData.reasons.length > 0 ? (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={256}>
                <BarChart 
                  data={failureData.reasons} 
                  layout="horizontal"
                  margin={{ left: 120, right: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="reason" type="category" width={100} />
                  <Tooltip 
                    formatter={(value: any, name: string) => {
                      if (name === 'percentage') return `${value}%`;
                      if (name === 'impactPaise') return formatINR(value);
                      return value.toLocaleString('en-IN');
                    }}
                  />
                  <Bar dataKey="count" fill="#ef4444" name="Count">
                    <LabelList 
                      dataKey="percentage" 
                      position="right" 
                      formatter={(value: any) => `${value}%`}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">Total Unsettled</p>
                  <p className="text-lg font-semibold">{failureData.totalUnsettled.toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Top Reason</p>
                  <p className="text-lg font-semibold">{failureData.reasons[0]?.reason || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Impact Value</p>
                  <p className="text-lg font-semibold">{formatINR(failureData.totalImpactPaise)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              No unsettled transactions in this period
            </div>
          )}
        </CardContent>
      </Card>
      
    </div>
  )
}