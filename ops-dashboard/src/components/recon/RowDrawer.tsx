import { 
  X,
  AlertTriangle,
  CheckCircle,
  Link,
  FileText,
  TrendingUp,
  TrendingDown,
  Calendar
} from 'lucide-react'
import { formatPaiseToINR, formatDateTime } from '@/lib/utils'

interface RowDrawerProps {
  row: any
  isOpen: boolean
  onClose: () => void
  onCreateException?: () => void
  onManualMatch?: () => void
}

export function RowDrawer({ row, isOpen, onClose, onCreateException, onManualMatch }: RowDrawerProps) {
  if (!isOpen || !row) return null

  // Calculate differences
  const amountDiff = row.bankData && row.pgData ? 
    (row.bankData.amount || 0) - (row.pgData.amount || 0) : 0
  
  const dateDiff = row.bankData?.date && row.pgData?.date ? 
    Math.floor((new Date(row.bankData.date).getTime() - new Date(row.pgData.date).getTime()) / (1000 * 60 * 60 * 24)) : 0

  const renderField = (label: string, pgValue: any, bankValue: any, isDiff?: boolean) => {
    const hasDifference = pgValue !== bankValue && pgValue && bankValue
    
    return (
      <div className="py-3 border-b border-gray-100 last:border-0">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          {label}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-sm text-gray-900">
            {pgValue || '-'}
          </div>
          <div className="text-sm text-gray-900">
            {bankValue || '-'}
            {hasDifference && isDiff && (
              <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                typeof amountDiff === 'number' && amountDiff > 0 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {typeof amountDiff === 'number' && amountDiff !== 0 && (
                  <>
                    {amountDiff > 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                    {formatPaiseToINR(Math.abs(amountDiff))}
                  </>
                )}
                {typeof dateDiff === 'number' && dateDiff !== 0 && (
                  <>
                    <Calendar className="w-3 h-3 mr-1" />
                    {Math.abs(dateDiff)} day{Math.abs(dateDiff) !== 1 ? 's' : ''}
                  </>
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
          <div className="w-screen max-w-3xl">
            <div className="h-full flex flex-col bg-white shadow-xl">
              {/* Header */}
              <div className="px-6 py-4 bg-white border-b border-gray-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-medium text-gray-900">
                      Transaction Reconciliation Details
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Transaction ID: {row.transactionId} • UTR: {row.utr}
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="ml-3 bg-white rounded-md text-gray-400 hover:text-gray-500"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                {/* Status Badge */}
                <div className="mt-4">
                  {row.status === 'matched' ? (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                      <CheckCircle className="w-4 h-4 mr-1.5" />
                      Successfully Matched
                    </span>
                  ) : row.status === 'unmatched' ? (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                      <AlertTriangle className="w-4 h-4 mr-1.5" />
                      Unmatched - {row.reason?.replace(/_/g, ' ')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800">
                      <AlertTriangle className="w-4 h-4 mr-1.5" />
                      Awaiting Bank File
                    </span>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-6 py-4">
                  {/* Column Headers */}
                  <div className="grid grid-cols-2 gap-4 mb-4 pb-3 border-b border-gray-200">
                    <div className="flex items-center space-x-2">
                      <FileText className="w-5 h-5 text-blue-600" />
                      <h3 className="text-sm font-semibold text-gray-900">PG/Transaction File</h3>
                    </div>
                    <div className="flex items-center space-x-2">
                      <FileText className="w-5 h-5 text-green-600" />
                      <h3 className="text-sm font-semibold text-gray-900">Bank Reconciliation File</h3>
                    </div>
                  </div>

                  {/* Fields Comparison */}
                  <div className="space-y-1">
                    {renderField(
                      'Transaction ID',
                      row.pgData?.transactionId,
                      row.bankData?.transactionId
                    )}
                    {renderField(
                      'UTR',
                      row.pgData?.utr,
                      row.bankData?.utr
                    )}
                    {renderField(
                      'Gross Amount',
                      row.pgData?.grossAmount ? formatPaiseToINR(row.pgData.grossAmount) : null,
                      row.bankData?.grossAmount ? formatPaiseToINR(row.bankData.grossAmount) : null,
                      true
                    )}
                    {renderField(
                      'Net Amount',
                      row.pgData?.netAmount ? formatPaiseToINR(row.pgData.netAmount) : null,
                      row.bankData?.netAmount ? formatPaiseToINR(row.bankData.netAmount) : null,
                      true
                    )}
                    {renderField(
                      'Fee',
                      row.pgData?.fee ? formatPaiseToINR(row.pgData.fee) : null,
                      row.bankData?.fee ? formatPaiseToINR(row.bankData.fee) : null,
                      true
                    )}
                    {renderField(
                      'Tax',
                      row.pgData?.tax ? formatPaiseToINR(row.pgData.tax) : null,
                      row.bankData?.tax ? formatPaiseToINR(row.bankData.tax) : null,
                      true
                    )}
                    {renderField(
                      'Payment Date',
                      row.pgData?.paymentDate ? formatDateTime(row.pgData.paymentDate) : null,
                      row.bankData?.paymentDate ? formatDateTime(row.bankData.paymentDate) : null,
                      true
                    )}
                    {renderField(
                      'Transaction Date',
                      row.pgData?.transactionDate ? formatDateTime(row.pgData.transactionDate) : null,
                      row.bankData?.transactionDate ? formatDateTime(row.bankData.transactionDate) : null,
                      true
                    )}
                    {renderField(
                      'Bank',
                      row.pgData?.bank,
                      row.bankData?.bank
                    )}
                    {renderField(
                      'Status',
                      row.pgData?.status,
                      row.bankData?.status
                    )}
                    {renderField(
                      'Reference',
                      row.pgData?.reference,
                      row.bankData?.reference
                    )}
                    {renderField(
                      'On-us Transaction',
                      row.pgData?.isOnUs ? 'Yes' : 'No',
                      row.bankData?.isOnUs ? 'Yes' : 'No'
                    )}
                  </div>

                  {/* Variance Summary */}
                  {(amountDiff !== 0 || dateDiff !== 0) && (
                    <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
                      <h4 className="text-sm font-medium text-amber-900 mb-2">
                        <AlertTriangle className="w-4 h-4 inline mr-1.5" />
                        Variance Detected
                      </h4>
                      <div className="space-y-1 text-sm text-amber-800">
                        {amountDiff !== 0 && (
                          <div>
                            Amount Difference: {amountDiff > 0 ? '+' : ''}{formatPaiseToINR(amountDiff)}
                          </div>
                        )}
                        {dateDiff !== 0 && (
                          <div>
                            Date Difference: {dateDiff > 0 ? '+' : ''}{dateDiff} day{Math.abs(dateDiff) !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Raw Data (Collapsible) */}
                  <details className="mt-6">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                      View Raw Data
                    </summary>
                    <div className="mt-3 grid grid-cols-2 gap-4">
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">PG Raw Data</h5>
                        <pre className="text-xs text-gray-700 overflow-x-auto">
                          {JSON.stringify(row.pgData, null, 2)}
                        </pre>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Bank Raw Data</h5>
                        <pre className="text-xs text-gray-700 overflow-x-auto">
                          {JSON.stringify(row.bankData, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </details>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex justify-between">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Close
                  </button>
                  <div className="flex space-x-3">
                    {row.status === 'unmatched' && (
                      <>
                        <button
                          onClick={onCreateException}
                          className="inline-flex items-center px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded-md hover:bg-amber-100"
                        >
                          <AlertTriangle className="w-4 h-4 mr-1.5" />
                          Create Exception
                        </button>
                        <button
                          onClick={onManualMatch}
                          className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-300 rounded-md hover:bg-blue-100"
                        >
                          <Link className="w-4 h-4 mr-1.5" />
                          Mark Manual Match
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}