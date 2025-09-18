import { useState } from 'react'
import { PlayCircle, CheckCircle, AlertCircle, Loader2, TrendingUp } from 'lucide-react'
import { formatPaiseToINR } from '@/lib/utils'

interface MatchProgressProps {
  jobId: string
  onMatch: (jobId: string, tolerances: { amountPaise: number; minutes: number }) => Promise<any>
  onComplete: () => void
}

export function MatchProgress({ jobId, onMatch, onComplete }: MatchProgressProps) {
  const [isMatching, setIsMatching] = useState(false)
  const [tolerances, setTolerances] = useState({
    amountPaise: 0,
    minutes: 10,
  })
  const [result, setResult] = useState<{
    matched: number
    unmatched: number
    exceptionsCount: number
    variancePaise: number
    confidence: number
  } | null>(null)

  const handleMatch = async () => {
    setIsMatching(true)
    try {
      const matchResult = await onMatch(jobId, tolerances)
      setResult(matchResult)
    } catch (error) {
      console.error('Matching failed:', error)
      alert('Matching failed')
    } finally {
      setIsMatching(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full">
      <h3 className="text-lg font-medium mb-4">Auto-Match Configuration</h3>

      {!result && (
        <div className="space-y-4">
          {/* Tolerance Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Amount Tolerance (₹)
              </label>
              <input
                type="number"
                value={tolerances.amountPaise / 100}
                onChange={(e) => setTolerances({ 
                  ...tolerances, 
                  amountPaise: Math.round(parseFloat(e.target.value || '0') * 100) 
                })}
                className="mt-1 block w-full rounded-md border-gray-300"
                min="0"
                step="0.01"
              />
              <p className="mt-1 text-xs text-gray-500">
                Transactions within ±₹{(tolerances.amountPaise / 100).toFixed(2)} will be considered matches
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Time Tolerance (minutes)
              </label>
              <input
                type="number"
                value={tolerances.minutes}
                onChange={(e) => setTolerances({ 
                  ...tolerances, 
                  minutes: parseInt(e.target.value || '0') 
                })}
                className="mt-1 block w-full rounded-md border-gray-300"
                min="0"
              />
              <p className="mt-1 text-xs text-gray-500">
                Transactions within ±{tolerances.minutes} minutes will be considered matches
              </p>
            </div>
          </div>

          {/* Matching Strategy Info */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="text-sm font-medium text-blue-900 mb-2">Matching Strategy</h4>
            <ol className="text-sm text-blue-700 space-y-1">
              <li>1. <strong>Primary:</strong> Exact UTR match (100% confidence)</li>
              <li>2. <strong>Fallback A:</strong> Amount within ±₹{(tolerances.amountPaise / 100).toFixed(2)} AND time within ±{tolerances.minutes} minutes (85% confidence)</li>
              <li>3. <strong>Fallback B:</strong> PG transaction ID ↔ bank reference mapping if available (75% confidence)</li>
            </ol>
          </div>

          {/* Run Match Button */}
          <button
            onClick={handleMatch}
            disabled={isMatching}
            className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isMatching ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Matching in progress...
              </>
            ) : (
              <>
                <PlayCircle className="w-5 h-5 mr-2" />
                Run Auto-Match
              </>
            )}
          </button>
        </div>
      )}

      {/* Match Results */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium text-gray-900">Match Results</h4>
            <span className="text-sm text-gray-500">
              Confidence: {result.confidence}%
            </span>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <span className="text-2xl font-bold text-green-700">{result.matched}</span>
              </div>
              <p className="mt-2 text-sm text-green-600">Matched</p>
            </div>
            
            <div className="bg-amber-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <AlertCircle className="w-8 h-8 text-amber-500" />
                <span className="text-2xl font-bold text-amber-700">{result.unmatched}</span>
              </div>
              <p className="mt-2 text-sm text-amber-600">Unmatched</p>
            </div>
            
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <AlertCircle className="w-8 h-8 text-red-500" />
                <span className="text-2xl font-bold text-red-700">{result.exceptionsCount}</span>
              </div>
              <p className="mt-2 text-sm text-red-600">Exceptions</p>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <TrendingUp className="w-8 h-8 text-purple-500" />
                <span className="text-xl font-bold text-purple-700">
                  {formatPaiseToINR(Math.abs(result.variancePaise))}
                </span>
              </div>
              <p className="mt-2 text-sm text-purple-600">
                Variance {result.variancePaise < 0 ? '(Short)' : result.variancePaise > 0 ? '(Excess)' : ''}
              </p>
            </div>
          </div>

          {/* Success Rate */}
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Match Rate</span>
              <span>{Math.round((result.matched / (result.matched + result.unmatched)) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${(result.matched / (result.matched + result.unmatched)) * 100}%` }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              {result.exceptionsCount > 0 && (
                <p>
                  <AlertCircle className="inline w-4 h-4 text-amber-500 mr-1" />
                  {result.exceptionsCount} exceptions need review
                </p>
              )}
            </div>
            <div className="space-x-3">
              <button
                onClick={() => setResult(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Re-run
              </button>
              <button
                onClick={onComplete}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Complete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}