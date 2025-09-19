import { useState } from 'react'
import { 
  Search, 
  Download, 
  RefreshCw, 
  Eye, 
  MoreVertical,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Copy
} from 'lucide-react'

export interface ReconRow {
  id: string
  txnId: string
  utr: string
  rrn?: string
  pgAmount: number
  bankAmount: number | null
  delta: number | null
  pgDate: string | null
  bankDate: string | null
  status: 'MATCHED' | 'UNMATCHED_PG' | 'UNMATCHED_BANK' | 'EXCEPTION' | 'Unknown'
  reasonCode?: string | null
  reasonLabel?: string | null
}

interface ReconResultsTableProps {
  rows: ReconRow[]
  totalCount: number
  matchedCount: number
  unmatchedCount?: number // For backward compatibility
  unmatchedPgCount?: number
  unmatchedBankCount?: number
  exceptionsCount: number
  jobId?: string
  isLoading?: boolean
  activeTab?: 'all' | 'matched' | 'unmatched' | 'unmatchedPg' | 'unmatchedBank' | 'exceptions'
  onTabChange?: (tab: 'all' | 'matched' | 'unmatched' | 'unmatchedPg' | 'unmatchedBank' | 'exceptions') => void
  onRefresh?: () => void
  onExport?: (format: 'csv' | 'excel') => void
  onRowAction?: (row: ReconRow, action: 'view' | 'edit') => void
}

export function ReconResultsTable({
  rows,
  totalCount,
  matchedCount,
  unmatchedCount = 0,
  unmatchedPgCount,
  unmatchedBankCount,
  exceptionsCount,
  jobId,
  isLoading = false,
  activeTab: externalActiveTab,
  onTabChange: externalOnTabChange,
  onRefresh,
  onExport,
  onRowAction
}: ReconResultsTableProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<'all' | 'matched' | 'unmatched' | 'unmatchedPg' | 'unmatchedBank' | 'exceptions'>('all')
  
  // Calculate unmatched counts if not provided separately
  const pgCount = unmatchedPgCount ?? Math.floor(unmatchedCount * 0.6)
  const bankCount = unmatchedBankCount ?? Math.floor(unmatchedCount * 0.4)
  const activeTab = externalActiveTab ?? internalActiveTab
  const setActiveTab = externalOnTabChange ?? setInternalActiveTab
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [exportMenuOpen, setExportMenuOpen] = useState(false)

  // Filter rows based on active tab and search query
  const filteredRows = rows.filter(row => {
    // First filter by status based on active tab
    const normalizedStatus = row.status?.toUpperCase();
    
    if (activeTab === 'matched') {
      if (normalizedStatus !== 'MATCHED') return false;
    } else if (activeTab === 'unmatchedPg') {
      if (normalizedStatus !== 'UNMATCHED_PG') return false;
    } else if (activeTab === 'unmatchedBank') {
      if (normalizedStatus !== 'UNMATCHED_BANK') return false;
    } else if (activeTab === 'exceptions') {
      if (normalizedStatus !== 'EXCEPTION') return false;
    }
    // 'all' tab shows everything, no filter needed
    
    // Then filter by search query
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      row.txnId.toLowerCase().includes(query) ||
      row.utr.toLowerCase().includes(query) ||
      (row.rrn && row.rrn.toLowerCase().includes(query))
    )
  })

  // Toggle row selection
  const toggleRowSelection = (rowId: string) => {
    const newSelection = new Set(selectedRows)
    if (newSelection.has(rowId)) {
      newSelection.delete(rowId)
    } else {
      newSelection.add(rowId)
    }
    setSelectedRows(newSelection)
  }

  // Toggle all rows
  const toggleAllRows = () => {
    if (selectedRows.size === filteredRows.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(filteredRows.map(r => r.id)))
    }
  }

  // Get status color and icon
  const getStatusStyle = (status: ReconRow['status']) => {
    // Handle both uppercase and lowercase status values
    const normalizedStatus = status?.toLowerCase()
    
    switch (normalizedStatus) {
      case 'matched':
        return {
          bg: 'bg-green-100',
          text: 'text-green-800',
          icon: <CheckCircle className="h-3 w-3" />,
          label: 'Matched'
        }
      case 'unmatchedpg':
      case 'unmatched_pg':
        return {
          bg: 'bg-amber-100',
          text: 'text-amber-800',
          icon: <AlertCircle className="h-3 w-3" />,
          label: 'Unmatched PG'
        }
      case 'unmatchedbank':
      case 'unmatched_bank':
        return {
          bg: 'bg-blue-100',
          text: 'text-blue-800',
          icon: <AlertCircle className="h-3 w-3" />,
          label: 'Unmatched Bank'
        }
      case 'exception':
      case 'exceptions':
        return {
          bg: 'bg-red-100',
          text: 'text-red-800',
          icon: <XCircle className="h-3 w-3" />,
          label: 'Exception'
        }
      default:
        return {
          bg: 'bg-gray-100',
          text: 'text-gray-700',
          icon: <AlertCircle className="h-3 w-3" />,
          label: status || 'Unknown'
        }
    }
  }

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount)
  }

  // Copy job ID
  const copyJobId = () => {
    if (jobId) {
      navigator.clipboard.writeText(jobId)
    }
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm w-full">
      {/* Toolbar */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Tab pills */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'all'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              All ({totalCount})
            </button>
            <button
              onClick={() => setActiveTab('matched')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'matched'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Matched ({matchedCount})
            </button>
            <button
              onClick={() => setActiveTab('unmatchedPg')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'unmatchedPg'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Unmatched PG ({pgCount})
            </button>
            <button
              onClick={() => setActiveTab('unmatchedBank')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'unmatchedBank'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Unmatched Bank ({bankCount})
            </button>
            <button
              onClick={() => setActiveTab('exceptions')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'exceptions'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Exceptions ({exceptionsCount})
            </button>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search txn ID, UTR, RRN"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
              />
            </div>

            {/* Export dropdown */}
            <div className="relative">
              <button
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1"
              >
                <Download className="h-4 w-4" />
                Export
              </button>
              {exportMenuOpen && (
                <div className="absolute right-0 mt-1 w-32 bg-white rounded-lg shadow-lg border z-10">
                  <button
                    onClick={() => {
                      onExport?.('csv')
                      setExportMenuOpen(false)
                    }}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50"
                  >
                    Export as CSV
                  </button>
                  <button
                    onClick={() => {
                      onExport?.('excel')
                      setExportMenuOpen(false)
                    }}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50"
                  >
                    Export as Excel
                  </button>
                </div>
              )}
            </div>

            {/* Job ID */}
            {jobId && (
              <button
                onClick={copyJobId}
                className="px-2 py-1.5 text-xs font-mono bg-gray-100 rounded-lg hover:bg-gray-200 flex items-center gap-1"
                title="Click to copy job ID"
              >
                Job: {jobId.substring(0, 8)}...
                <Copy className="h-3 w-3" />
              </button>
            )}

            {/* Refresh */}
            <button
              onClick={onRefresh}
              className="p-1.5 hover:bg-gray-100 rounded-lg"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="text-xs text-slate-500 uppercase tracking-wider">
              <th className="w-10 p-3 text-left border-b">
                <input
                  type="checkbox"
                  checked={selectedRows.size === filteredRows.length && filteredRows.length > 0}
                  onChange={toggleAllRows}
                  className="rounded"
                />
              </th>
              <th className="p-3 text-left border-b font-medium">
                TXN ID
              </th>
              <th className="p-3 text-left border-b font-medium">
                UTR / RRN
              </th>
              <th className="p-3 text-right border-b font-medium">
                PG AMOUNT
              </th>
              <th className="p-3 text-right border-b font-medium">
                BANK AMOUNT
              </th>
              <th className="p-3 text-right border-b font-medium">
                Δ
              </th>
              <th className="p-3 text-left border-b font-medium">
                PG DATE
              </th>
              <th className="p-3 text-left border-b font-medium">
                BANK DATE
              </th>
              <th className="p-3 text-left border-b font-medium">
                STATUS
              </th>
              <th className="p-3 text-left border-b font-medium">
                REASON
              </th>
              <th className="p-3 text-right border-b font-medium">
                ACTIONS
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              // Loading skeleton rows
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b">
                  <td className="p-3"><div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div></td>
                  <td className="p-3"><div className="w-24 h-4 bg-gray-200 rounded animate-pulse"></div></td>
                  <td className="p-3"><div className="w-32 h-4 bg-gray-200 rounded animate-pulse"></div></td>
                  <td className="p-3 text-right"><div className="w-20 h-4 bg-gray-200 rounded animate-pulse ml-auto"></div></td>
                  <td className="p-3 text-right"><div className="w-20 h-4 bg-gray-200 rounded animate-pulse ml-auto"></div></td>
                  <td className="p-3 text-right"><div className="w-12 h-4 bg-gray-200 rounded animate-pulse ml-auto"></div></td>
                  <td className="p-3"><div className="w-24 h-4 bg-gray-200 rounded animate-pulse"></div></td>
                  <td className="p-3"><div className="w-24 h-4 bg-gray-200 rounded animate-pulse"></div></td>
                  <td className="p-3"><div className="w-16 h-6 bg-gray-200 rounded-full animate-pulse"></div></td>
                  <td className="p-3"><div className="w-32 h-4 bg-gray-200 rounded animate-pulse"></div></td>
                  <td className="p-3 text-right"><div className="w-6 h-6 bg-gray-200 rounded animate-pulse ml-auto"></div></td>
                </tr>
              ))
            ) : filteredRows.length > 0 ? (
              filteredRows.map((row) => {
                const statusStyle = getStatusStyle(row.status)
                return (
                  <tr key={row.id} className="border-b hover:bg-slate-50">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row.id)}
                        onChange={() => toggleRowSelection(row.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="p-3 font-medium text-gray-900">
                      {row.txnId}
                    </td>
                    <td className="p-3 text-gray-600">
                      <div>
                        <div>{row.utr}</div>
                        {row.rrn && (
                          <div className="text-xs text-gray-400">{row.rrn}</div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-right font-medium">
                      ₹{formatCurrency(row.pgAmount).replace('₹', '')}
                    </td>
                    <td className="p-3 text-right font-medium">
                      {row.bankAmount !== null ? `₹${formatCurrency(row.bankAmount).replace('₹', '')}` : '—'}
                    </td>
                    <td className="p-3 text-right font-medium">
                      {row.delta !== null ? (
                        <span className={row.delta !== 0 ? 'text-red-600' : 'text-green-600'}>
                          {row.delta > 0 ? '+' : ''}₹{formatCurrency(Math.abs(row.delta)).replace('₹', '')}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="p-3 text-gray-600">
                      {row.pgDate || '—'}
                    </td>
                    <td className="p-3 text-gray-600">
                      {row.bankDate || '—'}
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                        {statusStyle.icon}
                        {statusStyle.label}
                      </span>
                    </td>
                    <td className="p-3 text-gray-600">
                      {row.reasonLabel ? (
                        <div className="text-sm">
                          <div className="font-medium">{row.reasonLabel}</div>
                          {row.reasonCode && (
                            <div className="text-xs text-gray-500">{row.reasonCode}</div>
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => onRowAction?.(row, 'view')}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="View details"
                      >
                        <Eye className="h-4 w-4 text-gray-500" />
                      </button>
                    </td>
                  </tr>
                )
              })
            ) : (
              // Empty state
              <tr>
                <td colSpan={11} className="p-8 text-center text-gray-500">
                  {totalCount === 0 ? 'Upload files to see reconciliation results' : 'No results found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-3">
        <div className="flex items-center justify-center text-sm text-gray-500">
          Showing {filteredRows.length} of {totalCount} results
        </div>
      </div>
    </div>
  )
}