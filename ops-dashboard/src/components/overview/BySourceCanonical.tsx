import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock, AlertCircle } from 'lucide-react';
import { formatINR } from '@/shared/reconMap';
import { fetchSourcesSummary, type OverviewWindow } from '@/services/overview';

interface BySourceCanonicalProps {
  window: OverviewWindow;
  onSourceClick?: (source: string) => void;
}

export function BySourceCanonical({ window, onSourceClick }: BySourceCanonicalProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['recon-sources-summary', window],
    queryFn: () => fetchSourcesSummary(window),
    refetchInterval: 30000,
  });

  if (isLoading || !data) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Reconciliation Sources</h3>
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-16 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { matchedPct, sources = [] } = data;

  // Calculate max value for bar scaling
  const maxCount = sources.length > 0 
    ? Math.max(...sources.map(s => s.totals?.count || 0)) 
    : 1;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Reconciliation Sources</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Overall Match</span>
          <span className="text-lg font-semibold text-green-600">{matchedPct}%</span>
        </div>
      </div>
      
      <div className="space-y-4">
        {sources.map((source) => {
          const isManual = source.sourceType === 'manual';
          const totalCount = source.totals?.count || 0;
          const barWidth = totalCount > 0 ? (totalCount / maxCount) * 100 : 0;
          
          // Calculate match rate for this source
          const matchedCount = source.breakdown?.matched?.count || 0;
          const sourceMatchRate = totalCount > 0 
            ? Math.round((matchedCount / totalCount) * 100) 
            : 0;
          
          // Get counts for each status
          const unmatchedPgCount = source.breakdown?.unmatchedPg?.count || 0;
          const unmatchedBankCount = source.breakdown?.unmatchedBank?.count || 0;
          const exceptionsCount = source.breakdown?.exceptions?.count || 0;
          
          return (
            <div
              key={source.sourceType}
              className="group cursor-pointer"
              onClick={() => onSourceClick?.(source.sourceType)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 capitalize">
                    {source.sourceType === 'manual' ? 'Manual Upload' : 'Bank Connectors'}
                  </span>
                  {!isManual && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="w-3 h-3" />
                      <span>Auto-sync</span>
                    </div>
                  )}
                  {exceptionsCount > 0 && (
                    <div className="flex items-center gap-1 text-xs text-amber-600">
                      <AlertCircle className="w-3 h-3" />
                      <span>{exceptionsCount} exceptions</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900">
                    {sourceMatchRate}% matched
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                </div>
              </div>
              
              <div className="relative">
                <div className="w-full bg-gray-100 rounded-full h-8 overflow-hidden">
                  <div className="flex h-full">
                    {/* Matched (Green) */}
                    <div
                      className="bg-green-500 transition-all duration-500"
                      style={{ width: `${(matchedCount / totalCount) * 100}%` }}
                      title={`Matched: ${matchedCount}`}
                    />
                    {/* Unmatched PG (Amber) */}
                    <div
                      className="bg-amber-400 transition-all duration-500"
                      style={{ width: `${(unmatchedPgCount / totalCount) * 100}%` }}
                      title={`Unmatched PG: ${unmatchedPgCount}`}
                    />
                    {/* Unmatched Bank (Orange) */}
                    <div
                      className="bg-orange-400 transition-all duration-500"
                      style={{ width: `${(unmatchedBankCount / totalCount) * 100}%` }}
                      title={`Unmatched Bank: ${unmatchedBankCount}`}
                    />
                    {/* Exceptions (Red) */}
                    <div
                      className="bg-red-500 transition-all duration-500"
                      style={{ width: `${(exceptionsCount / totalCount) * 100}%` }}
                      title={`Exceptions: ${exceptionsCount}`}
                    />
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <span>{formatINR(source.totals?.amountPaise || '0')} total</span>
                    <span className="font-medium text-green-600">{matchedCount} matched</span>
                    {exceptionsCount > 0 && (
                      <span className="font-medium text-red-600">{exceptionsCount} exceptions</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {totalCount.toLocaleString('en-IN')} txns
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span className="text-gray-600">Matched</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-amber-400 rounded"></div>
              <span className="text-gray-600">Unmatched PG</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-400 rounded"></div>
              <span className="text-gray-600">Unmatched Bank</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded"></div>
              <span className="text-gray-600">Exceptions</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}