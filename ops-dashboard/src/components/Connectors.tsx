import { useState } from 'react'
import { 
  Wifi, 
  WifiOff, 
  Server, 
  CheckCircle, 
  AlertCircle,
  XCircle,
  Clock,
  RefreshCw,
  Settings,
  Activity
} from 'lucide-react'

interface Connector {
  id: string
  name: string
  type: 'api' | 'sftp' | 'webhook'
  bank: string
  status: 'active' | 'inactive' | 'error' | 'degraded'
  lastSync?: string
  nextSync?: string
  metrics?: {
    success: number
    failed: number
    pending: number
  }
  config?: {
    endpoint?: string
    schedule?: string
    retryPolicy?: string
  }
}

const mockConnectors: Connector[] = [
  {
    id: 'conn-001',
    name: 'ICICI API v2',
    type: 'api',
    bank: 'ICICI Bank',
    status: 'active',
    lastSync: '2024-01-14T15:30:00Z',
    nextSync: '2024-01-14T16:00:00Z',
    metrics: {
      success: 1247,
      failed: 3,
      pending: 0
    },
    config: {
      endpoint: 'https://api.icicibank.com/recon/v2',
      schedule: 'Every 30 mins',
      retryPolicy: '3 attempts, exponential backoff'
    }
  },
  {
    id: 'conn-002',
    name: 'HDFC SFTP',
    type: 'sftp',
    bank: 'HDFC Bank',
    status: 'active',
    lastSync: '2024-01-14T14:00:00Z',
    nextSync: '2024-01-14T18:00:00Z',
    metrics: {
      success: 312,
      failed: 0,
      pending: 1
    },
    config: {
      endpoint: 'sftp://hdfc-recon.settlepaisa.com',
      schedule: 'Every 4 hours',
      retryPolicy: '5 attempts, linear backoff'
    }
  },
  {
    id: 'conn-003',
    name: 'Axis Bank API',
    type: 'api',
    bank: 'Axis Bank',
    status: 'degraded',
    lastSync: '2024-01-14T12:15:00Z',
    nextSync: '2024-01-14T16:15:00Z',
    metrics: {
      success: 198,
      failed: 12,
      pending: 5
    },
    config: {
      endpoint: 'https://api.axisbank.co.in/settlements',
      schedule: 'Every 4 hours',
      retryPolicy: '3 attempts, exponential backoff'
    }
  },
  {
    id: 'conn-004',
    name: 'SBI Webhook',
    type: 'webhook',
    bank: 'SBI',
    status: 'error',
    lastSync: '2024-01-14T08:00:00Z',
    metrics: {
      success: 89,
      failed: 45,
      pending: 23
    },
    config: {
      endpoint: 'Webhook listener',
      retryPolicy: 'Queue-based retry'
    }
  },
  {
    id: 'conn-005',
    name: 'BOB SFTP',
    type: 'sftp',
    bank: 'Bank of Baroda',
    status: 'inactive',
    lastSync: '2024-01-13T18:00:00Z',
    metrics: {
      success: 0,
      failed: 0,
      pending: 0
    },
    config: {
      endpoint: 'sftp://bob.settlepaisa.com',
      schedule: 'Daily at 18:00 IST'
    }
  }
]

export function Connectors() {
  const [connectors] = useState<Connector[]>(mockConnectors)
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'issues'>('all')

  const filteredConnectors = connectors.filter(conn => {
    if (filter === 'all') return true
    if (filter === 'active') return conn.status === 'active'
    if (filter === 'issues') return conn.status === 'error' || conn.status === 'degraded'
    return true
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'degraded':
        return <AlertCircle className="w-4 h-4 text-amber-600" />
      case 'error':
        return <XCircle className="w-4 h-4 text-red-600" />
      case 'inactive':
        return <WifiOff className="w-4 h-4 text-gray-400" />
      default:
        return <Clock className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-50 text-green-700 border-green-200'
      case 'degraded':
        return 'bg-amber-50 text-amber-700 border-amber-200'
      case 'error':
        return 'bg-red-50 text-red-700 border-red-200'
      case 'inactive':
        return 'bg-gray-50 text-gray-700 border-gray-200'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'api':
        return <Wifi className="w-4 h-4" />
      case 'sftp':
        return <Server className="w-4 h-4" />
      case 'webhook':
        return <Activity className="w-4 h-4" />
      default:
        return <Server className="w-4 h-4" />
    }
  }

  const formatRelativeTime = (dateStr?: string) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    if (hours > 24) return `${Math.floor(hours / 24)}d ago`
    if (hours > 0) return `${hours}h ${mins}m ago`
    return `${mins}m ago`
  }

  const formatNextSync = (dateStr?: string) => {
    if (!dateStr) return 'Not scheduled'
    const date = new Date(dateStr)
    const now = new Date()
    const diff = date.getTime() - now.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    if (hours > 24) return `in ${Math.floor(hours / 24)}d`
    if (hours > 0) return `in ${hours}h ${mins}m`
    return `in ${mins}m`
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Connectors</h3>
          <div className="flex items-center space-x-2">
            <div className="flex items-center bg-gray-100 rounded-md p-0.5">
              <button
                onClick={() => setFilter('all')}
                className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                  filter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                }`}
              >
                All ({connectors.length})
              </button>
              <button
                onClick={() => setFilter('active')}
                className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                  filter === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                }`}
              >
                Active ({connectors.filter(c => c.status === 'active').length})
              </button>
              <button
                onClick={() => setFilter('issues')}
                className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                  filter === 'issues' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                }`}
              >
                Issues ({connectors.filter(c => c.status === 'error' || c.status === 'degraded').length})
              </button>
            </div>
            <button className="p-1 text-gray-400 hover:text-gray-600">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
        {filteredConnectors.map(connector => (
          <div
            key={connector.id}
            className="px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
            onClick={() => setSelectedConnector(connector)}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <div className="mt-0.5">
                  {getStatusIcon(connector.status)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-900">{connector.name}</span>
                    <span className="text-gray-400">
                      {getTypeIcon(connector.type)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{connector.bank}</p>
                  <div className="flex items-center space-x-3 mt-1">
                    <span className="text-xs text-gray-500">
                      Last: {formatRelativeTime(connector.lastSync)}
                    </span>
                    {connector.nextSync && (
                      <span className="text-xs text-gray-500">
                        Next: {formatNextSync(connector.nextSync)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                {connector.metrics && (
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="text-green-600">✓ {connector.metrics.success}</span>
                    {connector.metrics.failed > 0 && (
                      <span className="text-red-600">✗ {connector.metrics.failed}</span>
                    )}
                    {connector.metrics.pending > 0 && (
                      <span className="text-amber-600">⧗ {connector.metrics.pending}</span>
                    )}
                  </div>
                )}
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium mt-1 ${getStatusColor(connector.status)}`}>
                  {connector.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Connector Details Modal */}
      {selectedConnector && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setSelectedConnector(null)} />
            <div className="relative bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {selectedConnector.name}
              </h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Type</dt>
                  <dd className="text-sm text-gray-900 capitalize">{selectedConnector.type}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Bank</dt>
                  <dd className="text-sm text-gray-900">{selectedConnector.bank}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Status</dt>
                  <dd className={`inline-flex items-center px-2 py-1 rounded text-sm font-medium ${getStatusColor(selectedConnector.status)}`}>
                    {getStatusIcon(selectedConnector.status)}
                    <span className="ml-1 capitalize">{selectedConnector.status}</span>
                  </dd>
                </div>
                {selectedConnector.config?.endpoint && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Endpoint</dt>
                    <dd className="text-sm text-gray-900 font-mono text-xs break-all">
                      {selectedConnector.config.endpoint}
                    </dd>
                  </div>
                )}
                {selectedConnector.config?.schedule && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Schedule</dt>
                    <dd className="text-sm text-gray-900">{selectedConnector.config.schedule}</dd>
                  </div>
                )}
                {selectedConnector.config?.retryPolicy && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Retry Policy</dt>
                    <dd className="text-sm text-gray-900">{selectedConnector.config.retryPolicy}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setSelectedConnector(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    console.log('Configure connector:', selectedConnector.id)
                    setSelectedConnector(null)
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  <Settings className="w-4 h-4 inline mr-1" />
                  Configure
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}