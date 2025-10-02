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
  const [cursor, setCursor] = useState<string | undefined>()
  const [allExceptions, setAllExceptions] = useState<Exception[]>([])

  // Fetch exceptions
  const { data: exceptionsData, isLoading, refetch } = useQuery({
    queryKey: ['exceptions', query, cursor],
    queryFn: () => opsApiExtended.getExceptions({ ...query, q: searchTerm, cursor, limit: 50 }),
    refetchInterval: 30000, // Refresh every 30 seconds
    keepPreviousData: true
  })

  // Accumulate exceptions as we paginate
  useEffect(() => {
    if (exceptionsData?.items) {
      if (!cursor) {
        // First page - replace all
        setAllExceptions(exceptionsData.items)
      } else {
        // Subsequent pages - append
        setAllExceptions(prev => {
          const existingIds = new Set(prev.map(e => e.id))
          const newItems = exceptionsData.items.filter(e => !existingIds.has(e.id))
          return [...prev, ...newItems]
        })
      }
    }
  }, [exceptionsData, cursor])

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
    setCursor(undefined)
  }

  // Handle filter change
  const handleFilterChange = (newQuery: ExceptionQuery) => {
    setQuery(newQuery)
    setCursor(undefined)
    setSelectedView(null)
    setAllExceptions([]) // Reset accumulated data
  }

  // Handle search
  const handleSearch = (term: string) => {
    setSearchTerm(term)
    setCursor(undefined)
    setAllExceptions([]) // Reset accumulated data
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
          <ExceptionTable
            exceptions={allExceptions}
            selectedIds={selectedExceptions}
            onSelectionChange={setSelectedExceptions}
            onExceptionClick={handleExceptionClick}
            hasMore={exceptionsData?.hasMore || false}
            onLoadMore={() => setCursor(exceptionsData?.cursor)}
          />
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