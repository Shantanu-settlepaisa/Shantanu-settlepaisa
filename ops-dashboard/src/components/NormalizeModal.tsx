import { useState } from 'react'
import { X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { opsApi } from '@/lib/ops-api'

interface NormalizeModalProps {
  isOpen: boolean
  jobId: string
  onClose: () => void
  onNormalize: (jobId: string, templateId?: string) => void
}

export function NormalizeModal({ isOpen, jobId, onClose, onNormalize }: NormalizeModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [preview, setPreview] = useState<any>(null)

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => opsApi.getTemplates(),
  })

  if (!isOpen) return null

  const handlePreview = async () => {
    const result = await opsApi.normalizeReconData(jobId, selectedTemplate, true)
    setPreview(result)
  }

  const handleNormalize = () => {
    onNormalize(jobId, selectedTemplate)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Normalize Data</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Select Template</label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300"
              >
                <option value="">Select a template</option>
                {templates?.map((template: any) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.acquirer})
                  </option>
                ))}
              </select>
            </div>

            {selectedTemplate && (
              <button
                onClick={handlePreview}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Preview normalization
              </button>
            )}

            {preview && (
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="text-sm font-medium mb-2">Preview</h4>
                <p className="text-sm text-gray-600">
                  Total rows: {preview.totalRows}<br />
                  Valid rows: {preview.validRows}<br />
                  Invalid rows: {preview.invalidRows}
                </p>
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleNormalize}
                disabled={!selectedTemplate}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Normalize
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}