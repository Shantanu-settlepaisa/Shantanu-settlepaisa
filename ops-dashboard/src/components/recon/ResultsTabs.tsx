import { useState } from 'react'
import { 
  Download, 
  CheckCircle, 
  AlertCircle,
  XCircle,
  FileSpreadsheet
} from 'lucide-react'
import { formatPaiseToINR } from '@/lib/utils'

interface ResultsTabsProps {
  jobId: string
  results?: {
    matched: {
      count: number
      rows: any[]
    }
    unmatchedPG: {
      count: number
      rows: any[]
    }
    unmatchedBank: {
      count: number
      rows: any[]
    }
    summary: {
      totalPG: number
      totalBank: number
      matchRate: number
      variancePaise: number
    }
  }
  onExport: (tab: 'matched' | 'unmatched_pg' | 'unmatched_bank') => void
  isLoading?: boolean
}

export function ResultsTabs({ jobId, results, onExport, isLoading }: ResultsTabsProps) {
  const [activeTab, setActiveTab] = useState<'matched' | 'unmatched_pg' | 'unmatched_bank'>('matched')

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-sm text-gray-600">Processing reconciliation...</p>
        </div>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="text-center">
          <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-600">Upload both files to see reconciliation results</p>
        </div>
      </div>
    )
  }

  const getTabData = () => {
    switch (activeTab) {
      case 'matched':
        return results.matched
      case 'unmatched_pg':
        return results.unmatchedPG
      case 'unmatched_bank':
        return results.unmatchedBank
      default:
        return { count: 0, rows: [] }
    }
  }

  const tabData = getTabData()
  const displayColumns = tabData.rows.length > 0 ? Object.keys(tabData.rows[0]).slice(0, 7) : []

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Summary Stats */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Total PG</p>
            <p className="text-2xl font-bold text-gray-900">{results.summary.totalPG}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Total Bank</p>
            <p className="text-2xl font-bold text-gray-900">{results.summary.totalBank}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Match Rate</p>
            <p className="text-2xl font-bold text-green-600">{results.summary.matchRate}%</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Variance</p>
            <p className={`text-2xl font-bold ${results.summary.variancePaise < 0 ? 'text-red-600' : 'text-blue-600'}`}>
              {formatPaiseToINR(Math.abs(results.summary.variancePaise))}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex">
          <button
            onClick={() => setActiveTab('matched')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'matched'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <CheckCircle className="w-4 h-4 inline mr-1.5" />
            Matched
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              {results.matched.count}
            </span>
          </button>
          
          <button
            onClick={() => setActiveTab('unmatched_pg')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'unmatched_pg'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <AlertCircle className="w-4 h-4 inline mr-1.5" />
            Unmatched (PG)
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
              {results.unmatchedPG.count}
            </span>
          </button>
          
          <button
            onClick={() => setActiveTab('unmatched_bank')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'unmatched_bank'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <XCircle className="w-4 h-4 inline mr-1.5" />
            Unmatched (Bank)
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
              {results.unmatchedBank.count}
            </span>
          </button>

          <div className="ml-auto flex items-center px-6">
            <button
              onClick={() => onExport(activeTab)}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export CSV
            </button>
          </div>
        </nav>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        {tabData.rows.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {displayColumns.map((column) => (
                  <th
                    key={column}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {column.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tabData.rows.slice(0, 100).map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  {displayColumns.map((column) => (
                    <td key={column} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {column.includes('amount') || column.includes('fee') || column.includes('tax')
                        ? formatPaiseToINR(row[column])
                        : row[column] || '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500">No {activeTab.replace('_', ' ')} records found</p>
          </div>
        )}
      </div>

      {/* Pagination Info */}
      {tabData.rows.length > 100 && (
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500">
            Showing 100 of {tabData.count} records. Export to see all.
          </p>
        </div>
      )}
    </div>
  )
}