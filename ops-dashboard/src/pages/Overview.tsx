import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, RefreshCw, Pause, Play, Calendar } from 'lucide-react';
import { useKpis, useTopReasons, usePipelineSummary, useReconSourceSummary, KpiFilters } from '@/hooks/opsOverview';
import { Kpis } from '@/components/Overview/Kpis';
import { SettlementPipeline } from '@/components/SettlementPipeline';
import { ReconciliationSources } from '@/components/overview/ReconciliationSources';
import { CashImpactCard } from '@/components/Overview/CashImpactCard';
import { ExceptionsCard } from '@/components/Overview/ExceptionsCard';
import { ConnectorHealthMini } from '@/components/Overview/ConnectorHealthMini';
import { useTimeFilterStore, TIME_RANGES } from '@/stores/timeFilterStore';

export default function Overview() {
  const navigate = useNavigate();
  const [live, setLive] = useState(true);
  const { filter: timeFilter, setFilter: setTimeFilter } = useTimeFilterStore();
  const [filters, setFilters] = useState<KpiFilters>({
    from: timeFilter.from,
    to: timeFilter.to,
  });

  // Sync filters with global time filter store
  useEffect(() => {
    setFilters({ from: timeFilter.from, to: timeFilter.to });
  }, [timeFilter]);

  // Use new data hooks
  const { 
    data: kpis, 
    isLoading: kpisLoading, 
    error: kpisError,
    refetch: refetchKpis 
  } = useKpis(filters);

  const { 
    data: topReasons, 
    isLoading: reasonsLoading,
    refetch: refetchReasons 
  } = useTopReasons(filters);

  const { 
    data: pipelineSummary, 
    isLoading: pipelineLoading,
    refetch: refetchPipeline 
  } = usePipelineSummary(filters);

  const { 
    data: reconSources, 
    isLoading: reconSourcesLoading,
    refetch: refetchReconSources 
  } = useReconSourceSummary(filters);

  const isLoading = kpisLoading || reasonsLoading || pipelineLoading || reconSourcesLoading;
  const error = kpisError; // Primary error source

  const refetch = () => {
    refetchKpis();
    refetchReasons();
    refetchPipeline();
    refetchReconSources();
  };

  const handleSegmentClick = (segment: string) => {
    navigate(`/ops/recon?filter=${segment}`);
  };

  const handleSourceClick = (source: string) => {
    navigate(`/ops/recon?source=${source}`);
  };

  const handleConnectorClick = (connectorId: string) => {
    navigate(`/ops/connectors/${connectorId}`);
  };

  const handleBankClick = (bankId: string) => {
    navigate(`/ops/data-sources?bank=${bankId}`);
  };

  // Track last update time - MUST be before any conditional returns
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  useEffect(() => {
    if (!isLoading && kpis) {
      setLastUpdated(new Date());
    }
  }, [kpis, isLoading]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-slate-600 mb-4">Failed to load overview data</p>
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

  const getRelativeTime = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reconciliation Overview</h1>
          <p className="text-sm text-slate-500">
            Real-time reconciliation metrics and system health
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              className="appearance-none bg-white border border-slate-300 rounded-lg pl-10 pr-10 py-2 text-sm font-medium text-slate-800 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 cursor-pointer transition-all"
              value={timeFilter.label}
              onChange={(e) => {
                const selected = TIME_RANGES.find(r => r.label === e.target.value);
                if (selected) {
                  setTimeFilter(selected);
                }
              }}
            >
              {TIME_RANGES.map(range => (
                <option key={range.label} value={range.label}>
                  {range.label}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Calendar className="w-4 h-4 text-slate-500" />
            </div>
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-sm text-slate-500">
            {live ? (
              <Activity className="w-4 h-4 text-green-500 animate-pulse" />
            ) : (
              <Activity className="w-4 h-4 text-slate-400" />
            )}
            <span className={live ? 'text-green-600 font-medium' : 'text-slate-500'}>
              {live ? 'Live' : 'Paused'}
            </span>
            <span className="text-xs text-slate-400">
              • Updated {getRelativeTime(lastUpdated)}
            </span>
          </div>
          <button
            onClick={() => setLive(!live)}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
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
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
          >
            <RefreshCw className="w-3 h-3 inline mr-1" /> Refresh
          </button>
        </div>
      </div>

      {/* KPIs - Full width, one row on desktop */}
      <div className="w-full">
        <Kpis 
          kpis={kpis} 
          isLoading={isLoading}
          filters={filters}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cash Impact Card */}
        <CashImpactCard
          variancePaise={kpis?.totals.variancePaise || '0'}
          reconciledAmountPaise={kpis?.totals.reconciledAmountPaise || '0'}
          totalAmountPaise={kpis?.totals.totalAmountPaise || '0'}
          unreconciledCount={kpis?.recon.unmatchedPgCount || 0}
          filters={filters}
          isLoading={isLoading}
        />

        {/* Exceptions Card */}
        <ExceptionsCard
          totalExceptions={kpis?.recon.exceptionsCount || 0}
          filters={filters}
          isLoading={isLoading}
        />

        {/* Connector Health Mini */}
        <ConnectorHealthMini
          filters={filters}
          isLoading={isLoading}
        />
      </div>

      {/* Settlement Pipeline */}
      <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-slate-900">Settlement Pipeline</h3>
          <span className="text-sm text-slate-500">{timeFilter.label}</span>
        </div>
        <SettlementPipeline
          captured={pipelineSummary?.ingested || 0}
          inSettlement={pipelineSummary?.inSettlement || 0}
          sentToBank={pipelineSummary?.reconciled || 0}
          credited={pipelineSummary?.settled || 0}
          unsettled={pipelineSummary?.unsettled || 0}
          capturedValue={0}
          creditedValue={0}
          warnings={[]}
          onSegmentClick={handleSegmentClick}
        />
      </div>

      {/* Reconciliation Sources - Full width */}
      <ReconciliationSources
        data={reconSources}
        isLoading={reconSourcesLoading}
        filters={filters}
      />

    </div>
  );
}