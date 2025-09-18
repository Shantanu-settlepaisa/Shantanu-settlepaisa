import { useState, useEffect } from 'react'
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Download,
  TrendingUp,
  TrendingDown,
  FileText,
  RefreshCw
} from 'lucide-react'

interface ReconciliationResult {
  id: string
  cycleDate: string
  pgSource: string
  bankSource: string
  totalPGTransactions: number
  totalBankRecords: number
  matched: any[]
  unmatchedPG: any[]
  unmatchedBank: any[]
  exceptions: any[]
  matchRate: number
  totalAmount: number
  reconciledAmount: number
  createdAt: string
}

export function ReconciliationResults({ resultId }: { resultId?: string }) {
  const [results, setResults] = useState<ReconciliationResult[]>([])
  const [selectedResult, setSelectedResult] = useState<ReconciliationResult | null>(null)
  const [activeTab, setActiveTab] = useState<'matched' | 'unmatchedPG' | 'unmatchedBank' | 'exceptions'>('matched')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchResults()
  }, [resultId])

  const fetchResults = async () => {
    try {
      setLoading(true)
      if (resultId) {
        // Fetch specific result
        const response = await fetch(`http://localhost:5103/api/reconcile/${resultId}`)
        const data = await response.json()
        setSelectedResult(data)
      } else {
        // Fetch all results
        const response = await fetch('http://localhost:5103/api/reconcile')
        const data = await response.json()
        setResults(data)
        if (data.length > 0 && !selectedResult) {
          setSelectedResult(data[0])
        }
      }
    } catch (error) {
      console.error('Failed to fetch results:', error)
    } finally {
      setLoading(false)
    }
  }

  const runReconciliation = async () => {
    try {
      const cycleDate = new Date().toISOString().split('T')[0]
      const response = await fetch('http://localhost:5103/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleDate,
          pgSource: 'PG Demo API',
          bankSource: 'AXIS Bank SFTP'
        })
      })
      const data = await response.json()
      if (data.success) {
        await fetchResults()
      }
    } catch (error) {
      console.error('Failed to run reconciliation:', error)
    }
  }

  const formatAmount = (amount: number) => {
    const amountInRupees = amount / 100
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amountInRupees)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!selectedResult) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500 mb-4">No reconciliation results available</p>
        <button
          onClick={runReconciliation}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Run Reconciliation Now
        </button>
      </div>
    )
  }

  const matchPercentage = selectedResult.matchRate
  const unmatchedPercentage = 100 - matchPercentage

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Reconciliation Results</h2>
            <p className="text-sm text-gray-500 mt-1">
              Cycle: {selectedResult.cycleDate} | {selectedResult.pgSource} ↔ {selectedResult.bankSource}
            </p>
          </div>
          <button
            onClick={runReconciliation}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Run New Reconciliation
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Match Rate</p>
                <p className="text-2xl font-bold text-gray-900">{matchPercentage.toFixed(1)}%</p>
              </div>
              {matchPercentage >= 95 ? (
                <TrendingUp className="w-8 h-8 text-green-500" />
              ) : matchPercentage >= 85 ? (
                <TrendingUp className="w-8 h-8 text-amber-500" />
              ) : (
                <TrendingDown className="w-8 h-8 text-red-500" />
              )}
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Matched</p>
                <p className="text-2xl font-bold text-green-600">{selectedResult.matched.length}</p>
                <p className="text-xs text-gray-500">{formatAmount(selectedResult.reconciledAmount)}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <div className="bg-amber-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Unmatched</p>
                <p className="text-2xl font-bold text-amber-600">
                  {selectedResult.unmatchedPG.length + selectedResult.unmatchedBank.length}
                </p>
                <p className="text-xs text-gray-500">
                  PG: {selectedResult.unmatchedPG.length} | Bank: {selectedResult.unmatchedBank.length}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </div>
          </div>

          <div className="bg-red-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Exceptions</p>
                <p className="text-2xl font-bold text-red-600">{selectedResult.exceptions.length}</p>
                <p className="text-xs text-gray-500">Requires review</p>
              </div>
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('matched')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'matched'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Matched ({selectedResult.matched.length})
            </button>
            <button
              onClick={() => setActiveTab('unmatchedPG')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'unmatchedPG'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Unmatched PG ({selectedResult.unmatchedPG.length})
            </button>
            <button
              onClick={() => setActiveTab('unmatchedBank')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'unmatchedBank'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Unmatched Bank ({selectedResult.unmatchedBank.length})
            </button>
            <button
              onClick={() => setActiveTab('exceptions')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'exceptions'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Exceptions ({selectedResult.exceptions.length})
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'matched' && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Transaction ID</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">UTR</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">PG Amount</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Bank Amount</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedResult.matched.slice(0, 10).map((match, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-sm">{match.pgTransaction.transaction_id}</td>
                      <td className="px-4 py-2 text-sm">{match.pgTransaction.utr}</td>
                      <td className="px-4 py-2 text-sm">{formatAmount(match.pgTransaction.amount)}</td>
                      <td className="px-4 py-2 text-sm">{formatAmount(match.bankRecord.AMOUNT)}</td>
                      <td className="px-4 py-2 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          match.confidence >= 95 ? 'bg-green-100 text-green-800' :
                          match.confidence >= 85 ? 'bg-amber-100 text-amber-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {match.confidence}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'unmatchedPG' && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Transaction ID</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">UTR</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Payment Method</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Captured At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedResult.unmatchedPG.map((txn, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-sm">{txn.transaction_id}</td>
                      <td className="px-4 py-2 text-sm">{txn.utr}</td>
                      <td className="px-4 py-2 text-sm">{formatAmount(txn.amount)}</td>
                      <td className="px-4 py-2 text-sm">{txn.payment_method}</td>
                      <td className="px-4 py-2 text-sm">{new Date(txn.captured_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'unmatchedBank' && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Transaction ID</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">UTR</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedResult.unmatchedBank.map((record, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-sm">{record.TRANSACTION_ID}</td>
                      <td className="px-4 py-2 text-sm">{record.UTR}</td>
                      <td className="px-4 py-2 text-sm">{formatAmount(record.AMOUNT)}</td>
                      <td className="px-4 py-2 text-sm">{record.DATE}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'exceptions' && (
            <div className="space-y-4">
              {selectedResult.exceptions.map((exception, idx) => (
                <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 mr-3" />
                    <div>
                      <p className="font-medium text-red-900">{exception.type}</p>
                      <p className="text-sm text-red-700 mt-1">{exception.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}