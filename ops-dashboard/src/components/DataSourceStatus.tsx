import { CheckCircle, AlertCircle, XCircle, RefreshCw, Database } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'

interface DataSource {
  id: string
  name: string
  type: 'pg' | 'bank' | 'erp'
  status: 'connected' | 'degraded' | 'error'
  lastSyncAt: string
  syncLag?: number // in minutes
  lastError?: string
}

interface DataSourceStatusProps {
  sources: DataSource[]
}

const statusIcons = {
  connected: CheckCircle,
  degraded: AlertCircle,
  error: XCircle,
}

const statusColors = {
  connected: 'text-green-500',
  degraded: 'text-amber-500',
  error: 'text-red-500',
}

const typeLabels = {
  pg: 'Payment Gateway',
  bank: 'Bank Feed',
  erp: 'ERP System',
}

export function DataSourceStatus({ sources }: DataSourceStatusProps) {
  const handleRecheck = (sourceId: string) => {
    // In demo mode, just show a toast or update timestamp
    console.log('Rechecking source:', sourceId)
  }

  return (
    <div className="p-6 space-y-4">
      {sources.map((source) => {
        const StatusIcon = statusIcons[source.status]
        
        return (
          <div key={source.id} className="flex items-start space-x-3">
            <div className={`flex-shrink-0 mt-1 ${statusColors[source.status]}`}>
              <StatusIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{source.name}</p>
                  <p className="text-xs text-gray-500">{typeLabels[source.type]}</p>
                </div>
                <button
                  onClick={() => handleRecheck(source.id)}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Recheck connection"
                >
                  <RefreshCw className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="mt-1">
                <p className="text-xs text-gray-500">
                  Last sync: {formatRelativeTime(source.lastSyncAt)}
                  {source.syncLag && source.syncLag > 5 && (
                    <span className="ml-1 text-amber-600">
                      ({source.syncLag}m lag)
                    </span>
                  )}
                </p>
                {source.lastError && (
                  <p className="text-xs text-red-600 mt-1">{source.lastError}</p>
                )}
              </div>
            </div>
          </div>
        )
      })}
      
      {sources.length === 0 && (
        <div className="text-center py-4 text-gray-500">
          <Database className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No data sources configured</p>
        </div>
      )}
    </div>
  )
}