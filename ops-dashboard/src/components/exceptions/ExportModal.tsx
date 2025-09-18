import { useState } from 'react'
import { X, Download, FileText, FileSpreadsheet } from 'lucide-react'
import type { ExceptionQuery } from '@/types/exceptions'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  query: ExceptionQuery
  onExport: (format: 'csv' | 'xlsx', template?: string) => void
}

export function ExportModal({ isOpen, onClose, query, onExport }: ExportModalProps) {
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv')
  const [template, setTemplate] = useState<string>('full')

  const handleExport = () => {
    onExport(format, template)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <Download className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium leading-6 text-gray-900">
                  Export Exceptions
                </h3>
                <p className="text-sm text-gray-500">
                  Download exception data for analysis
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-md text-gray-400 hover:text-gray-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <div className="space-y-4">
            {/* Format Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Export Format
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setFormat('csv')}
                  className={`flex items-center justify-center px-4 py-3 border rounded-md ${
                    format === 'csv'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <FileText className="w-5 h-5 mr-2" />
                  CSV
                </button>
                <button
                  onClick={() => setFormat('xlsx')}
                  className={`flex items-center justify-center px-4 py-3 border rounded-md ${
                    format === 'xlsx'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <FileSpreadsheet className="w-5 h-5 mr-2" />
                  Excel
                </button>
              </div>
            </div>

            {/* Template Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Export Template
              </label>
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="summary">Summary Report</option>
                <option value="full">Full Details</option>
                <option value="sla_breaches">SLA Breaches Only</option>
              </select>
            </div>

            {/* Filter Summary */}
            <div className="rounded-md bg-gray-50 p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Export Scope</h4>
              <div className="text-sm text-gray-600 space-y-1">
                {query.status && query.status.length > 0 && (
                  <p>Status: {query.status.join(', ')}</p>
                )}
                {query.reason && query.reason.length > 0 && (
                  <p>Reasons: {query.reason.join(', ')}</p>
                )}
                {query.severity && query.severity.length > 0 && (
                  <p>Severity: {query.severity.join(', ')}</p>
                )}
                {query.dateFrom && (
                  <p>From: {query.dateFrom}</p>
                )}
                {query.dateTo && (
                  <p>To: {query.dateTo}</p>
                )}
                {query.slaBreached && (
                  <p>SLA Breached: Yes</p>
                )}
                {!query.status && !query.reason && !query.severity && !query.dateFrom && !query.dateTo && !query.slaBreached && (
                  <p>All exceptions</p>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="rounded-md bg-blue-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <FileText className="h-5 w-5 text-blue-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    Export Information
                  </h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <p>The export will include all data matching your current filters.</p>
                    <p className="mt-1">Download link will expire in 1 hour.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:col-start-2 sm:text-sm"
            >
              Export
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:col-start-1 sm:mt-0 sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}