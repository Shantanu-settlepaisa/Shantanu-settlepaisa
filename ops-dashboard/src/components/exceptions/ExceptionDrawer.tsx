import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  X, 
  User, 
  Clock, 
  AlertCircle, 
  CheckCircle,
  Archive,
  RefreshCw,
  ChevronRight,
  Calendar,
  MessageSquare
} from 'lucide-react'
import { formatCompactINR, formatDateTime } from '@/lib/utils'
import { opsApiExtended } from '@/lib/ops-api-extended'
import type { Exception, ExceptionDetail } from '@/types/exceptions'

interface ExceptionDrawerProps {
  exception: Exception
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
}

export function ExceptionDrawer({ exception, isOpen, onClose, onUpdate }: ExceptionDrawerProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'details' | 'timeline' | 'data'>('details')
  const [actionNote, setActionNote] = useState('')
  const [snoozeDate, setSnoozeDate] = useState('')

  // Fetch full exception details
  const { data: exceptionDetail } = useQuery({
    queryKey: ['exception', exception.id],
    queryFn: () => opsApiExtended.getException(exception.id),
    enabled: isOpen
  })

  // Action mutations
  const updateMutation = useMutation({
    mutationFn: (params: { action: string; params?: any; note?: string }) => 
      opsApiExtended.bulkUpdateExceptions({
        ids: [exception.id],
        ...params
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exception', exception.id] })
      onUpdate()
      setActionNote('')
    }
  })

  const reprocessMutation = useMutation({
    mutationFn: () => opsApiExtended.reprocessException(exception.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exception', exception.id] })
      onUpdate()
    }
  })

  const handleAction = (action: string, params?: any) => {
    updateMutation.mutate({
      action,
      params,
      note: actionNote
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
      
      <div className="absolute right-0 top-0 h-full w-[600px] bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Exception {exception.exceptionCode}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {exception.reason.replace(/_/g, ' ')} • {exception.merchantName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 rounded-md"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {['details', 'timeline', 'data'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`py-3 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Key Information */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Key Information</h3>
                <dl className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Status</dt>
                    <dd className="mt-1 text-sm text-gray-900">{exception.status}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Severity</dt>
                    <dd className="mt-1 text-sm text-gray-900">{exception.severity}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Assigned To</dt>
                    <dd className="mt-1 text-sm text-gray-900">{exception.assignedToName || 'Unassigned'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">SLA Due</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDateTime(exception.slaDueAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">PG Transaction</dt>
                    <dd className="mt-1 text-sm font-mono text-gray-900">{exception.pgTransactionId}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Bank Reference</dt>
                    <dd className="mt-1 text-sm font-mono text-gray-900">{exception.bankReferenceId}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">UTR</dt>
                    <dd className="mt-1 text-sm font-mono text-gray-900">{exception.utr || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Amount Delta</dt>
                    <dd className="mt-1 text-sm font-medium text-red-600">
                      {formatCompactINR(exception.amountDelta)}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Variance Details */}
              {exceptionDetail?.variance && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Variance Analysis</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">PG Amount</p>
                        <p className="font-medium">{formatCompactINR(exception.pgAmount)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Bank Amount</p>
                        <p className="font-medium">{formatCompactINR(exception.bankAmount)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Difference</p>
                        <p className="font-medium text-red-600">
                          {formatCompactINR(Math.abs(exception.amountDelta))}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {exceptionDetail?.suggestions && exceptionDetail.suggestions.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Suggested Actions</h3>
                  <ul className="space-y-2">
                    {exceptionDetail.suggestions.map((suggestion, idx) => (
                      <li key={idx} className="flex items-start">
                        <ChevronRight className="w-4 h-4 text-gray-400 mt-0.5 mr-2" />
                        <span className="text-sm text-gray-700">{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tags */}
              {exception.tags.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {exception.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Activity Timeline</h3>
              <div className="flow-root">
                <ul className="-mb-8">
                  {exceptionDetail?.timeline?.map((action, idx) => (
                    <li key={action.id}>
                      <div className="relative pb-8">
                        {idx < (exceptionDetail?.timeline?.length || 0) - 1 && (
                          <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" />
                        )}
                        <div className="relative flex space-x-3">
                          <div>
                            <span className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center ring-8 ring-white">
                              <User className="w-4 h-4 text-gray-500" />
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div>
                              <p className="text-sm text-gray-900">
                                <span className="font-medium">{action.userName}</span>
                                {' '}
                                <span className="text-gray-500">{action.action.replace(/_/g, ' ')}</span>
                              </p>
                              <p className="text-xs text-gray-500">
                                {formatDateTime(action.timestamp)}
                              </p>
                            </div>
                            {action.note && (
                              <div className="mt-2 text-sm text-gray-700 bg-gray-50 rounded-md p-2">
                                {action.note}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-6">
              {/* PG Data */}
              {exceptionDetail?.pgData && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">PG Data</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <pre className="text-xs text-gray-700 overflow-x-auto">
                      {JSON.stringify(exceptionDetail.pgData, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Bank Data */}
              {exceptionDetail?.bankData && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Bank Data</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <pre className="text-xs text-gray-700 overflow-x-auto">
                      {JSON.stringify(exceptionDetail.bankData, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-gray-200 px-6 py-4 space-y-4">
          {/* Action Note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Action Note
            </label>
            <textarea
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              rows={2}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="Add a note about this action..."
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {exception.status === 'open' && (
              <button
                onClick={() => handleAction('investigate')}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <Clock className="w-4 h-4 mr-1.5" />
                Investigate
              </button>
            )}
            
            <button
              onClick={() => {
                if (snoozeDate) {
                  handleAction('snooze', { snoozeUntil: snoozeDate })
                }
              }}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <Archive className="w-4 h-4 mr-1.5" />
              Snooze
            </button>
            
            <button
              onClick={() => handleAction('resolve')}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <CheckCircle className="w-4 h-4 mr-1.5" />
              Resolve
            </button>
            
            <button
              onClick={() => reprocessMutation.mutate()}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Reprocess
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}