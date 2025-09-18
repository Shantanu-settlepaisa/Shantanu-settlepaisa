import { useState, useRef } from 'react'
import { X, Upload, AlertCircle, CheckCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { opsApi } from '@/lib/ops-api'

interface UploadDialogProps {
  isOpen: boolean
  onClose: () => void
  onUpload: (file: File, metadata: any) => Promise<void>
  existingJobId?: string
}

export function UploadDialog({ isOpen, onClose, onUpload, existingJobId }: UploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [createNewJob, setCreateNewJob] = useState(!existingJobId)
  const [jobData, setJobData] = useState({
    jobId: existingJobId || '',
    merchantId: 'MERCH001',
    acquirer: '',
    cycleDate: new Date().toISOString().split('T')[0],
  })
  const [checksumMd5, setChecksumMd5] = useState('')
  const [signaturePgp, setSignaturePgp] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)

  // Fetch existing jobs for dropdown
  const { data: jobs } = useQuery({
    queryKey: ['recon-jobs-list'],
    queryFn: () => opsApi.getReconJobs({ status: 'awaiting_file' }),
    enabled: isOpen && !createNewJob,
  })

  if (!isOpen) return null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      // Calculate MD5 checksum (in production, use crypto library)
      setChecksumMd5(`demo-md5-${selectedFile.name}-${selectedFile.size}`)
    }
  }

  const validateFile = (file: File): string | null => {
    const validExtensions = ['.csv', '.xlsx', '.xls']
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    
    if (!validExtensions.includes(fileExtension)) {
      return 'Invalid file type. Please upload CSV or Excel files only.'
    }
    
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      return 'File size exceeds 50MB limit.'
    }
    
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!file) {
      alert('Please select a file')
      return
    }

    const validationError = validateFile(file)
    if (validationError) {
      alert(validationError)
      return
    }

    if (!createNewJob && !jobData.jobId) {
      alert('Please select an existing job or create a new one')
      return
    }

    if (createNewJob && (!jobData.acquirer || !jobData.cycleDate)) {
      alert('Please fill in all required fields')
      return
    }

    setIsUploading(true)
    try {
      const metadata = createNewJob 
        ? {
            merchantId: jobData.merchantId,
            acquirer: jobData.acquirer,
            cycleDate: jobData.cycleDate,
            checksumMd5,
            signaturePgp: signaturePgp || undefined,
          }
        : {
            jobId: jobData.jobId,
            checksumMd5,
            signaturePgp: signaturePgp || undefined,
          }

      await onUpload(file, metadata)
      setUploadResult({ success: true, fileName: file.name })
      
      // Close after short delay to show success
      setTimeout(() => {
        onClose()
        setFile(null)
        setUploadResult(null)
      }, 1500)
    } catch (error) {
      console.error('Upload failed:', error)
      setUploadResult({ success: false, error: 'Upload failed' })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Upload Reconciliation File</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Job Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Selection
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={!createNewJob}
                    onChange={() => setCreateNewJob(false)}
                    className="mr-2"
                    disabled={!jobs?.data?.length}
                  />
                  <span>Select existing job</span>
                </label>
                {!createNewJob && (
                  <select
                    value={jobData.jobId}
                    onChange={(e) => setJobData({ ...jobData, jobId: e.target.value })}
                    className="ml-6 block w-full rounded-md border-gray-300"
                    required={!createNewJob}
                  >
                    <option value="">Select a job...</option>
                    {jobs?.data?.map((job: any) => (
                      <option key={job.id} value={job.id}>
                        {job.merchantName} - {job.acquirer} - {job.cycleDate}
                      </option>
                    ))}
                  </select>
                )}
                
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={createNewJob}
                    onChange={() => setCreateNewJob(true)}
                    className="mr-2"
                  />
                  <span>Create new job</span>
                </label>
              </div>
            </div>

            {/* New Job Fields */}
            {createNewJob && (
              <div className="ml-6 space-y-3 p-3 bg-gray-50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Merchant</label>
                  <select
                    value={jobData.merchantId}
                    onChange={(e) => setJobData({ ...jobData, merchantId: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300"
                  >
                    <option value="MERCH001">Flipkart (MERCH001)</option>
                    <option value="MERCH002">Amazon (MERCH002)</option>
                    <option value="MERCH003">Myntra (MERCH003)</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Acquirer</label>
                  <select
                    value={jobData.acquirer}
                    onChange={(e) => setJobData({ ...jobData, acquirer: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300"
                    required={createNewJob}
                  >
                    <option value="">Select acquirer...</option>
                    <option value="ICICI Bank">ICICI Bank</option>
                    <option value="HDFC Bank">HDFC Bank</option>
                    <option value="SBI">SBI</option>
                    <option value="Axis Bank">Axis Bank</option>
                    <option value="Bank of Baroda">Bank of Baroda</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Cycle Date</label>
                  <input
                    type="date"
                    value={jobData.cycleDate}
                    onChange={(e) => setJobData({ ...jobData, cycleDate: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300"
                    required={createNewJob}
                  />
                </div>
              </div>
            )}

            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                File Upload
              </label>
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                  required
                />
                {file ? (
                  <div className="flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-green-500 mr-2" />
                    <div className="text-left">
                      <p className="font-medium">{file.name}</p>
                      <p className="text-sm text-gray-500">
                        {(file.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-600">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-gray-500">CSV, XLSX up to 50MB</p>
                  </div>
                )}
              </div>
            </div>

            {/* Validation Fields */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  MD5 Checksum (Optional)
                </label>
                <input
                  type="text"
                  value={checksumMd5}
                  onChange={(e) => setChecksumMd5(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 text-sm"
                  placeholder="Auto-generated or paste here"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  PGP Signature (Optional)
                </label>
                <textarea
                  value={signaturePgp}
                  onChange={(e) => setSignaturePgp(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 text-sm"
                  rows={2}
                  placeholder="Paste PGP signature if available"
                />
              </div>
            </div>

            {/* Upload Result */}
            {uploadResult && (
              <div className={`p-3 rounded-lg flex items-center ${
                uploadResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}>
                {uploadResult.success ? (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    File uploaded successfully!
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 mr-2" />
                    {uploadResult.error}
                  </>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={isUploading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!file || isUploading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? 'Uploading...' : 'Upload File'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}