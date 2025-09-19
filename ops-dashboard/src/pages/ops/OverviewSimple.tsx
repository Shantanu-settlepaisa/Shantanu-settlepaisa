import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, RefreshCw, Pause, Play, AlertCircle, CheckCircle, IndianRupee, FileText } from 'lucide-react';
import { SettlementPipeline } from '@/components/SettlementPipeline';
import { fetchOverview } from '@/services/overview';

export default function OverviewSimple() {
  const [live, setLive] = useState(true);
  
  // Fetch overview data with hardcoded date range for now
  const { data: overview, isLoading, error, refetch } = useQuery({
    queryKey: ['overview-simple'],
    queryFn: () => fetchOverview({
      from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: new Date().toISOString().split('T')[0],
    }),
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
          <p className="text-sm text-gray-500">Monitor reconciliation performance</p>
        </div>
        <div className="flex items-center gap-3">
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
    </div>
  );
}