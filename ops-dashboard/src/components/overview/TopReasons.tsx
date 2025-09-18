import { TopReason } from '@/services/overview';
import { AlertCircle, ChevronRight } from 'lucide-react';

interface TopReasonsProps {
  reasons: TopReason[];
  isLoading?: boolean;
  onReasonClick?: (reason: string) => void;
}

export function TopReasons({ reasons, isLoading, onReasonClick }: TopReasonsProps) {
  if (isLoading || !reasons) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Unreconciled Reasons</h3>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-12 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const maxCount = reasons.length > 0 ? Math.max(...reasons.map(r => r.impactedTxns)) : 1;

  const getSeverityColor = (pct: number) => {
    if (pct >= 30) return 'bg-red-100 text-red-700 border-red-200';
    if (pct >= 15) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-yellow-100 text-yellow-700 border-yellow-200';
  };

  const getSeverityLabel = (pct: number) => {
    if (pct >= 30) return 'high';
    if (pct >= 15) return 'medium';
    return 'low';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Top Unreconciled Reasons</h3>
        <span className="text-sm text-gray-500">Last 24 hours</span>
      </div>

      <div className="space-y-3">
        {reasons.map((reason, index) => (
          <div
            key={reason.code}
            className="group cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition-colors"
            onClick={() => onReasonClick?.(reason.code)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium">
                  {index + 1}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{reason.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${getSeverityColor(reason.pct)}`}>
                      {getSeverityLabel(reason.pct)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{reason.code}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900">
                    {reason.impactedTxns.toLocaleString('en-IN')}
                  </div>
                  <div className="text-xs text-gray-500">
                    {reason.pct}% of exceptions
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="text-gray-600">
              Total: {reasons.reduce((sum, r) => sum + r.impactedTxns, 0).toLocaleString('en-IN')} unreconciled
            </span>
          </div>
          <button className="text-blue-600 hover:text-blue-700 font-medium">
            View All Reasons →
          </button>
        </div>
      </div>
    </div>
  );
}