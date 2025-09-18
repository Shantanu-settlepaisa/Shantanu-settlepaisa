import { ReconSourceSummary, generateDrillThroughParams, KpiFilters } from '@/hooks/opsOverview';
import { useNavigate } from 'react-router-dom';
import { Activity, Upload, ChevronRight } from 'lucide-react';

interface ReconciliationSourcesProps {
  data: ReconSourceSummary | undefined;
  isLoading?: boolean;
  filters: KpiFilters;
}

interface SourceChip {
  label: string;
  count: number;
  variant: 'matched' | 'unmatched-pg' | 'unmatched-bank' | 'exceptions';
  onClick: () => void;
}

export function ReconciliationSources({ data, isLoading, filters }: ReconciliationSourcesProps) {
  const navigate = useNavigate();

  const handleDrillThrough = (source: 'connectors' | 'manual', filterType?: string) => {
    const params = generateDrillThroughParams(filters, {
      source: source === 'connectors' ? 'automated' : 'manual',
      ...(filterType && { status: filterType })
    });
    navigate(`/ops/recon?${params.toString()}`);
  };

  const createSourceChips = (
    sourceData: {
      totalTransactions: number;
      matchedCount: number;
      unmatchedPgCount: number;
      unmatchedBankCount: number;
      exceptionsCount: number;
      matchedPct: number;
    } | undefined, 
    sourceType: 'connectors' | 'manual'
  ): SourceChip[] => {
    if (!sourceData) return [];

    return [
      {
        label: 'Matched',
        count: sourceData.matchedCount,
        variant: 'matched' as const,
        onClick: () => handleDrillThrough(sourceType, 'matched')
      },
      {
        label: 'Unmatched PG',
        count: sourceData.unmatchedPgCount,
        variant: 'unmatched-pg' as const,
        onClick: () => handleDrillThrough(sourceType, 'unmatched-pg')
      },
      {
        label: 'Unmatched Bank',
        count: sourceData.unmatchedBankCount,
        variant: 'unmatched-bank' as const,
        onClick: () => handleDrillThrough(sourceType, 'unmatched-bank')
      },
      {
        label: 'Exceptions',
        count: sourceData.exceptionsCount,
        variant: 'exceptions' as const,
        onClick: () => handleDrillThrough(sourceType, 'exceptions')
      }
    ].filter(chip => chip.count > 0);
  };

  const getChipStyles = (variant: SourceChip['variant']) => {
    switch (variant) {
      case 'matched':
        return 'bg-green-100 text-green-700 hover:bg-green-200';
      case 'unmatched-pg':
        return 'bg-amber-100 text-amber-700 hover:bg-amber-200';
      case 'unmatched-bank':
        return 'bg-orange-100 text-orange-700 hover:bg-orange-200';
      case 'exceptions':
        return 'bg-red-100 text-red-700 hover:bg-red-200';
      default:
        return 'bg-gray-100 text-gray-700 hover:bg-gray-200';
    }
  };

  if (isLoading || !data) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Reconciliation Sources</h3>
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-20 bg-gray-200 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const connectorChips = createSourceChips(data.connectors, 'connectors');
  const manualChips = createSourceChips(data.manualUpload, 'manual');

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Reconciliation Sources</h3>
        <div className="text-2xl font-bold text-gray-900">
          {data.overall.matchedPct}%
          <span className="text-sm font-normal text-gray-500 ml-1">matched</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Connectors Mini-Card */}
        <div 
          className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors cursor-pointer group"
          onClick={() => handleDrillThrough('connectors')}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-gray-900">Connectors</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold text-gray-900">
                {data.connectors.matchedPct}%
              </span>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
            </div>
          </div>
          
          <div className="flex flex-wrap gap-1 mb-2">
            {connectorChips.map((chip) => (
              <button
                key={chip.label}
                onClick={(e) => {
                  e.stopPropagation();
                  chip.onClick();
                }}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${getChipStyles(chip.variant)}`}
              >
                {chip.label} {chip.count.toLocaleString('en-IN')}
              </button>
            ))}
          </div>
          
          <div className="text-xs text-gray-500">
            {data.connectors.totalTransactions.toLocaleString('en-IN')} transactions
          </div>
        </div>

        {/* Manual Upload Mini-Card */}
        <div 
          className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors cursor-pointer group"
          onClick={() => handleDrillThrough('manual')}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-purple-600" />
              <span className="font-medium text-gray-900">Manual Upload</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold text-gray-900">
                {data.manualUpload.matchedPct}%
              </span>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
            </div>
          </div>
          
          <div className="flex flex-wrap gap-1 mb-2">
            {manualChips.map((chip) => (
              <button
                key={chip.label}
                onClick={(e) => {
                  e.stopPropagation();
                  chip.onClick();
                }}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${getChipStyles(chip.variant)}`}
              >
                {chip.label} {chip.count.toLocaleString('en-IN')}
              </button>
            ))}
          </div>
          
          <div className="text-xs text-gray-500">
            {data.manualUpload.totalTransactions.toLocaleString('en-IN')} transactions
          </div>
        </div>
      </div>

      {/* Overall Summary */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate(`/ops/recon?${generateDrillThroughParams(filters, { status: 'matched' }).toString()}`)}
            className="px-3 py-1 bg-green-100 text-green-700 hover:bg-green-200 rounded text-sm font-medium transition-colors"
          >
            Matched {data.overall.matchedCount.toLocaleString('en-IN')}
          </button>
          <button
            onClick={() => navigate(`/ops/recon?${generateDrillThroughParams(filters, { status: 'unmatched-pg' }).toString()}`)}
            className="px-3 py-1 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded text-sm font-medium transition-colors"
          >
            Unmatched PG {data.overall.unmatchedPgCount.toLocaleString('en-IN')}
          </button>
          <button
            onClick={() => navigate(`/ops/recon?${generateDrillThroughParams(filters, { status: 'unmatched-bank' }).toString()}`)}
            className="px-3 py-1 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded text-sm font-medium transition-colors"
          >
            Unmatched Bank {data.overall.unmatchedBankCount.toLocaleString('en-IN')}
          </button>
          <button
            onClick={() => navigate(`/ops/exceptions?${generateDrillThroughParams(filters).toString()}`)}
            className="px-3 py-1 bg-red-100 text-red-700 hover:bg-red-200 rounded text-sm font-medium transition-colors"
          >
            Exceptions {data.overall.exceptionsCount.toLocaleString('en-IN')}
          </button>
        </div>
      </div>
    </div>
  );
}