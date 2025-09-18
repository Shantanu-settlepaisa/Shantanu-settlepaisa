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
  Activity,
  Database,
  Lock
} from 'lucide-react'

interface Connector {
  id: string
  acquirer: string
  type: 'api' | 'sftp'
  protocol: string
  status: 'connected' | 'disconnected' | 'error' | 'degraded'
  lastSync?: string
  lastFileName?: string
  nextPoll?: string
  recordsProcessed?: number
  endpoint?: string
  schedule?: string
}

const mockConnectors: Connector[] = [
  {
    id: 'conn-axis-api',
    acquirer: 'AXIS BANK',
    type: 'api',
    protocol: 'REST API v2',
    status: 'connected',
    lastSync: '2024-01-14T15:30:00Z',
    lastFileName: 'AXIS_RECON_20240114_153000.json',
    nextPoll: '2024-01-14T16:00:00Z',
    recordsProcessed: 1247,
    endpoint: 'https://api.axisbank.co.in/recon/v2',
    schedule: 'Every 30 mins'
  },
  {
    id: 'conn-hdfc-sftp',
    acquirer: 'HDFC BANK',
    type: 'sftp',
    protocol: 'SFTP',
    status: 'connected',
    lastSync: '2024-01-14T14:00:00Z',
    lastFileName: 'HDFC_SETTLEMENT_20240114.csv',
    nextPoll: '2024-01-14T18:00:00Z',
    recordsProcessed: 892,
    endpoint: 'sftp://hdfc-recon.settlepaisa.com',
    schedule: 'Every 4 hours'
  },
  {
    id: 'conn-icici-api',
    acquirer: 'ICICI BANK',
    type: 'api',
    protocol: 'REST API v3',
    status: 'degraded',
    lastSync: '2024-01-14T13:45:00Z',
    lastFileName: 'ICICI_TXN_20240114_134500.xml',
    nextPoll: '2024-01-14T16:45:00Z',
    recordsProcessed: 567,
    endpoint: 'https://api.icicibank.com/settlement/v3',
    schedule: 'Every 3 hours'
  },
  {
    id: 'conn-sbi-sftp',
    acquirer: 'STATE BANK OF INDIA',
    type: 'sftp',
    protocol: 'SFTP',
    status: 'error',
    lastSync: '2024-01-14T06:00:00Z',
    lastFileName: 'SBI_RECON_20240114.txt',
    recordsProcessed: 0,
    endpoint: 'sftp://sbi.settlepaisa.com',
    schedule: 'Daily at 06:00, 18:00 IST'
  },
  {
    id: 'conn-bob-api',
    acquirer: 'BANK OF BARODA',
    type: 'api',
    protocol: 'SOAP API',
    status: 'disconnected',
    lastSync: '2024-01-13T18:00:00Z',
    lastFileName: 'BOB_SETTLE_20240113.xml',
    recordsProcessed: 0,
    endpoint: 'https://api.bankofbaroda.in/recon',
    schedule: 'Daily at 18:00 IST'
  },
  {
    id: 'conn-pnb-sftp',
    acquirer: 'PUNJAB NATIONAL BANK',
    type: 'sftp',
    protocol: 'SFTP',
    status: 'disconnected',
    endpoint: 'sftp://pnb.settlepaisa.com',
    schedule: 'Daily at 09:00 IST'
  },
  {
    id: 'conn-kotak-api',
    acquirer: 'KOTAK MAHINDRA BANK',
    type: 'api',
    protocol: 'REST API v1',
    status: 'disconnected',
    endpoint: 'https://api.kotak.com/settlements',
    schedule: 'Every 2 hours'
  },
  {
    id: 'conn-yes-api',
    acquirer: 'YES BANK',
    type: 'api',
    protocol: 'REST API v2',
    status: 'disconnected',
    endpoint: 'https://api.yesbank.in/recon/v2',
    schedule: 'Every hour'
  }
]

export function ConnectorsEnhanced() {
  const [connectors] = useState<Connector[]>(mockConnectors)
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'degraded':
        return <AlertCircle className="w-5 h-5 text-amber-600" />
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />
      case 'disconnected':
        return <WifiOff className="w-5 h-5 text-gray-400" />
      default:
        return <Clock className="w-5 h-5 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-50 border-green-200'
      case 'degraded':
        return 'bg-amber-50 border-amber-200'
      case 'error':
        return 'bg-red-50 border-red-200'
      case 'disconnected':
        return 'bg-gray-50 border-gray-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'api':
        return <Wifi className="w-4 h-4 text-blue-600" />
      case 'sftp':
        return <Server className="w-4 h-4 text-purple-600" />
      default:
        return <Database className="w-4 h-4 text-gray-600" />
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

  const formatNextPoll = (dateStr?: string) => {
    if (!dateStr) return 'Not scheduled'
    const date = new Date(dateStr)
    const now = new Date()
    const diff = date.getTime() - now.getTime()
    
    if (diff < 0) return 'Overdue'
    
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    if (hours > 24) return `in ${Math.floor(hours / 24)}d`
    if (hours > 0) return `in ${hours}h ${mins}m`
    return `in ${mins}m`
  }

  // Group connectors by status
  const connectedCount = connectors.filter(c => c.status === 'connected').length
  const issueCount = connectors.filter(c => c.status === 'error' || c.status === 'degraded').length
  const disconnectedCount = connectors.filter(c => c.status === 'disconnected').length

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Bank Connectors</h2>
            <p className="text-sm text-gray-500 mt-0.5">Automated reconciliation file ingestion status</p>
          </div>
          <div className="flex items-center space-x-4 text-sm">
            <span className="flex items-center text-green-600">
              <CheckCircle className="w-4 h-4 mr-1" />
              {connectedCount} Connected
            </span>
            {issueCount > 0 && (
              <span className="flex items-center text-amber-600">
                <AlertCircle className="w-4 h-4 mr-1" />
                {issueCount} Issues
              </span>
            )}
            <span className="flex items-center text-gray-500">
              <WifiOff className="w-4 h-4 mr-1" />
              {disconnectedCount} Offline
            </span>
          </div>
        </div>
      </div>

      {/* Connector Grid */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {connectors.map(connector => (
            <div
              key={connector.id}
              className={`bg-white rounded-lg border-2 p-4 cursor-pointer transition-all hover:shadow-md ${getStatusColor(connector.status)}`}
              onClick={() => setSelectedConnector(connector)}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-2">
                  {getStatusIcon(connector.status)}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    connector.status === 'connected' ? 'bg-green-100 text-green-800' :
                    connector.status === 'degraded' ? 'bg-amber-100 text-amber-800' :
                    connector.status === 'error' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {connector.status}
                  </span>
                </div>
                {getTypeIcon(connector.type)}
              </div>

              {/* Acquirer Name */}
              <h3 className="font-semibold text-gray-900 mb-1">{connector.acquirer}</h3>
              <p className="text-xs text-gray-500 mb-3">{connector.protocol}</p>

              {/* Status Info */}
              {connector.status === 'connected' || connector.status === 'degraded' ? (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Last Sync:</span>
                    <span className="text-gray-900 font-medium">{formatRelativeTime(connector.lastSync)}</span>
                  </div>
                  {connector.lastFileName && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Last File:</span>
                      <span className="text-gray-900 font-medium truncate ml-2" title={connector.lastFileName}>
                        {connector.lastFileName.substring(0, 15)}...
                      </span>
                    </div>
                  )}
                  {connector.nextPoll && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Next Poll:</span>
                      <span className="text-gray-900 font-medium">{formatNextPoll(connector.nextPoll)}</span>
                    </div>
                  )}
                  {connector.recordsProcessed !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Records:</span>
                      <span className="text-gray-900 font-medium">{connector.recordsProcessed.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              ) : connector.status === 'error' ? (
                <div className="text-xs">
                  <p className="text-red-600 font-medium">Connection failed</p>
                  <p className="text-gray-500 mt-1">Last attempt: {formatRelativeTime(connector.lastSync)}</p>
                </div>
              ) : (
                <div className="text-xs">
                  <p className="text-gray-500">Not configured</p>
                  <button className="mt-2 text-blue-600 hover:text-blue-800 font-medium" disabled>
                    <Lock className="w-3 h-3 inline mr-1" />
                    Coming soon—OPS-0006
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Coming Soon Notice */}
        <div className="mt-8 p-6 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start space-x-3">
            <Activity className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-blue-900">Automated Ingestion Coming Soon</h3>
              <p className="text-sm text-blue-700 mt-1">
                OPS-0006 will enable live SFTP/API pulls for automated reconciliation file ingestion. 
                Currently showing connection status for monitoring purposes only.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Connector Details Modal */}
      {selectedConnector && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setSelectedConnector(null)} />
            <div className="relative bg-white rounded-lg p-6 max-w-md w-full">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedConnector.acquirer}
                </h3>
                {getStatusIcon(selectedConnector.status)}
              </div>
              
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Connection Type</dt>
                  <dd className="text-sm text-gray-900 capitalize">{selectedConnector.type} - {selectedConnector.protocol}</dd>
                </div>
                {selectedConnector.endpoint && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Endpoint</dt>
                    <dd className="text-sm text-gray-900 font-mono text-xs break-all bg-gray-50 p-2 rounded">
                      {selectedConnector.endpoint}
                    </dd>
                  </div>
                )}
                {selectedConnector.schedule && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Schedule</dt>
                    <dd className="text-sm text-gray-900">{selectedConnector.schedule}</dd>
                  </div>
                )}
                {selectedConnector.lastSync && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Last Sync</dt>
                    <dd className="text-sm text-gray-900">
                      {new Date(selectedConnector.lastSync).toLocaleString()}
                    </dd>
                  </div>
                )}
                {selectedConnector.lastFileName && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Last File</dt>
                    <dd className="text-sm text-gray-900 font-mono text-xs break-all bg-gray-50 p-2 rounded">
                      {selectedConnector.lastFileName}
                    </dd>
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
                  disabled
                  className="px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 rounded-md cursor-not-allowed"
                >
                  <Lock className="w-4 h-4 inline mr-1" />
                  Configure (OPS-0006)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}