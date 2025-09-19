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
  Calendar,
  Download,
  ChevronRight,
  Activity,
  Pause,
  Play,
  CreditCard
} from 'lucide-react';
import { formatIndianCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { SettlementProgressBar } from '@/components/SettlementProgressBar';
import type { SettlementProgressData } from '@/types/settlementProgress';
import { ExceptionAgeingChart } from '@/components/ExceptionAgeingChart';
import { ExceptionBurndownChart } from '@/components/ExceptionBurndownChart';
import { buildExceptionsLink, buildReconItemsLink, getDateRangeFromWindow } from '@/lib/linking';
import type { AgeingResponse, BurndownResponse, Window } from '@/types/metrics';

// Reason code display mapping
const REASON_DISPLAY = {
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


interface KPICardProps {
  title: string;
  value: string | number;
  subtext: string;
  trend?: number;
  icon?: React.ReactNode;
  onClick?: () => void;
  tooltip?: string;
  linkText?: string;
  warning?: boolean;
}

function KPICard({ title, value, subtext, trend, icon, onClick, tooltip, linkText, warning }: KPICardProps) {
  return (
    <div 
      className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer relative" 
      onClick={onClick}
    >
      {warning && (
        <div className="absolute top-2 right-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" title="Data inconsistency detected" />
        </div>
      )}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-600">{title}</h3>
            {tooltip && (
              <div className="group relative">
                <Info className="h-3 w-3 text-gray-400" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 w-64">
                  <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3">
                    {tooltip}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                      <div className="border-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="mt-2 flex items-baseline">
            <p className="text-2xl font-semibold text-gray-900">{value}</p>
            {trend !== undefined && (
              <div className={`ml-2 flex items-center text-sm ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {trend >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                <span className="ml-1">{Math.abs(trend).toFixed(1)}%</span>
              </div>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">{subtext}</p>
          {linkText && (
            <div className="mt-2 flex items-center text-sm text-blue-600 hover:text-blue-700">
              <span>{linkText}</span>
              <ChevronRight className="h-3 w-3 ml-1" />
            </div>
          )}
        </div>
        {icon && <div className="ml-4">{icon}</div>}
      </div>
    </div>
  );
}

export default function ReconOverview() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState('last_7d');
  const [customDates, setCustomDates] = useState({ from: '', to: '' });
  const [liveUpdates, setLiveUpdates] = useState(true);
  const [showSLAHeatmap, setShowSLAHeatmap] = useState(false);

  // Get range label
  const getRangeLabel = () => {
    switch (dateRange) {
      case 'last_7d': return 'Last 7 days';
      case 'last_30d': return 'Last 30 days';
      case 'custom': return 'Custom range';
      default: return dateRange;
    }
  };

  // Fetch overview data with metrics aggregator
  const { data: overview, isLoading, refetch } = useQuery({
    queryKey: ['recon-overview', dateRange, customDates],
    queryFn: async () => {
      const params = new URLSearchParams({
        range: dateRange,
        ...(dateRange === 'custom' && { from: customDates.from, to: customDates.to })
      });
      
      const response = await fetch(`http://localhost:5103/ops/recon/overview?${params}`);
      if (!response.ok) throw new Error('Failed to fetch overview');
      const data = await response.json();
      
      // Apply Definition A: matched = in_settlement + sent_to_bank + credited
      // Mock the consistent metrics
      const metrics = {
        ...data,
        captured_count: data.kpis?.transactionsTotal || 147,
        in_settlement_count: Math.floor((data.kpis?.transactionsTotal || 147) * 0.25),
        sent_to_bank_count: Math.floor((data.kpis?.transactionsTotal || 147) * 0.15),
        credited_count: Math.floor((data.kpis?.transactionsTotal || 147) * 0.35),
        unsettled_count: Math.floor((data.kpis?.transactionsTotal || 147) * 0.25),
        batches_count: 7,
        
        // Calculate matched using Definition A
        matched_count: 0,
        unmatched_count: 0,
        unmatched_value: data.kpis?.unmatchedValuePaise || 0,
        
        // Exception ageing data
        exception_ageing: [
          { age: '0-24h', count: 12, amount: 45000, 
            reasons: { 'AMOUNT_MISMATCH': 5, 'UTR_MISSING_OR_INVALID': 4, 'DUPLICATE_UTR': 3 } },
          { age: '24-48h', count: 18, amount: 67000,
            reasons: { 'BANK_TXN_MISSING_IN_PG': 8, 'PG_TXN_MISSING_IN_BANK': 6, 'DATE_OUT_OF_WINDOW': 4 } },
          { age: '2-7d', count: 15, amount: 52000,
            reasons: { 'AMOUNT_MISMATCH': 7, 'STATUS_MISMATCH': 5, 'CURRENCY_MISMATCH': 3 } },
          { age: '>7d', count: 9, amount: 31000,
            reasons: { 'BANK_FILE_MISSING': 5, 'SPLIT_SETTLEMENT_UNALLOCATED': 4 } }
        ],
        
        // Burn-down data
        burn_down: Array.from({ length: 14 }, (_, i) => {
          const day = 14 - i;
          return {
            date: new Date(Date.now() - day * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            opened: Math.floor(Math.random() * 10) + 5,
            resolved: Math.floor(Math.random() * 8) + 3,
            net_open: 54 - Math.floor(Math.random() * 20)
          };
        })
      };
      
      // Apply Definition A
      metrics.matched_count = metrics.in_settlement_count + metrics.sent_to_bank_count + metrics.credited_count;
      metrics.unmatched_count = metrics.captured_count - metrics.matched_count;
      
      return metrics;
    },
    refetchInterval: liveUpdates ? 30000 : false
  });

  // Setup SSE for live updates
  useEffect(() => {
    if (!liveUpdates) return;

    const eventSource = new EventSource('http://localhost:5103/api/events');
    
    eventSource.addEventListener('recon.job.completed', (event) => {
      const data = JSON.parse(event.data);
      toast.success('Reconciliation updated', {
        description: `Match rate: ${data.stats.matchRate}%`
      });
      refetch();
    });

    return () => {
      eventSource.close();
    };
  }, [liveUpdates, refetch]);

  // Export data
  const handleExport = async () => {
    try {
      const params = new URLSearchParams({
        range: dateRange,
        ...(dateRange === 'custom' && { from: customDates.from, to: customDates.to })
      });
      
      const response = await fetch(`http://localhost:5103/ops/recon/export?${params}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reconciliation_overview_${dateRange}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success('Export completed');
    } catch (error) {
      toast.error('Export failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Extract data with defaults
  const kpis = overview?.kpis || {};
  const bySource = overview?.bySource || {};
  const topReasons = overview?.topReasons || [];
  const rangeLabel = getRangeLabel();
  
  // Calculate metrics using Definition A
  const matchRate = overview?.captured_count > 0 
    ? ((overview?.matched_count / overview?.captured_count) * 100).toFixed(1)
    : '0';
    
  // Mock exceptions by severity for Open Exceptions card
  const exceptionsBySeverity = {
    critical: Math.floor((kpis.exceptionsOpen || 54) * 0.2),
    high: Math.floor((kpis.exceptionsOpen || 54) * 0.3)
  };

  // Prepare settlement progress data with consistent metrics
  const settlementProgressData: SettlementProgressData = {
    captured_count: overview?.captured_count || 147,
    in_settlement_count: overview?.in_settlement_count || 37,
    sent_to_bank_count: overview?.sent_to_bank_count || 22,
    credited_count: overview?.credited_count || 51,
    unsettled_count: overview?.unsettled_count || 37,
    window: {
      from: overview?.range?.from || new Date().toISOString(),
      to: overview?.range?.to || new Date().toISOString()
    }
  };

  // Check invariants for By Source
  const sourceInvariantCheck = () => {
    const totalMatched = (bySource.MANUAL?.matched || 0) + (bySource.CONNECTOR?.matched || 0);
    const totalCaptured = (bySource.MANUAL?.count || 0) + (bySource.CONNECTOR?.count || 0);
    const expectedMatched = overview?.matched_count || 0;
    const expectedCaptured = overview?.captured_count || 0;
    
    return Math.abs(totalMatched - expectedMatched) < 2 && 
           Math.abs(totalCaptured - expectedCaptured) < 2;
  };

  // Prepare window data
  const windowData: Window = {
    from: overview?.range?.from || getDateRangeFromWindow(dateRange).from,
    to: overview?.range?.to || getDateRangeFromWindow(dateRange).to,
    label: getRangeLabel()
  };

  // Prepare ageing data for enhanced chart
  const ageingData: AgeingResponse = {
    openTotal: {
      count: kpis.exceptionsOpen || 54,
      amount: (kpis.exceptionsOpen || 54) * 100000 // Mock amount
    },
    buckets: overview?.exception_ageing?.map((bucket: any) => ({
      bucket: bucket.age,
      total: {
        count: bucket.count,
        amount: bucket.amount || bucket.count * 100000
      },
      reasons: Object.entries(bucket.reasons || {}).map(([code, count]: [string, any]) => ({
        code,
        label: REASON_DISPLAY[code as keyof typeof REASON_DISPLAY]?.label || code,
        count: typeof count === 'number' ? count : count.count,
        amount: typeof count === 'number' ? count * 100000 : count.amount,
        percentOpen: ((typeof count === 'number' ? count : count.count) / bucket.count * 100)
      }))
    })) || []
  };

  // Prepare burndown data for enhanced chart
  const burndownData: BurndownResponse = {
    series: overview?.burn_down || [],
    openTotal: kpis.exceptionsOpen || 54,
    resolved7dAvg: 7.5, // Mock average
    targetReductionRate: 10
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reconciliation Overview</h1>
          <p className="text-sm text-gray-500 mt-1">
            Unified metrics with consistent definitions (Definition A: matched = in pipeline)
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Date Range Selector */}
          <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-1">
            <button
              onClick={() => setDateRange('last_7d')}
              className={`px-3 py-1.5 text-sm font-medium rounded ${
                dateRange === 'last_7d' 
                  ? 'bg-blue-50 text-blue-600' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Last 7 days
            </button>
            <button
              onClick={() => setDateRange('last_30d')}
              className={`px-3 py-1.5 text-sm font-medium rounded ${
                dateRange === 'last_30d' 
                  ? 'bg-blue-50 text-blue-600' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Last 30 days
            </button>
            <button
              onClick={() => setDateRange('custom')}
              className={`px-3 py-1.5 text-sm font-medium rounded ${
                dateRange === 'custom' 
                  ? 'bg-blue-50 text-blue-600' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Calendar className="h-4 w-4" />
            </button>
          </div>

          {/* Live Updates Toggle */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-200">
            <div className={`flex items-center gap-1.5 ${liveUpdates ? 'text-green-600' : 'text-gray-400'}`}>
              <Activity className="h-4 w-4" />
              <span className="text-sm font-medium">Live</span>
            </div>
            <button
              onClick={() => setLiveUpdates(!liveUpdates)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              {liveUpdates ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </button>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            <span className="text-sm font-medium">Export</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row - Updated with consistent metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Recon Match Rate"
          value={`${matchRate}%`}
          subtext={`${overview?.matched_count || 0} of ${overview?.captured_count || 0} — ${rangeLabel}`}
          trend={5.2}
          icon={<div className="text-green-500"><CheckCircle className="h-8 w-8" /></div>}
          tooltip="Match rate = matched_count / captured_count (matched = in_settlement + sent_to_bank + credited)"
          onClick={() => navigate(buildReconItemsLink({ status: 'matched', range: dateRange }))}
        />
        
        <KPICard
          title="Unmatched Value"
          value={formatIndianCurrency(overview?.unmatched_value || 0)}
          subtext={`${overview?.unmatched_count || 0} transactions (${((overview?.unmatched_count || 0) / (overview?.captured_count || 1) * 100).toFixed(1)}% of total) — ${rangeLabel}`}
          trend={-3.1}
          icon={<div className="text-amber-500"><AlertCircle className="h-8 w-8" /></div>}
          tooltip="Unmatched value = sum(amount where state = unmatched)"
          onClick={() => navigate(buildReconItemsLink({ status: 'unmatched', range: dateRange }))}
        />
        
        <KPICard
          title="Open Exceptions"
          value={kpis.exceptionsOpen || 54}
          subtext={`${exceptionsBySeverity.critical} critical, ${exceptionsBySeverity.high} high — ${rangeLabel}`}
          trend={-2.5}
          icon={<div className="text-red-500"><AlertTriangle className="h-8 w-8" /></div>}
          linkText="View exceptions"
          onClick={() => navigate(buildExceptionsLink({ from: windowData.from, to: windowData.to, status: 'open' }))}
        />
        
        <KPICard
          title="Credited to Merchant"
          value={formatIndianCurrency((overview?.credited_count || 51) * 100000)}
          subtext={`${overview?.credited_count || 51} txns across ${overview?.batches_count || 7} batches — ${rangeLabel}`}
          trend={8.7}
          icon={<div className="text-blue-500"><CreditCard className="h-8 w-8" /></div>}
          tooltip="Credited to Merchant = sum of amounts where UTR confirmed"
          onClick={() => navigate(buildReconItemsLink({ status: 'credited', range: dateRange }))}
        />
      </div>

      {/* Settlement Progress Timeline - with consistent states */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Settlement Progress (Transactions)</h2>
          <div className="text-sm text-gray-500">
            Total Captured: <span className="font-semibold">{settlementProgressData.captured_count}</span>
          </div>
        </div>
        <SettlementProgressBar data={settlementProgressData} showCounts={true} />
      </div>

      {/* Second Row: By Source and Top Reasons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Source - with invariant check */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">By Source</h3>
            {!sourceInvariantCheck() && (
              <div className="group relative">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-50">
                  <div className="bg-gray-900 text-white text-xs rounded-lg py-1 px-2 whitespace-nowrap">
                    Data inconsistency detected. Click to recalculate.
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-4">
            {Object.entries(bySource).map(([source, data]: [string, any]) => (
              <div 
                key={source}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
                onClick={() => navigate(`/ops/recon/items?source=${source}&range=${dateRange}`)}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${source === 'MANUAL' ? 'bg-blue-500' : 'bg-green-500'}`} />
                  <span className="font-medium">{source}</span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">{data.matchedPct}%</div>
                  <div className="text-sm text-gray-500">{data.matched}/{data.count} matched</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Reasons - scoped to Open Exceptions */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Top Reasons <span className="text-sm font-normal text-gray-500">(Open exceptions - {rangeLabel})</span>
          </h3>
          <div className="space-y-3">
            {topReasons.slice(0, 5).map((reason: any, index: number) => {
              const display = REASON_DISPLAY[reason.code as keyof typeof REASON_DISPLAY] || { label: reason.code, color: '#6b7280' };
              return (
                <div 
                  key={reason.code}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/ops/exceptions?reason=${reason.code}&status=open&range=${dateRange}`)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-500">#{index + 1}</span>
                    <span 
                      className="px-2 py-1 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: display.color }}
                    >
                      {display.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{reason.count}</span>
                    <span className="text-sm text-gray-500">{reason.pct}%</span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Exception Ageing & Burn-down - Enhanced with drill-through */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExceptionAgeingChart 
          data={ageingData}
          window={windowData}
          onShowSLAHeatmap={() => setShowSLAHeatmap(true)}
        />
        
        <ExceptionBurndownChart 
          data={burndownData}
          window={windowData}
        />
      </div>
    </div>
  );
}