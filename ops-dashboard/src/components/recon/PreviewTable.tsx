import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  Search,
  CheckCircle,
  XCircle,
  Clock,
  ChevronRight
} from 'lucide-react'
import { formatPaiseToINR, formatDateTime } from '@/lib/utils'

interface TransactionRow {
  id: string
  transactionId: string
  utr: string
  grossAmount: number
  netAmount: number
  paymentBank: string
  paymentDate: string
  transactionDate: string
  isOnUs: boolean
  status: 'matched' | 'unmatched' | 'awaiting'
  reason?: string
  pgData?: any
  bankData?: any
}

interface PreviewTableProps {
  rows: TransactionRow[]
  hasMore: boolean
  isLoading: boolean
  onLoadMore: () => void
  onRowClick: (row: TransactionRow) => void
}

export function PreviewTable({ rows, hasMore, isLoading, onLoadMore, onRowClick }: PreviewTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredRows, setFilteredRows] = useState<TransactionRow[]>(rows)
  const observerTarget = useRef<HTMLDivElement>(null)

  // Filter rows based on search
  useEffect(() => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const filtered = rows.filter(row => 
        row.transactionId.toLowerCase().includes(query) ||
        row.utr.toLowerCase().includes(query)
      )
      setFilteredRows(filtered)
    } else {
      setFilteredRows(rows)
    }
  }, [searchQuery, rows])

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          onLoadMore()
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasMore, isLoading, onLoadMore])

  const getStatusBadge = (status: string, reason?: string) => {
    switch (status) {
      case 'matched':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Matched
          </span>
        )
      case 'unmatched':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" />
            Unmatched
          </span>
        )
      case 'awaiting':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            <Clock className="w-3 h-3 mr-1" />
            Awaiting Bank
          </span>
        )
      default:
        return null
    }
  }

  const getReasonChip = (reason?: string) => {
    if (!reason) return null

    const reasonConfig: Record<string, { bg: string; text: string; label: string }> = {
      'amount_mismatch': { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Amount Mismatch' },
      'date_mismatch': { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Date Mismatch' },
      'not_in_bank': { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Not in Bank' },
      'not_in_pg': { bg: 'bg-pink-50', text: 'text-pink-700', label: 'Not in PG' },
      'duplicate': { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Duplicate' },
    }

    const config = reasonConfig[reason] || { bg: 'bg-gray-100', text: 'text-gray-700', label: reason }

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    )
  }

  return (
    <div className="bg-white flex flex-col h-full">
      {/* Search Bar */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Transaction ID or UTR..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Transaction ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                UTR
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Gross
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Net
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Payment Bank
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Payment Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Transaction Date
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                On-us
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reason
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-6 py-12 text-center">
                  <div className="text-gray-500">
                    {searchQuery ? 'No transactions found matching your search.' : 'No transactions to display.'}
                  </div>
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick(row)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {row.transactionId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {row.utr}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatPaiseToINR(row.grossAmount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatPaiseToINR(row.netAmount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {row.paymentBank}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {row.paymentDate ? formatDateTime(row.paymentDate) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {row.transactionDate ? formatDateTime(row.transactionDate) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                    {row.isOnUs ? (
                      <span className="text-green-600 font-medium">Yes</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(row.status, row.reason)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getReasonChip(row.reason)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Infinite scroll trigger */}
        {hasMore && (
          <div ref={observerTarget} className="px-6 py-4 text-center">
            {isLoading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm text-gray-500">Loading more transactions...</span>
              </div>
            ) : (
              <div className="text-sm text-gray-400">Scroll for more</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}