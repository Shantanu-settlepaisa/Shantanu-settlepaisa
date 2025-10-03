import { useState, useEffect } from 'react'
import { 
  Plus, 
  Search, 
  RefreshCw, 
  Play, 
  Pause, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  Wifi,
  WifiOff,
  Settings,
  TestTube,
  Calendar,
  History,
  Cable
} from 'lucide-react'
import { opsApiExtended } from '@/lib/ops-api-extended'
import { ConnectorFormModal } from '@/components/connectors/ConnectorFormModal'
import { RunHistoryModal } from '@/components/connectors/RunHistoryModal'
import { BackfillModal } from '@/components/connectors/BackfillModal'
import { connectorScheduler } from '@/services/connector-scheduler'
import { sftpPoller } from '@/services/sftp-poller'
import type { Connector, ConnectorHealthStatus } from '@/types/connectors'

export default function ConnectorsPage() {
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTab, setSelectedTab] = useState('all')
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [backfillOpen, setBackfillOpen] = useState(false)

  useEffect(() => {
    loadConnectors()
  }, [])

  const loadConnectors = async () => {
    try {
      setLoading(true)
      const response = await opsApiExtended.getConnectors()
      // Handle both array and object response formats
      if (Array.isArray(response)) {
        setConnectors(response)
      } else if (response && response.connectors) {
        setConnectors(response.connectors)
      } else {
        setConnectors([])
      }
    } catch (error) {
      console.error('Failed to load connectors:', error)
      setConnectors([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreateConnector = () => {
    setSelectedConnector(null)
    setModalOpen(true)
  }

  const handleEditConnector = (connector: Connector) => {
    setSelectedConnector(connector)
    setModalOpen(true)
  }

  const handleTestConnector = async (connector: Connector) => {
    try {
      const result = await opsApiExtended.testConnector(connector.id)
      alert(result.success ? 'Test Successful' : 'Test Failed: ' + result.message)
    } catch (error) {
      alert('Failed to test connector')
    }
  }

  const handleRunNow = async (connector: Connector) => {
    try {
      // Use the SFTP poller to actually run the connector
      const result = await sftpPoller.pollConnector(connector)
      if (result.success) {
        alert(`${connector.name} completed: ${result.filesDownloaded} files processed`)
      } else {
        alert(`${connector.name} failed: ${result.error}`)
      }
      await loadConnectors()
    } catch (error) {
      alert('Failed to start connector run')
    }
  }

  const handleToggleStatus = async (connector: Connector) => {
    try {
      if (connector.status === 'ACTIVE') {
        await opsApiExtended.pauseConnector(connector.id)
        alert(`${connector.name} has been paused`)
      } else {
        await opsApiExtended.resumeConnector(connector.id)
        alert(`${connector.name} has been resumed`)
      }
      await loadConnectors()
    } catch (error) {
      alert('Failed to update connector status')
    }
  }

  const handleViewHistory = (connector: Connector) => {
    setSelectedConnector(connector)
    setHistoryOpen(true)
  }

  const handleBackfill = (connector: Connector) => {
    setSelectedConnector(connector)
    setBackfillOpen(true)
  }

  const getHealthIcon = (status?: ConnectorHealthStatus) => {
    switch (status) {
      case 'HEALTHY':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'WARNING':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      case 'CRITICAL':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadge = (status: string) => {
    const isActive = status === 'ACTIVE'
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
      }`}>
        {isActive ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
        {status}
      </span>
    )
  }

  const filteredConnectors = (Array.isArray(connectors) ? connectors : []).filter(connector => {
    const matchesSearch = connector.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (connector.source_entity || connector.provider || '').toLowerCase().includes(searchQuery.toLowerCase())
    const matchesTab = selectedTab === 'all' || 
                      (selectedTab === 'active' && connector.status === 'ACTIVE') ||
                      (selectedTab === 'paused' && connector.status === 'PAUSED')
    return matchesSearch && matchesTab
  })

  return (
    <div className="h-full flex flex-col p-6 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Cable className="h-6 w-6" />
            Connectors
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage SFTP and API connectors for automated file ingestion
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadConnectors}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 flex items-center gap-2 text-sm font-medium text-gray-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleCreateConnector}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            Add Connector
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search connectors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex bg-white border border-gray-300 rounded-lg">
          {['all', 'active', 'paused'].map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize ${
                selectedTab === tab
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              } ${tab === 'all' ? 'rounded-l-lg' : ''} ${tab === 'paused' ? 'rounded-r-lg' : ''}`}
            >
              {tab} ({
                tab === 'all' ? connectors.length :
                tab === 'active' ? connectors.filter(c => c.status === 'ACTIVE').length :
                connectors.filter(c => c.status === 'PAUSED').length
              })
            </button>
          ))}
        </div>
      </div>

      {/* Connectors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-auto">
        {loading ? (
          <div className="col-span-full flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredConnectors.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-12">
            <Cable className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 text-lg font-medium">No connectors found</p>
            {connectors.length === 0 && (
              <button
                onClick={handleCreateConnector}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                Create your first connector
              </button>
            )}
          </div>
        ) : (
          filteredConnectors.map((connector) => (
            <div key={connector.id} className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {getHealthIcon(connector.healthStatus)}
                    <h3 className="text-base font-semibold text-gray-900">{connector.name}</h3>
                  </div>
                  {getStatusBadge(connector.status)}
                </div>
                
                <div className="text-xs text-gray-600 mb-4">
                  {connector.connector_type || connector.type} • {connector.source_entity || connector.provider}
                  {connector.merchantName && ` • ${connector.merchantName}`}
                </div>

                {/* Health Info */}
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-gray-600">Success Rate</span>
                    <span className="font-medium text-gray-900">
                      {connector.success_rate || (connector.total_runs > 0 
                        ? Math.round((connector.success_count / connector.total_runs) * 100)
                        : 0)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Last Run</span>
                    <span className="font-medium text-gray-900">
                      {connector.last_run_at || connector.lastRunAt 
                        ? new Date(connector.last_run_at || connector.lastRunAt).toLocaleString() 
                        : 'Never'}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleTestConnector(connector)}
                    className="px-2 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center justify-center gap-1"
                  >
                    <TestTube className="h-3 w-3" />
                    Test
                  </button>
                  <button
                    onClick={() => handleRunNow(connector)}
                    disabled={connector.status !== 'ACTIVE'}
                    className="px-2 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                  >
                    <Play className="h-3 w-3" />
                    Run
                  </button>
                  <button
                    onClick={() => handleViewHistory(connector)}
                    className="px-2 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center justify-center gap-1"
                  >
                    <History className="h-3 w-3" />
                    History
                  </button>
                  <button
                    onClick={() => handleBackfill(connector)}
                    className="px-2 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center justify-center gap-1"
                  >
                    <Calendar className="h-3 w-3" />
                    Backfill
                  </button>
                  <button
                    onClick={() => handleEditConnector(connector)}
                    className="px-2 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center justify-center gap-1"
                  >
                    <Settings className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleStatus(connector)}
                    className={`px-2 py-1.5 text-xs font-medium rounded flex items-center justify-center gap-1 ${
                      connector.status === 'ACTIVE' 
                        ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                        : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                    }`}
                  >
                    {connector.status === 'ACTIVE' ? (
                      <>
                        <Pause className="h-3 w-3" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3" />
                        Resume
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modals */}
      <ConnectorFormModal
        isOpen={modalOpen}
        connector={selectedConnector}
        onSave={async (data) => {
          try {
            if (selectedConnector) {
              await opsApiExtended.updateConnector(selectedConnector.id, data)
              alert('Connector updated successfully')
            } else {
              await opsApiExtended.createConnector(data)
              alert('Connector created successfully')
            }
            await loadConnectors()
            setModalOpen(false)
          } catch (error) {
            console.error('Failed to save connector:', error)
          }
        }}
        onClose={() => setModalOpen(false)}
      />

      <RunHistoryModal
        isOpen={historyOpen}
        connector={selectedConnector}
        onClose={() => setHistoryOpen(false)}
      />

      <BackfillModal
        isOpen={backfillOpen}
        connector={selectedConnector}
        onClose={() => setBackfillOpen(false)}
        onSuccess={loadConnectors}
      />
    </div>
  )
}