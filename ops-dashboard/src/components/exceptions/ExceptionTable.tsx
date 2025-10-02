import { useState, useEffect, useRef } from 'react'
import { 
  AlertCircle, 
  Clock, 
  CheckCircle, 
  XCircle,
  ChevronRight,
  AlertTriangle
} from 'lucide-react'
import { formatCompactINR, formatRelativeTime } from '@/lib/utils'
import type { Exception } from '@/types/exceptions'

interface ExceptionTableProps {
  exceptions: Exception[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  onExceptionClick: (exception: Exception) => void
  hasMore: boolean
  onLoadMore: () => void
}

export function ExceptionTable({ 
  exceptions, 
  selectedIds,
  onSelectionChange,
  onExceptionClick,
  hasMore,
  onLoadMore
}: ExceptionTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Set indeterminate state for select all checkbox
  useEffect(() => {
    if (selectAllRef.current) {
      const isIndeterminate = selectedIds.length > 0 && selectedIds.length < exceptions.length
      selectAllRef.current.indeterminate = isIndeterminate
    }
  }, [selectedIds, exceptions])

  // Handle scroll for pagination
  useEffect(() => {
    const handleScroll = () => {
      if (!tableRef.current || isLoadingMore || !hasMore) return
      
      const { scrollTop, scrollHeight, clientHeight } = tableRef.current
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        setIsLoadingMore(true)
        onLoadMore()
        setTimeout(() => setIsLoadingMore(false), 1000)
      }
    }

    const element = tableRef.current
    if (element) {
      element.addEventListener('scroll', handleScroll)
      return () => element.removeEventListener('scroll', handleScroll)
    }
  }, [hasMore, isLoadingMore, onLoadMore])

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(exceptions.map(e => e.id))
    } else {
      onSelectionChange([])
    }
  }

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedIds, id])
    } else {
      onSelectionChange(selectedIds.filter(i => i !== id))
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-50 border-red-200'
      case 'high':
        return 'text-orange-600 bg-orange-50 border-orange-200'
      case 'medium':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'low':
        return 'text-green-600 bg-green-50 border-green-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertCircle className="w-4 h-4" />
      case 'investigating':
        return <Clock className="w-4 h-4" />
      case 'resolved':
        return <CheckCircle className="w-4 h-4" />
      case 'escalated':
        return <AlertTriangle className="w-4 h-4" />
      default:
        return <XCircle className="w-4 h-4" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'text-amber-600 bg-amber-50 border-amber-200'
      case 'investigating':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'resolved':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'escalated':
        return 'text-red-600 bg-red-50 border-red-200'
      case 'snoozed':
        return 'text-gray-600 bg-gray-50 border-gray-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const calculateSLAStatus = (slaDueAt: string) => {
    const now = new Date()
    const due = new Date(slaDueAt)
    const hoursLeft = (due.getTime() - now.getTime()) / (1000 * 60 * 60)
    
    if (hoursLeft < 0) {
      return { text: 'Breached', color: 'text-red-600' }
    } else if (hoursLeft < 4) {
      return { text: `${Math.floor(hoursLeft)}h left`, color: 'text-amber-600' }
    } else if (hoursLeft < 24) {
      return { text: `${Math.floor(hoursLeft)}h left`, color: 'text-blue-600' }
    } else {
      const days = Math.floor(hoursLeft / 24)
      return { text: `${days}d left`, color: 'text-gray-600' }
    }
  }

  return (
    <div ref={tableRef} className="h-full overflow-auto relative">
      <table className="min-w-full divide-y divide-gray-200 table-fixed">
        <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
          <tr>
            <th scope="col" className="px-6 py-3 text-left">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={selectedIds.length === exceptions.length && exceptions.length > 0}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Exception ID
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Reason
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Amount Δ
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Merchant
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Cycle
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Age
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              SLA
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Severity
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Assigned To
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Updated
            </th>
            <th scope="col" className="relative px-6 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {exceptions.map((exception) => {
            const slaStatus = calculateSLAStatus(exception.slaDueAt)
            const isSelected = selectedIds.includes(exception.id)
            
            return (
              <tr 
                key={exception.id}
                className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => handleSelectOne(exception.id, e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {exception.exceptionCode}
                  </div>
                  {exception.pgTransactionId && (
                    <div className="text-xs text-gray-500">{exception.pgTransactionId}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-gray-900">
                    {exception.reason.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`text-sm font-medium ${exception.amountDelta > 0 ? 'text-red-600' : exception.amountDelta < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                    {formatCompactINR(Math.abs(exception.amountDelta))}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{exception.merchantName || exception.merchantId || '-'}</div>
                  {exception.acquirerCode && (
                    <div className="text-xs text-gray-500">{exception.acquirerCode}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {exception.cycleDate ? new Date(exception.cycleDate).toLocaleDateString() : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatRelativeTime(exception.createdAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`text-sm font-medium ${slaStatus.color}`}>
                    {slaStatus.text}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getSeverityColor(exception.severity)}`}>
                    {exception.severity}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {exception.assignedToName || '-'}
                  </div>
                  {exception.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {exception.tags.map(tag => (
                        <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(exception.status)}`}>
                    {getStatusIcon(exception.status)}
                    <span className="ml-1">{exception.status}</span>
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatRelativeTime(exception.updatedAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => onExceptionClick(exception)}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      
      {isLoadingMore && (
        <div className="p-4 text-center">
          <div className="inline-flex items-center">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
            Loading more...
          </div>
        </div>
      )}
      
      {!hasMore && exceptions.length > 0 && (
        <div className="p-4 text-center text-sm text-gray-500">
          No more exceptions to load
        </div>
      )}
      
      {exceptions.length === 0 && (
        <div className="p-8 text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">No exceptions found</p>
          <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or search criteria</p>
        </div>
      )}
    </div>
  )
}