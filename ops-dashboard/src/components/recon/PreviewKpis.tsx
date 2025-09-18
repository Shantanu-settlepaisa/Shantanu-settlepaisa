import { 
  CheckCircle, 
  AlertCircle,
  Clock,
  Download,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  Copy
} from 'lucide-react'

interface PreviewKpisProps {
  stats: {
    total: number
    matched: number
    unmatched: number
    awaitingBank: number
    reasons: {
      amountMismatch: number
      dateMismatch: number
      notInBank: number
      notInPG: number
      duplicate: number
      other: number
    }
  }
  onRerun: () => void
  onExport: (type: 'matched' | 'unmatched' | 'awaiting') => void
  isLoading?: boolean
}

export function PreviewKpis({ stats, onRerun, onExport, isLoading }: PreviewKpisProps) {
  const matchedPercent = stats.total > 0 ? Math.round((stats.matched / stats.total) * 100) : 0
  const unmatchedPercent = stats.total > 0 ? Math.round((stats.unmatched / stats.total) * 100) : 0
  const awaitingPercent = stats.total > 0 ? Math.round((stats.awaitingBank / stats.total) * 100) : 0

  const reasonChips = [
    { key: 'amountMismatch', label: 'Amount Mismatch', icon: DollarSign, count: stats.reasons.amountMismatch },
    { key: 'dateMismatch', label: 'Date Mismatch', icon: Calendar, count: stats.reasons.dateMismatch },
    { key: 'notInBank', label: 'Not in Bank', icon: TrendingDown, count: stats.reasons.notInBank },
    { key: 'notInPG', label: 'Not in PG', icon: TrendingUp, count: stats.reasons.notInPG },
    { key: 'duplicate', label: 'Duplicate', icon: Copy, count: stats.reasons.duplicate },
  ].filter(r => r.count > 0)

  if (isLoading) {
    return (
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Loading skeletons */}
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-8 w-32 bg-gray-200 rounded-full"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border-b border-gray-200">
      {/* Main KPI Chips */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Matched */}
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-green-50 border border-green-200">
              <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
              <span className="text-sm font-medium text-green-900">
                Matched: {stats.matched.toLocaleString()}
              </span>
              <span className="ml-2 text-xs text-green-700">
                ({matchedPercent}%)
              </span>
            </div>

            {/* Unmatched */}
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-red-50 border border-red-200">
              <AlertCircle className="w-4 h-4 text-red-600 mr-2" />
              <span className="text-sm font-medium text-red-900">
                Unmatched: {stats.unmatched.toLocaleString()}
              </span>
              <span className="ml-2 text-xs text-red-700">
                ({unmatchedPercent}%)
              </span>
            </div>

            {/* Awaiting Bank File */}
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-amber-50 border border-amber-200">
              <Clock className="w-4 h-4 text-amber-600 mr-2" />
              <span className="text-sm font-medium text-amber-900">
                Awaiting Bank: {stats.awaitingBank.toLocaleString()}
              </span>
              <span className="ml-2 text-xs text-amber-700">
                ({awaitingPercent}%)
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onRerun}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Re-run Recon
            </button>
            
            <div className="flex items-center space-x-1 border-l pl-2">
              <button
                onClick={() => onExport('matched')}
                disabled={stats.matched === 0}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4 mr-1" />
                Export Matched
              </button>
              <button
                onClick={() => onExport('unmatched')}
                disabled={stats.unmatched === 0}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4 mr-1" />
                Export Unmatched
              </button>
              <button
                onClick={() => onExport('awaiting')}
                disabled={stats.awaitingBank === 0}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4 mr-1" />
                Export Awaiting
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Reason Chips */}
      {reasonChips.length > 0 && (
        <div className="px-6 pb-3 -mt-1">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Reasons:</span>
            {reasonChips.map(reason => {
              const Icon = reason.icon
              return (
                <div
                  key={reason.key}
                  className="inline-flex items-center px-3 py-1 rounded-full bg-gray-100 border border-gray-200"
                >
                  <Icon className="w-3 h-3 text-gray-600 mr-1.5" />
                  <span className="text-xs font-medium text-gray-700">
                    {reason.label}: {reason.count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Warning Banner for Predominantly Awaiting */}
      {awaitingPercent > 50 && (
        <div className="bg-amber-50 border-t border-amber-200 px-6 py-3">
          <div className="flex items-center">
            <AlertCircle className="w-4 h-4 text-amber-600 mr-2" />
            <p className="text-sm text-amber-800">
              <strong>Note:</strong> {awaitingPercent}% of transactions are awaiting bank file. 
              These transactions were found in your PG file but not in the bank reconciliation file. 
              They may appear in a future bank file or could indicate pending settlements.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}