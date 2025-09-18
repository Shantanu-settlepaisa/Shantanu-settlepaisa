import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertCircle,
  Clock,
  Download,
  ChevronDown,
  RefreshCw,
  Loader2,
  X,
  FileSpreadsheet
} from 'lucide-react'
import { opsApi } from '@/lib/ops-api'
import { formatPaiseToINR } from '@/lib/utils'

interface UploadedFile {
  id: string
  name: string
  size: number
  rowCount: number
  uploadedAt: string
  type: 'pg' | 'bank'
}

interface ReconSession {
  id: string
  pgFile?: UploadedFile
  bankFile?: UploadedFile
  status: 'awaiting_pg' | 'awaiting_bank' | 'processing' | 'completed' | 'failed'
  templateId?: string
  results?: {
    matched: number
    unmatchedPG: number
    unmatchedBank: number
    variancePaise: number
    confidence: number
  }
}

export function ManualUpload() {
  const [session, setSession] = useState<ReconSession>({
    id: `session-${Date.now()}`,
    status: 'awaiting_pg'
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [dragActive, setDragActive] = useState<{ pg: boolean; bank: boolean }>({
    pg: false,
    bank: false
  })

  // Fetch templates
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => opsApi.getTemplates()
  })

  // Get last used template from localStorage
  useEffect(() => {
    const lastUsed = localStorage.getItem('lastUsedTemplate')
    if (lastUsed && templates?.find((t: any) => t.id === lastUsed)) {
      setSelectedTemplate(lastUsed)
    }
  }, [templates])

  // Auto-process when both files are uploaded
  useEffect(() => {
    if (session.pgFile && session.bankFile && session.status !== 'processing' && session.status !== 'completed') {
      processReconciliation()
    }
  }, [session.pgFile, session.bankFile])

  // Handle file upload
  const handleFileUpload = async (file: File, type: 'pg' | 'bank') => {
    try {
      // Validate file
      const validExtensions = ['.csv', '.xlsx', '.xls']
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
      if (!validExtensions.includes(ext)) {
        alert('Invalid file type. Please upload CSV or Excel files.')
        return
      }

      if (file.size > 50 * 1024 * 1024) {
        alert('File size exceeds 50MB limit.')
        return
      }

      // Parse file to get row count (mock)
      const uploadedFile: UploadedFile = {
        id: `file-${Date.now()}`,
        name: file.name,
        size: file.size,
        rowCount: Math.floor(Math.random() * 1000) + 100, // Mock row count
        uploadedAt: new Date().toISOString(),
        type
      }

      // Update session
      setSession(prev => ({
        ...prev,
        [type === 'pg' ? 'pgFile' : 'bankFile']: uploadedFile,
        status: type === 'pg' 
          ? (prev.bankFile ? 'processing' : 'awaiting_bank')
          : (prev.pgFile ? 'processing' : 'awaiting_pg')
      }))
    } catch (error) {
      console.error('Upload failed:', error)
      alert('Failed to upload file')
    }
  }

  // Process reconciliation
  const processReconciliation = async () => {
    if (!session.pgFile || !session.bankFile) return

    setIsProcessing(true)
    setSession(prev => ({ ...prev, status: 'processing' }))

    try {
      // Save selected template
      if (selectedTemplate) {
        localStorage.setItem('lastUsedTemplate', selectedTemplate)
      }

      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Mock results
      const results = {
        matched: 850,
        unmatchedPG: 45,
        unmatchedBank: 23,
        variancePaise: -125000, // ₹1,250 short
        confidence: 94.7
      }

      setSession(prev => ({
        ...prev,
        status: 'completed',
        templateId: selectedTemplate,
        results
      }))
    } catch (error) {
      console.error('Processing failed:', error)
      setSession(prev => ({ ...prev, status: 'failed' }))
    } finally {
      setIsProcessing(false)
    }
  }

  // Export handlers
  const handleExport = (type: 'matched' | 'unmatched' | 'summary', format: 'csv' | 'xlsx') => {
    console.log(`Exporting ${type} as ${format}`)
    // Mock export - in real app would generate and download file
    alert(`Exported ${type} data as ${format.toUpperCase()}`)
    setExportMenuOpen(false)
  }

  // Reset session
  const resetSession = () => {
    setSession({
      id: `session-${Date.now()}`,
      status: 'awaiting_pg'
    })
  }

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent, type: 'pg' | 'bank') => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(prev => ({ ...prev, [type]: true }))
    } else if (e.type === "dragleave") {
      setDragActive(prev => ({ ...prev, [type]: false }))
    }
  }

  const handleDrop = async (e: React.DragEvent, type: 'pg' | 'bank') => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(prev => ({ ...prev, [type]: false }))

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFileUpload(e.dataTransfer.files[0], type)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Manual Upload</h3>
          {session.status === 'completed' && (
            <button
              onClick={resetSession}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              <RefreshCw className="w-3 h-3 inline mr-1" />
              New Session
            </button>
          )}
        </div>
      </div>

      {/* State Ribbon */}
      <div className={`px-4 py-2 text-xs font-medium ${
        session.status === 'awaiting_pg' ? 'bg-amber-50 text-amber-800' :
        session.status === 'awaiting_bank' ? 'bg-amber-50 text-amber-800' :
        session.status === 'processing' ? 'bg-blue-50 text-blue-800' :
        session.status === 'completed' ? 'bg-green-50 text-green-800' :
        'bg-red-50 text-red-800'
      }`}>
        {session.status === 'awaiting_pg' && (
          <>
            <AlertCircle className="w-3 h-3 inline mr-1" />
            Awaiting Transaction/PG file
          </>
        )}
        {session.status === 'awaiting_bank' && (
          <>
            <AlertCircle className="w-3 h-3 inline mr-1" />
            Awaiting Bank recon file
          </>
        )}
        {session.status === 'processing' && (
          <>
            <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />
            Normalization & Matching running...
          </>
        )}
        {session.status === 'completed' && (
          <>
            <CheckCircle className="w-3 h-3 inline mr-1" />
            Reconciliation completed
          </>
        )}
        {session.status === 'failed' && (
          <>
            <X className="w-3 h-3 inline mr-1" />
            Processing failed
          </>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* PG File Upload */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Transaction/PG File
          </label>
          {!session.pgFile ? (
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                dragActive.pg 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={(e) => handleDrag(e, 'pg')}
              onDragLeave={(e) => handleDrag(e, 'pg')}
              onDragOver={(e) => handleDrag(e, 'pg')}
              onDrop={(e) => handleDrop(e, 'pg')}
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = '.csv,.xlsx,.xls'
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0]
                  if (file) handleFileUpload(file, 'pg')
                }
                input.click()
              }}
            >
              <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">Drop PG file or click to browse</p>
              <p className="text-xs text-gray-500 mt-1">CSV, XLSX up to 50MB</p>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-2">
                  <FileText className="w-4 h-4 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{session.pgFile.name}</p>
                    <p className="text-xs text-gray-500">
                      {session.pgFile.rowCount} rows • {(session.pgFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSession(prev => ({ ...prev, pgFile: undefined, status: 'awaiting_pg' }))}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bank File Upload */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Bank Recon File
          </label>
          {!session.bankFile ? (
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                dragActive.bank 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={(e) => handleDrag(e, 'bank')}
              onDragLeave={(e) => handleDrag(e, 'bank')}
              onDragOver={(e) => handleDrag(e, 'bank')}
              onDrop={(e) => handleDrop(e, 'bank')}
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = '.csv,.xlsx,.xls'
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0]
                  if (file) handleFileUpload(file, 'bank')
                }
                input.click()
              }}
            >
              <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">Drop Bank file or click to browse</p>
              <p className="text-xs text-gray-500 mt-1">CSV, XLSX up to 50MB</p>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-2">
                  <FileSpreadsheet className="w-4 h-4 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{session.bankFile.name}</p>
                    <p className="text-xs text-gray-500">
                      {session.bankFile.rowCount} rows • {(session.bankFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSession(prev => ({ ...prev, bankFile: undefined, status: 'awaiting_bank' }))}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Template Selection */}
        {(session.pgFile || session.bankFile) && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Mapping Template
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full text-sm border-gray-300 rounded-md"
              disabled={isProcessing}
            >
              <option value="">Auto-detect</option>
              {templates?.map((template: any) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <p className="text-xs text-gray-500 mt-1">
                Last used template auto-selected
              </p>
            )}
          </div>
        )}

        {/* Results */}
        {session.status === 'completed' && session.results && (
          <div className="border-t pt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-green-50 rounded-lg p-2">
                <p className="text-xs text-green-600 font-medium">Matched</p>
                <p className="text-lg font-bold text-green-900">{session.results.matched}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-2">
                <p className="text-xs text-amber-600 font-medium">Unmatched PG</p>
                <p className="text-lg font-bold text-amber-900">{session.results.unmatchedPG}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-2">
                <p className="text-xs text-orange-600 font-medium">Unmatched Bank</p>
                <p className="text-lg font-bold text-orange-900">{session.results.unmatchedBank}</p>
              </div>
              <div className={`rounded-lg p-2 ${
                session.results.variancePaise < 0 ? 'bg-red-50' : 'bg-blue-50'
              }`}>
                <p className={`text-xs font-medium ${
                  session.results.variancePaise < 0 ? 'text-red-600' : 'text-blue-600'
                }`}>Variance</p>
                <p className={`text-lg font-bold ${
                  session.results.variancePaise < 0 ? 'text-red-900' : 'text-blue-900'
                }`}>
                  {formatPaiseToINR(Math.abs(session.results.variancePaise))}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">
                Confidence: {session.results.confidence}%
              </div>
              <div className="relative">
                <button
                  onClick={() => setExportMenuOpen(!exportMenuOpen)}
                  className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Download className="w-3 h-3 mr-1" />
                  Export
                  <ChevronDown className="w-3 h-3 ml-1" />
                </button>
                
                {exportMenuOpen && (
                  <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                    <div className="py-1">
                      <button
                        onClick={() => handleExport('matched', 'csv')}
                        className="block w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        Export Matched (CSV)
                      </button>
                      <button
                        onClick={() => handleExport('matched', 'xlsx')}
                        className="block w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        Export Matched (XLSX)
                      </button>
                      <hr className="my-1" />
                      <button
                        onClick={() => handleExport('unmatched', 'csv')}
                        className="block w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        Export Unmatched (CSV)
                      </button>
                      <button
                        onClick={() => handleExport('unmatched', 'xlsx')}
                        className="block w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        Export Unmatched (XLSX)
                      </button>
                      <hr className="my-1" />
                      <button
                        onClick={() => handleExport('summary', 'csv')}
                        className="block w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        Export Summary (CSV)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}