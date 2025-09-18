import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Wifi,
  Database,
  FileText,
  Calendar,
  Play,
  Pause,
  Edit2,
  Eye,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Shield,
  Key,
  Globe,
  Server,
  Activity
} from 'lucide-react'
import { opsApiExtended as opsApi } from '@/lib/ops-api-extended'
import { formatDateTime } from '@/lib/utils'
import { ConnectorDrawer } from './ConnectorDrawer'
import { JobsPanel } from './JobsPanel'

export type ConnectorType = 'PG_HTTP_API' | 'PG_DB_PULL' | 'BANK_SFTP' | 'BANK_HTTP_API'

export interface DataSource {
  sourceId: string
  name: string
  type: ConnectorType
  merchantId?: string
  acquirerCode?: string
  pathOrEndpoint: string
  fileGlob?: string
  httpMethod?: string
  headersJson?: any
  mappingTemplateId?: string
  timezone: string
  isEnabled: boolean
  createdAt: string
  updatedAt: string
  // Extended fields
  schedule?: {
    scheduleId: string
    cronExpr: string
    nextRunAt?: string
    lastRunAt?: string
    isPaused: boolean
  }
  lastJob?: {
    jobId: string
    cycleDate: string
    status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'DLQ'
    rowsIngested?: number
    bytesIngested?: number
    errorMessage?: string
    createdAt: string
  }
  health?: {
    status: 'healthy' | 'degraded' | 'down'
    lastCheck: string
    latency?: number
    message?: string
  }
}

export function ConnectorsPage() {
  const queryClient = useQueryClient()
  const [selectedConnector, setSelectedConnector] = useState<DataSource | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [jobsPanelOpen, setJobsPanelOpen] = useState(false)
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create')

  // Fetch connectors
  const { data, isLoading } = useQuery({
    queryKey: ['connectors'],
    queryFn: () => opsApi.getConnectors(),
    refetchInterval: 30000 // Refresh every 30s for status updates
  })
  
  // Ensure connectors is always an array
  const connectors = Array.isArray(data) ? data : (data?.connectors || [])

  // Run connector manually
  const runConnectorMutation = useMutation({
    mutationFn: (params: { sourceId: string; cycleDate?: string }) => 
      opsApi.runConnector(params.sourceId, params.cycleDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connectors'] })
      queryClient.invalidateQueries({ queryKey: ['ingest-jobs'] })
    }
  })

  // Toggle connector enable/disable
  const toggleConnectorMutation = useMutation({
    mutationFn: (params: { sourceId: string; enabled: boolean }) =>
      opsApi.updateConnector(params.sourceId, { isEnabled: params.enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connectors'] })
    }
  })

  const getTypeIcon = (type: ConnectorType) => {
    switch (type) {
      case 'PG_HTTP_API':
        return <Globe className="w-4 h-4" />
      case 'PG_DB_PULL':
        return <Database className="w-4 h-4" />
      case 'BANK_SFTP':
        return <Server className="w-4 h-4" />
      case 'BANK_HTTP_API':
        return <Wifi className="w-4 h-4" />
    }
  }

  const getTypeLabel = (type: ConnectorType) => {
    switch (type) {
      case 'PG_HTTP_API':
        return 'PG API'
      case 'PG_DB_PULL':
        return 'PG Database'
      case 'BANK_SFTP':
        return 'Bank SFTP'
      case 'BANK_HTTP_API':
        return 'Bank API'
    }
  }

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'SUCCEEDED':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'FAILED':
      case 'DLQ':
        return <XCircle className="w-4 h-4 text-red-600" />
      case 'RUNNING':
        return <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
      case 'QUEUED':
        return <Clock className="w-4 h-4 text-amber-600" />
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />
    }
  }

  const getHealthBadge = (health?: DataSource['health']) => {
    if (!health) return null
    
    const colors = {
      healthy: 'bg-green-100 text-green-800',
      degraded: 'bg-amber-100 text-amber-800',
      down: 'bg-red-100 text-red-800'
    }

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[health.status]}`}>
        <Activity className="w-3 h-3 mr-1" />
        {health.status}
        {health.latency && ` (${health.latency}ms)`}
      </span>
    )
  }

  const parseCronExpression = (cron: string): string => {
    // Simple cron parser for display
    if (cron === '0 0 19 * * ?') return 'Daily at 7:00 PM IST'
    if (cron === '0 0 * * * ?') return 'Every hour'
    if (cron === '0 */30 * * * ?') return 'Every 30 minutes'
    return cron
  }

  const handleCreateConnector = () => {
    setSelectedConnector(null)
    setEditMode('create')
    setDrawerOpen(true)
  }

  const handleEditConnector = (connector: DataSource) => {
    setSelectedConnector(connector)
    setEditMode('edit')
    setDrawerOpen(true)
  }

  const handleViewJobs = (connector: DataSource) => {
    setSelectedConnector(connector)
    setJobsPanelOpen(true)
  }

  const handleRunNow = async (connector: DataSource) => {
    const cycleDate = prompt('Enter cycle date (YYYY-MM-DD) or leave empty for today:')
    await runConnectorMutation.mutateAsync({ 
      sourceId: connector.sourceId, 
      cycleDate: cycleDate || undefined 
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading connectors...</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Data Connectors</h2>
            <p className="text-sm text-gray-500">
              Configure automated data sources for PG transactions and bank reconciliation files
            </p>
          </div>
          <button
            onClick={handleCreateConnector}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Connector
          </button>
        </div>
      </div>

      {/* Connectors Grid */}
      <div className="flex-1 overflow-auto p-6">
        {!connectors || connectors.length === 0 ? (
          <div className="text-center py-12">
            <Server className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No connectors</h3>
            <p className="mt-1 text-sm text-gray-500">Get started by creating a new connector.</p>
            <div className="mt-6">
              <button
                onClick={handleCreateConnector}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Connector
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {connectors.map((connector) => (
              <div
                key={connector.sourceId}
                className="bg-white overflow-hidden shadow rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
              >
                {/* Card Header */}
                <div className="px-4 py-4 border-b border-gray-200">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className={`p-2 rounded-lg ${
                        connector.type.includes('BANK') ? 'bg-green-100' : 'bg-blue-100'
                      }`}>
                        {getTypeIcon(connector.type)}
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">{connector.name}</h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {getTypeLabel(connector.type)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      {connector.isEnabled ? (
                        <button
                          onClick={() => toggleConnectorMutation.mutate({ 
                            sourceId: connector.sourceId, 
                            enabled: false 
                          })}
                          className="p-1 text-green-600 hover:text-green-700"
                          title="Enabled - Click to disable"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleConnectorMutation.mutate({ 
                            sourceId: connector.sourceId, 
                            enabled: true 
                          })}
                          className="p-1 text-gray-400 hover:text-gray-600"
                          title="Disabled - Click to enable"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleEditConnector(connector)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Card Body */}
                <div className="px-4 py-3 space-y-3">
                  {/* Endpoint/Path */}
                  <div className="text-xs">
                    <span className="text-gray-500">Endpoint:</span>
                    <p className="font-mono text-gray-700 truncate">
                      {connector.pathOrEndpoint}
                    </p>
                    {connector.fileGlob && (
                      <p className="font-mono text-gray-600 text-xs mt-1">
                        Pattern: {connector.fileGlob}
                      </p>
                    )}
                  </div>

                  {/* Schedule */}
                  {connector.schedule && (
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-gray-500">Schedule:</span>
                        <p className="text-gray-700">
                          {parseCronExpression(connector.schedule.cronExpr)}
                        </p>
                      </div>
                      {connector.schedule.isPaused && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          <Pause className="w-3 h-3 mr-1" />
                          Paused
                        </span>
                      )}
                    </div>
                  )}

                  {/* Last Run */}
                  {connector.lastJob && (
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-gray-500">Last Run:</span>
                        <p className="text-gray-700">
                          {formatDateTime(connector.lastJob.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center space-x-1">
                        {getStatusIcon(connector.lastJob.status)}
                        <span className="text-gray-600">
                          {connector.lastJob.rowsIngested?.toLocaleString() || 0} rows
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Next Run */}
                  {connector.schedule?.nextRunAt && !connector.schedule.isPaused && (
                    <div className="text-xs">
                      <span className="text-gray-500">Next Run:</span>
                      <p className="text-gray-700">
                        {formatDateTime(connector.schedule.nextRunAt)}
                      </p>
                    </div>
                  )}

                  {/* Health Badge */}
                  {connector.health && (
                    <div className="pt-2 border-t border-gray-100">
                      {getHealthBadge(connector.health)}
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => handleViewJobs(connector)}
                      className="inline-flex items-center text-xs text-gray-600 hover:text-gray-900"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View Jobs
                    </button>
                    <button
                      onClick={() => handleRunNow(connector)}
                      disabled={!connector.isEnabled}
                      className={`inline-flex items-center px-3 py-1 border text-xs font-medium rounded-md ${
                        connector.isEnabled
                          ? 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100'
                          : 'border-gray-300 text-gray-400 bg-gray-50 cursor-not-allowed'
                      }`}
                    >
                      <Play className="w-3 h-3 mr-1" />
                      Run Now
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connector Drawer */}
      {drawerOpen && (
        <ConnectorDrawer
          connector={selectedConnector}
          mode={editMode}
          isOpen={drawerOpen}
          onClose={() => {
            setDrawerOpen(false)
            setSelectedConnector(null)
          }}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ['connectors'] })
            setDrawerOpen(false)
            setSelectedConnector(null)
          }}
        />
      )}

      {/* Jobs Panel */}
      {jobsPanelOpen && selectedConnector && (
        <JobsPanel
          connector={selectedConnector}
          isOpen={jobsPanelOpen}
          onClose={() => {
            setJobsPanelOpen(false)
            setSelectedConnector(null)
          }}
        />
      )}
    </div>
  )
}