import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { 
  AlertCircle,
  ArrowRight,
  FileUp,
  Settings,
  RefreshCw
} from 'lucide-react'
import { opsApiExtended as opsApi } from '@/lib/ops-api-extended'
import { UploadCard } from './UploadCard'
import { PreviewKpis } from './PreviewKpis'
import { PreviewTable } from './PreviewTable'
import { RowDrawer } from './RowDrawer'
import { ReconResults } from './ReconResults'
import { Link } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'

interface PreviewSession {
  jobId: string
  merchantId: string
  merchantName: string
  acquirerCode: string
  cycleDate: string
  pgFile?: any
  bankFile?: any
  mappingTemplateId?: string
  previewData?: {
    stats: any
    rows: any[]
    cursor?: string
    hasMore: boolean
  }
  status: 'idle' | 'uploading' | 'processing' | 'ready' | 'error'
}

export function ManualUploadPage() {
  const [session, setSession] = useState<PreviewSession>({
    jobId: '',
    merchantId: 'ALL',
    merchantName: 'All Merchants',
    acquirerCode: 'ALL',
    cycleDate: new Date().toISOString().split('T')[0],
    mappingTemplateId: 'auto', // Auto-detect and normalize based on Recon Config
    status: 'idle'
  })
  
  const [selectedRow, setSelectedRow] = useState<any>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState(uuidv4())
  const [autoReconChecking, setAutoReconChecking] = useState(false)

  // Check for auto-reconciliation when cycle date changes
  useEffect(() => {
    const checkAutoRecon = async () => {
      if (!session.cycleDate) return
      
      setAutoReconChecking(true)
      try {
        const result = await opsApi.checkForAutoReconciliation(session.cycleDate)
        if (result.shouldTrigger && result.pgFile && result.bankFile) {
          // Auto-trigger reconciliation if both files exist
          console.log(`Auto-reconciliation available for ${session.cycleDate}`)
          
          // Simulate file uploads with the available files
          setSession(prev => ({
            ...prev,
            pgFile: { id: `auto_pg_${Date.now()}`, name: result.pgFile },
            bankFile: { id: `auto_bank_${Date.now()}`, name: result.bankFile }
          }))
          
          // Auto-trigger the preview
          setTimeout(() => {
            createPreviewMutation.mutate()
          }, 500)
        }
      } catch (error) {
        console.error('Failed to check auto-reconciliation:', error)
      } finally {
        setAutoReconChecking(false)
      }
    }
    
    checkAutoRecon()
  }, [session.cycleDate])

  // Create preview mutation
  const createPreviewMutation = useMutation({
    mutationFn: async () => {
      const response = await opsApi.createReconPreview({
        merchantId: session.merchantId,
        acquirerCode: session.acquirerCode,
        cycleDate: session.cycleDate,
        pgFileId: session.pgFile?.id,
        bankFileId: session.bankFile?.id,
        mappingTemplateId: session.mappingTemplateId,
        idempotencyKey
      })
      return response
    },
    onSuccess: async (data) => {
      // Poll for preview completion
      setSession(prev => ({ ...prev, jobId: data.jobId, status: 'processing' }))
      pollPreviewStatus(data.jobId)
    },
    onError: (error) => {
      console.error('Failed to create preview:', error)
      setSession(prev => ({ ...prev, status: 'error' }))
    }
  })

  // Poll preview status
  const pollPreviewStatus = async (jobId: string) => {
    const maxAttempts = 30
    let attempts = 0
    
    const poll = async () => {
      try {
        const status = await opsApi.getPreviewStatus(jobId)
        
        if (status.ready) {
          // Load initial rows
          const rows = await opsApi.getPreviewRows(jobId, { status: 'all', limit: 50 })
          setSession(prev => ({
            ...prev,
            status: 'ready',
            previewData: {
              stats: status.stats,
              rows: rows.data,
              cursor: rows.cursor,
              hasMore: rows.hasMore
            }
          }))
        } else if (attempts < maxAttempts) {
          attempts++
          setTimeout(poll, 2000) // Poll every 2 seconds
        } else {
          setSession(prev => ({ ...prev, status: 'error' }))
        }
      } catch (error) {
        console.error('Failed to poll preview status:', error)
        setSession(prev => ({ ...prev, status: 'error' }))
      }
    }
    
    poll()
  }

  // Handle PG file upload
  const handlePGUpload = async (file: File) => {
    console.log('handlePGUpload called with file:', file.name)
    const result = await opsApi.uploadFileToS3(file, 'pg')
    console.log('PG file upload result:', result)
    
    const newPgFile = {
      id: result.fileId,
      name: file.name,
      size: file.size,
      checksum: result.checksum,
      rowCount: result.rowCount,
      headers: result.headers,
      preview: result.preview,
      validations: result.validations
    }
    
    setSession(prev => {
      console.log('Setting PG file in session. Previous state:', prev)
      return {
        ...prev,
        pgFile: newPgFile
      }
    })

    // Auto-trigger preview if both files present
    if (session.bankFile) {
      console.log('Auto-triggering preview after PG upload')
      setTimeout(() => createPreviewMutation.mutate(), 100)
    }
  }

  // Handle Bank file upload
  const handleBankUpload = async (file: File) => {
    const result = await opsApi.uploadFileToS3(file, 'bank')
    
    const newBankFile = {
      id: result.fileId,
      name: file.name,
      size: file.size,
      checksum: result.checksum,
      rowCount: result.rowCount,
      headers: result.headers,
      preview: result.preview,
      validations: result.validations
    }
    
    setSession(prev => ({
      ...prev,
      bankFile: newBankFile
    }))

    // Auto-trigger preview if both files present
    if (session.pgFile) {
      setTimeout(() => createPreviewMutation.mutate(), 100)
    }
  }

  // Check and trigger preview
  const checkAndTriggerPreview = () => {
    if (session.pgFile && session.bankFile) {
      createPreviewMutation.mutate()
    }
  }

  // Load more rows
  const loadMoreRows = async () => {
    if (!session.jobId || !session.previewData?.cursor) return
    
    try {
      const rows = await opsApi.getPreviewRows(session.jobId, {
        status: 'all',
        limit: 50,
        cursor: session.previewData.cursor
      })
      
      setSession(prev => ({
        ...prev,
        previewData: {
          ...prev.previewData!,
          rows: [...prev.previewData!.rows, ...rows.data],
          cursor: rows.cursor,
          hasMore: rows.hasMore
        }
      }))
    } catch (error) {
      console.error('Failed to load more rows:', error)
    }
  }

  // Handle row click
  const handleRowClick = (row: any) => {
    setSelectedRow(row)
    setDrawerOpen(true)
  }

  // Handle re-run
  const handleRerun = () => {
    setIdempotencyKey(uuidv4())
    createPreviewMutation.mutate()
  }

  // Handle export
  const handleExport = async (type: 'matched' | 'unmatched' | 'awaiting') => {
    if (!session.jobId) return
    
    try {
      const url = await opsApi.exportPreview(session.jobId, type)
      window.open(url, '_blank')
    } catch (error) {
      console.error('Failed to export:', error)
    }
  }

  // Upload sample files
  const handleUploadSampleFiles = async () => {
    console.log('Uploading sample files...')
    try {
      // Mock sample file data for demo
      const pgFile = new File(['transaction_id,utr,amount,date\nTXN001,UTR12345,10000,2025-09-09'], 'pg_axis_demo.csv', { type: 'text/csv' })
      const bankFile = new File(['transaction_id,utr,amount,date\nTXN001,UTR12345,10000,2025-09-09'], 'bank_axis_demo.csv', { type: 'text/csv' })

      console.log('Uploading PG file...')
      await handlePGUpload(pgFile)
      console.log('Uploading Bank file...')
      await handleBankUpload(bankFile)
      
      console.log('Current session state:', session)
      console.log('Mapping template ID:', session.mappingTemplateId)
      
      // Trigger preview after both files are uploaded (with a delay to ensure state is updated)
      setTimeout(() => {
        console.log('Triggering preview mutation with auto-detection...')
        createPreviewMutation.mutate()
      }, 200)
    } catch (error) {
      console.error('Failed to upload sample files:', error)
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Top Controls */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Cycle Date */}
            <div>
              <label className="block text-xs font-medium text-gray-500">Cycle Date</label>
              <input
                type="date"
                value={session.cycleDate}
                onChange={(e) => setSession(prev => ({ ...prev, cycleDate: e.target.value }))}
                className="mt-0.5 text-sm border-gray-300 rounded-md"
              />
            </div>
            
            {/* Info text */}
            <div className="text-sm text-gray-500">
              {autoReconChecking ? (
                <span className="text-blue-600">
                  <RefreshCw className="w-3 h-3 inline animate-spin mr-1" />
                  Checking for available files...
                </span>
              ) : (
                <>
                  <span className="font-medium">Automatic Schema Detection:</span> Bank file format will be automatically detected and normalized based on Recon Config
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-3">
            <button
              onClick={handleUploadSampleFiles}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <FileUp className="w-4 h-4 mr-1.5" />
              Upload Sample Files
            </button>
            <Link
              to="/ops/recon/config"
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <Settings className="w-4 h-4 mr-1.5" />
              Recon Config
            </Link>
          </div>
        </div>
      </div>


      {/* Upload Cards */}
      <div className="px-6 py-6">
        <div className="grid grid-cols-2 gap-6">
          <UploadCard
            title="Transaction/PG File"
            fileType="pg"
            merchant="All Merchants"
            acquirer="All Banks"
            cycleDate={session.cycleDate}
            onFileUpload={handlePGUpload}
            onFileRemove={() => setSession(prev => ({ 
              ...prev, 
              pgFile: undefined, 
              previewData: undefined,
              status: 'idle'
            }))}
            uploadedFile={session.pgFile}
          />
          
          <UploadCard
            title="Bank Recon File"
            fileType="bank"
            merchant="All Merchants"
            acquirer="All Banks"
            cycleDate={session.cycleDate}
            onFileUpload={handleBankUpload}
            onFileRemove={() => setSession(prev => ({ 
              ...prev, 
              bankFile: undefined, 
              previewData: undefined,
              status: 'idle'
            }))}
            uploadedFile={session.bankFile}
          />
        </div>
      </div>

      {/* Results Panel */}
      <div className="flex-1 bg-white border-t border-gray-200 flex flex-col overflow-hidden">
        {session.status === 'idle' && !session.pgFile && !session.bankFile ? (
          // Empty state
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileUp className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">Upload both files to see reconciliation results</p>
            </div>
          </div>
        ) : session.status === 'idle' && (!session.pgFile || !session.bankFile) ? (
          // Partial state - one file uploaded
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="flex items-center justify-center space-x-2 mb-3">
                {!session.pgFile && (
                  <>
                    <ArrowRight className="w-5 h-5 text-amber-600" />
                    <span className="text-amber-600 font-medium">Upload Transaction/PG file</span>
                  </>
                )}
                {!session.bankFile && (
                  <>
                    <ArrowRight className="w-5 h-5 text-amber-600" />
                    <span className="text-amber-600 font-medium">Upload Bank recon file</span>
                  </>
                )}
              </div>
              <p className="text-sm text-gray-500">
                Both files are required to run reconciliation
              </p>
            </div>
          </div>
        ) : session.status === 'processing' ? (
          // Processing state
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-600">Processing reconciliation...</p>
              <p className="text-sm text-gray-500 mt-1">This may take a few moments</p>
            </div>
          </div>
        ) : session.status === 'ready' ? (
          // Results state - Use ReconResults component
          <div className="flex-1 overflow-auto p-6">
            <ReconResults
              merchantId={session.merchantId}
              acquirer={session.acquirerCode}
              cycleDate={session.cycleDate}
              jobId={session.jobId}
            />
          </div>
        ) : session.status === 'error' ? (
          // Error state
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
              <p className="text-gray-900 font-medium">Failed to process reconciliation</p>
              <p className="text-sm text-gray-500 mt-1">Please try again or contact support</p>
              <button
                onClick={handleRerun}
                className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Row Drawer */}
      <RowDrawer
        row={selectedRow}
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false)
          setSelectedRow(null)
        }}
        onCreateException={() => {
          console.log('Create exception for:', selectedRow)
          // TODO: Implement exception creation
        }}
        onManualMatch={() => {
          console.log('Manual match for:', selectedRow)
          // TODO: Implement manual matching
        }}
      />
    </div>
  )
}