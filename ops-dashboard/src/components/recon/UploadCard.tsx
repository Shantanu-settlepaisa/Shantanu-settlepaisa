import { useState, useCallback } from 'react'
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertCircle,
  X,
  RefreshCw,
  Shield,
  FileSpreadsheet
} from 'lucide-react'
import { formatBytes } from '@/lib/utils'

interface UploadCardProps {
  title?: string
  fileType?: 'pg' | 'bank'
  merchant?: string
  acquirer?: string
  cycleDate?: string
  onFileUpload?: (file: File) => Promise<void>
  onFileRemove?: () => void
  uploadedFile?: {
    name: string
    size: number
    checksum?: string
    rowCount?: number
    headers?: string[]
    preview?: any[]
    validations?: {
      fileType: boolean
      delimiter: string
      encoding: string
      headerRecognized: boolean
      schemaDetected?: string
    }
  }
  // New props for simplified multi-file upload
  onUpload?: (files: File[]) => void
  accept?: string
  multiple?: boolean
  className?: string
}

export function UploadCard({
  title,
  fileType,
  merchant,
  acquirer,
  cycleDate,
  onFileUpload,
  onFileRemove,
  uploadedFile,
  onUpload,
  accept = '.csv,.xlsx,.xls',
  multiple = false,
  className = ''
}: UploadCardProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true)
    } else if (e.type === "dragleave") {
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files) {
      if (onUpload && multiple) {
        // Handle multiple files for simplified upload
        onUpload(Array.from(files))
      } else if (onFileUpload && files[0]) {
        // Handle single file for traditional upload
        await processFile(files[0])
      }
    }
  }, [onUpload, onFileUpload, multiple])

  const processFile = async (file: File) => {
    setError(null)
    
    // Validate file type
    const validExtensions = ['.csv', '.xlsx', '.xls']
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    if (!validExtensions.includes(ext)) {
      setError('Invalid file type. Please upload CSV or Excel files.')
      return
    }

    // Validate file size (50MB limit)
    if (file.size > 50 * 1024 * 1024) {
      setError('File size exceeds 50MB limit.')
      return
    }

    setIsUploading(true)
    try {
      await onFileUpload(file)
    } catch (err: any) {
      setError(err.message || 'Failed to upload file')
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileSelect = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files) {
        if (onUpload && multiple) {
          // Handle multiple files for simplified upload
          onUpload(Array.from(files))
        } else if (onFileUpload && files[0]) {
          // Handle single file for traditional upload
          await processFile(files[0])
        }
      }
    }
    input.click()
  }

  // Simplified mode for ManualUploadEnhanced
  if (onUpload && !onFileUpload) {
    return (
      <div
        className={`${className} rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors ${
          isDragging 
            ? 'border-blue-500 bg-blue-50' 
            : error
            ? 'border-red-300 bg-red-50'
            : 'border-gray-300 hover:border-gray-400 bg-gray-50'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={handleFileSelect}
        style={{ minHeight: '120px' }}
      >
        <Upload className="w-8 h-8 text-gray-400 mb-2" />
        <p className="text-sm text-gray-600">
          Drop files here or click to browse
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {multiple ? 'Multiple files allowed' : 'Single file only'}
        </p>
      </div>
    )
  }

  // Original full-featured mode
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {uploadedFile && (
            <button
              onClick={onFileRemove}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Replace File
            </button>
          )}
        </div>
        
        {/* Meta Info */}
        {(merchant || acquirer || cycleDate) && (
          <div className="mt-2 flex items-center space-x-3 text-xs text-gray-500">
            {merchant && <span>Merchant: {merchant}</span>}
            {acquirer && <span>Acquirer: {acquirer}</span>}
            {cycleDate && <span>Cycle: {cycleDate}</span>}
          </div>
        )}
      </div>

      {/* Upload Zone or File Info */}
      <div className="flex-1 p-4">
        {!uploadedFile ? (
          <div
            className={`h-full min-h-[200px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors ${
              isDragging 
                ? 'border-blue-500 bg-blue-50' 
                : error
                ? 'border-red-300 bg-red-50'
                : 'border-gray-300 hover:border-gray-400 bg-gray-50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={handleFileSelect}
          >
            {isUploading ? (
              <>
                <RefreshCw className="w-10 h-10 text-blue-600 animate-spin mb-3" />
                <p className="text-sm text-gray-600">Uploading and parsing...</p>
              </>
            ) : (
              <>
                <Upload className="w-10 h-10 text-gray-400 mb-3" />
                <p className="text-sm font-medium text-gray-700">
                  Drop {fileType === 'pg' ? 'PG/Transaction' : 'Bank reconciliation'} file here
                </p>
                <p className="text-xs text-gray-500 mt-1">or click to browse</p>
                <p className="text-xs text-gray-400 mt-2">CSV, XLSX up to 50MB</p>
              </>
            )}
            
            {error && (
              <div className="mt-3 px-3 py-2 bg-red-100 rounded-md">
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* File Info */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-2">
                  <FileSpreadsheet className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{uploadedFile.name}</p>
                    <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500">
                      <span>{formatBytes(uploadedFile.size)}</span>
                      {uploadedFile.rowCount && <span>{uploadedFile.rowCount} rows</span>}
                      {uploadedFile.checksum && (
                        <span className="flex items-center">
                          <Shield className="w-3 h-3 mr-1" />
                          {uploadedFile.checksum.substring(0, 8)}...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={onFileRemove}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Validation Chips */}
            {uploadedFile.validations && (
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  uploadedFile.validations.fileType ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {uploadedFile.validations.fileType ? (
                    <CheckCircle className="w-3 h-3 mr-1" />
                  ) : (
                    <AlertCircle className="w-3 h-3 mr-1" />
                  )}
                  File type OK
                </span>
                {uploadedFile.validations.schemaDetected && uploadedFile.validations.schemaDetected !== 'N/A' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    <Shield className="w-3 h-3 mr-1" />
                    Schema: {uploadedFile.validations.schemaDetected}
                  </span>
                )}
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {uploadedFile.validations.delimiter} delimiter
                </span>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {uploadedFile.validations.encoding} encoding
                </span>
                {uploadedFile.validations.headerRecognized && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Headers recognized
                  </span>
                )}
              </div>
            )}

            {/* Header Preview */}
            {uploadedFile.headers && uploadedFile.preview && (
              <div>
                <h4 className="text-xs font-medium text-gray-700 mb-2">Preview (first 5 rows)</h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {uploadedFile.headers.slice(0, 5).map((header, i) => (
                            <th key={i} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {header}
                            </th>
                          ))}
                          {uploadedFile.headers.length > 5 && (
                            <th className="px-3 py-2 text-center text-xs text-gray-400">
                              +{uploadedFile.headers.length - 5} more
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {uploadedFile.preview.slice(0, 5).map((row, i) => (
                          <tr key={i}>
                            {uploadedFile.headers!.slice(0, 5).map((header, j) => (
                              <td key={j} className="px-3 py-2 whitespace-nowrap text-xs text-gray-900">
                                {row[header] || '-'}
                              </td>
                            ))}
                            {uploadedFile.headers!.length > 5 && (
                              <td className="px-3 py-2 text-center text-xs text-gray-400">...</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}