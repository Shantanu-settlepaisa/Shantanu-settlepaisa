import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, RefreshCw, Pause, Play, AlertCircle, CheckCircle, IndianRupee, FileText, Calendar } from 'lucide-react';
import { SettlementPipeline } from '@/components/SettlementPipeline';
import { fetchOverview } from '@/services/overview';
import { ConnectorHealthCardSimple } from '@/features/ingest/ConnectorHealthCardSimple';

type DateRange = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'custom';

export default function OverviewSimple() {
  const [live, setLive] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');

  // Calculate date range based on selection
  const getDateRange = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    switch (dateRange) {
      case 'today':
        return { from: todayStr, to: todayStr };
      case 'yesterday':
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        return { from: yesterdayStr, to: yesterdayStr };
      case 'last7days':
        const last7Days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { from: last7Days.toISOString().split('T')[0], to: todayStr };
      case 'last30days':
        const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        return { from: last30Days.toISOString().split('T')[0], to: todayStr };
      case 'custom':
        return { 
          from: customFromDate || todayStr, 
          to: customToDate || todayStr 
        };
      default:
        return { from: last7Days.toISOString().split('T')[0], to: todayStr };
    }
  };

  const { from, to } = getDateRange();
  
  // Fetch overview data with dynamic date range
  const { data: overview, isLoading, error, refetch } = useQuery({
    queryKey: ['overview-simple', from, to, dateRange],
    queryFn: () => fetchOverview({ from, to }),
    refetchInterval: live ? 30000 : false,
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Failed to load dashboard metrics</p>
          <button onClick={() => refetch()} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const reconRate = overview ? Math.round((overview.pipeline.credited / overview.pipeline.captured) * 100) : 0;

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reconciliation Overview</h1>
          <p className="text-sm text-gray-500">
            Monitor reconciliation performance | {dateRange === 'today' ? 'Today' : 
            dateRange === 'yesterday' ? 'Yesterday' : 
            dateRange === 'last7days' ? 'Last 7 Days' : 
            dateRange === 'last30days' ? 'Last 30 Days' : 
            `${from} to ${to}`} | {isLoading ? 'Loading...' : 'Live Data from V2 DB'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date Range Filter */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <select 
              value={dateRange} 
              onChange={(e) => setDateRange(e.target.value as DateRange)}
              className="px-3 py-1 border border-gray-300 rounded text-sm bg-white"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7days">Last 7 Days</option>
              <option value="last30days">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Custom Date Inputs */}
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFromDate}
                onChange={(e) => setCustomFromDate(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
                placeholder="From"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={customToDate}
                onChange={(e) => setCustomToDate(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
                placeholder="To"
              />
            </div>
          )}

          <div className="flex items-center space-x-2 text-sm text-gray-500">
            {live ? (
              <Activity className="w-4 h-4 text-green-500 animate-pulse" />
            ) : (
              <Activity className="w-4 h-4 text-gray-400" />
            )}
            <span className={live ? 'text-green-600 font-medium' : 'text-gray-500'}>
              {live ? 'Live' : 'Paused'}
            </span>
          </div>
          <button
            onClick={() => setLive(!live)}
            className="px-3 py-1 border border-gray-300 rounded text-sm"
          >
            {live ? <><Pause className="w-3 h-3 inline mr-1" /> Pause</> : <><Play className="w-3 h-3 inline mr-1" /> Resume</>}
          </button>
          <button onClick={() => refetch()} className="px-3 py-1 border border-gray-300 rounded text-sm">
            <RefreshCw className="w-3 h-3 inline mr-1" /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <p className="text-sm text-gray-500">Recon Match Rate</p>
          <p className="text-2xl font-bold">{reconRate}%</p>
          <p className="text-xs text-gray-400 mt-1">
            {overview?.pipeline.credited.toLocaleString('en-IN')} of {overview?.pipeline.captured.toLocaleString('en-IN')}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-2">
            <AlertCircle className="w-8 h-8 text-amber-500" />
          </div>
          <p className="text-sm text-gray-500">Unmatched Value</p>
          <p className="text-2xl font-bold">₹{((overview?.pipeline.unsettled || 0) * 100).toLocaleString('en-IN')}</p>
          <p className="text-xs text-gray-400 mt-1">{overview?.pipeline.unsettled} transactions</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-2">
            <FileText className="w-8 h-8 text-red-500" />
          </div>
          <p className="text-sm text-gray-500">Open Exceptions</p>
          <p className="text-2xl font-bold">{overview?.pipeline.unsettled || 0}</p>
          <p className="text-xs text-gray-400 mt-1">Requires attention</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-2">
            <IndianRupee className="w-8 h-8 text-blue-500" />
          </div>
          <p className="text-sm text-gray-500">Credited to Merchant</p>
          <p className="text-2xl font-bold">₹{((overview?.pipeline.creditedValue || 0) / 100).toLocaleString('en-IN')}</p>
          <p className="text-xs text-gray-400 mt-1">{overview?.pipeline.credited} txns</p>
        </div>
      </div>

      {/* Settlement Pipeline */}
      <div className="bg-white p-6 rounded-lg shadow">
        {isLoading ? (
          <div className="h-32 flex items-center justify-center">
            <div className="text-gray-500">Loading pipeline...</div>
          </div>
        ) : (
          <SettlementPipeline
            captured={overview?.pipeline.captured || 0}
            inSettlement={overview?.pipeline.inSettlement || 0}
            sentToBank={overview?.pipeline.sentToBank || 0}
            credited={overview?.pipeline.credited || 0}
            unsettled={overview?.pipeline.unsettled || 0}
            capturedValue={overview?.pipeline.capturedValue}
            creditedValue={overview?.pipeline.creditedValue}
            warnings={overview?.pipeline.warnings}
            onSegmentClick={(segment) => console.log('Clicked:', segment)}
          />
        )}
      </div>

      {/* Data Consistency Check */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Data Consistency</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-green-50 rounded">
            <span className="text-sm">Pipeline Sum Check</span>
            <span className="text-sm font-medium text-green-600">
              {overview && overview.pipeline.captured === (overview.pipeline.inSettlement + overview.pipeline.sentToBank + overview.pipeline.credited + overview.pipeline.unsettled) ? '✓ PASSED' : '✗ FAILED'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-green-50 rounded">
            <span className="text-sm">Credit Constraint</span>
            <span className="text-sm font-medium text-green-600">
              {overview && overview.pipeline.credited <= overview.pipeline.sentToBank ? '✓ credited ≤ sentToBank' : '✗ VIOLATED'}
            </span>
          </div>
          {overview?.pipeline.warnings && overview.pipeline.warnings.length > 0 && (
            <div className="p-3 bg-amber-50 rounded">
              <p className="text-sm font-medium text-amber-700">Warnings:</p>
              {overview.pipeline.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600 mt-1">• {w}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Connector Health Card - Always shown for debugging */}
      <ConnectorHealthCardSimple />

      {/* Additional Analysis Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Unreconciled Reasons */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Top Unreconciled Reasons</h3>
          <div className="space-y-3">
            {overview?.topReasons?.slice(0, 5).map((reason, index) => (
              <div key={reason.code} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{reason.label}</p>
                    <p className="text-xs text-gray-500">{reason.code}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{reason.impactedTxns}</p>
                  <p className="text-xs text-gray-500">{reason.pct}%</p>
                </div>
              </div>
            )) || (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No exception data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Reconciliation by Source */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Reconciliation by Source</h3>
          <div className="space-y-4">
            {overview?.bySource?.map((source) => (
              <div key={source.source} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{source.source}</h4>
                  <span className="text-sm text-gray-500">{source.matchRate}% match rate</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full" 
                    style={{ width: `${source.matchRate}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>{source.exceptions} exceptions</span>
                  <span>Last sync: {source.lastSync || 'N/A'}</span>
                </div>
              </div>
            )) || (
              <div className="text-center py-8 text-gray-500">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No source data available</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cash Impact Summary */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Cash Impact Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600">Successfully Reconciled</p>
                <p className="text-xl font-bold text-green-700">
                  ₹{overview?.kpis?.creditedToMerchant?.amount ? (overview.kpis.creditedToMerchant.amount / 100).toLocaleString() : '0'}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600">Pending Resolution</p>
                <p className="text-xl font-bold text-orange-700">
                  ₹{overview?.kpis?.unmatchedValue?.amount ? (overview.kpis.unmatchedValue.amount / 100).toLocaleString() : '0'}
                </p>
              </div>
              <AlertCircle className="w-8 h-8 text-orange-500" />
            </div>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600">Total Volume</p>
                <p className="text-xl font-bold text-blue-700">
                  {overview?.pipeline?.captured || 0} txns
                </p>
              </div>
              <IndianRupee className="w-8 h-8 text-blue-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}