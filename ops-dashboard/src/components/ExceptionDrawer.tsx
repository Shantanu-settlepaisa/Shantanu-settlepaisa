import { useState } from 'react'
import { X, AlertTriangle, Link, Eye, EyeOff, CheckCircle, FileText, Clock } from 'lucide-react'
import { formatPaiseToINR, formatDateTime } from '@/lib/utils'

interface ExceptionData {
  id: string
  type: 'amount_mismatch' | 'missing_txn_pg' | 'missing_txn_bank' | 'duplicate_txn' | 'date_tolerance_exceeded' | 'status_conflict'
  severity: 'critical' | 'high' | 'medium' | 'low'
  rawData: Record<string, any>
  normalizedData: Record<string, any>
  engineData: Record<string, any>
  variance?: {
    field: string
    expected: any
    actual: any
    delta: any
  }
  createdAt: string
  status: 'new' | 'investigating' | 'resolved' | 'escalated'
  auditTrail: Array<{
    action: string
    user: string
    timestamp: string
    reason?: string
  }>
}

interface ExceptionDrawerProps {
  exception: ExceptionData | null
  isOpen: boolean
  onClose: () => void
  onResolve: (exceptionId: string, action: string, reason: string, linkToSettlementId?: string) => Promise<void>
}

const exceptionTypeLabels = {
  amount_mismatch: 'Amount Mismatch',
  missing_txn_pg: 'Missing Transaction (PG)',
  missing_txn_bank: 'Missing Transaction (Bank)',
  duplicate_txn: 'Duplicate Transaction',
  date_tolerance_exceeded: 'Date Tolerance Exceeded',
  status_conflict: 'Status Conflict',
}

export function ExceptionDrawer({ exception, isOpen, onClose, onResolve }: ExceptionDrawerProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'raw' | 'normalized' | 'engine' | 'audit'>('details')
  const [resolveAction, setResolveAction] = useState<'link' | 'ignore' | 'adjust' | ''>('')
  const [resolveReason, setResolveReason] = useState('')
  const [linkToSettlementId, setLinkToSettlementId] = useState('')
  const [isResolving, setIsResolving] = useState(false)

  if (!isOpen || !exception) return null

  const handleResolve = async () => {
    if (!resolveAction || !resolveReason) {
      alert('Please select an action and provide a reason')
      return
    }

    if (resolveAction === 'link' && !linkToSettlementId) {
      alert('Please provide a settlement ID to link')
      return
    }

    setIsResolving(true)
    try {
      await onResolve(
        exception.id,
        resolveAction,
        resolveReason,
        resolveAction === 'link' ? linkToSettlementId : undefined
      )
      onClose()
    } catch (error) {
      console.error('Failed to resolve exception:', error)
      alert('Failed to resolve exception')
    } finally {
      setIsResolving(false)
    }
  }

  const renderDataView = (data: Record<string, any>, title: string) => (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-gray-900">{title}</h4>
      <div className="bg-gray-50 rounded-lg p-4">
        <dl className="space-y-2">
          {Object.entries(data).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <dt className="text-sm text-gray-600">{key}:</dt>
              <dd className="text-sm font-medium text-gray-900">
                {key.toLowerCase().includes('amount') || key.toLowerCase().includes('fee') || key.toLowerCase().includes('tax')
                  ? formatPaiseToINR(typeof value === 'number' ? value : parseInt(value || '0'))
                  : value?.toString() || '-'}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
          <div className="w-screen max-w-2xl">
            <div className="h-full flex flex-col bg-white shadow-xl">
              {/* Header */}
              <div className="px-6 py-4 bg-white border-b border-gray-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-medium text-gray-900">
                      Exception Details
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      ID: {exception.id}
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="ml-3 bg-white rounded-md text-gray-400 hover:text-gray-500"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                {/* Exception Summary */}
                <div className="mt-4 flex items-center space-x-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    exception.severity === 'critical' ? 'bg-red-100 text-red-800' :
                    exception.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                    exception.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {exception.severity}
                  </span>
                  <span className="text-sm text-gray-900">
                    {exceptionTypeLabels[exception.type]}
                  </span>
                  <span className="text-sm text-gray-500">
                    Created {formatDateTime(exception.createdAt)}
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8 px-6">
                  {['details', 'raw', 'normalized', 'engine', 'audit'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab as any)}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        activeTab === tab
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'details' && (
                  <div className="space-y-6">
                    {/* Variance Details */}
                    {exception.variance && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <h4 className="text-sm font-medium text-amber-900 mb-2">
                          <AlertTriangle className="inline w-4 h-4 mr-1" />
                          Variance Detected
                        </h4>
                        <dl className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <dt className="text-amber-700">Field:</dt>
                            <dd className="font-medium text-amber-900">{exception.variance.field}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-amber-700">Expected:</dt>
                            <dd className="font-medium text-amber-900">
                              {exception.variance.field === 'amount' 
                                ? formatPaiseToINR(exception.variance.expected)
                                : exception.variance.expected}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-amber-700">Actual:</dt>
                            <dd className="font-medium text-amber-900">
                              {exception.variance.field === 'amount' 
                                ? formatPaiseToINR(exception.variance.actual)
                                : exception.variance.actual}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-amber-700">Delta:</dt>
                            <dd className="font-medium text-amber-900">
                              {exception.variance.field === 'amount' 
                                ? formatPaiseToINR(exception.variance.delta)
                                : exception.variance.delta}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    )}

                    {/* Resolution Actions */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Resolution Actions</h4>
                      <div className="space-y-3">
                        <label className="flex items-start">
                          <input
                            type="radio"
                            value="link"
                            checked={resolveAction === 'link'}
                            onChange={(e) => setResolveAction(e.target.value as any)}
                            className="mt-1 mr-3"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium text-gray-900">
                              <Link className="inline w-4 h-4 mr-1" />
                              Link to Settlement
                            </span>
                            <p className="text-xs text-gray-500">Link this exception to an existing settlement</p>
                            {resolveAction === 'link' && (
                              <input
                                type="text"
                                value={linkToSettlementId}
                                onChange={(e) => setLinkToSettlementId(e.target.value)}
                                placeholder="Enter settlement ID"
                                className="mt-2 block w-full rounded-md border-gray-300 text-sm"
                              />
                            )}
                          </div>
                        </label>

                        <label className="flex items-start">
                          <input
                            type="radio"
                            value="ignore"
                            checked={resolveAction === 'ignore'}
                            onChange={(e) => setResolveAction(e.target.value as any)}
                            className="mt-1 mr-3"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium text-gray-900">
                              <EyeOff className="inline w-4 h-4 mr-1" />
                              Ignore Exception
                            </span>
                            <p className="text-xs text-gray-500">Mark as reviewed and ignore</p>
                          </div>
                        </label>

                        <label className="flex items-start">
                          <input
                            type="radio"
                            value="adjust"
                            checked={resolveAction === 'adjust'}
                            onChange={(e) => setResolveAction(e.target.value as any)}
                            className="mt-1 mr-3"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium text-gray-900">
                              <FileText className="inline w-4 h-4 mr-1" />
                              Create Adjustment
                            </span>
                            <p className="text-xs text-gray-500">Create an adjustment entry for this exception</p>
                          </div>
                        </label>
                      </div>

                      {resolveAction && (
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700">
                            Reason (Required)
                          </label>
                          <textarea
                            value={resolveReason}
                            onChange={(e) => setResolveReason(e.target.value)}
                            rows={3}
                            className="mt-1 block w-full rounded-md border-gray-300 text-sm"
                            placeholder="Provide a reason for this resolution..."
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'raw' && renderDataView(exception.rawData, 'Raw Bank Data')}
                {activeTab === 'normalized' && renderDataView(exception.normalizedData, 'Normalized Data')}
                {activeTab === 'engine' && renderDataView(exception.engineData, 'Engine/PG Data')}
                
                {activeTab === 'audit' && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Audit Trail</h4>
                    <div className="space-y-3">
                      {exception.auditTrail.map((entry, index) => (
                        <div key={index} className="flex items-start space-x-3">
                          <div className="flex-shrink-0">
                            <Clock className="w-5 h-5 text-gray-400" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-gray-900">
                              <strong>{entry.user}</strong> {entry.action}
                            </p>
                            {entry.reason && (
                              <p className="text-sm text-gray-500">Reason: {entry.reason}</p>
                            )}
                            <p className="text-xs text-gray-400">{formatDateTime(entry.timestamp)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Close
                  </button>
                  {activeTab === 'details' && (
                    <button
                      onClick={handleResolve}
                      disabled={!resolveAction || !resolveReason || isResolving}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isResolving ? 'Resolving...' : 'Resolve Exception'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}