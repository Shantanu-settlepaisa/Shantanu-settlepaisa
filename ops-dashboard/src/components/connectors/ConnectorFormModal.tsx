import { useState, useEffect } from 'react'
import { X, Server, Key, Calendar, Info } from 'lucide-react'
import type { Connector, ConnectorType, ConnectorProvider, SFTPConfig, APIConfig } from '@/types/connectors'

interface ConnectorFormModalProps {
  isOpen: boolean
  connector: Connector | null
  onSave: (data: any) => Promise<void>
  onClose: () => void
}

export function ConnectorFormModal({ isOpen, connector, onSave, onClose }: ConnectorFormModalProps) {
  const [activeTab, setActiveTab] = useState<'connection' | 'auth' | 'schedule'>('connection')
  const [formData, setFormData] = useState({
    name: '',
    type: 'SFTP' as ConnectorType,
    provider: 'AXIS' as ConnectorProvider,
    merchantId: '',
    acquirerCode: '',
    config: {
      // SFTP Config
      host: 'localhost',
      port: 2222,
      username: 'bank',
      authType: 'password' as 'password' | 'privateKey',
      password: 'bankpass',
      privateKey: '',
      remotePath: '/upload',
      filePattern: '',
      checksumExt: '.sha256',
      pgpPublicKey: '',
      timezone: 'Asia/Kolkata',
      schedule: '0 19 * * *',
      targetCycleRule: 'yesterday',
      // API Config
      baseUrl: '',
      token: '',
      apiKey: '',
      endpoint: '',
      responseFormat: 'csv' as 'csv' | 'json' | 'xml',
    }
  })

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (connector) {
      setFormData({
        name: connector.name,
        type: connector.type,
        provider: connector.provider,
        merchantId: connector.merchantId || '',
        acquirerCode: connector.acquirerCode || '',
        config: { ...formData.config, ...(connector.config as any) }
      })
    } else {
      // Set default file pattern based on provider
      setFormData(prev => ({
        ...prev,
        config: {
          ...prev.config,
          filePattern: getDefaultFilePattern(prev.provider)
        }
      }))
    }
  }, [connector])

  const getDefaultFilePattern = (provider: ConnectorProvider) => {
    switch (provider) {
      case 'AXIS':
        return 'AXIS_RECON_YYYYMMDD*.csv'
      case 'BOB':
        return 'BOB_RECON_YYYYMMDD*.csv'
      case 'HDFC':
        return 'HDFC_TXN_YYYYMMDD*.csv'
      case 'ICICI':
        return 'ICICI_SETTLEMENT_YYYYMMDD*.csv'
      default:
        return 'PREFIX_YYYYMMDD*.csv'
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    try {
      // Clean up config based on type
      const config = formData.type === 'SFTP' 
        ? {
            host: formData.config.host,
            port: formData.config.port,
            username: formData.config.username,
            authType: formData.config.authType,
            password: formData.config.authType === 'password' ? formData.config.password : undefined,
            privateKey: formData.config.authType === 'privateKey' ? formData.config.privateKey : undefined,
            remotePath: formData.config.remotePath,
            filePattern: formData.config.filePattern || getDefaultFilePattern(formData.provider),
            checksumExt: formData.config.checksumExt,
            pgpPublicKey: formData.config.pgpPublicKey || undefined,
            timezone: formData.config.timezone,
            schedule: formData.config.schedule,
            targetCycleRule: formData.config.targetCycleRule,
          } as SFTPConfig
        : {
            baseUrl: formData.config.baseUrl,
            authType: formData.config.token ? 'bearer' : 'apiKey',
            token: formData.config.token || undefined,
            apiKey: formData.config.apiKey || undefined,
            endpoint: formData.config.endpoint,
            schedule: formData.config.schedule,
            timezone: formData.config.timezone,
            responseFormat: formData.config.responseFormat,
          } as APIConfig

      await onSave({
        name: formData.name,
        type: formData.type,
        provider: formData.provider,
        merchantId: formData.merchantId || undefined,
        acquirerCode: formData.acquirerCode || undefined,
        config
      })
      onClose()
    } catch (error) {
      console.error('Failed to save connector:', error)
      alert('Failed to save connector')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">
            {connector ? 'Edit Connector' : 'Create Connector'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
            {/* Basic Info */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-1">Connector Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., AXIS Bank SFTP"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="SFTP"
                        checked={formData.type === 'SFTP'}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value as ConnectorType })}
                        className="mr-2"
                      />
                      SFTP
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="API"
                        checked={formData.type === 'API'}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value as ConnectorType })}
                        className="mr-2"
                      />
                      API
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Provider</label>
                  <select
                    value={formData.provider}
                    onChange={(e) => {
                      const provider = e.target.value as ConnectorProvider
                      setFormData({ 
                        ...formData, 
                        provider,
                        config: {
                          ...formData.config,
                          filePattern: getDefaultFilePattern(provider)
                        }
                      })
                    }}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="AXIS">AXIS Bank</option>
                    <option value="BOB">Bank of Baroda</option>
                    <option value="HDFC">HDFC Bank</option>
                    <option value="ICICI">ICICI Bank</option>
                    <option value="PG">Payment Gateway</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Merchant ID (Optional)</label>
                  <input
                    type="text"
                    value={formData.merchantId}
                    onChange={(e) => setFormData({ ...formData, merchantId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., MERCH001"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Acquirer Code (Optional)</label>
                  <input
                    type="text"
                    value={formData.acquirerCode}
                    onChange={(e) => setFormData({ ...formData, acquirerCode: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., AXIS"
                  />
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b mb-6">
              <div className="flex gap-6">
                {['connection', 'auth', 'schedule'].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab as any)}
                    className={`pb-2 px-1 capitalize text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab
                        ? 'text-blue-600 border-blue-600'
                        : 'text-gray-500 border-transparent hover:text-gray-700'
                    }`}
                  >
                    {tab === 'connection' && <Server className="inline h-4 w-4 mr-1" />}
                    {tab === 'auth' && <Key className="inline h-4 w-4 mr-1" />}
                    {tab === 'schedule' && <Calendar className="inline h-4 w-4 mr-1" />}
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="space-y-4">
              {activeTab === 'connection' && formData.type === 'SFTP' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Host</label>
                      <input
                        type="text"
                        value={formData.config.host}
                        onChange={(e) => setFormData({
                          ...formData,
                          config: { ...formData.config, host: e.target.value }
                        })}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="sftp.example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Port</label>
                      <input
                        type="number"
                        value={formData.config.port}
                        onChange={(e) => setFormData({
                          ...formData,
                          config: { ...formData.config, port: parseInt(e.target.value) }
                        })}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Remote Path</label>
                    <input
                      type="text"
                      value={formData.config.remotePath}
                      onChange={(e) => setFormData({
                        ...formData,
                        config: { ...formData.config, remotePath: e.target.value }
                      })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="/upload"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">File Pattern</label>
                    <input
                      type="text"
                      value={formData.config.filePattern}
                      onChange={(e) => setFormData({
                        ...formData,
                        config: { ...formData.config, filePattern: e.target.value }
                      })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={getDefaultFilePattern(formData.provider)}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Use YYYYMMDD for date pattern. Example: {getDefaultFilePattern(formData.provider)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Checksum Extension (Optional)</label>
                    <input
                      type="text"
                      value={formData.config.checksumExt}
                      onChange={(e) => setFormData({
                        ...formData,
                        config: { ...formData.config, checksumExt: e.target.value }
                      })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder=".sha256"
                    />
                  </div>
                </>
              )}

              {activeTab === 'connection' && formData.type === 'API' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Base URL</label>
                    <input
                      type="text"
                      value={formData.config.baseUrl}
                      onChange={(e) => setFormData({
                        ...formData,
                        config: { ...formData.config, baseUrl: e.target.value }
                      })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://api.example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Endpoint</label>
                    <input
                      type="text"
                      value={formData.config.endpoint}
                      onChange={(e) => setFormData({
                        ...formData,
                        config: { ...formData.config, endpoint: e.target.value }
                      })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="/v1/reconciliation/files"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Response Format</label>
                    <select
                      value={formData.config.responseFormat}
                      onChange={(e) => setFormData({
                        ...formData,
                        config: { ...formData.config, responseFormat: e.target.value as any }
                      })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="csv">CSV</option>
                      <option value="json">JSON</option>
                      <option value="xml">XML</option>
                    </select>
                  </div>
                </>
              )}

              {activeTab === 'auth' && formData.type === 'SFTP' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Username</label>
                    <input
                      type="text"
                      value={formData.config.username}
                      onChange={(e) => setFormData({
                        ...formData,
                        config: { ...formData.config, username: e.target.value }
                      })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="sftp_user"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Authentication Type</label>
                    <div className="flex gap-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="password"
                          checked={formData.config.authType === 'password'}
                          onChange={(e) => setFormData({
                            ...formData,
                            config: { ...formData.config, authType: e.target.value as any }
                          })}
                          className="mr-2"
                        />
                        Password
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="privateKey"
                          checked={formData.config.authType === 'privateKey'}
                          onChange={(e) => setFormData({
                            ...formData,
                            config: { ...formData.config, authType: e.target.value as any }
                          })}
                          className="mr-2"
                        />
                        Private Key
                      </label>
                    </div>
                  </div>

                  {formData.config.authType === 'password' && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Password</label>
                      <input
                        type="password"
                        value={formData.config.password}
                        onChange={(e) => setFormData({
                          ...formData,
                          config: { ...formData.config, password: e.target.value }
                        })}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="••••••••"
                      />
                    </div>
                  )}

                  {formData.config.authType === 'privateKey' && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Private Key</label>
                      <textarea
                        value={formData.config.privateKey}
                        onChange={(e) => setFormData({
                          ...formData,
                          config: { ...formData.config, privateKey: e.target.value }
                        })}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={6}
                        placeholder="-----BEGIN RSA PRIVATE KEY-----"
                      />
                    </div>
                  )}
                </>
              )}

              {activeTab === 'auth' && formData.type === 'API' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Bearer Token</label>
                    <input
                      type="password"
                      value={formData.config.token}
                      onChange={(e) => setFormData({
                        ...formData,
                        config: { ...formData.config, token: e.target.value }
                      })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Bearer token"
                    />
                  </div>

                  <div className="text-center text-sm text-gray-500">OR</div>

                  <div>
                    <label className="block text-sm font-medium mb-1">API Key</label>
                    <input
                      type="password"
                      value={formData.config.apiKey}
                      onChange={(e) => setFormData({
                        ...formData,
                        config: { ...formData.config, apiKey: e.target.value }
                      })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="API Key"
                    />
                  </div>
                </>
              )}

              {activeTab === 'schedule' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Cron Schedule</label>
                    <input
                      type="text"
                      value={formData.config.schedule}
                      onChange={(e) => setFormData({
                        ...formData,
                        config: { ...formData.config, schedule: e.target.value }
                      })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0 19 * * *"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Default: 0 19 * * * (Daily at 7:00 PM IST)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Timezone</label>
                    <select
                      value={formData.config.timezone}
                      onChange={(e) => setFormData({
                        ...formData,
                        config: { ...formData.config, timezone: e.target.value }
                      })}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                    </select>
                  </div>

                  {formData.type === 'SFTP' && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Target Cycle Rule</label>
                      <select
                        value={formData.config.targetCycleRule}
                        onChange={(e) => setFormData({
                          ...formData,
                          config: { ...formData.config, targetCycleRule: e.target.value }
                        })}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="yesterday">Yesterday's Data</option>
                        <option value="today">Today's Data</option>
                        <option value="custom">Custom Rule</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Determines which date's file to look for based on run time
                      </p>
                    </div>
                  )}

                  <div className="rounded-lg bg-blue-50 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Info className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">Schedule Preview</span>
                    </div>
                    <p className="text-xs text-blue-700">
                      Runs daily at 7:00 PM IST, processes {formData.config.targetCycleRule === 'yesterday' ? "previous day's" : "current day's"} files
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 p-6 border-t bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !formData.name}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : connector ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}