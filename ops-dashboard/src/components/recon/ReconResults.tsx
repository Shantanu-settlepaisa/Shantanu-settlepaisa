import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Filter,
  Download,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  TrendingUp,
  ChevronRight,
  Eye,
  Check,
  X,
  FileSpreadsheet,
  Users,
  RefreshCw
} from 'lucide-react'
import { opsApiExtended as opsApi } from '@/lib/ops-api-extended'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { ReconResultDrawer } from './ReconResultDrawer'
import { BulkActionsModal } from './BulkActionsModal'

interface ReconResultsProps {
  merchantId?: string
  acquirer?: string
  cycleDate: string
  jobId?: string
}

export type ReconStatus = 
  | 'MATCHED' 
  | 'BANK_FILE_AWAITED' 
  | 'PG_ONLY' 
  | 'BANK_ONLY' 
  | 'AMOUNT_MISMATCH' 
  | 'DATE_MISMATCH' 
  | 'FEE_MISMATCH' 
  | 'REFUND_PENDING' 
  | 'DUPLICATE'

export interface ReconResult {
  id: string
  pgTxnId?: string
  bankRef?: string
  utr?: string
  rrn?: string
  pgAmount?: number // in paise
  bankAmount?: number // in paise
  amountDelta?: number // in paise
  pgDate?: string
  bankDate?: string
  dateDelta?: number // in days
  pgFee?: number
  bankFee?: number
  feeDelta?: number
  status: ReconStatus
  reasonCode?: string
  reasonDetail?: string
  suggestedAction?: string
  resolution?: {
    action: 'accept_pg' | 'accept_bank' | 'mark_investigate' | 'write_off' | 'assign'
    assignedTo?: string
    note?: string
    resolvedBy?: string
    resolvedAt?: string
  }
  createdAt: string
  updatedAt: string
}

interface ReconSummary {
  totalCount: number
  matchedCount: number
  matchedAmount: number // in paise
  unmatchedCount: number
  unmatchedAmount: number // in paise
  exceptionCount: number
  lastRunAt?: string
}

export function ReconResults({ merchantId = 'ALL', acquirer = 'ALL', cycleDate, jobId }: ReconResultsProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'all' | 'matched' | 'exceptions'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ReconStatus[]>([])
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedResult, setSelectedResult] = useState<ReconResult | null>(null)
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [cursor, setCursor] = useState<string | undefined>()

  // Fetch results
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['recon-results', merchantId, acquirer, cycleDate, activeTab, searchQuery, statusFilter, cursor],
    queryFn: () => opsApi.getReconResults({
      merchantId,
      acquirer,
      cycleDate,
      status: activeTab === 'matched' ? ['MATCHED'] : activeTab === 'exceptions' ? 
        ['PG_ONLY', 'BANK_ONLY', 'AMOUNT_MISMATCH', 'DATE_MISMATCH', 'FEE_MISMATCH', 'DUPLICATE'] : 
        statusFilter,
      q: searchQuery,
      cursor,
      limit: 50
    }),
    enabled: !!cycleDate
  })

  // Resolve mutation
  const resolveMutation = useMutation({
    mutationFn: (params: {
      items: string[]
      action: 'accept_pg' | 'accept_bank' | 'mark_investigate' | 'write_off' | 'assign'
      assignTo?: string
      note?: string
    }) => opsApi.resolveRecon(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recon-results'] })
      setSelectedRows(new Set())
      setBulkModalOpen(false)
    }
  })

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: (subset: 'all' | 'matched' | 'unmatched' | 'exceptions') => 
      opsApi.exportRecon({
        merchantId,
        acquirer,
        cycleDate,
        subset
      }),
    onSuccess: (url) => {
      window.open(url, '_blank')
    }
  })

  // Computed values
  const summary: ReconSummary = data?.summary || {
    totalCount: 0,
    matchedCount: 0,
    matchedAmount: 0,
    unmatchedCount: 0,
    unmatchedAmount: 0,
    exceptionCount: 0
  }

  const results: ReconResult[] = data?.items || []

  const getStatusColor = (status: ReconStatus) => {
    if (!status) return 'text-gray-600 bg-gray-50 border-gray-200'
    switch (status) {
      case 'MATCHED':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'BANK_FILE_AWAITED':
        return 'text-amber-600 bg-amber-50 border-amber-200'
      case 'PG_ONLY':
      case 'BANK_ONLY':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'AMOUNT_MISMATCH':
      case 'DATE_MISMATCH':
      case 'FEE_MISMATCH':
        return 'text-red-600 bg-red-50 border-red-200'
      case 'DUPLICATE':
        return 'text-purple-600 bg-purple-50 border-purple-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getStatusIcon = (status: ReconStatus) => {
    if (!status) return <AlertCircle className="w-4 h-4" />
    switch (status) {
      case 'MATCHED':
        return <CheckCircle className="w-4 h-4" />
      case 'BANK_FILE_AWAITED':
        return <Clock className="w-4 h-4" />
      case 'AMOUNT_MISMATCH':
      case 'DATE_MISMATCH':
      case 'FEE_MISMATCH':
        return <AlertCircle className="w-4 h-4" />
      case 'DUPLICATE':
        return <XCircle className="w-4 h-4" />
      default:
        return <AlertCircle className="w-4 h-4" />
    }
  }

  const getStatusLabel = (status: ReconStatus) => {
    if (!status) return 'Unknown'
    return status.replace(/_/g, ' ')
  }

  const handleRowClick = (result: ReconResult) => {
    setSelectedResult(result)
    setDrawerOpen(true)
  }

  const handleSelectAll = () => {
    if (selectedRows.size === results.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(results.map(r => r.id)))
    }
  }

  const handleSelectRow = (id: string) => {
    const newSelection = new Set(selectedRows)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setSelectedRows(newSelection)
  }

  if (!cycleDate) {
    return (
      <div className="p-6 text-center text-gray-500">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p>Select a cycle date to view reconciliation results</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Matched</p>
              <p className="text-2xl font-bold text-green-600">
                {summary.matchedCount}
              </p>
              <p className="text-sm text-gray-500">
                {formatCurrency(summary.matchedAmount)}
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-200" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Unmatched</p>
              <p className="text-2xl font-bold text-amber-600">
                {summary.unmatchedCount}
              </p>
              <p className="text-sm text-gray-500">
                {formatCurrency(summary.unmatchedAmount)}
              </p>
            </div>
            <AlertCircle className="w-8 h-8 text-amber-200" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Exceptions</p>
              <p className="text-2xl font-bold text-red-600">
                {summary.exceptionCount}
              </p>
              <p className="text-sm text-gray-500">
                Requires action
              </p>
            </div>
            <XCircle className="w-8 h-8 text-red-200" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Last Run</p>
              <p className="text-sm font-semibold text-gray-900">
                {summary.lastRunAt ? formatDateTime(summary.lastRunAt) : 'Never'}
              </p>
              <p className="text-sm text-gray-500">
                Job: {jobId?.substring(0, 8) || 'N/A'}
              </p>
            </div>
            <Clock className="w-8 h-8 text-gray-200" />
          </div>
        </div>
      </div>

      {/* Tabs and Toolbar */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex items-center justify-between p-4">
            <div className="flex space-x-4">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                  activeTab === 'all'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All ({summary.totalCount})
              </button>
              <button
                onClick={() => setActiveTab('matched')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                  activeTab === 'matched'
                    ? 'bg-green-100 text-green-700'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Matched ({summary.matchedCount})
              </button>
              <button
                onClick={() => setActiveTab('exceptions')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                  activeTab === 'exceptions'
                    ? 'bg-red-100 text-red-700'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Exceptions ({summary.exceptionCount})
              </button>
            </div>

            <div className="flex items-center space-x-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search txn ID, UTR, RRN..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-md"
                />
              </div>

              {/* Export */}
              <div className="relative">
                <button
                  onClick={() => {}}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  Export
                </button>
              </div>

              {/* Bulk Actions */}
              {selectedRows.size > 0 && (
                <button
                  onClick={() => setBulkModalOpen(true)}
                  className="inline-flex items-center px-3 py-1.5 border border-blue-300 text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100"
                >
                  <Users className="w-4 h-4 mr-1.5" />
                  Actions ({selectedRows.size})
                </button>
              )}

              {/* Refresh */}
              <button
                onClick={() => refetch()}
                className="p-1.5 text-gray-400 hover:text-gray-600"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Results Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === results.length && results.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Txn ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  UTR/RRN
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  PG Amount
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Bank Amount
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Δ
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  PG Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Bank Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading results...
                  </td>
                </tr>
              ) : results.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    No results found
                  </td>
                </tr>
              ) : (
                results.map((result) => (
                  <tr
                    key={result.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleRowClick(result)}
                  >
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedRows.has(result.id)}
                        onChange={() => handleSelectRow(result.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {result.pgTxnId || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {result.utr || result.rrn || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">
                      {result.pgAmount ? formatCurrency(result.pgAmount) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">
                      {result.bankAmount ? formatCurrency(result.bankAmount) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      {result.amountDelta ? (
                        <span className={result.amountDelta > 0 ? 'text-red-600' : 'text-green-600'}>
                          {result.amountDelta > 0 ? '+' : ''}{formatCurrency(Math.abs(result.amountDelta))}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {result.pgDate || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {result.bankDate || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(result.status)}`}>
                        {getStatusIcon(result.status)}
                        <span className="ml-1">{getStatusLabel(result.status)}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRowClick(result)
                        }}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data?.hasMore && (
          <div className="px-6 py-3 border-t border-gray-200">
            <button
              onClick={() => setCursor(data.cursor)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Load more results →
            </button>
          </div>
        )}
      </div>

      {/* Result Drawer */}
      {selectedResult && (
        <ReconResultDrawer
          result={selectedResult}
          isOpen={drawerOpen}
          onClose={() => {
            setDrawerOpen(false)
            setSelectedResult(null)
          }}
          onResolve={(action, note, assignTo) => {
            resolveMutation.mutate({
              items: [selectedResult.id],
              action,
              note,
              assignTo
            })
            setDrawerOpen(false)
          }}
        />
      )}

      {/* Bulk Actions Modal */}
      {bulkModalOpen && (
        <BulkActionsModal
          selectedCount={selectedRows.size}
          isOpen={bulkModalOpen}
          onClose={() => setBulkModalOpen(false)}
          onAction={(action, note, assignTo) => {
            resolveMutation.mutate({
              items: Array.from(selectedRows),
              action,
              note,
              assignTo
            })
          }}
        />
      )}
    </div>
  )
}