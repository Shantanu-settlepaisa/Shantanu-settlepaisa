import { MoreVertical } from 'lucide-react'
import { formatRelativeTime, formatDate } from '@/lib/utils'

interface ReconJob {
  id: string
  merchantName: string
  acquirer: string
  cycleDate: string
  status: string
  fileCount: number
  lastUpdated: string
  slaStatus: 'on_track' | 'at_risk' | 'breached'
  matchedCount?: number
  unmatchedCount?: number
  exceptionCount?: number
}

interface ReconListProps {
  jobs: ReconJob[]
  onUpload: () => void
  onNormalize: (jobId: string) => void
  onMatch: (jobId: string) => void
  onRefresh: () => void
}

const statusColors = {
  awaiting_file: 'bg-gray-100 text-gray-800',
  ingested: 'bg-blue-100 text-blue-800',
  normalized: 'bg-indigo-100 text-indigo-800',
  matching: 'bg-purple-100 text-purple-800',
  exceptions: 'bg-amber-100 text-amber-800',
  resolved: 'bg-green-100 text-green-800',
}

const slaColors = {
  on_track: 'text-green-600',
  at_risk: 'text-amber-600',
  breached: 'text-red-600',
}

export function ReconList({ jobs, onUpload, onNormalize, onMatch }: ReconListProps) {
  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Merchant / Acquirer
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Cycle Date
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Progress
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              SLA
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Last Updated
            </th>
            <th className="relative px-6 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {jobs.map((job) => (
            <tr key={job.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div>
                  <p className="text-sm font-medium text-gray-900">{job.merchantName}</p>
                  <p className="text-sm text-gray-500">{job.acquirer}</p>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {formatDate(job.cycleDate)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[job.status as keyof typeof statusColors]}`}>
                  {job.status.replace('_', ' ')}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {job.matchedCount !== undefined ? (
                  <div>
                    <p>{job.matchedCount} matched</p>
                    {job.unmatchedCount && <p className="text-xs text-gray-500">{job.unmatchedCount} unmatched</p>}
                    {job.exceptionCount ? <p className="text-xs text-amber-600">{job.exceptionCount} exceptions</p> : null}
                  </div>
                ) : job.fileCount > 0 ? (
                  <p>{job.fileCount} files</p>
                ) : (
                  <p className="text-gray-400">-</p>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`text-sm font-medium ${slaColors[job.slaStatus]}`}>
                  {job.slaStatus.replace('_', ' ')}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatRelativeTime(job.lastUpdated)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button className="text-gray-400 hover:text-gray-600">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}