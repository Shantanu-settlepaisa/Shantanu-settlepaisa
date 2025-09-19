import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { opsApi } from '@/lib/ops-api'
import { formatPaiseToINR, formatDateTime } from '@/lib/utils'
import { FileText, Clock, DollarSign, AlertCircle } from 'lucide-react'

export default function SettlementDetails() {
  const { settlementId } = useParams<{ settlementId: string }>()

  const { data: settlement, isLoading } = useQuery({
    queryKey: ['settlement', settlementId],
    queryFn: () => opsApi.getSettlementDetails(settlementId!),
    enabled: !!settlementId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading settlement details...</p>
        </div>
      </div>
    )
  }

  if (!settlement) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Settlement not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900">Settlement Details</h1>
          <p className="text-sm text-gray-500">ID: {settlement.id}</p>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <p className="text-sm font-medium text-gray-500">Merchant</p>
            <p className="mt-1 text-lg text-gray-900">{settlement.merchantName}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Acquirer</p>
            <p className="mt-1 text-lg text-gray-900">{settlement.acquirer}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Cycle Date</p>
            <p className="mt-1 text-lg text-gray-900">{settlement.cycleDate}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Net Amount</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">
              {formatPaiseToINR(settlement.netAmountPaise)}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Bank UTR</p>
            <p className="mt-1 text-lg text-gray-900">{settlement.bankUtr || 'Pending'}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Posted At</p>
            <p className="mt-1 text-lg text-gray-900">
              {settlement.postedAt ? formatDateTime(settlement.postedAt) : 'Not posted'}
            </p>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Financial Breakdown</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500">Fees</p>
              <p className="text-sm font-medium">{formatPaiseToINR(settlement.feePaise)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">GST</p>
              <p className="text-sm font-medium">{formatPaiseToINR(settlement.gstPaise)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">TDS</p>
              <p className="text-sm font-medium">{formatPaiseToINR(settlement.tdsPaise)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Adjustments</p>
              <p className="text-sm font-medium">{formatPaiseToINR(settlement.adjustmentsPaise)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}