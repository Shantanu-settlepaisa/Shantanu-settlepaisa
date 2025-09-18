import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  X,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  Download,
  FileText,
  Activity,
  Loader2,
  Calendar,
  Database,
  Shield,
  Upload
} from 'lucide-react'
import { opsApiExtended as opsApi } from '@/lib/ops-api-extended'
import { formatDateTime, formatBytes } from '@/lib/utils'
import type { DataSource } from './ConnectorsPage'

interface JobsPanelProps {
  connector: DataSource
  isOpen: boolean
  onClose: () => void
}

interface IngestJob {
  jobId: string
  sourceId: string
  cycleDate: string
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'DLQ'
  attempt: number
  maxAttempt: number
  artifactUri?: string
  rowsIngested?: number
  bytesIngested?: number
  errorMessage?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  duration?: number
}

interface IngestEvent {
  eventId: string
  jobId: string
  kind: 'CONNECT' | 'LIST' | 'DOWNLOAD' | 'DECRYPT' | 'VERIFY' | 'UPLOAD_RAW' | 'COMPLETE' | 'ERROR'
  payload: any
  createdAt: string
}

export function JobsPanel({ connector, isOpen, onClose }: JobsPanelProps) {
  const [selectedJob, setSelectedJob] = useState<IngestJob | null>(null)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)

  // Fetch jobs
  const { data: jobs, isLoading, refetch } = useQuery({
    queryKey: ['ingest-jobs', connector.sourceId],
    queryFn: () => opsApi.getIngestJobs({ sourceId: connector.sourceId }),
    enabled: isOpen,
    refetchInterval: 5000 // Refresh every 5s while open
  })

  // Fetch job events
  const { data: events } = useQuery({
    queryKey: ['ingest-events', selectedJob?.jobId],
    queryFn: () => opsApi.getIngestEvents(selectedJob!.jobId),
    enabled: !!selectedJob
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCEEDED':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'FAILED':
        return <XCircle className="w-4 h-4 text-red-600" />
      case 'DLQ':
        return <AlertCircle className="w-4 h-4 text-red-600" />
      case 'RUNNING':
        return <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
      case 'QUEUED':
        return <Clock className="w-4 h-4 text-amber-600" />
      default:
        return null
    }
  }

  const getStatusBadge = (status: string) => {
    const colors = {
      SUCCEEDED: 'bg-green-100 text-green-800',
      FAILED: 'bg-red-100 text-red-800',
      DLQ: 'bg-red-100 text-red-800',
      RUNNING: 'bg-blue-100 text-blue-800',
      QUEUED: 'bg-amber-100 text-amber-800'
    }

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[status as keyof typeof colors]}`}>
        {getStatusIcon(status)}
        <span className="ml-1">{status}</span>
      </span>
    )
  }

  const getEventIcon = (kind: string) => {
    switch (kind) {
      case 'CONNECT':
        return <Activity className="w-3 h-3 text-blue-600" />
      case 'LIST':
        return <FileText className="w-3 h-3 text-blue-600" />
      case 'DOWNLOAD':
        return <Download className="w-3 h-3 text-blue-600" />
      case 'DECRYPT':
      case 'VERIFY':
        return <Shield className="w-3 h-3 text-purple-600" />
      case 'UPLOAD_RAW':
        return <Upload className="w-3 h-3 text-green-600" />
      case 'COMPLETE':
        return <CheckCircle className="w-3 h-3 text-green-600" />
      case 'ERROR':
        return <XCircle className="w-3 h-3 text-red-600" />
      default:
        return <Activity className="w-3 h-3 text-gray-400" />
    }
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
          <div className="w-screen max-w-4xl">
            <div className="h-full flex bg-white shadow-xl">
              {/* Jobs List */}
              <div className="w-1/2 border-r border-gray-200 flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-medium text-gray-900">Ingestion Jobs</h2>
                      <p className="text-sm text-gray-500">{connector.name}</p>
                    </div>
                    <button
                      onClick={() => refetch()}
                      className="p-2 text-gray-400 hover:text-gray-600"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Jobs List */}
                <div className="flex-1 overflow-y-auto">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                    </div>
                  ) : jobs && jobs.length > 0 ? (
                    <div className="divide-y divide-gray-200">
                      {jobs.map((job: IngestJob) => (
                        <div
                          key={job.jobId}
                          className={`p-4 hover:bg-gray-50 cursor-pointer ${
                            selectedJob?.jobId === job.jobId ? 'bg-blue-50' : ''
                          }`}
                          onClick={() => setSelectedJob(job)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <Calendar className="w-4 h-4 text-gray-400" />
                                <span className="text-sm font-medium text-gray-900">
                                  {job.cycleDate}
                                </span>
                                {getStatusBadge(job.status)}
                              </div>
                              
                              <div className="mt-1 text-xs text-gray-500">
                                Started: {formatDateTime(job.createdAt)}
                              </div>
                              
                              {job.status === 'SUCCEEDED' && (
                                <div className="mt-2 flex items-center space-x-3 text-xs text-gray-600">
                                  <span>{job.rowsIngested?.toLocaleString() || 0} rows</span>
                                  <span>{formatBytes(job.bytesIngested || 0)}</span>
                                  <span>{formatDuration(job.duration)}</span>
                                </div>
                              )}
                              
                              {job.status === 'FAILED' && job.errorMessage && (
                                <div className="mt-2 text-xs text-red-600">
                                  {job.errorMessage}
                                </div>
                              )}
                              
                              {job.attempt > 1 && (
                                <div className="mt-1 text-xs text-amber-600">
                                  Attempt {job.attempt} of {job.maxAttempt}
                                </div>
                              )}
                            </div>
                            
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setExpandedJob(expandedJob === job.jobId ? null : job.jobId)
                              }}
                              className="ml-2 p-1 text-gray-400 hover:text-gray-600"
                            >
                              {expandedJob === job.jobId ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                          
                          {/* Expanded Details */}
                          {expandedJob === job.jobId && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <dl className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <dt className="text-gray-500">Job ID</dt>
                                  <dd className="font-mono text-gray-700">{job.jobId.substring(0, 8)}</dd>
                                </div>
                                <div>
                                  <dt className="text-gray-500">Duration</dt>
                                  <dd className="text-gray-700">{formatDuration(job.duration)}</dd>
                                </div>
                                {job.artifactUri && (
                                  <div className="col-span-2">
                                    <dt className="text-gray-500">Artifact</dt>
                                    <dd className="font-mono text-gray-700 truncate">{job.artifactUri}</dd>
                                  </div>
                                )}
                              </dl>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                      <Database className="w-8 h-8 mb-2 text-gray-400" />
                      <p className="text-sm">No jobs found</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Job Details / Events */}
              <div className="flex-1 flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-gray-900">
                      {selectedJob ? 'Job Events' : 'Select a Job'}
                    </h3>
                    <button
                      onClick={onClose}
                      className="ml-3 bg-white rounded-md text-gray-400 hover:text-gray-500"
                    >
                      <X className="h-6 w-6" />
                    </button>
                  </div>
                </div>

                {/* Events Timeline */}
                <div className="flex-1 overflow-y-auto">
                  {selectedJob ? (
                    events && events.length > 0 ? (
                      <div className="p-6">
                        <div className="flow-root">
                          <ul className="-mb-8">
                            {events.map((event: IngestEvent, idx: number) => (
                              <li key={event.eventId}>
                                <div className="relative pb-8">
                                  {idx !== events.length - 1 && (
                                    <span
                                      className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <div className="relative flex space-x-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white ring-2 ring-gray-200">
                                      {getEventIcon(event.kind)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div>
                                        <p className="text-sm font-medium text-gray-900">
                                          {event.kind.replace(/_/g, ' ')}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                          {formatDateTime(event.createdAt)}
                                        </p>
                                      </div>
                                      {event.payload && Object.keys(event.payload).length > 0 && (
                                        <div className="mt-2 text-xs">
                                          <details className="cursor-pointer">
                                            <summary className="text-gray-600 hover:text-gray-900">
                                              View details
                                            </summary>
                                            <pre className="mt-2 p-2 bg-gray-50 rounded overflow-x-auto text-gray-700">
                                              {JSON.stringify(event.payload, null, 2)}
                                            </pre>
                                          </details>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                        
                        {/* Link to Recon Results */}
                        {selectedJob.status === 'SUCCEEDED' && (
                          <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex items-center">
                              <CheckCircle className="w-5 h-5 text-blue-600 mr-2" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-blue-900">
                                  Reconciliation Complete
                                </p>
                                <p className="text-xs text-blue-700 mt-1">
                                  Data has been normalized and reconciled
                                </p>
                              </div>
                              <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                                View Results →
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-32">
                        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                      <Activity className="w-8 h-8 mb-2 text-gray-400" />
                      <p className="text-sm">Select a job to view events</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}