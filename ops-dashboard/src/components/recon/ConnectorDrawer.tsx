import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  X,
  Save,
  TestTube,
  Key,
  Shield,
  AlertCircle,
  CheckCircle,
  Loader2,
  FileText,
  Clock
} from 'lucide-react'
import { opsApiExtended as opsApi } from '@/lib/ops-api-extended'
import type { ConnectorType, DataSource } from './ConnectorsPage'

interface ConnectorDrawerProps {
  connector?: DataSource | null
  mode: 'create' | 'edit'
  isOpen: boolean
  onClose: () => void
  onSave: () => void
}

interface ConnectorForm {
  name: string
  type: ConnectorType
  merchantId?: string
  acquirerCode?: string
  pathOrEndpoint: string
  fileGlob?: string
  httpMethod?: string
  headers?: Record<string, string>
  mappingTemplateId?: string
  timezone: string
  isEnabled: boolean
  
  // Credentials
  credentials?: {
    // SFTP
    sftpHost?: string
    sftpPort?: number
    sftpUsername?: string
    sftpPassword?: string
    sftpPrivateKey?: string
    
    // HTTP
    httpAuthToken?: string
    httpApiKey?: string
    
    // DB
    dbConnectionString?: string
    
    // PGP
    pgpPublicKey?: string
    pgpPrivateKey?: string
  }
  
  // Schedule
  schedule?: {
    cronExpr: string
    isPaused: boolean
  }
}

const CRON_PRESETS = [
  { label: 'Every 30 minutes', value: '0 */30 * * * ?' },
  { label: 'Every hour', value: '0 0 * * * ?' },
  { label: 'Daily at 7:00 PM IST', value: '0 0 19 * * ?' },
  { label: 'Daily at 9:00 AM IST', value: '0 0 9 * * ?' },
  { label: 'Every 6 hours', value: '0 0 */6 * * ?' },
  { label: 'Custom', value: 'custom' }
]

export function ConnectorDrawer({ connector, mode, isOpen, onClose, onSave }: ConnectorDrawerProps) {
  const [form, setForm] = useState<ConnectorForm>({
    name: '',
    type: 'BANK_SFTP',
    timezone: 'Asia/Kolkata',
    isEnabled: true,
    pathOrEndpoint: '',
    schedule: {
      cronExpr: '0 0 19 * * ?',
      isPaused: false
    }
  })
  
  const [testResult, setTestResult] = useState<{
    status: 'idle' | 'testing' | 'success' | 'failed'
    message?: string
    details?: any
  }>({ status: 'idle' })
  
  const [showCredentials, setShowCredentials] = useState(false)
  const [customCron, setCustomCron] = useState(false)

  // Fetch mapping templates
  const { data: templates } = useQuery({
    queryKey: ['mapping-templates'],
    queryFn: () => opsApi.getMappingTemplates(),
    staleTime: 5 * 60 * 1000
  })

  // Initialize form with connector data
  useEffect(() => {
    if (connector && mode === 'edit') {
      setForm({
        name: connector.name,
        type: connector.type,
        merchantId: connector.merchantId,
        acquirerCode: connector.acquirerCode,
        pathOrEndpoint: connector.pathOrEndpoint,
        fileGlob: connector.fileGlob,
        httpMethod: connector.httpMethod,
        headers: connector.headersJson,
        mappingTemplateId: connector.mappingTemplateId,
        timezone: connector.timezone,
        isEnabled: connector.isEnabled,
        schedule: connector.schedule ? {
          cronExpr: connector.schedule.cronExpr,
          isPaused: connector.schedule.isPaused
        } : undefined
      })
    }
  }, [connector, mode])

  // Create/Update connector
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return opsApi.createConnector(form)
      } else {
        return opsApi.updateConnector(connector!.sourceId, form)
      }
    },
    onSuccess: () => {
      onSave()
    }
  })

  // Test connection
  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      setTestResult({ status: 'testing' })
      
      // Create temporary connector for testing
      const testConnector = mode === 'edit' 
        ? { sourceId: connector!.sourceId, ...form }
        : form
      
      return opsApi.testConnectorConnection(testConnector)
    },
    onSuccess: (result) => {
      setTestResult({
        status: 'success',
        message: `Connected successfully! Latency: ${result.latency}ms`,
        details: result
      })
    },
    onError: (error: any) => {
      setTestResult({
        status: 'failed',
        message: error.message || 'Connection failed',
        details: error
      })
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveMutation.mutate()
  }

  const handleTypeChange = (type: ConnectorType) => {
    setForm(prev => ({
      ...prev,
      type,
      // Reset type-specific fields
      fileGlob: type.includes('SFTP') ? prev.fileGlob : undefined,
      httpMethod: type.includes('HTTP') ? 'GET' : undefined
    }))
  }

  const renderCredentialsFields = () => {
    switch (form.type) {
      case 'BANK_SFTP':
      case 'PG_DB_PULL':
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">SFTP Host</label>
                <input
                  type="text"
                  value={form.credentials?.sftpHost || ''}
                  onChange={(e) => setForm(prev => ({
                    ...prev,
                    credentials: { ...prev.credentials, sftpHost: e.target.value }
                  }))}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm text-sm"
                  placeholder="sftp.example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Port</label>
                <input
                  type="number"
                  value={form.credentials?.sftpPort || 22}
                  onChange={(e) => setForm(prev => ({
                    ...prev,
                    credentials: { ...prev.credentials, sftpPort: parseInt(e.target.value) }
                  }))}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm text-sm"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Username</label>
              <input
                type="text"
                value={form.credentials?.sftpUsername || ''}
                onChange={(e) => setForm(prev => ({
                  ...prev,
                  credentials: { ...prev.credentials, sftpUsername: e.target.value }
                }))}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Authentication
              </label>
              <div className="mt-1 space-y-2">
                <div>
                  <input
                    type="password"
                    value={form.credentials?.sftpPassword || ''}
                    onChange={(e) => setForm(prev => ({
                      ...prev,
                      credentials: { ...prev.credentials, sftpPassword: e.target.value }
                    }))}
                    className="block w-full border-gray-300 rounded-md shadow-sm text-sm"
                    placeholder="Password (optional)"
                  />
                </div>
                <div>
                  <textarea
                    value={form.credentials?.sftpPrivateKey || ''}
                    onChange={(e) => setForm(prev => ({
                      ...prev,
                      credentials: { ...prev.credentials, sftpPrivateKey: e.target.value }
                    }))}
                    className="block w-full border-gray-300 rounded-md shadow-sm text-sm"
                    rows={3}
                    placeholder="Private key (optional)"
                  />
                </div>
              </div>
            </div>
          </>
        )
      
      case 'PG_HTTP_API':
      case 'BANK_HTTP_API':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700">HTTP Method</label>
              <select
                value={form.httpMethod || 'GET'}
                onChange={(e) => setForm(prev => ({ ...prev, httpMethod: e.target.value }))}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm text-sm"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Authorization Token
              </label>
              <input
                type="password"
                value={form.credentials?.httpAuthToken || ''}
                onChange={(e) => setForm(prev => ({
                  ...prev,
                  credentials: { ...prev.credentials, httpAuthToken: e.target.value }
                }))}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm text-sm"
                placeholder="Bearer token or API key"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Headers (JSON)
              </label>
              <textarea
                value={JSON.stringify(form.headers || {}, null, 2)}
                onChange={(e) => {
                  try {
                    const headers = JSON.parse(e.target.value)
                    setForm(prev => ({ ...prev, headers }))
                  } catch {}
                }}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm text-sm font-mono"
                rows={3}
                placeholder='{"Content-Type": "application/json"}'
              />
            </div>
          </>
        )
      
      default:
        return null
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
          <div className="w-screen max-w-md">
            <form onSubmit={handleSubmit} className="h-full flex flex-col bg-white shadow-xl">
              {/* Header */}
              <div className="px-6 py-4 bg-white border-b border-gray-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-medium text-gray-900">
                      {mode === 'create' ? 'Add Connector' : 'Edit Connector'}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Configure data source connection and schedule
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="ml-3 bg-white rounded-md text-gray-400 hover:text-gray-500"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-6 py-4 space-y-6">
                  {/* Basic Info */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-3">Basic Information</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Name</label>
                        <input
                          type="text"
                          value={form.name}
                          onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm text-sm"
                          placeholder="e.g., Axis SFTP - Bank Recon"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Type</label>
                        <select
                          value={form.type}
                          onChange={(e) => handleTypeChange(e.target.value as ConnectorType)}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm text-sm"
                        >
                          <option value="BANK_SFTP">Bank SFTP</option>
                          <option value="BANK_HTTP_API">Bank API</option>
                          <option value="PG_HTTP_API">PG API</option>
                          <option value="PG_DB_PULL">PG Database</option>
                        </select>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Merchant (optional)
                          </label>
                          <input
                            type="text"
                            value={form.merchantId || ''}
                            onChange={(e) => setForm(prev => ({ ...prev, merchantId: e.target.value }))}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm text-sm"
                            placeholder="Leave empty for all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Acquirer (optional)
                          </label>
                          <input
                            type="text"
                            value={form.acquirerCode || ''}
                            onChange={(e) => setForm(prev => ({ ...prev, acquirerCode: e.target.value }))}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm text-sm"
                            placeholder="Leave empty for all"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Connection Settings */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-3">Connection Settings</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          {form.type.includes('SFTP') ? 'Path Root' : 'Endpoint URL'}
                        </label>
                        <input
                          type="text"
                          value={form.pathOrEndpoint}
                          onChange={(e) => setForm(prev => ({ ...prev, pathOrEndpoint: e.target.value }))}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm text-sm"
                          placeholder={form.type.includes('SFTP') ? '/home/user/incoming' : 'https://api.example.com/v1/transactions'}
                          required
                        />
                      </div>
                      
                      {form.type.includes('SFTP') && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            File Pattern
                          </label>
                          <input
                            type="text"
                            value={form.fileGlob || ''}
                            onChange={(e) => setForm(prev => ({ ...prev, fileGlob: e.target.value }))}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm text-sm font-mono"
                            placeholder="AXIS_RECON_{yyyyMMdd}.csv"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            Use {'{'}yyyyMMdd{'}'} for date patterns
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Credentials */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-gray-900">
                        <Shield className="w-4 h-4 inline mr-1" />
                        Credentials
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowCredentials(!showCredentials)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        {showCredentials ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {showCredentials && (
                      <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                        {renderCredentialsFields()}
                        
                        {/* PGP Keys (optional for all types) */}
                        <div className="pt-4 border-t border-gray-200">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            PGP Encryption (optional)
                          </label>
                          <div className="space-y-2">
                            <textarea
                              value={form.credentials?.pgpPublicKey || ''}
                              onChange={(e) => setForm(prev => ({
                                ...prev,
                                credentials: { ...prev.credentials, pgpPublicKey: e.target.value }
                              }))}
                              className="block w-full border-gray-300 rounded-md shadow-sm text-sm"
                              rows={2}
                              placeholder="PGP public key for verification"
                            />
                            <textarea
                              value={form.credentials?.pgpPrivateKey || ''}
                              onChange={(e) => setForm(prev => ({
                                ...prev,
                                credentials: { ...prev.credentials, pgpPrivateKey: e.target.value }
                              }))}
                              className="block w-full border-gray-300 rounded-md shadow-sm text-sm"
                              rows={2}
                              placeholder="PGP private key for decryption"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Mapping Template */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-3">Data Processing</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Mapping Template
                        </label>
                        <select
                          value={form.mappingTemplateId || ''}
                          onChange={(e) => setForm(prev => ({ ...prev, mappingTemplateId: e.target.value }))}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm text-sm"
                        >
                          <option value="">Auto-detect from schema</option>
                          {templates?.map((template: any) => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Schedule */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-3">
                      <Clock className="w-4 h-4 inline mr-1" />
                      Schedule
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Run Schedule
                        </label>
                        <select
                          value={customCron ? 'custom' : form.schedule?.cronExpr}
                          onChange={(e) => {
                            if (e.target.value === 'custom') {
                              setCustomCron(true)
                            } else {
                              setCustomCron(false)
                              setForm(prev => ({
                                ...prev,
                                schedule: { ...prev.schedule!, cronExpr: e.target.value }
                              }))
                            }
                          }}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm text-sm"
                        >
                          {CRON_PRESETS.map(preset => (
                            <option key={preset.value} value={preset.value}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      {customCron && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Cron Expression
                          </label>
                          <input
                            type="text"
                            value={form.schedule?.cronExpr || ''}
                            onChange={(e) => setForm(prev => ({
                              ...prev,
                              schedule: { ...prev.schedule!, cronExpr: e.target.value }
                            }))}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm text-sm font-mono"
                            placeholder="0 */30 * * * ?"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            Quartz cron format (seconds minutes hours day month weekday year)
                          </p>
                        </div>
                      )}
                      
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="pauseSchedule"
                          checked={form.schedule?.isPaused || false}
                          onChange={(e) => setForm(prev => ({
                            ...prev,
                            schedule: { ...prev.schedule!, isPaused: e.target.checked }
                          }))}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="pauseSchedule" className="ml-2 block text-sm text-gray-700">
                          Start with schedule paused
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Test Connection */}
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <button
                      type="button"
                      onClick={() => testConnectionMutation.mutate()}
                      disabled={testResult.status === 'testing'}
                      className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    >
                      {testResult.status === 'testing' ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <TestTube className="w-4 h-4 mr-2" />
                      )}
                      Test Connection
                    </button>
                    
                    {testResult.status !== 'idle' && testResult.status !== 'testing' && (
                      <div className={`mt-3 p-3 rounded-md ${
                        testResult.status === 'success' ? 'bg-green-50' : 'bg-red-50'
                      }`}>
                        <div className="flex items-start">
                          {testResult.status === 'success' ? (
                            <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                          )}
                          <div className="flex-1">
                            <p className={`text-sm ${
                              testResult.status === 'success' ? 'text-green-800' : 'text-red-800'
                            }`}>
                              {testResult.message}
                            </p>
                            {testResult.details && (
                              <pre className="mt-2 text-xs text-gray-600 overflow-x-auto">
                                {JSON.stringify(testResult.details, null, 2)}
                              </pre>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    {mode === 'create' ? 'Create Connector' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}