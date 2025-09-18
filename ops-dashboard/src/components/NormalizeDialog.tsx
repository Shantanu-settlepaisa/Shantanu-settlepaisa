import { useState, useEffect } from 'react'
import { X, FileText, Eye, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { opsApi } from '@/lib/ops-api'
import { formatPaiseToINR } from '@/lib/utils'
import { MappingTemplateEditor } from './MappingTemplateEditor'

interface NormalizeDialogProps {
  isOpen: boolean
  jobId: string
  fileId?: string
  onClose: () => void
  onNormalize: (jobId: string, templateId?: string) => Promise<void>
}

interface PreviewRow {
  field: string
  rawValue: string
  normalizedValue: string
  dataType: string
  status: 'valid' | 'invalid' | 'warning'
  message?: string
}

export function NormalizeDialog({ 
  isOpen, 
  jobId, 
  fileId,
  onClose, 
  onNormalize 
}: NormalizeDialogProps) {
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)
  const [preview, setPreview] = useState<{
    rows: PreviewRow[][]
    summary: {
      totalRows: number
      validRows: number
      invalidRows: number
      warningRows: number
    }
  } | null>(null)
  const [isNormalizing, setIsNormalizing] = useState(false)
  const [bankFields, setBankFields] = useState<string[]>([])

  // Fetch templates
  const { data: templates, refetch: refetchTemplates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => opsApi.getTemplates(),
    enabled: isOpen,
  })

  // Fetch file preview to get bank fields
  const { data: filePreview } = useQuery({
    queryKey: ['file-preview', fileId],
    queryFn: () => fileId ? opsApi.getFilePreview(fileId, 5) : null,
    enabled: isOpen && !!fileId,
  })

  useEffect(() => {
    if (filePreview && filePreview.length > 0) {
      setBankFields(Object.keys(filePreview[0]))
    }
  }, [filePreview])

  if (!isOpen) return null

  const handlePreview = async () => {
    if (!selectedTemplate) {
      alert('Please select a template')
      return
    }

    try {
      const result = await opsApi.normalizePreview(jobId, fileId, selectedTemplate)
      
      // Transform the preview data
      const previewRows: PreviewRow[][] = result.rows.map((row: any) => {
        return Object.entries(row.normalized).map(([field, value]) => ({
          field,
          rawValue: row.raw[field] || '',
          normalizedValue: value as string,
          dataType: row.types?.[field] || 'string',
          status: row.validations?.[field]?.status || 'valid',
          message: row.validations?.[field]?.message,
        }))
      })

      setPreview({
        rows: previewRows,
        summary: result.summary || {
          totalRows: result.totalRows || 0,
          validRows: result.validRows || 0,
          invalidRows: result.invalidRows || 0,
          warningRows: result.warningRows || 0,
        },
      })
    } catch (error) {
      console.error('Preview failed:', error)
      alert('Failed to generate preview')
    }
  }

  const handleNormalize = async () => {
    if (!selectedTemplate) {
      alert('Please select a template')
      return
    }

    setIsNormalizing(true)
    try {
      await onNormalize(jobId, selectedTemplate)
      onClose()
    } catch (error) {
      console.error('Normalization failed:', error)
      alert('Normalization failed')
    } finally {
      setIsNormalizing(false)
    }
  }

  const handleSaveTemplate = async (template: any) => {
    try {
      await opsApi.saveTemplate(template)
      await refetchTemplates()
      setShowTemplateEditor(false)
      alert('Template saved successfully')
    } catch (error) {
      console.error('Failed to save template:', error)
      alert('Failed to save template')
    }
  }

  if (showTemplateEditor) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75" />
          <div className="relative max-w-4xl w-full">
            <MappingTemplateEditor
              bankFields={bankFields}
              onSave={handleSaveTemplate}
              onCancel={() => setShowTemplateEditor(false)}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium">Normalize Data</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-8rem)]">
            {/* Template Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Mapping Template
              </label>
              <div className="flex items-center space-x-3">
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="flex-1 rounded-md border-gray-300"
                >
                  <option value="">Select a template...</option>
                  {templates?.map((template: any) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.acquirer})
                      {template.scope === 'global' && ' - Global'}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowTemplateEditor(true)}
                  className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
                >
                  <FileText className="inline w-4 h-4 mr-1" />
                  Create Template
                </button>
                <button
                  onClick={handlePreview}
                  disabled={!selectedTemplate}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Eye className="inline w-4 h-4 mr-1" />
                  Preview
                </button>
              </div>
            </div>

            {/* File Info */}
            {filePreview && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>File:</strong> {fileId} | 
                  <strong> Rows:</strong> {filePreview.length} preview (of total) | 
                  <strong> Fields:</strong> {bankFields.join(', ')}
                </p>
              </div>
            )}

            {/* Preview Results */}
            {preview && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm font-medium text-blue-900">Total Rows</p>
                    <p className="text-2xl font-bold text-blue-700">{preview.summary.totalRows}</p>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg">
                    <p className="text-sm font-medium text-green-900">Valid</p>
                    <p className="text-2xl font-bold text-green-700">{preview.summary.validRows}</p>
                  </div>
                  <div className="bg-amber-50 p-3 rounded-lg">
                    <p className="text-sm font-medium text-amber-900">Warnings</p>
                    <p className="text-2xl font-bold text-amber-700">{preview.summary.warningRows}</p>
                  </div>
                  <div className="bg-red-50 p-3 rounded-lg">
                    <p className="text-sm font-medium text-red-900">Invalid</p>
                    <p className="text-2xl font-bold text-red-700">{preview.summary.invalidRows}</p>
                  </div>
                </div>

                {/* Preview Table */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Preview (First 5 Rows)</h4>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Row</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Field</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Raw Value</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Normalized</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {preview.rows.slice(0, 5).map((row, rowIndex) => (
                            row.map((field, fieldIndex) => (
                              <tr key={`${rowIndex}-${fieldIndex}`} className={fieldIndex === 0 ? 'border-t-2 border-gray-300' : ''}>
                                {fieldIndex === 0 && (
                                  <td rowSpan={row.length} className="px-4 py-2 text-sm font-medium text-gray-900">
                                    {rowIndex + 1}
                                  </td>
                                )}
                                <td className="px-4 py-2 text-sm text-gray-900">{field.field}</td>
                                <td className="px-4 py-2 text-sm text-gray-500">{field.rawValue}</td>
                                <td className="px-4 py-2 text-sm font-medium text-gray-900">
                                  {field.dataType === 'amount' && field.normalizedValue 
                                    ? formatPaiseToINR(parseInt(field.normalizedValue))
                                    : field.normalizedValue}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-500">{field.dataType}</td>
                                <td className="px-4 py-2">
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                    field.status === 'valid' ? 'bg-green-100 text-green-800' :
                                    field.status === 'warning' ? 'bg-amber-100 text-amber-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {field.status === 'valid' && <CheckCircle className="w-3 h-3 mr-1" />}
                                    {field.status === 'warning' && <AlertCircle className="w-3 h-3 mr-1" />}
                                    {field.status === 'invalid' && <X className="w-3 h-3 mr-1" />}
                                    {field.status}
                                  </span>
                                  {field.message && (
                                    <p className="text-xs text-gray-500 mt-1">{field.message}</p>
                                  )}
                                </td>
                              </tr>
                            ))
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Validation Messages */}
                {preview.summary.invalidRows > 0 && (
                  <div className="p-4 bg-red-50 rounded-lg">
                    <div className="flex">
                      <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
                      <div>
                        <h4 className="text-sm font-medium text-red-800">Validation Issues</h4>
                        <p className="mt-1 text-sm text-red-700">
                          {preview.summary.invalidRows} rows contain invalid data that may cause issues during matching.
                          Review the errors above and adjust your template if needed.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={isNormalizing}
              >
                Cancel
              </button>
              <button
                onClick={handleNormalize}
                disabled={!selectedTemplate || !preview || isNormalizing}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isNormalizing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Normalizing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Normalize Data
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}