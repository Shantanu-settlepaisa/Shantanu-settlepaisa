import { CheckCircle, AlertCircle, XCircle, Clock } from 'lucide-react'

export interface ReconStatsData {
  matched: {
    count: number
    amount: number // in paise
  }
  unmatched: {
    count: number
    amount: number // in paise
  }
  exceptions: {
    count: number
  }
  lastRun: {
    at: string
    jobId: string
  }
}

interface ReconStatsProps {
  stats: ReconStatsData | null
}

export function ReconStats({ stats }: ReconStatsProps) {
  // Format currency
  const formatCurrency = (amountInPaise: number) => {
    const amount = amountInPaise / 100
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount)
  }

  // Format date
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).replace(',', ' at')
    } catch {
      return 'Never'
    }
  }

  if (!stats) {
    return null
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* Matched Card */}
      <div className="rounded-xl border bg-white shadow-sm p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-500">Matched</p>
            <p className="text-3xl font-semibold text-green-600 mt-1">
              {stats.matched.count}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {formatCurrency(stats.matched.amount)}
            </p>
          </div>
          <div className="p-2 bg-green-100 rounded-full">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
        </div>
      </div>

      {/* Unmatched Card */}
      <div className="rounded-xl border bg-white shadow-sm p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-500">Unmatched</p>
            <p className="text-3xl font-semibold text-amber-600 mt-1">
              {stats.unmatched.count}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {formatCurrency(stats.unmatched.amount)}
            </p>
          </div>
          <div className="p-2 bg-amber-100 rounded-full">
            <AlertCircle className="h-5 w-5 text-amber-600" />
          </div>
        </div>
      </div>

      {/* Exceptions Card */}
      <div className="rounded-xl border bg-white shadow-sm p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-500">Exceptions</p>
            <p className="text-3xl font-semibold text-red-600 mt-1">
              {stats.exceptions.count}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Requires action
            </p>
          </div>
          <div className="p-2 bg-red-100 rounded-full">
            <XCircle className="h-5 w-5 text-red-600" />
          </div>
        </div>
      </div>

      {/* Last Run Card */}
      <div className="rounded-xl border bg-white shadow-sm p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-500">Last Run</p>
            <p className="text-sm font-semibold text-gray-900 mt-2">
              {formatDate(stats.lastRun.at)}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Job: {stats.lastRun.jobId.substring(0, 8)}...
            </p>
          </div>
          <div className="p-2 bg-gray-100 rounded-full">
            <Clock className="h-5 w-5 text-gray-600" />
          </div>
        </div>
      </div>
    </div>
  )
}