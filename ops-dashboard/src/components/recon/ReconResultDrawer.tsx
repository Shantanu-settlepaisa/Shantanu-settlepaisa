import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  X,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  User,
  Calendar,
  FileText,
  Activity,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Equal
} from 'lucide-react'
import { opsApiExtended as opsApi } from '@/lib/ops-api-extended'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { ReconResult, ReconStatus } from './ReconResults'

interface ReconResultDrawerProps {
  result: ReconResult
  isOpen: boolean
  onClose: () => void
  onResolve: (
    action: 'accept_pg' | 'accept_bank' | 'mark_investigate' | 'write_off' | 'assign',
    note?: string,
    assignTo?: string
  ) => void
}

interface AuditEntry {
  id: string
  action: string
  actor: string
  timestamp: string
  before?: any
  after?: any
  note?: string
}

export function ReconResultDrawer({ result, isOpen, onClose, onResolve }: ReconResultDrawerProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'activity'>('details')
  const [resolveAction, setResolveAction] = useState<string>('')
  const [resolveNote, setResolveNote] = useState('')
  const [assignTo, setAssignTo] = useState('')

  // Fetch detailed result with audit trail
  const { data: detailedResult } = useQuery({
    queryKey: ['recon-result', result.id],
    queryFn: () => opsApi.getReconResult(result.id),
    enabled: isOpen
  })

  const auditTrail: AuditEntry[] = detailedResult?.auditTrail || []

  const getDeltaIcon = (delta?: number) => {
    if (!delta) return <Equal className="w-4 h-4 text-gray-400" />
    if (delta > 0) return <ArrowUpRight className="w-4 h-4 text-red-600" />
    return <ArrowDownRight className="w-4 h-4 text-green-600" />
  }

  const formatDelta = (value?: number, formatter?: (v: number) => string) => {
    if (!value) return '-'
    const formatted = formatter ? formatter(Math.abs(value)) : Math.abs(value).toString()
    return `${value > 0 ? '+' : '-'}${formatted}`
  }

  const handleResolve = () => {
    if (!resolveAction) return
    
    onResolve(
      resolveAction as any,
      resolveNote || undefined,
      resolveAction === 'assign' ? assignTo : undefined
    )
    
    // Reset form
    setResolveAction('')
    setResolveNote('')
    setAssignTo('')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
          <div className="w-screen max-w-2xl">
            <div className="h-full bg-white shadow-xl flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-medium text-gray-900">
                      Reconciliation Details
                    </h2>
                    <p className="text-sm text-gray-500">
                      {result.pgTxnId || result.bankRef || result.id}
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="rounded-md text-gray-400 hover:text-gray-500"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                {/* Tabs */}
                <div className="mt-4 flex space-x-4">
                  <button
                    onClick={() => setActiveTab('details')}
                    className={`pb-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'details'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Details
                  </button>
                  <button
                    onClick={() => setActiveTab('activity')}
                    className={`pb-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'activity'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Activity ({auditTrail.length})
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {activeTab === 'details' ? (
                  <div className="p-6 space-y-6">
                    {/* Status and Reason */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">Status</h3>
                          <p className="mt-1 text-2xl font-bold text-gray-900">
                            {result.status.replace(/_/g, ' ')}
                          </p>
                          {result.reasonDetail && (
                            <p className="mt-2 text-sm text-gray-600">
                              {result.reasonDetail}
                            </p>
                          )}
                          {result.suggestedAction && (
                            <div className="mt-3 p-2 bg-blue-50 rounded border border-blue-200">
                              <p className="text-sm text-blue-800">
                                <strong>Suggested:</strong> {result.suggestedAction}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          {result.resolution ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Resolved
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              Pending
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Side by Side Comparison */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* PG Side */}
                      <div className="border border-gray-200 rounded-lg p-4">
                        <h3 className="text-sm font-medium text-gray-900 mb-3">
                          Payment Gateway
                        </h3>
                        <dl className="space-y-2">
                          <div>
                            <dt className="text-xs text-gray-500">Transaction ID</dt>
                            <dd className="text-sm font-medium text-gray-900">
                              {result.pgTxnId || '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-gray-500">Amount</dt>
                            <dd className="text-sm font-medium text-gray-900">
                              {result.pgAmount ? formatCurrency(result.pgAmount) : '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-gray-500">Date</dt>
                            <dd className="text-sm font-medium text-gray-900">
                              {result.pgDate || '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-gray-500">Fee</dt>
                            <dd className="text-sm font-medium text-gray-900">
                              {result.pgFee ? formatCurrency(result.pgFee) : '-'}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      {/* Bank Side */}
                      <div className="border border-gray-200 rounded-lg p-4">
                        <h3 className="text-sm font-medium text-gray-900 mb-3">
                          Bank
                        </h3>
                        <dl className="space-y-2">
                          <div>
                            <dt className="text-xs text-gray-500">Reference</dt>
                            <dd className="text-sm font-medium text-gray-900">
                              {result.bankRef || result.utr || result.rrn || '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-gray-500">Amount</dt>
                            <dd className="text-sm font-medium text-gray-900">
                              {result.bankAmount ? formatCurrency(result.bankAmount) : '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-gray-500">Date</dt>
                            <dd className="text-sm font-medium text-gray-900">
                              {result.bankDate || '-'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-gray-500">Fee</dt>
                            <dd className="text-sm font-medium text-gray-900">
                              {result.bankFee ? formatCurrency(result.bankFee) : '-'}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>

                    {/* Deltas */}
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="text-sm font-medium text-gray-900 mb-3">
                        Differences
                      </h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">Amount</span>
                          <div className="flex items-center space-x-1">
                            {getDeltaIcon(result.amountDelta)}
                            <span className={`text-sm font-medium ${
                              result.amountDelta ? 'text-red-600' : 'text-gray-900'
                            }`}>
                              {formatDelta(result.amountDelta, formatCurrency)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">Date</span>
                          <div className="flex items-center space-x-1">
                            {getDeltaIcon(result.dateDelta)}
                            <span className={`text-sm font-medium ${
                              result.dateDelta ? 'text-amber-600' : 'text-gray-900'
                            }`}>
                              {result.dateDelta ? `${Math.abs(result.dateDelta)} days` : 'Match'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">Fee</span>
                          <div className="flex items-center space-x-1">
                            {getDeltaIcon(result.feeDelta)}
                            <span className={`text-sm font-medium ${
                              result.feeDelta ? 'text-red-600' : 'text-gray-900'
                            }`}>
                              {formatDelta(result.feeDelta, formatCurrency)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Resolution Actions */}
                    {!result.resolution && (
                      <div className="border border-gray-200 rounded-lg p-4">
                        <h3 className="text-sm font-medium text-gray-900 mb-3">
                          Resolve Exception
                        </h3>
                        
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">
                              Action
                            </label>
                            <select
                              value={resolveAction}
                              onChange={(e) => setResolveAction(e.target.value)}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                            >
                              <option value="">Select action...</option>
                              <option value="accept_pg">Accept PG Amount</option>
                              <option value="accept_bank">Accept Bank Amount</option>
                              <option value="mark_investigate">Mark for Investigation</option>
                              <option value="write_off">Write Off</option>
                              <option value="assign">Assign to Team Member</option>
                            </select>
                          </div>

                          {resolveAction === 'assign' && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700">
                                Assign To
                              </label>
                              <input
                                type="text"
                                value={assignTo}
                                onChange={(e) => setAssignTo(e.target.value)}
                                placeholder="Enter email or username"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                              />
                            </div>
                          )}

                          <div>
                            <label className="block text-sm font-medium text-gray-700">
                              Note (optional)
                            </label>
                            <textarea
                              value={resolveNote}
                              onChange={(e) => setResolveNote(e.target.value)}
                              rows={3}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                              placeholder="Add a note about this resolution..."
                            />
                          </div>

                          <button
                            onClick={handleResolve}
                            disabled={!resolveAction}
                            className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300"
                          >
                            Resolve Exception
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Existing Resolution */}
                    {result.resolution && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <h3 className="text-sm font-medium text-green-900 mb-2">
                          Resolution
                        </h3>
                        <dl className="space-y-1">
                          <div className="flex justify-between">
                            <dt className="text-sm text-green-700">Action:</dt>
                            <dd className="text-sm font-medium text-green-900">
                              {result.resolution.action.replace(/_/g, ' ')}
                            </dd>
                          </div>
                          {result.resolution.resolvedBy && (
                            <div className="flex justify-between">
                              <dt className="text-sm text-green-700">Resolved by:</dt>
                              <dd className="text-sm font-medium text-green-900">
                                {result.resolution.resolvedBy}
                              </dd>
                            </div>
                          )}
                          {result.resolution.resolvedAt && (
                            <div className="flex justify-between">
                              <dt className="text-sm text-green-700">Resolved at:</dt>
                              <dd className="text-sm font-medium text-green-900">
                                {formatDateTime(result.resolution.resolvedAt)}
                              </dd>
                            </div>
                          )}
                          {result.resolution.note && (
                            <div className="mt-2 pt-2 border-t border-green-200">
                              <dt className="text-sm text-green-700">Note:</dt>
                              <dd className="mt-1 text-sm text-green-900">
                                {result.resolution.note}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6">
                    {/* Activity Timeline */}
                    <div className="flow-root">
                      <ul className="-mb-8">
                        {auditTrail.map((entry, idx) => (
                          <li key={entry.id}>
                            <div className="relative pb-8">
                              {idx !== auditTrail.length - 1 && (
                                <span
                                  className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                                  aria-hidden="true"
                                />
                              )}
                              <div className="relative flex space-x-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 ring-2 ring-white">
                                  <Activity className="h-4 w-4 text-gray-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div>
                                    <p className="text-sm text-gray-900">
                                      <span className="font-medium">{entry.actor}</span>
                                      {' '}
                                      {entry.action}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {formatDateTime(entry.timestamp)}
                                    </p>
                                  </div>
                                  {entry.note && (
                                    <div className="mt-2 text-sm text-gray-600">
                                      {entry.note}
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}