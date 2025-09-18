import { useState } from 'react'
import { X, Upload } from 'lucide-react'

interface UploadFileModalProps {
  isOpen: boolean
  onClose: () => void
  onUpload: (file: File, metadata: any) => void
}

export function UploadFileModal({ isOpen, onClose, onUpload }: UploadFileModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [acquirer, setAcquirer] = useState('')
  const [cycleDate, setCycleDate] = useState(new Date().toISOString().split('T')[0])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (file && acquirer) {
      onUpload(file, { acquirer, cycleDate })
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Upload Reconciliation File</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">File</label>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="mt-1 block w-full text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Acquirer</label>
              <select
                value={acquirer}
                onChange={(e) => setAcquirer(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300"
                required
              >
                <option value="">Select acquirer</option>
                <option value="ICICI Bank">ICICI Bank</option>
                <option value="HDFC Bank">HDFC Bank</option>
                <option value="SBI">SBI</option>
                <option value="Axis Bank">Axis Bank</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Cycle Date</label>
              <input
                type="date"
                value={cycleDate}
                onChange={(e) => setCycleDate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300"
                required
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Upload
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}