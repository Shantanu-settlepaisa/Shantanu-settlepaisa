import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  Info,
  RefreshCw,
  Download,
  ChevronRight,
  Activity,
  HelpCircle,
  Users,
  Hash
} from 'lucide-react';
import { formatIndianCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { ExceptionAgeingChart } from '@/components/ExceptionAgeingChart';
import { ExceptionBurndownChart } from '@/components/ExceptionBurndownChart';
import { WindowPicker } from '@/components/WindowPicker';
import { buildExceptionsLink, buildReconItemsLink } from '@/lib/linking';
import { 
  getOverview, 
  formatMetricNumber,
  type Window, 
  type Overview,
  type TopReasons,
  type ValidationWarning 
} from '@/services/aggregator/reconMetricsV2';
import type { AgeingResponse, BurndownResponse } from '@/types/metrics';

// Reason code display mapping
const REASON_DISPLAY: Record<string, { label: string; color: string }> = {
  BANK_FILE_MISSING: { label: 'Bank File Missing', color: '#ef4444' },
  PG_TXN_MISSING_IN_BANK: { label: 'PG Txn Missing in Bank', color: '#f97316' },
  BANK_TXN_MISSING_IN_PG: { label: 'Bank Txn Missing in PG', color: '#f97316' },
  UTR_MISSING_OR_INVALID: { label: 'UTR Missing/Invalid', color: '#ef4444' },
  DATE_OUT_OF_WINDOW: { label: 'Date Out of Window', color: '#eab308' },
  AMOUNT_MISMATCH: { label: 'Amount Mismatch', color: '#f59e0b' },
  STATUS_MISMATCH: { label: 'Status Mismatch', color: '#eab308' },
  DUPLICATE_BANK_ENTRY: { label: 'Duplicate Bank Entry', color: '#a855f7' },
  DUPLICATE_PG_ENTRY: { label: 'Duplicate PG Entry', color: '#a855f7' },
  CURRENCY_MISMATCH: { label: 'Currency Mismatch', color: '#6366f1' },
  SCHEME_OR_MID_MISMATCH: { label: 'Scheme/MID Mismatch', color: '#3b82f6' },
  FEES_VARIANCE: { label: 'Fees Variance', color: '#06b6d4' },
  PARTIAL_CAPTURE_OR_REFUND_PENDING: { label: 'Partial/Refund Pending', color: '#14b8a6' },
  SPLIT_SETTLEMENT_UNALLOCATED: { label: 'Split Settlement', color: '#6b7280' }
};

// KPI Card with consistent formatting and tooltips
interface KPICardProps {
  title: string;
  value: string | number;
  subtext: string;
  trend?: { value: number; isPositive: boolean };
  icon: React.ReactNode;
  definition?: string;
  onClick?: () => void;
}

function KPICard({ title, value, subtext, trend, icon, definition, onClick }: KPICardProps) {
  return (
    <div 
      className={`bg-white rounded-lg border border-gray-200 p-6 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-medium text-gray-600">{title}</h3>
            {definition && (
              <div className="group relative">
                <HelpCircle className="h-3 w-3 text-gray-400" />
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-64">
                  <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3">
                    {definition}
                    <div className="absolute top-full left-4 -mt-1">
                      <div className="border-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-semibold text-gray-900">{value}</p>
            {trend && (
              <span className={`flex items-center gap-1 text-sm ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {trend.isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {trend.value.toFixed(1)}%
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">{subtext}</p>
        </div>
        <div className="text-gray-400 ml-4">{icon}</div>
      </div>
    </div>
  );
}

// Pipeline Bar with exclusive segments and validation
interface PipelineBarProps {
  data: Overview['pipeline'];
  onChipClick: (stage: string) => void;
}

function PipelineBar({ data, onChipClick }: PipelineBarProps) {
  // Use exclusive pipeline segments instead of raw data
  const exclusiveStages = [
    { key: 'inSettlementOnly', label: 'In Settlement Only', value: data.exclusive.inSettlementOnly, color: 'bg-blue-500' },
    { key: 'sentToBankOnly', label: 'Sent to Bank Only', value: data.exclusive.sentToBankOnly, color: 'bg-amber-500' },
    { key: 'credited', label: 'Credited', value: data.exclusive.credited, color: 'bg-emerald-500' },
    { key: 'unsettled', label: 'Unsettled', value: data.exclusive.unsettled, color: 'bg-orange-600' }
  ];
  
  const hasWarnings = data.warnings.length > 0;
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Settlement Pipeline</h3>
        {hasWarnings && (
          <div className="group relative">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-50 w-80">
              <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3">
                <div className="font-semibold mb-1">Pipeline Validation:</div>
                {data.warnings.map((w, i) => (
                  <div key={i} className="mt-1">• {w.message}</div>
                ))}
                <div className="absolute top-full right-4 -mt-1">
                  <div className="border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="relative h-12 bg-gray-100 rounded-lg overflow-hidden">
        <div className="absolute inset-0 flex">
          {exclusiveStages.map((stage) => {
            // Each segment shows its proportion of the total captured
            const width = data.exclusive.totalCaptured > 0 ? (stage.value / data.exclusive.totalCaptured) * 100 : 0;
            if (width <= 0) return null;
            
            return (
              <div
                key={stage.key}
                className={`${stage.color} hover:opacity-80 cursor-pointer transition-opacity flex items-center justify-center`}
                style={{ width: `${width}%` }}
                onClick={() => onChipClick(stage.key)}
              >
                <span className="text-white text-xs font-medium px-1">
                  {stage.value}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="flex flex-wrap gap-3 mt-4">
        {exclusiveStages.map(stage => (
          <button
            key={stage.key}
            onClick={() => onChipClick(stage.key)}
            className="flex items-center gap-2 text-sm hover:bg-gray-50 px-2 py-1 rounded transition-colors"
          >
            <div className={`w-3 h-3 rounded ${stage.color}`} />
            <span className="text-gray-700">{stage.label}:</span>
            <span className="font-semibold text-gray-900">{stage.value.toLocaleString('en-IN')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Top Reasons with remainder handling
interface TopReasonsComponentProps {
  data: TopReasons;
  onReasonClick: (reason: string) => void;
}

function TopReasonsComponent({ data, onReasonClick }: TopReasonsComponentProps) {
  // Create rows with remainder if needed
  const displayRows = data?.rows ? [...data.rows] : [];
  if (data?.remainder && data.remainder > 0) {
    displayRows.push({
      reason: 'OTHER',
      count: data.remainder,
      pct: (data.remainder / (data.total + data.remainder)) * 100
    });
  }
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Top Exception Reasons ({data.mode === 'impacted' ? 'Impacted Txns' : 'Occurrences'})
        </h3>
        <div className="text-xs text-gray-500">
          Total: {data.total + (data.remainder || 0)}
        </div>
      </div>
      
      <div className="space-y-3">
        {displayRows.slice(0, 6).map(row => {
          const display = REASON_DISPLAY[row.reason] || { label: row.reason === 'OTHER' ? 'Other' : row.reason, color: '#6b7280' };
          
          return (
            <button
              key={row.reason}
              onClick={() => onReasonClick(row.reason)}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={row.reason === 'OTHER'}
            >
              <div className="flex items-center gap-3">
                <div 
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: display.color }}
                />
                <span className="text-sm font-medium text-gray-700">{display.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-900">{row.count}</span>
                <span className="text-xs text-gray-500">({row.pct.toFixed(1)}%)</span>
                {row.reason !== 'OTHER' && <ChevronRight className="h-4 w-4 text-gray-400" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// By Source section
interface BySourceProps {
  data: Overview['bySource'];
  onSourceClick: (source: 'manual' | 'connector') => void;
}

function BySource({ data, onSourceClick }: BySourceProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">By Source</h3>
      
      <div className="space-y-3">
        {(['manual', 'connector'] as const).map(source => {
          const sourceData = data[source];
          const matchRate = sourceData.pct;
          
          return (
            <button
              key={source}
              onClick={() => onSourceClick(source)}
              className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700 uppercase">{source}</span>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">
                    {sourceData.matched} / {sourceData.total}
                  </span>
                  <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500"
                      style={{ width: `${matchRate}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{matchRate.toFixed(1)}%</span>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Main Component
export function ReconOverviewConsistent() {
  const navigate = useNavigate();
  const [window, setWindow] = useState<Window>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 7);
    
    return {
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0],
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      label: 'Last 7 days'
    };
  });
  
  // No longer need reason mode - it's determined by the aggregator
  
  // Fetch overview data from aggregator
  const { data: overview, isLoading, refetch } = useQuery({
    queryKey: ['recon-overview', window],
    queryFn: async () => {
      // In production, this would call the API
      // For now, using the mock aggregator directly
      return await getOverview(window, {});
    },
    refetchInterval: 30000 // Auto-refresh every 30s
  });
  
  
  // Convert aggregator data to chart formats
  const ageingData: AgeingResponse | undefined = overview && {
    window: { from: window.from, to: window.to, label: window.label },
    openTotal: { count: overview.tiles.openExceptions.count, amount: overview.tiles.unmatched.amount },
    buckets: Object.entries(overview.ageing).map(([bucket, reasons]) => ({
      bucket,
      total: {
        count: Object.values(reasons).reduce((sum, count) => sum + count, 0),
        amount: Object.values(reasons).reduce((sum, count) => sum + count * 2847 * 100, 0)
      },
      reasons: Object.entries(reasons)
        .filter(([_, count]) => count > 0)
        .map(([code, count]) => ({
          code,
          label: REASON_DISPLAY[code]?.label || code,
          count,
          amount: count * 2847 * 100,
          percentOpen: (count / overview.tiles.openExceptions.count) * 100
        }))
    }))
  };
  
  const burndownData: BurndownResponse | undefined = overview && {
    window: { from: window.from, to: window.to, label: window.label },
    openTotal: overview.tiles.openExceptions.count,
    resolved7dAvg: overview.burnDown.targetPerDay,
    targetReductionRate: overview.burnDown.targetPerDay,
    series: overview.burnDown.days
  };
  
  // Handle drill-through actions
  const handlePipelineClick = (stage: string) => {
    // Track analytics
    if (window.analytics) {
      window.analytics.track('overview:chip_clicked', { stage, window });
    }
    
    // Navigate to appropriate filtered view
    const link = buildReconItemsLink({
      from: window.from,
      to: window.to,
      status: stage === 'unsettled' ? 'unmatched' : 'matched'
    });
    navigate(link);
  };
  
  const handleReasonClick = (reason: string) => {
    const link = buildExceptionsLink({
      from: window.from,
      to: window.to,
      reasonCode: reason
    });
    navigate(link);
  };
  
  const handleSourceClick = (source: 'manual' | 'connector') => {
    const link = buildReconItemsLink({
      from: window.from,
      to: window.to,
      source
    });
    navigate(link);
  };
  
  const handleKPIClick = (kpi: string) => {
    let link: string;
    switch (kpi) {
      case 'reconRate':
        link = buildReconItemsLink({ from: window.from, to: window.to, status: 'matched' });
        break;
      case 'unmatched':
        link = buildReconItemsLink({ from: window.from, to: window.to, status: 'unmatched' });
        break;
      case 'exceptions':
        link = buildExceptionsLink({ from: window.from, to: window.to });
        break;
      case 'credited':
        link = buildReconItemsLink({ from: window.from, to: window.to, status: 'credited' });
        break;
      default:
        return;
    }
    navigate(link);
  };
  
  if (isLoading || !overview) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
      </div>
    );
  }
  
  // Calculate trends vs previous window (would fetch from API in production)
  const reconTrend = { value: 5.2, isPositive: true };
  
  return (
    <div className="space-y-6">
      {/* Header with Window Picker */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Reconciliation Overview</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor reconciliation performance and exception trends
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <WindowPicker value={window} onChange={setWindow} />
          <button
            onClick={() => refetch()}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <Download className="h-5 w-5" />
          </button>
        </div>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Recon Match Rate"
          value={`${overview.tiles.reconRate.pct.toFixed(1)}%`}
          subtext={`${overview.tiles.reconRate.matched} of ${overview.tiles.reconRate.total} — ${window.label}`}
          trend={reconTrend}
          icon={<Activity className="h-5 w-5" />}
          definition={overview.definitions.reconRate}
          onClick={() => handleKPIClick('reconRate')}
        />
        
        <KPICard
          title="Unmatched Value"
          value={formatMetricNumber(overview.tiles.unmatched.amount, 'amount')}
          subtext={`${overview.tiles.unmatched.txns} transactions — ${window.label}`}
          icon={<AlertCircle className="h-5 w-5" />}
          definition={overview.definitions.unmatched}
          onClick={() => handleKPIClick('unmatched')}
        />
        
        <KPICard
          title="Open Exceptions"
          value={overview.tiles.openExceptions.count}
          subtext={`${overview.tiles.openExceptions.critical} critical, ${overview.tiles.openExceptions.high} high`}
          icon={<AlertTriangle className="h-5 w-5" />}
          definition={overview.definitions.openExceptions}
          onClick={() => handleKPIClick('exceptions')}
        />
        
        <KPICard
          title="Credited to Merchant"
          value={formatMetricNumber(overview.tiles.creditedToMerchant.amount, 'amount')}
          subtext={`${overview.tiles.creditedToMerchant.txCount} txns — ${window.label}`}
          icon={<CheckCircle className="h-5 w-5" />}
          definition={overview.definitions.creditedToMerchant}
          onClick={() => handleKPIClick('credited')}
        />
      </div>
      
      {/* Pipeline Bar */}
      <PipelineBar 
        data={overview.pipeline} 
        onChipClick={handlePipelineClick}
      />
      
      {/* Middle Row: By Source and Top Reasons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BySource data={overview.bySource} onSourceClick={handleSourceClick} />
        <TopReasonsComponent 
          data={overview.topReasons} 
          onReasonClick={handleReasonClick}
        />
      </div>
      
      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {ageingData && (
          <ExceptionAgeingChart 
            data={ageingData} 
            window={{ from: window.from, to: window.to, label: window.label }}
          />
        )}
        {burndownData && (
          <ExceptionBurndownChart 
            data={burndownData}
            window={{ from: window.from, to: window.to, label: window.label }}
          />
        )}
      </div>
    </div>
  );
}

export default ReconOverviewConsistent;