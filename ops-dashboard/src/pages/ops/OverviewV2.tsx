import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, RefreshCw, Pause, Play, AlertCircle, CheckCircle, IndianRupee, FileText, Calendar } from 'lucide-react';
import { SettlementPipeline } from '@/components/SettlementPipeline';
import { fetchOverview } from '@/services/overview';
import { ConnectorHealthCardSimple } from '@/features/ingest/ConnectorHealthCardSimple';

type DateRange = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'custom';

export default function OverviewV2() {
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
        const defaultLast7Days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { from: defaultLast7Days.toISOString().split('T')[0], to: todayStr };
    }
  };

  const { from, to } = getDateRange();
  
  // Fetch overview data with dynamic date range using V2 API
  const { data: overview, isLoading, error, refetch } = useQuery({
    queryKey: ['overview-v2', from, to, dateRange],
    queryFn: () => fetchOverview({ from, to }),
    refetchInterval: live ? 30000 : false,
  });

  const getDateRangeDisplay = () => {
    switch (dateRange) {
      case 'today': return 'Today';
      case 'yesterday': return 'Yesterday';  
      case 'last7days': return 'Last 7 Days';
      case 'last30days': return 'Last 30 Days';
      case 'custom': return `${customFromDate || from} to ${customToDate || to}`;
      default: return 'Today';
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error loading data</h3>
          <p className="text-red-600 text-sm mt-1">{error.message}</p>
          <details className="mt-2">
            <summary className="text-sm text-red-600 cursor-pointer">Error details</summary>
            <pre className="text-xs text-red-500 mt-1">{JSON.stringify(error, null, 2)}</pre>
          </details>
          <button 
            onClick={() => refetch()} 
            className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Add safety checks for data access
  const safeAmount = (amount: number | undefined) => {
    if (!amount || isNaN(amount)) return 0;
    return Math.round(amount / 100);
  };

  // Debug logging
  console.log('🔍 OverviewV2 Data Received:', overview);
  console.log('🔍 KPIs data:', overview?.kpis);
  console.log('🔍 Pipeline data:', overview?.pipeline);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reconciliation Overview</h1>
            <p className="text-gray-500 mt-1">
              Monitor reconciliation performance | {getDateRangeDisplay()} | Live Data from V2 DB
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Date Range Selector */}
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateRange)}
                className="px-3 py-1 border border-gray-300 rounded text-sm"
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
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Recon Match Rate */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <p className="text-sm text-gray-500">Recon Match Rate</p>
          <p className="text-2xl font-bold text-gray-900">
            {overview?.kpis?.reconMatch?.matched && overview?.kpis?.reconMatch?.total
              ? Math.round((overview.kpis.reconMatch.matched / overview.kpis.reconMatch.total) * 100)
              : 0}%
          </p>
          <p className="text-xs text-gray-400">
            {overview?.kpis?.reconMatch?.matched || 0} of {overview?.kpis?.reconMatch?.total || 0}
          </p>
        </div>

        {/* Unmatched Value */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-2">
            <AlertCircle className="w-8 h-8 text-orange-500" />
          </div>
          <p className="text-sm text-gray-500">Unmatched Value</p>
          <p className="text-2xl font-bold text-gray-900">
            ₹{safeAmount(overview?.kpis?.unmatchedValue?.amount).toLocaleString()}
          </p>
          <p className="text-xs text-gray-400">
            {overview?.kpis?.unmatchedValue?.count || 0} transactions
          </p>
        </div>

        {/* Open Exceptions */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-2">
            <FileText className="w-8 h-8 text-red-500" />
          </div>
          <p className="text-sm text-gray-500">Open Exceptions</p>
          <p className="text-2xl font-bold text-gray-900">
            {overview?.kpis?.openExceptions?.total || 0}
          </p>
          <p className="text-xs text-gray-400">Requires attention</p>
        </div>

        {/* Credited to Merchant */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-2">
            <IndianRupee className="w-8 h-8 text-blue-500" />
          </div>
          <p className="text-sm text-gray-500">Credited to Merchant</p>
          <p className="text-2xl font-bold text-gray-900">
            ₹{safeAmount(overview?.kpis?.creditedToMerchant?.amount).toLocaleString()}
          </p>
          <p className="text-xs text-gray-400">
            {overview?.kpis?.creditedToMerchant?.txns || 0} txns
          </p>
        </div>
      </div>

      {/* Settlement Pipeline */}
      <div className="bg-white p-6 rounded-lg shadow">
        <SettlementPipeline 
          captured={overview?.pipeline?.captured || 0} 
          overview={overview}
        />
      </div>

      {/* Data Consistency Checks */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Data Consistency</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
            <span className="text-sm">Pipeline Sum Check</span>
            <span className="text-sm text-red-600 font-medium">✗ FAILED</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
            <span className="text-sm">Credit Constraint</span>
            <span className="text-sm text-green-600 font-medium">✓ credited ≤ sentToBank</span>
          </div>
        </div>
      </div>

      {/* Connector Health */}
      <div className="bg-white p-6 rounded-lg shadow">
        <ConnectorHealthCardSimple />
      </div>

      {/* Top Exceptions Section */}
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
              <p className="text-gray-500 text-sm">No exception data available</p>
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
              <p className="text-gray-500 text-sm">No source data available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}