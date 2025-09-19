import { useState } from 'react'
import { 
  AlertCircle, 
  CheckCircle, 
  DollarSign,
  ArrowRight,
  Activity,
  FileText,
  Clock,
  RefreshCw,
  Pause,
  Play
} from 'lucide-react'
import { formatCompactINR } from '@/lib/utils'
import { KpiCardEnhanced } from '@/components/KpiCardEnhanced'
import { ProgressTracker } from '@/components/ProgressTracker'
import { ExceptionSnapshot } from '@/components/ExceptionSnapshot'
import { DataSourceStatus } from '@/components/DataSourceStatus'
import { TimeRangePicker, getTimeRangeLabel, getTimeRangeShortLabel } from '@/components/TimeRangePicker'
import { useOpsMetrics } from '@/hooks/useOpsMetrics'
import { useQuery } from '@tanstack/react-query'
import { opsApi } from '@/lib/ops-api'

export default function OverviewEnhanced() {
  const [live, setLive] = useState(true)
  
  // Use the new time-aware metrics hook
  const { 
    data, 
    loading, 
    error, 
    lastUpdated, 
    isConnected,
    timeRange,
    setTimeRange,
    timezone,
    refresh
  } = useOpsMetrics({ live })
  
  // Still use queries for exceptions and data sources
  const { data: exceptions } = useQuery({
    queryKey: ['exception-snapshot', timeRange],
    queryFn: () => opsApi.getExceptionSnapshot(8),
    refetchInterval: live ? 30000 : false,
  })
  
  const { data: dataSources } = useQuery({
    queryKey: ['data-sources-status'],
    queryFn: () => opsApi.getDataSourcesStatus(),
    refetchInterval: live ? 60000 : false,
  })
  
  const rangeLabel = getTimeRangeLabel(timeRange)
  const rangeShortLabel = getTimeRangeShortLabel(timeRange)
  
  // Calculate compare label for trends
  const getCompareLabel = () => {
    switch (timeRange) {
      case 'today':
        return 'yesterday'
      case 'yesterday':
        return 'day before'
      case 'last7d':
        return 'previous 7 days'
      case 'last30d':
        return 'previous 30 days'
      case 'mtd':
        return 'previous MTD'
      default:
        return 'previous period'
    }
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Failed to load dashboard metrics</p>
          <button
            onClick={refresh}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }
  
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations Overview</h1>
          <p className="text-sm text-gray-500">Real-time reconciliation and settlement monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Time Range Picker */}
          <TimeRangePicker
            value={timeRange}
            onChange={setTimeRange}
            timezone={timezone}
          />
          
          {/* Live Controls */}
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            {live && isConnected ? (
              <Activity className="w-4 h-4 text-green-500 animate-pulse" />
            ) : (
              <Activity className="w-4 h-4 text-gray-400" />
            )}
            <span className={live ? 'text-green-600 font-medium' : 'text-gray-500'}>
              {live ? `Live • ${rangeShortLabel}` : `Paused • ${rangeShortLabel}`}
            </span>
            {lastUpdated && (
              <>
                <span className="text-gray-400">•</span>
                <span>{new Date(lastUpdated).toLocaleTimeString()}</span>
              </>
            )}
          </div>
          
          <button
            onClick={() => setLive(!live)}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            {live ? (
              <>
                <Pause className="w-3 h-3 mr-1" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-3 h-3 mr-1" />
                Resume
              </>
            )}
          </button>
          
          <button
            onClick={refresh}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh
          </button>
        </div>
      </div>
      
      {/* KPI Cards with time context */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCardEnhanced
          title="Reconciliation Status"
          value={data?.reconciliation.matchedPct || 0}
          format="percentage"
          subtitle=""
          contextLine={`${data?.reconciliation.matchedCount || 0} of ${data?.reconciliation.totalCount || 0} matched`}
          rangeLabel={rangeLabel}
          icon={CheckCircle}
          trend={data?.reconciliation.trend ? {
            ...data.reconciliation.trend,
            compareLabel: getCompareLabel()
          } : undefined}
          color="green"
          loading={loading}
          tooltip="Percentage of transactions successfully matched between PG and Bank files in the selected time window."
        />
        
        <KpiCardEnhanced
          title="Unmatched Value"
          value={data?.unmatched.value || 0}
          format="currency"
          subtitle=""
          contextLine={`${data?.unmatched.count || 0} transactions`}
          rangeLabel={rangeLabel}
          icon={AlertCircle}
          trend={data?.unmatched.trend ? {
            ...data.unmatched.trend,
            compareLabel: getCompareLabel()
          } : undefined}
          color="amber"
          loading={loading}
          tooltip="Total value of transactions that could not be matched between PG and Bank records."
        />
        
        <KpiCardEnhanced
          title="Open Exceptions"
          value={data?.exceptions.openCount || 0}
          subtitle=""
          contextLine={`${data?.exceptions.critical || 0} critical, ${data?.exceptions.high || 0} high`}
          rangeLabel={rangeLabel}
          icon={FileText}
          trend={data?.exceptions.trend ? {
            ...data.exceptions.trend,
            compareLabel: getCompareLabel()
          } : undefined}
          color="red"
          loading={loading}
          tooltip="Number of unresolved exceptions requiring manual intervention, categorized by severity."
        />
        
        <KpiCardEnhanced
          title="Settlement Value"
          value={data?.settlementValue.amount || 0}
          format="currency"
          subtitle=""
          contextLine={`${data?.settlementValue.count || 0} settlements`}
          rangeLabel={rangeLabel}
          icon={DollarSign}
          trend={data?.settlementValue.trend ? {
            ...data.settlementValue.trend,
            compareLabel: getCompareLabel()
          } : undefined}
          color="blue"
          loading={loading}
          tooltip="Total value of settlements processed in the selected time window."
        />
      </div>
      
      {/* Settlement Progress Tracker - now synced with global range */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Settlement Progress</h2>
          <span className="text-sm text-gray-500">{rangeLabel}</span>
        </div>
        <ProgressTracker stages={data ? [
          {
            name: 'Captured',
            status: 'completed',
            count: data.progress.captured.count,
            valuePaise: data.progress.captured.amount,
            percentage: 35
          },
          {
            name: 'In Settlement',
            status: 'active',
            count: data.progress.inSettlement.count,
            valuePaise: data.progress.inSettlement.amount,
            percentage: 30
          },
          {
            name: 'Settled to Bank',
            status: 'pending',
            count: data.progress.settledToBank.count,
            valuePaise: data.progress.settledToBank.amount,
            percentage: 25
          },
          {
            name: 'Unsettled',
            status: 'pending',
            count: data.progress.unsettled.count,
            valuePaise: data.progress.unsettled.amount,
            percentage: 10
          }
        ] : []} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Exception Queue Snapshot */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Exception Queue</h2>
                <p className="text-sm text-gray-500 mt-1">Top exceptions for {rangeLabel}</p>
              </div>
              <a 
                href="/ops/exceptions" 
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
              >
                View all
                <ArrowRight className="w-4 h-4 ml-1" />
              </a>
            </div>
          </div>
          <ExceptionSnapshot exceptions={exceptions || []} />
        </div>
        
        {/* Data Source Status */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Data Sources</h2>
          </div>
          <DataSourceStatus sources={dataSources || []} />
        </div>
      </div>
      
      {/* Quick Actions */}
      {timeRange === 'today' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-blue-900">Settlement Cutoff in 2h 34m</h3>
              <p className="mt-1 text-sm text-blue-700">
                3 merchants awaiting bank file confirmation. Manual upload may be required.
              </p>
              <div className="mt-3">
                <button className="text-sm font-medium text-blue-600 hover:text-blue-500">
                  Upload Bank Files →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* No data message */}
      {!loading && data && data.reconciliation.totalCount === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
          <p className="text-gray-600">No data available for {rangeLabel}</p>
          <p className="text-sm text-gray-500 mt-2">
            Try selecting a different time range or check if data ingestion is running.
          </p>
        </div>
      )}
    </div>
  )
}