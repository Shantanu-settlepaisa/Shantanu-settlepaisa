import { useState, useCallback } from 'react'
import { 
  Upload,
  FileText,
  X,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertCircle
} from 'lucide-react'

export interface UploadedFile {
  id: string
  file: File
  size: number
  md5?: string
  analysis?: {
    fileTypeOk?: boolean
    delimiter?: 'comma' | 'tab' | 'pipe'
    encoding?: 'utf-8' | 'utf-16' | 'ascii'
    headersRecognized?: boolean
    schemaDetected?: string
  }
  preview?: {
    columns: string[]
    rows: any[][]
  }
  parsedData?: any[]  // Full parsed CSV data
}

interface FileCardProps {
  title: 'Transaction/PG File' | 'Bank Recon File'
  meta: {
    merchant: string
    acquirer: string
    cycle: string
  }
  files: UploadedFile[]
  onDropFiles: (files: File[]) => void
  onRemoveFile: (id: string) => void
  onReplaceAll?: () => void
}

export function FileCard({
  title,
  meta,
  files,
  onDropFiles,
  onRemoveFile,
  onReplaceAll
}: FileCardProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [expandedPreview, setExpandedPreview] = useState(false)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true)
    } else if (e.type === 'dragleave') {
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    
    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length > 0) {
      onDropFiles(droppedFiles)
    }
  }, [onDropFiles])

  const handleFileSelect = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,.xlsx,.xls'
    input.multiple = true
    input.onchange = (e) => {
      const selectedFiles = Array.from((e.target as HTMLInputElement).files || [])
      if (selectedFiles.length > 0) {
        onDropFiles(selectedFiles)
      }
    }
    input.click()
  }

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Get all preview rows (max 5 total across all files)
  const getAllPreviewRows = () => {
    const allRows: any[][] = []
    let columns: string[] = []
    
    for (const file of files) {
      if (file.preview) {
        if (columns.length === 0) {
          columns = file.preview.columns
        }
        allRows.push(...file.preview.rows)
        if (allRows.length >= 5) break
      }
    }
    
    return { columns, rows: allRows.slice(0, 5) }
  }

  const hasFiles = files.length > 0
  const preview = getAllPreviewRows()

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h3 className="font-medium text-gray-900">{title}</h3>
          <div className="text-xs text-gray-500 mt-1">
            Merchant: {meta.merchant} · Acquirer: {meta.acquirer} · Cycle: {meta.cycle}
          </div>
        </div>
        {hasFiles && onReplaceAll && (
          <button
            onClick={onReplaceAll}
            className="text-sm text-red-600 hover:text-red-700 font-medium"
          >
            Replace File
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        {!hasFiles ? (
          /* Dropzone */
          <div
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isDragging 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400 bg-gray-50'
              }
            `}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={handleFileSelect}
          >
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">
              Drop files here or click to browse
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Multiple files allowed · CSV, XLSX up to 50MB each
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* File chips */}
            <div className="flex flex-wrap gap-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="inline-flex items-center gap-2 rounded-full bg-green-50 border border-green-200 px-3 py-1.5"
                >
                  <FileText className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-gray-900">
                    {file.file.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatSize(file.size)}
                  </span>
                  {file.md5 && (
                    <span className="text-xs text-gray-400 font-mono">
                      md5:{file.md5.substring(0, 6)}
                    </span>
                  )}
                  <button
                    onClick={() => onRemoveFile(file.id)}
                    className="ml-1 hover:bg-green-100 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3 text-gray-500" />
                  </button>
                </div>
              ))}
            </div>

            {/* Analysis badges */}
            {files[0]?.analysis && (
              <div className="flex flex-wrap gap-2">
                {files[0].analysis.fileTypeOk && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <CheckCircle className="h-3 w-3" />
                    File type OK
                  </span>
                )}
                {files[0].analysis.delimiter && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                    {files[0].analysis.delimiter} delimiter
                  </span>
                )}
                {files[0].analysis.encoding && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                    {files[0].analysis.encoding.toUpperCase()} encoding
                  </span>
                )}
                {files[0].analysis.headersRecognized && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <CheckCircle className="h-3 w-3" />
                    Headers recognized
                  </span>
                )}
                {files[0].analysis.schemaDetected && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    Schema: {files[0].analysis.schemaDetected}
                  </span>
                )}
              </div>
            )}

            {/* Preview section */}
            {preview.columns.length > 0 && (
              <div className="border rounded-lg bg-gray-50">
                <button
                  onClick={() => setExpandedPreview(!expandedPreview)}
                  className="w-full px-3 py-2 flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  <span>Preview (first 5 rows)</span>
                  {expandedPreview ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                
                {expandedPreview && (
                  <div className="p-3 border-t overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-white">
                          {preview.columns.map((col, i) => (
                            <th
                              key={i}
                              className="px-2 py-1 text-left font-medium text-gray-600 uppercase"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {preview.rows.map((row, i) => (
                          <tr key={i} className="bg-white">
                            {row.map((cell, j) => (
                              <td key={j} className="px-2 py-1 text-gray-900">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Add more files button */}
            <button
              onClick={handleFileSelect}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gray-400 hover:text-gray-800"
            >
              + Add more files
            </button>
          </div>
        )}
      </div>
    </div>
  )
}