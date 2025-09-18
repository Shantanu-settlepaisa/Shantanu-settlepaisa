import { AlertTriangle, Clock, User } from 'lucide-react'
import { formatRelativeTime, getStatusColor } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'

interface Exception {
  id: string
  transactionId?: string
  settlementId?: string
  type: 'refund_mismatch' | 'fee_discrepancy' | 'missing_txn' | 'duplicate' | 'date_tolerance'
  severity: 'critical' | 'high' | 'medium' | 'low'
  aging: string
  status: 'new' | 'investigating' | 'resolved' | 'escalated'
  assignee?: string
  createdAt: string
}

interface ExceptionSnapshotProps {
  exceptions: Exception[]
}

const typeLabels = {
  refund_mismatch: 'Refund Mismatch',
  fee_discrepancy: 'Fee Discrepancy',
  missing_txn: 'Missing Transaction',
  duplicate: 'Duplicate Entry',
  date_tolerance: 'Date Tolerance Breach',
}

const severityColors = {
  critical: 'text-red-600 bg-red-50',
  high: 'text-orange-600 bg-orange-50',
  medium: 'text-yellow-600 bg-yellow-50',
  low: 'text-blue-600 bg-blue-50',
}

export function ExceptionSnapshot({ exceptions }: ExceptionSnapshotProps) {
  const navigate = useNavigate()

  if (exceptions.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>No exceptions to display</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              ID / Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Severity
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Aging
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Assignee
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {exceptions.map((exception) => (
            <tr
              key={exception.id}
              className="hover:bg-gray-50 cursor-pointer"
              onClick={() => navigate(`/ops/exceptions?id=${exception.id}`)}
            >
              <td className="px-6 py-4 whitespace-nowrap">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {exception.transactionId || exception.settlementId || exception.id}
                  </p>
                  <p className="text-xs text-gray-500">{typeLabels[exception.type]}</p>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${severityColors[exception.severity]}`}>
                  {exception.severity}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center text-sm text-gray-900">
                  <Clock className="w-4 h-4 mr-1 text-gray-400" />
                  {exception.aging}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(exception.status)}`}>
                  {exception.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {exception.assignee ? (
                  <div className="flex items-center text-sm text-gray-900">
                    <User className="w-4 h-4 mr-1 text-gray-400" />
                    {exception.assignee}
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">Unassigned</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}