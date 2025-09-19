import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Activity, RefreshCw, Pause, Play, Calendar } from 'lucide-react';
import { fetchOverview } from '@/services/overview';
import { Kpis } from '@/components/Overview/Kpis';
import { SettlementPipeline } from '@/components/SettlementPipeline';
import { BySourceCanonical } from '@/components/Overview/BySourceCanonical';
import { TopReasons } from '@/components/Overview/TopReasons';
import { ConnectorsHealth } from '@/components/Overview/ConnectorsHealth';
import { DataQuality } from '@/components/Overview/DataQuality';
import { BankFeedLag } from '@/components/Overview/BankFeedLag';

export default function Overview() {
  const navigate = useNavigate();
  const [live, setLive] = useState(true);
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['overview', dateRange],
    queryFn: () => {
      console.log('Fetching overview data for date range:', dateRange);
      return fetchOverview(dateRange);
    },
    refetchInterval: live ? 30000 : false,
  });

  const handleSegmentClick = (segment: string) => {
    navigate(`/ops/recon?filter=${segment}`);
  };

  const handleSourceClick = (source: string) => {
    navigate(`/ops/recon?source=${source}`);
  };

  const handleReasonClick = (reason: string) => {
    navigate(`/ops/exceptions?reason=${encodeURIComponent(reason)}`);
  };

  const handleConnectorClick = (connectorId: string) => {
    navigate(`/ops/connectors/${connectorId}`);
  };

  const handleBankClick = (bankId: string) => {
    navigate(`/ops/data-sources?bank=${bankId}`);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Failed to load overview data</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reconciliation Overview</h1>
          <p className="text-sm text-gray-500">
            Real-time reconciliation metrics and system health
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {/* From Date */}
            <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:border-blue-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 transition-all">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600 font-medium">From:</span>
              <input
                type="date"
                value={dateRange.from}
                onChange={(e) => {
                  console.log('From date changed to:', e.target.value);
                  setDateRange(prev => ({ ...prev, from: e.target.value }));
                }}
                className="text-sm font-medium text-gray-800 border-none outline-none bg-transparent cursor-pointer"
                style={{ colorScheme: 'light', minWidth: '120px' }}
              />
            </div>
            
            {/* To Date */}
            <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:border-blue-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 transition-all">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600 font-medium">To:</span>
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) => {
                  console.log('To date changed to:', e.target.value);
                  setDateRange(prev => ({ ...prev, to: e.target.value }));
                }}
                className="text-sm font-medium text-gray-800 border-none outline-none bg-transparent cursor-pointer"
                style={{ colorScheme: 'light', minWidth: '120px' }}
              />
            </div>
          </div>
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
            className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            {live ? (
              <>
                <Pause className="w-3 h-3 inline mr-1" /> Pause
              </>
            ) : (
              <>
                <Play className="w-3 h-3 inline mr-1" /> Resume
              </>
            )}
          </button>
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            <RefreshCw className="w-3 h-3 inline mr-1" /> Refresh
          </button>
        </div>
      </div>

      {/* KPIs */}
      <Kpis kpis={data?.kpis || {
        reconRate: 0,
        reconRateChange: 0,
        reconRateSparkline: [],
        totalCaptured: '0',
        totalCapturedChange: 0,
        totalCapturedSparkline: [],
        totalCredited: '0',
        totalCreditedChange: 0,
        totalCreditedSparkline: [],
        unsettledValue: '0',
        unsettledValueChange: 0,
        unsettledValueSparkline: [],
        avgSettlementTime: 0,
        avgSettlementTimeChange: 0,
        avgSettlementTimeSparkline: [],
        bankFeedLag: 0,
        bankFeedLagChange: 0,
        bankFeedLagSparkline: [],
        openExceptions: 0,
        openExceptionsChange: 0,
        openExceptionsSparkline: [],
        autoReconRate: 0,
        autoReconRateChange: 0,
        autoReconRateSparkline: []
      }} isLoading={isLoading} />

      {/* Settlement Pipeline */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Settlement Pipeline</h3>
        <SettlementPipeline
          captured={data?.pipeline.captured || 0}
          inSettlement={data?.pipeline.inSettlement || 0}
          sentToBank={data?.pipeline.sentToBank || 0}
          credited={data?.pipeline.credited || 0}
          unsettled={data?.pipeline.unsettled || 0}
          capturedValue={data?.pipeline.capturedValue}
          creditedValue={data?.pipeline.creditedValue}
          warnings={data?.pipeline.warnings}
          onSegmentClick={handleSegmentClick}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Source */}
        <BySourceCanonical
          window={window}
          onSourceClick={handleSourceClick}
        />

        {/* Top Reasons */}
        <TopReasons
          reasons={data?.topReasons || []}
          isLoading={isLoading}
          onReasonClick={handleReasonClick}
        />
      </div>

      {/* Secondary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connectors Health */}
        <ConnectorsHealth
          connectors={data?.connectorsHealth || []}
          isLoading={isLoading}
          onConnectorClick={handleConnectorClick}
        />

        {/* Data Quality */}
        <DataQuality
          quality={data?.quality || {
            overallScore: 0,
            completeness: 0,
            completenessChange: 0,
            accuracy: 0,
            accuracyChange: 0,
            consistency: 0,
            consistencyChange: 0,
            timeliness: 0,
            timelinessChange: 0,
            issues: []
          }}
          isLoading={isLoading}
        />

        {/* Bank Feed Lag */}
        <BankFeedLag
          banks={data?.bankFeedLag || []}
          isLoading={isLoading}
          onBankClick={handleBankClick}
        />
      </div>

      {/* Data Consistency Check */}
      {data && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Data Consistency</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded">
              <span className="text-sm">Pipeline Sum Check</span>
              <span className="text-sm font-medium text-green-600">
                {data.pipeline.captured === 
                  (data.pipeline.inSettlement + data.pipeline.sentToBank + 
                   data.pipeline.credited + data.pipeline.unsettled)
                  ? '✓ PASSED'
                  : '✗ FAILED'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-green-50 rounded">
              <span className="text-sm">Credit Constraint</span>
              <span className="text-sm font-medium text-green-600">
                {data.pipeline.credited <= data.pipeline.sentToBank
                  ? '✓ credited ≤ sentToBank'
                  : '✗ VIOLATED'}
              </span>
            </div>
            {data.pipeline.warnings && data.pipeline.warnings.length > 0 && (
              <div className="p-3 bg-amber-50 rounded">
                <p className="text-sm font-medium text-amber-700">Warnings:</p>
                {data.pipeline.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-600 mt-1">• {w}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}