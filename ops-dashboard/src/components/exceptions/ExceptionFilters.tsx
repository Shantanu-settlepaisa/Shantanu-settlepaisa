import { useState } from 'react'
import { Filter, X } from 'lucide-react'
import type { ExceptionQuery } from '@/types/exceptions'

interface ExceptionFiltersProps {
  query: ExceptionQuery
  onChange: (query: ExceptionQuery) => void
}

export function ExceptionFilters({ query, onChange }: ExceptionFiltersProps) {
  const [open, setOpen] = useState(false)

  const handleFilterChange = (key: keyof ExceptionQuery, value: any) => {
    onChange({
      ...query,
      [key]: value
    })
  }

  const clearFilters = () => {
    onChange({})
  }

  const activeFilterCount = Object.keys(query).filter(k => {
    const value = query[k as keyof ExceptionQuery]
    return value !== undefined && value !== null && 
           (Array.isArray(value) ? value.length > 0 : value !== '')
  }).length

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
      >
        <Filter className="w-4 h-4 mr-2" />
        Filters
        {activeFilterCount > 0 && (
          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {activeFilterCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">Filters</h3>
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear all
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
            {/* Status filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                multiple
                value={query.status || []}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value)
                  handleFilterChange('status', values.length > 0 ? values : undefined)
                }}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                size={3}
              >
                <option value="open">Open</option>
                <option value="investigating">Investigating</option>
                <option value="snoozed">Snoozed</option>
                <option value="resolved">Resolved</option>
                <option value="wont_fix">Won't Fix</option>
                <option value="escalated">Escalated</option>
              </select>
            </div>

            {/* Reason filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason
              </label>
              <select
                multiple
                value={query.reason || []}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value)
                  handleFilterChange('reason', values.length > 0 ? values : undefined)
                }}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                size={3}
              >
                <option value="AMOUNT_MISMATCH">Amount Mismatch</option>
                <option value="BANK_FILE_AWAITED">Bank File Awaited</option>
                <option value="FEE_MISMATCH">Fee Mismatch</option>
                <option value="DATE_MISMATCH">Date Mismatch</option>
                <option value="PG_ONLY">PG Only</option>
                <option value="BANK_ONLY">Bank Only</option>
                <option value="DUPLICATE">Duplicate</option>
              </select>
            </div>

            {/* Severity filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Severity
              </label>
              <select
                multiple
                value={query.severity || []}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value)
                  handleFilterChange('severity', values.length > 0 ? values : undefined)
                }}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                size={3}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={query.dateFrom || ''}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value || undefined)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={query.dateTo || ''}
                  onChange={(e) => handleFilterChange('dateTo', e.target.value || undefined)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
            </div>

            {/* SLA Breached */}
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={query.slaBreached || false}
                  onChange={(e) => handleFilterChange('slaBreached', e.target.checked || undefined)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">SLA Breached Only</span>
              </label>
            </div>
          </div>

          <div className="p-4 border-t border-gray-200">
            <button
              onClick={() => setOpen(false)}
              className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}
    </div>
  )
}