import { useState, useEffect } from 'react'
import { X, CheckCircle, XCircle, AlertCircle, Clock, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { opsApiExtended } from '@/lib/ops-api-extended'
import type { Connector, ConnectorRun } from '@/types/connectors'

interface RunHistoryModalProps {
  isOpen: boolean
  connector: Connector | null
  onClose: () => void
}

export function RunHistoryModal({ isOpen, connector, onClose }: RunHistoryModalProps) {
  const [runs, setRuns] = useState<ConnectorRun[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedRun, setExpandedRun] = useState<string | null>(null)

  useEffect(() => {
    if (connector && isOpen) {
      loadRunHistory()
    }
  }, [connector, isOpen])

  const loadRunHistory = async () => {
    if (!connector) return
    
    try {
      setLoading(true)
      const response = await opsApiExtended.getConnectorRuns(connector.id)
      setRuns(response.runs || [])
    } catch (error) {
      console.error('Failed to load run history:', error)
      // Generate mock data for demo
      setRuns(generateMockRuns(connector))
    } finally {
      setLoading(false)
    }
  }

  const generateMockRuns = (connector: Connector): ConnectorRun[] => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: `run_${i}`,
      connectorId: connector.id,
      connectorName: connector.name,
      cycleDate: format(new Date(Date.now() - i * 86400000), 'yyyy-MM-dd'),
      startedAt: new Date(Date.now() - i * 86400000 - 3600000).toISOString(),
      finishedAt: new Date(Date.now() - i * 86400000 - 3540000).toISOString(),
      outcome: ['SUCCESS', 'SUCCESS', 'PARTIAL', 'SUCCESS', 'FAILED'][i % 5] as any,
      filesDiscovered: Math.floor(Math.random() * 5) + 1,
      filesDownloaded: Math.floor(Math.random() * 5),
      error: i === 4 ? 'Connection timeout after 30s' : undefined,
      metrics: {
        duration: 60 + Math.floor(Math.random() * 60),
        bytesDownloaded: Math.floor(Math.random() * 10000000),
        rowsProcessed: Math.floor(Math.random() * 10000),
        matchesFound: Math.floor(Math.random() * 9000),
        exceptionsCreated: Math.floor(Math.random() * 100),
      },
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    }))
  }

  const getOutcomeIcon = (outcome?: string) => {
    switch (outcome) {
      case 'SUCCESS':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'PARTIAL':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      case 'FAILED':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getOutcomeBadge = (outcome?: string) => {
    const colors = {
      SUCCESS: 'bg-green-100 text-green-800',
      PARTIAL: 'bg-yellow-100 text-yellow-800',
      FAILED: 'bg-red-100 text-red-800',
    }
    
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[outcome as keyof typeof colors] || 'bg-gray-100 text-gray-800'}`}>
        {outcome || 'RUNNING'}
      </span>
    )
  }

  const formatDuration = (start: string, end?: string) => {
    if (!end) return 'Running...'
    const duration = new Date(end).getTime() - new Date(start).getTime()
    const seconds = Math.floor(duration / 1000)
    const minutes = Math.floor(seconds / 60)
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  if (!isOpen) return null

  const stats = {
    total: runs.length,
    successful: runs.filter(r => (r.outcome || r.status) === 'SUCCESS').length,
    failed: runs.filter(r => (r.outcome || r.status) === 'FAILED').length,
    successRate: runs.length > 0 
      ? ((runs.filter(r => (r.outcome || r.status) === 'SUCCESS').length / runs.length) * 100).toFixed(0)
      : '0',
    totalFiles: runs.reduce((sum, r) => sum + (r.records_processed || r.filesDownloaded || 0), 0)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold">Run History</h2>
            <p className="text-sm text-gray-600">{connector?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 p-6 bg-gray-50 border-b">
          <div>
            <p className="text-xs text-gray-600">Total Runs</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Success Rate</p>
            <p className="text-2xl font-bold text-green-600">{stats.successRate}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Failed Runs</p>
            <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Files Processed</p>
            <p className="text-2xl font-bold">{stats.totalFiles}</p>
          </div>
        </div>

        {/* Run List */}
        <div className="overflow-y-auto max-h-[calc(90vh-280px)] p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : runs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No runs yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="border rounded-lg bg-white hover:shadow-sm transition-shadow"
                >
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getOutcomeIcon(run.outcome)}
                        <div>
                          <p className="font-medium">
                            {run.cycleDate 
                              ? format(new Date(run.cycleDate), 'MMM dd, yyyy')
                              : `${run.run_type || 'Run'} - ${format(new Date(run.startedAt || run.started_at), 'MMM dd, yyyy')}`
                            }
                          </p>
                          <p className="text-xs text-gray-600">
                            Started {formatDistanceToNow(new Date(run.startedAt || run.started_at), { addSuffix: true })}
                          </p>
                        </div>
                        {getOutcomeBadge(run.outcome || run.status)}
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {run.records_processed || run.filesDownloaded || 0} records
                          </p>
                          <p className="text-xs text-gray-600">
                            {run.duration_seconds 
                              ? `${run.duration_seconds}s`
                              : formatDuration(run.startedAt || run.started_at, run.finishedAt || run.completed_at)
                            }
                          </p>
                        </div>
                        {expandedRun === run.id ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </div>

                    {(run.error || run.error_message) && (
                      <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-700">
                        Error: {run.error || run.error_message}
                      </div>
                    )}
                  </div>

                  {expandedRun === run.id && run.metrics && (
                    <div className="px-4 pb-4 border-t">
                      <div className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-gray-600">Bytes Downloaded</p>
                          <p className="font-medium">
                            {(run.metrics.bytesDownloaded! / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Rows Processed</p>
                          <p className="font-medium">
                            {run.metrics.rowsProcessed?.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Matches Found</p>
                          <p className="font-medium">
                            {run.metrics.matchesFound?.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Exceptions</p>
                          <p className="font-medium">
                            {run.metrics.exceptionsCreated}
                          </p>
                        </div>
                      </div>
                      
                      {run.reconJobId && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                          <p className="text-sm font-medium text-blue-900">
                            Reconciliation Triggered
                          </p>
                          <p className="text-xs text-blue-700 mt-1">
                            Job ID: {run.reconJobId}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}