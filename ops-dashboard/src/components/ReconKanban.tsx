import { Upload, PlayCircle, AlertCircle, CheckCircle, Clock, MoreVertical } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'

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

interface ReconKanbanProps {
  jobs: ReconJob[]
  onUpload: () => void
  onNormalize: (jobId: string) => void
  onMatch: (jobId: string) => void
  onRefresh: () => void
}

const columns = [
  { id: 'awaiting_file', title: 'Awaiting File', color: 'bg-gray-100' },
  { id: 'ingested', title: 'Ingested', color: 'bg-blue-50' },
  { id: 'normalized', title: 'Normalized', color: 'bg-indigo-50' },
  { id: 'matching', title: 'Matching', color: 'bg-purple-50' },
  { id: 'exceptions', title: 'Exceptions', color: 'bg-amber-50' },
  { id: 'resolved', title: 'Resolved', color: 'bg-green-50' },
]

const slaColors = {
  on_track: 'bg-green-100 text-green-800',
  at_risk: 'bg-amber-100 text-amber-800',
  breached: 'bg-red-100 text-red-800',
}

export function ReconKanban({ jobs, onUpload, onNormalize, onMatch, onRefresh }: ReconKanbanProps) {
  const getJobsForColumn = (status: string) => {
    return jobs.filter(job => job.status === status)
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map(column => {
        const columnJobs = getJobsForColumn(column.id)
        
        return (
          <div key={column.id} className="flex-shrink-0 w-80">
            <div className={`rounded-t-lg px-4 py-2 ${column.color}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">{column.title}</h3>
                <span className="text-sm text-gray-500">{columnJobs.length}</span>
              </div>
            </div>
            
            <div className="bg-gray-50 min-h-[400px] rounded-b-lg p-2 space-y-2">
              {columnJobs.map(job => (
                <div key={job.id} className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{job.merchantName}</p>
                      <p className="text-sm text-gray-500">{job.acquirer}</p>
                    </div>
                    <button className="p-1 hover:bg-gray-100 rounded">
                      <MoreVertical className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                  
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>Cycle: {job.cycleDate}</p>
                    {job.fileCount > 0 && <p>Files: {job.fileCount}</p>}
                    {job.matchedCount !== undefined && (
                      <p>Matched: {job.matchedCount}/{job.matchedCount + (job.unmatchedCount || 0)}</p>
                    )}
                    {job.exceptionCount !== undefined && job.exceptionCount > 0 && (
                      <p className="text-amber-600">Exceptions: {job.exceptionCount}</p>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between mt-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${slaColors[job.slaStatus]}`}>
                      {job.slaStatus.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatRelativeTime(job.lastUpdated)}
                    </span>
                  </div>
                  
                  {/* Action buttons based on status */}
                  <div className="mt-3 flex gap-2">
                    {job.status === 'awaiting_file' && (
                      <button
                        onClick={() => onUpload()}
                        className="flex-1 text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                      >
                        Upload File
                      </button>
                    )}
                    {job.status === 'ingested' && (
                      <button
                        onClick={() => onNormalize(job.id)}
                        className="flex-1 text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700"
                      >
                        Normalize
                      </button>
                    )}
                    {job.status === 'normalized' && (
                      <button
                        onClick={() => onMatch(job.id)}
                        className="flex-1 text-xs bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700"
                      >
                        Auto-Match
                      </button>
                    )}
                    {job.status === 'exceptions' && (
                      <a
                        href={`/ops/exceptions?job=${job.id}`}
                        className="flex-1 text-xs bg-amber-600 text-white px-2 py-1 rounded hover:bg-amber-700 text-center"
                      >
                        View Exceptions
                      </a>
                    )}
                  </div>
                </div>
              ))}
              
              {columnJobs.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">No jobs</p>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}