import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Grid3x3, 
  List, 
  Upload, 
  PlayCircle,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  MoreVertical,
  Plus,
  Download,
  FileUp,
  Wifi
} from 'lucide-react'
import { opsApi } from '@/lib/ops-api'
import { formatRelativeTime, getStatusColor } from '@/lib/utils'
import { ReconKanban } from '@/components/ReconKanban'
import { ReconList } from '@/components/ReconList'
import { UploadDialog } from '@/components/UploadDialog'
import { NormalizeDialog } from '@/components/NormalizeDialog'
import { MatchProgress } from '@/components/MatchProgress'
import { ExceptionDrawer } from '@/components/ExceptionDrawer'
import { ManualUploadEnhanced } from '@/components/ManualUploadEnhanced'
import { ConnectorsEnhanced } from '@/components/ConnectorsEnhanced'
import { ConnectorsAutomated } from '@/components/ConnectorsAutomated'

export default function ReconWorkspace() {
  const queryClient = useQueryClient()
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [activeTab, setActiveTab] = useState<'overview' | 'manual' | 'connectors'>('manual')
  const [filters, setFilters] = useState({
    status: '',
    merchant: '',
    acquirer: '',
    dateRange: 'last7days',
  })
  
  // Dialog states
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [normalizeDialogOpen, setNormalizeDialogOpen] = useState(false)
  const [matchProgressOpen, setMatchProgressOpen] = useState(false)
  const [exceptionDrawerOpen, setExceptionDrawerOpen] = useState(false)
  
  // Selected items
  const [selectedJob, setSelectedJob] = useState<string | null>(null)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [selectedException, setSelectedException] = useState<any>(null)
  
  // Sample files for demo
  const [showSampleFiles, setShowSampleFiles] = useState(false)

  // Fetch recon jobs
  const { data: jobs, isLoading, refetch } = useQuery({
    queryKey: ['recon-jobs', filters],
    queryFn: () => opsApi.getReconJobs(filters),
    refetchInterval: 30000,
  })

  // Fetch sample files
  const { data: sampleFiles } = useQuery({
    queryKey: ['sample-files'],
    queryFn: () => opsApi.getSampleFiles(),
    enabled: showSampleFiles,
  })

  // Create job mutation
  const createJobMutation = useMutation({
    mutationFn: (data: any) => opsApi.createReconJob(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recon-jobs'] })
    },
  })

  // Upload file handler
  const handleUpload = async (file: File, metadata: any) => {
    try {
      // If creating new job, create it first
      if (!metadata.jobId && metadata.merchantId) {
        const { jobId } = await createJobMutation.mutateAsync({
          merchantId: metadata.merchantId,
          acquirer: metadata.acquirer,
          cycleDate: metadata.cycleDate,
        })
        metadata.jobId = jobId
      }

      const result = await opsApi.uploadReconFile(file, metadata)
      setSelectedFileId(result.fileId)
      refetch()
      return result
    } catch (error) {
      console.error('Upload failed:', error)
      throw error
    }
  }

  // Normalize handler
  const handleNormalize = async (jobId: string, templateId?: string) => {
    try {
      await opsApi.normalizeReconData(jobId, templateId)
      refetch()
    } catch (error) {
      console.error('Normalization failed:', error)
      throw error
    }
  }

  // Match handler
  const handleMatch = async (jobId: string, tolerances: any) => {
    try {
      const result = await opsApi.matchReconData(jobId, tolerances)
      refetch()
      return result
    } catch (error) {
      console.error('Matching failed:', error)
      throw error
    }
  }

  // Exception resolution handler
  const handleResolveException = async (
    exceptionId: string,
    action: string,
    reason: string,
    linkToSettlementId?: string
  ) => {
    try {
      await opsApi.resolveException(exceptionId, action, reason, linkToSettlementId)
      queryClient.invalidateQueries({ queryKey: ['exceptions'] })
    } catch (error) {
      console.error('Failed to resolve exception:', error)
      throw error
    }
  }

  // Download sample file
  const handleDownloadSample = (path: string) => {
    // In real app, this would download the file
    window.open(path, '_blank')
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reconciliation Workspace</h1>
            <p className="text-sm text-gray-500">Manage reconciliation jobs and file processing</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowSampleFiles(!showSampleFiles)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <Download className="w-4 h-4 mr-2" />
              Sample Files
            </button>
            <button
              onClick={() => {
                setSelectedJob(null)
                setUploadDialogOpen(true)
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload File
            </button>
          </div>
        </div>
      </div>

      {/* Sample Files */}
      {showSampleFiles && sampleFiles && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-blue-900">
              <FileText className="inline w-4 h-4 mr-1" />
              Sample reconciliation files available for testing:
            </p>
            <div className="flex items-center space-x-3">
              {sampleFiles.map((file: any) => (
                <button
                  key={file.name}
                  onClick={() => handleDownloadSample(file.path)}
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  {file.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters and View Toggle */}
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="text-sm border-gray-300 rounded-md"
            >
              <option value="">All Status</option>
              <option value="awaiting_file">Awaiting File</option>
              <option value="ingested">Ingested</option>
              <option value="normalized">Normalized</option>
              <option value="matching">Matching</option>
              <option value="exceptions">Exceptions</option>
              <option value="resolved">Resolved</option>
            </select>
            
            <select
              value={filters.acquirer}
              onChange={(e) => setFilters({ ...filters, acquirer: e.target.value })}
              className="text-sm border-gray-300 rounded-md"
            >
              <option value="">All Acquirers</option>
              <option value="ICICI">ICICI Bank</option>
              <option value="HDFC">HDFC Bank</option>
              <option value="SBI">SBI</option>
              <option value="Axis">Axis Bank</option>
            </select>

            <select
              value={filters.dateRange}
              onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
              className="text-sm border-gray-300 rounded-md"
            >
              <option value="today">Today</option>
              <option value="last7days">Last 7 days</option>
              <option value="last30days">Last 30 days</option>
              <option value="last90days">Last 90 days</option>
            </select>

            {filters.status === 'awaiting_file' && (
              <div className="flex items-center text-sm text-amber-600 bg-amber-50 px-3 py-1 rounded-md">
                <AlertCircle className="w-4 h-4 mr-1" />
                {jobs?.data?.filter((j: any) => j.status === 'awaiting_file').length || 0} awaiting bank files
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setView('kanban')}
              className={`p-2 rounded ${view === 'kanban' ? 'bg-white shadow' : 'hover:bg-white'}`}
            >
              <Grid3x3 className="w-5 h-5" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-2 rounded ${view === 'list' ? 'bg-white shadow' : 'hover:bg-white'}`}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'manual' ? (
          /* Full-width Manual Upload */
          <ManualUploadEnhanced />
        ) : activeTab === 'connectors' ? (
          /* Full-width Connectors */
          <ConnectorsAutomated />
        ) : (
          /* Overview with sidebar layout */
          <div className="flex h-full">
            <div className="w-96 border-r border-gray-200 bg-gray-50 p-4 overflow-y-auto">
              {/* Tabs */}
              <div className="mb-4">
            <nav className="flex space-x-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab('overview')}
                className={`flex-1 flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'overview'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Grid3x3 className="w-4 h-4 mr-1.5" />
                Overview
              </button>
              <button
                onClick={() => setActiveTab('manual')}
                className={`flex-1 flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'manual'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <FileUp className="w-4 h-4 mr-1.5" />
                Manual Upload
              </button>
              <button
                onClick={() => setActiveTab('connectors')}
                className={`flex-1 flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'connectors'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Wifi className="w-4 h-4 mr-1.5" />
                Connectors
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Quick Stats */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Today's Overview</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Pending Jobs</span>
                    <span className="text-sm font-medium text-gray-900">
                      {jobs?.data?.filter((j: any) => j.status === 'awaiting_file').length || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">In Progress</span>
                    <span className="text-sm font-medium text-gray-900">
                      {jobs?.data?.filter((j: any) => ['ingested', 'normalized', 'matching'].includes(j.status)).length || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Exceptions</span>
                    <span className="text-sm font-medium text-amber-600">
                      {jobs?.data?.filter((j: any) => j.status === 'exceptions').length || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Completed Today</span>
                    <span className="text-sm font-medium text-green-600">
                      {jobs?.data?.filter((j: any) => j.status === 'resolved').length || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h3>
                <div className="space-y-2">
                  {jobs?.data?.slice(0, 5).map((job: any) => (
                    <div key={job.id} className="flex items-center justify-between py-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">
                          {job.merchantName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {job.acquirer} • {job.cycleDate}
                        </p>
                      </div>
                      <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        job.status === 'resolved' ? 'bg-green-100 text-green-800' :
                        job.status === 'exceptions' ? 'bg-amber-100 text-amber-800' :
                        job.status === 'awaiting_file' ? 'bg-gray-100 text-gray-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {job.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="h-full overflow-hidden">
              <ManualUploadEnhanced />
            </div>
          )}
          
          {activeTab === 'connectors' && (
            <div className="h-full overflow-hidden">
              <ConnectorsAutomated />
            </div>
          )}
            </div>

            {/* Right Column - Jobs View */}
            <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading reconciliation jobs...</p>
              </div>
            </div>
          ) : view === 'kanban' ? (
            <ReconKanban 
              jobs={jobs?.data || []}
              onUpload={() => setUploadDialogOpen(true)}
              onNormalize={(jobId) => {
                setSelectedJob(jobId)
                setNormalizeDialogOpen(true)
              }}
              onMatch={(jobId) => {
                setSelectedJob(jobId)
                setMatchProgressOpen(true)
              }}
              onRefresh={refetch}
            />
          ) : (
            <ReconList 
              jobs={jobs?.data || []}
              onUpload={() => setUploadDialogOpen(true)}
              onNormalize={(jobId) => {
                setSelectedJob(jobId)
                setNormalizeDialogOpen(true)
              }}
              onMatch={(jobId) => {
                setSelectedJob(jobId)
                setMatchProgressOpen(true)
              }}
              onRefresh={refetch}
            />
          )}
            </div>
          </div>
        )}
      </div>

      {/* Dialogs and Modals */}
      {uploadDialogOpen && (
        <UploadDialog
          isOpen={uploadDialogOpen}
          existingJobId={selectedJob || undefined}
          onClose={() => {
            setUploadDialogOpen(false)
            setSelectedJob(null)
          }}
          onUpload={handleUpload}
        />
      )}

      {normalizeDialogOpen && selectedJob && (
        <NormalizeDialog
          isOpen={normalizeDialogOpen}
          jobId={selectedJob}
          fileId={selectedFileId || undefined}
          onClose={() => {
            setNormalizeDialogOpen(false)
            setSelectedJob(null)
            setSelectedFileId(null)
          }}
          onNormalize={handleNormalize}
        />
      )}

      {matchProgressOpen && selectedJob && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setMatchProgressOpen(false)} />
            <div className="relative">
              <MatchProgress
                jobId={selectedJob}
                onMatch={handleMatch}
                onComplete={() => {
                  setMatchProgressOpen(false)
                  setSelectedJob(null)
                  refetch()
                }}
              />
            </div>
          </div>
        </div>
      )}

      {exceptionDrawerOpen && selectedException && (
        <ExceptionDrawer
          exception={selectedException}
          isOpen={exceptionDrawerOpen}
          onClose={() => {
            setExceptionDrawerOpen(false)
            setSelectedException(null)
          }}
          onResolve={handleResolveException}
        />
      )}
    </div>
  )
}