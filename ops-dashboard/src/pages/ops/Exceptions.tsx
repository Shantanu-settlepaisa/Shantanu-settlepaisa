import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  Filter,
  Download,
  Plus,
  Search,
  ChevronDown,
  Users,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Eye,
  Archive,
  Settings,
  Bookmark
} from 'lucide-react'
import { formatCompactINR, formatRelativeTime, formatDateTime } from '@/lib/utils'
import { opsApiExtended } from '@/lib/ops-api-extended'
import type { 
  Exception, 
  ExceptionStatus, 
  ExceptionSeverity,
  ExceptionReason,
  SavedView,
  ExceptionQuery
} from '@/types/exceptions'

// Import sub-components (we'll create these next)
import { ExceptionKPIs } from '@/components/exceptions/ExceptionKPIs'
import { ExceptionFilters } from '@/components/exceptions/ExceptionFilters'
import { ExceptionTable } from '@/components/exceptions/ExceptionTable'
import { ExceptionDrawer } from '@/components/exceptions/ExceptionDrawer'
import { BulkActionsModal } from '@/components/exceptions/BulkActionsModal'
import { SavedViewsDropdown } from '@/components/exceptions/SavedViewsDropdown'
import { ExportModal } from '@/components/exceptions/ExportModal'

export default function Exceptions() {
  const queryClient = useQueryClient()
  
  // State
  const [query, setQuery] = useState<ExceptionQuery>({})
  const [selectedView, setSelectedView] = useState<SavedView | null>(null)
  const [selectedExceptions, setSelectedExceptions] = useState<string[]>([])
  const [selectedException, setSelectedException] = useState<Exception | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const ITEMS_PER_PAGE = 50

  // Fetch exceptions
  const { data: exceptionsData, isLoading, refetch } = useQuery({
    queryKey: ['exceptions', query, currentPage, searchTerm],
    queryFn: () => opsApiExtended.getExceptions({
      ...query,
      q: searchTerm,
      limit: ITEMS_PER_PAGE,
      offset: (currentPage - 1) * ITEMS_PER_PAGE
    }),
    refetchInterval: 30000, // Refresh every 30 seconds
    keepPreviousData: true
  })

  // Calculate total pages when data changes
  useEffect(() => {
    if (exceptionsData?.counts?.total) {
      setTotalPages(Math.ceil(exceptionsData.counts.total / ITEMS_PER_PAGE))
    }
  }, [exceptionsData])

  // Fetch saved views
  const { data: savedViews } = useQuery({
    queryKey: ['exception-views'],
    queryFn: () => opsApiExtended.getSavedViews()
  })

  // Fetch rules (for info display)
  const { data: rules } = useQuery({
    queryKey: ['exception-rules'],
    queryFn: () => opsApiExtended.getExceptionRules()
  })

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: opsApiExtended.bulkUpdateExceptions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exceptions'] })
      setSelectedExceptions([])
      setBulkModalOpen(false)
    }
  })

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: opsApiExtended.exportExceptions,
    onSuccess: (data) => {
      window.open(data.url, '_blank')
      setExportModalOpen(false)
    }
  })

  // Handle view selection
  const handleViewSelect = (view: SavedView) => {
    setSelectedView(view)
    setQuery(view.query)
    setCurrentPage(1) // Reset to page 1
  }

  // Handle filter change
  const handleFilterChange = (newQuery: ExceptionQuery) => {
    setQuery(newQuery)
    setCurrentPage(1) // Reset to page 1
    setSelectedView(null)
  }

  // Handle search
  const handleSearch = (term: string) => {
    setSearchTerm(term)
    setCurrentPage(1) // Reset to page 1
  }

  // Handle exception click
  const handleExceptionClick = (exception: Exception) => {
    setSelectedException(exception)
    setDrawerOpen(true)
  }

  // Handle bulk action
  const handleBulkAction = (action: string, params?: any, note?: string) => {
    bulkUpdateMutation.mutate({
      ids: selectedExceptions,
      action,
      params,
      note
    })
  }

  // Calculate KPI metrics
  const kpiMetrics = {
    open: exceptionsData?.counts?.byStatus?.open || 0,
    investigating: exceptionsData?.counts?.byStatus?.investigating || 0,
    snoozed: exceptionsData?.counts?.byStatus?.snoozed || 0,
    slaBreached: exceptionsData?.counts?.slaBreached || 0,
    resolved7d: exceptionsData?.counts?.byStatus?.resolved || 0,
    last24hInflow: 0 // Would need additional API
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Exceptions Command Center</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage reconciliation exceptions, SLAs, and resolution workflows
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Rules indicator */}
            <div className="flex items-center text-sm text-gray-500">
              <Settings className="w-4 h-4 mr-1" />
              {rules?.filter(r => r.enabled)?.length || 0} active rules
            </div>
            
            {/* Refresh button */}
            <button
              onClick={() => refetch()}
              className="p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 rounded-md"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <ExceptionKPIs metrics={kpiMetrics} />

      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 flex-1">
            {/* Saved Views */}
            <SavedViewsDropdown
              views={savedViews || []}
              selectedView={selectedView}
              onSelect={handleViewSelect}
            />

            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search by ID, transaction, UTR..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
              <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
            </div>

            {/* Filters */}
            <ExceptionFilters
              query={query}
              onChange={handleFilterChange}
            />
          </div>

          <div className="flex items-center space-x-3">
            {/* Bulk actions */}
            {selectedExceptions.length > 0 && (
              <button
                onClick={() => setBulkModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <Users className="w-4 h-4 mr-2" />
                Actions ({selectedExceptions.length})
              </button>
            )}

            {/* Export */}
            <button
              onClick={() => setExportModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading exceptions...</p>
            </div>
          </div>
        ) : (
          <>
            <ExceptionTable
              exceptions={exceptionsData?.items || []}
              selectedIds={selectedExceptions}
              onSelectionChange={setSelectedExceptions}
              onExceptionClick={handleExceptionClick}
            />

            {/* Pagination Controls */}
            {exceptionsData && totalPages > 1 && (
              <div className="bg-white border-t border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing <span className="font-medium">{((currentPage - 1) * ITEMS_PER_PAGE) + 1}</span> to{' '}
                    <span className="font-medium">
                      {Math.min(currentPage * ITEMS_PER_PAGE, exceptionsData.counts?.total || 0)}
                    </span> of{' '}
                    <span className="font-medium">{exceptionsData.counts?.total || 0}</span> exceptions
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* Previous Button */}
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>

                    {/* Page Numbers */}
                    <div className="flex items-center space-x-1">
                      {/* First page */}
                      {currentPage > 3 && (
                        <>
                          <button
                            onClick={() => setCurrentPage(1)}
                            className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                          >
                            1
                          </button>
                          {currentPage > 4 && <span className="px-2 text-gray-500">...</span>}
                        </>
                      )}

                      {/* Pages around current */}
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(page => {
                          return page === currentPage ||
                                 page === currentPage - 1 ||
                                 page === currentPage + 1 ||
                                 (page === currentPage - 2 && currentPage <= 3) ||
                                 (page === currentPage + 2 && currentPage >= totalPages - 2)
                        })
                        .map(page => (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`px-3 py-2 border rounded-md text-sm font-medium ${
                              page === currentPage
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                            }`}
                          >
                            {page}
                          </button>
                        ))}

                      {/* Last page */}
                      {currentPage < totalPages - 2 && (
                        <>
                          {currentPage < totalPages - 3 && <span className="px-2 text-gray-500">...</span>}
                          <button
                            onClick={() => setCurrentPage(totalPages)}
                            className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                          >
                            {totalPages}
                          </button>
                        </>
                      )}
                    </div>

                    {/* Next Button */}
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Drawer */}
      {selectedException && (
        <ExceptionDrawer
          exception={selectedException}
          isOpen={drawerOpen}
          onClose={() => {
            setDrawerOpen(false)
            setSelectedException(null)
          }}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ['exceptions'] })
            setDrawerOpen(false)
          }}
        />
      )}

      {/* Bulk Actions Modal */}
      {bulkModalOpen && (
        <BulkActionsModal
          selectedCount={selectedExceptions.length}
          isOpen={bulkModalOpen}
          onClose={() => setBulkModalOpen(false)}
          onAction={handleBulkAction}
        />
      )}

      {/* Export Modal */}
      {exportModalOpen && (
        <ExportModal
          isOpen={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          query={query}
          onExport={(format, template) => {
            exportMutation.mutate({ query, format, template })
          }}
        />
      )}
    </div>
  )
}