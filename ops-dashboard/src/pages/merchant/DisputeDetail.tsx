// UC-DISPUTES-0001: Merchant Dispute Detail Page with Evidence Upload
import React, { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { 
  ArrowLeft, AlertTriangle, Clock, Upload, FileText, Trash2, 
  CheckCircle, XCircle, Send, Download, Shield, DollarSign,
  Calendar, User, Activity, Paperclip, AlertCircle, Info
} from 'lucide-react'
import { merchantDisputesService } from '@/services/merchant-disputes-service'
import type { DisputeEvidence, EvidenceType } from '@/types/merchant-disputes'
import { 
  getStatusColor, formatDueDate, calculateDaysUntilDue, 
  getEvidenceTypeLabel, validateFile, MAX_FILES, MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS
} from '@/types/merchant-disputes'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/auth'

export default function DisputeDetail() {
  const { disputeId } = useParams<{ disputeId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { user } = useAuthStore()
  
  const [isDragging, setIsDragging] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [evidenceTypes, setEvidenceTypes] = useState<Record<string, EvidenceType>>({})
  const [showSubmitDialog, setShowSubmitDialog] = useState(false)

  // Check if user can upload evidence
  const canUpload = user?.role === 'merchant-admin' || user?.role === 'merchant-ops'

  // Fetch dispute detail
  const { data, isLoading, error } = useQuery({
    queryKey: ['merchant-dispute', disputeId],
    queryFn: () => merchantDisputesService.getDisputeDetail(disputeId!),
    enabled: !!disputeId,
    refetchInterval: 30000
  })

  // Upload evidence mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ files, types }: { files: File[], types: Record<string, EvidenceType> }) => {
      return merchantDisputesService.uploadEvidence(disputeId!, files, types)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-dispute', disputeId] })
      setPendingFiles([])
      setEvidenceTypes({})
      toast.success('Evidence uploaded successfully')
    },
    onError: () => {
      toast.error('Failed to upload evidence')
    }
  })

  // Submit evidence mutation
  const submitMutation = useMutation({
    mutationFn: async (evidenceIds: string[]) => {
      return merchantDisputesService.submitEvidence(disputeId!, evidenceIds)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-dispute', disputeId] })
      setShowSubmitDialog(false)
      toast.success('Evidence submitted successfully')
    },
    onError: () => {
      toast.error('Failed to submit evidence')
    }
  })

  // Remove evidence mutation
  const removeMutation = useMutation({
    mutationFn: async (evidenceId: string) => {
      return merchantDisputesService.removeEvidence(disputeId!, evidenceId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-dispute', disputeId] })
      toast.success('Evidence removed')
    }
  })

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    if (!canUpload || !data?.dispute.canUploadEvidence) return

    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }, [canUpload, data])

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !canUpload) return
    const files = Array.from(e.target.files)
    handleFiles(files)
  }

  // Process files
  const handleFiles = (files: File[]) => {
    const currentCount = pendingFiles.length + (data?.evidence.filter(e => e.status === 'pending').length || 0)
    
    if (currentCount + files.length > MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} files allowed`)
      return
    }

    const validFiles: File[] = []
    for (const file of files) {
      const validation = validateFile(file)
      if (validation.valid) {
        validFiles.push(file)
        // Set default evidence type
        setEvidenceTypes(prev => ({ ...prev, [file.name]: 'OTHERS' }))
      } else {
        toast.error(`${file.name}: ${validation.error}`)
      }
    }

    setPendingFiles(prev => [...prev, ...validFiles])
  }

  // Remove pending file
  const removePendingFile = (fileName: string) => {
    setPendingFiles(prev => prev.filter(f => f.name !== fileName))
    setEvidenceTypes(prev => {
      const newTypes = { ...prev }
      delete newTypes[fileName]
      return newTypes
    })
  }

  // Upload pending files
  const handleUpload = async () => {
    if (pendingFiles.length === 0) return
    await uploadMutation.mutateAsync({ files: pendingFiles, types: evidenceTypes })
  }

  // Submit evidence
  const handleSubmit = () => {
    const evidenceIds = data?.evidence
      .filter(e => e.status === 'pending' || e.status === 'uploaded')
      .map(e => e.id) || []
    
    if (evidenceIds.length === 0) {
      toast.error('No evidence to submit')
      return
    }

    setShowSubmitDialog(true)
  }

  const confirmSubmit = async () => {
    const evidenceIds = data?.evidence
      .filter(e => e.status === 'pending' || e.status === 'uploaded')
      .map(e => e.id) || []
    
    await submitMutation.mutateAsync(evidenceIds)
  }

  // Format currency
  const formatCurrency = (paise: bigint | undefined) => {
    if (!paise) return '₹0.00'
    const rupees = Number(paise) / 100
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(rupees)
  }

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium">Dispute not found</h3>
            <Button className="mt-4" onClick={() => navigate('/merchant/disputes')}>
              Back to Disputes
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { dispute, evidence, settlementImpact, activities } = data
  const daysUntilDue = calculateDaysUntilDue(dispute.evidenceDueAt)
  const isUrgent = daysUntilDue !== null && daysUntilDue <= 2 && dispute.status === 'EVIDENCE_REQUIRED'

  // Add demo assets helper (dev mode only)
  const attachSampleFiles = async () => {
    if (process.env.NODE_ENV !== 'development') return
    
    // Create sample files
    const sampleFiles = [
      new File(['Invoice content'], 'invoice_sample.pdf', { type: 'application/pdf' }),
      new File(['Delivery proof'], 'delivery_proof.jpg', { type: 'image/jpeg' }),
      new File(['Customer email'], 'customer_communication.pdf', { type: 'application/pdf' })
    ]
    
    handleFiles(sampleFiles)
    
    // Set appropriate evidence types
    setEvidenceTypes({
      'invoice_sample.pdf': 'INVOICE',
      'delivery_proof.jpg': 'PROOF_OF_DELIVERY',
      'customer_communication.pdf': 'CUSTOMER_COMMS'
    })
    
    toast.success('Sample files attached')
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/merchant/disputes')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{dispute.caseRef}</h1>
            <p className="text-sm text-gray-500">Opened {format(new Date(dispute.openedAt), 'dd MMM yyyy')}</p>
          </div>
        </div>
        <Badge className={getStatusColor(dispute.status)}>
          {dispute.status.replace(/_/g, ' ')}
        </Badge>
      </div>

      {/* Evidence Due Banner */}
      {dispute.status === 'EVIDENCE_REQUIRED' && dispute.evidenceDueAt && (
        <Card className={isUrgent ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'}>
          <CardContent className="p-4 flex items-center">
            <AlertTriangle className={`h-5 w-5 ${isUrgent ? 'text-red-600' : 'text-yellow-600'} mr-3`} />
            <div className="flex-1">
              <p className={`text-sm font-medium ${isUrgent ? 'text-red-900' : 'text-yellow-900'}`}>
                Evidence {formatDueDate(dispute.evidenceDueAt)}
              </p>
              <p className={`text-xs ${isUrgent ? 'text-red-700' : 'text-yellow-700'} mt-1`}>
                Submit by {format(new Date(dispute.evidenceDueAt), 'dd MMM yyyy, hh:mm a')} IST
              </p>
            </div>
            {process.env.NODE_ENV === 'development' && (
              <Button size="sm" variant="outline" onClick={attachSampleFiles}>
                Attach Sample Files
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Dispute Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Transaction ID</p>
            <p className="font-medium">{dispute.txnId}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Amount</p>
            <p className="font-medium text-lg">{formatCurrency(dispute.disputedAmountPaise)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Reason Code</p>
            <p className="font-medium">{dispute.reasonCode}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Reason</p>
            <p className="font-medium text-sm">{dispute.reasonDesc}</p>
          </div>
          {dispute.rrn && (
            <div>
              <p className="text-sm text-gray-500">RRN</p>
              <p className="font-medium">{dispute.rrn}</p>
            </div>
          )}
          {dispute.utr && (
            <div>
              <p className="text-sm text-gray-500">UTR</p>
              <p className="font-medium">{dispute.utr}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs defaultValue="evidence" className="space-y-4">
        <TabsList>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="settlement">Settlement Impact</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
        </TabsList>

        {/* Evidence Tab */}
        <TabsContent value="evidence" className="space-y-4">
          {dispute.canUploadEvidence && canUpload && (
            <>
              {/* Upload Area */}
              <Card>
                <CardHeader>
                  <CardTitle>Upload Evidence</CardTitle>
                  <CardDescription>
                    Upload supporting documents (PDF, JPG, PNG, CSV, XLSX - max {MAX_FILES} files, 25MB each)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                      isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                  >
                    <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-sm font-medium text-gray-900">
                      Drag and drop files here, or click to browse
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      Allowed: {ALLOWED_EXTENSIONS.join(', ')}
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={ALLOWED_EXTENSIONS.join(',')}
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <Button
                      className="mt-4"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Select Files
                    </Button>
                  </div>

                  {/* Pending Files */}
                  {pendingFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="text-sm font-medium">Files to Upload</h4>
                      {pendingFiles.map(file => (
                        <div key={file.name} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                          <FileText className="h-4 w-4 text-gray-400" />
                          <span className="flex-1 text-sm">{file.name}</span>
                          <span className="text-xs text-gray-500">{formatFileSize(file.size)}</span>
                          <Select
                            value={evidenceTypes[file.name]}
                            onValueChange={(value) => setEvidenceTypes(prev => ({ ...prev, [file.name]: value as EvidenceType }))}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="INVOICE">Invoice</SelectItem>
                              <SelectItem value="PROOF_OF_DELIVERY">Proof of Delivery</SelectItem>
                              <SelectItem value="CUSTOMER_COMMS">Customer Comms</SelectItem>
                              <SelectItem value="REFUND_PROOF">Refund Proof</SelectItem>
                              <SelectItem value="OTHERS">Others</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removePendingFile(file.name)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button onClick={handleUpload} disabled={uploadMutation.isPending}>
                        {uploadMutation.isPending ? 'Uploading...' : 'Upload Files'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Evidence List */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Evidence Files</CardTitle>
                  <CardDescription>
                    {evidence.length} file{evidence.length !== 1 ? 's' : ''} uploaded
                  </CardDescription>
                </div>
                {dispute.canUploadEvidence && evidence.some(e => e.status === 'pending' || e.status === 'uploaded') && (
                  <Button onClick={handleSubmit} disabled={submitMutation.isPending}>
                    <Send className="h-4 w-4 mr-2" />
                    Submit Evidence
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {evidence.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Paperclip className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">No evidence uploaded yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {evidence.map(file => (
                    <div key={file.id} className="flex items-center gap-2 p-3 border rounded">
                      <FileText className="h-5 w-5 text-gray-400" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{file.fileName}</p>
                        <p className="text-xs text-gray-500">
                          {getEvidenceTypeLabel(file.evidenceType)} • {formatFileSize(file.fileSize)} • 
                          Uploaded {format(new Date(file.uploadedAt), 'dd MMM yyyy')}
                        </p>
                      </div>
                      <Badge variant={file.status === 'submitted' ? 'default' : 'secondary'}>
                        {file.status}
                      </Badge>
                      {file.status === 'pending' && dispute.canUploadEvidence && canUpload && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeMutation.mutate(file.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {dispute.evidenceSubmittedAt && (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4 flex items-center">
                <CheckCircle className="h-5 w-5 text-green-600 mr-3" />
                <div>
                  <p className="text-sm font-medium text-green-900">Evidence Submitted</p>
                  <p className="text-xs text-green-700">
                    Submitted on {format(new Date(dispute.evidenceSubmittedAt), 'dd MMM yyyy, hh:mm a')} IST
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Settlement Impact Tab */}
        <TabsContent value="settlement">
          <Card>
            <CardHeader>
              <CardTitle>Settlement Impact</CardTitle>
              <CardDescription>
                Financial impact of this dispute on your settlements
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Hold Information */}
              {settlementImpact.holdAmountPaise && (
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-yellow-900">Reserve Hold</p>
                      <p className="text-2xl font-bold text-yellow-900 mt-1">
                        {formatCurrency(settlementImpact.holdAmountPaise)}
                      </p>
                      <p className="text-sm text-yellow-700 mt-2">
                        Hold Date: {settlementImpact.holdDate ? format(new Date(settlementImpact.holdDate), 'dd MMM yyyy') : 'N/A'}
                      </p>
                      <p className="text-xs text-yellow-600">
                        Batch: {settlementImpact.holdBatchRef || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Release Information (Won) */}
              {dispute.outcome === 'WON' && settlementImpact.releasedAmountPaise && (
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-green-900">Amount Released</p>
                      <p className="text-2xl font-bold text-green-900 mt-1">
                        {formatCurrency(settlementImpact.releasedAmountPaise)}
                      </p>
                      <p className="text-sm text-green-700 mt-2">
                        Release Date: {settlementImpact.releaseDate ? format(new Date(settlementImpact.releaseDate), 'dd MMM yyyy') : 'N/A'}
                      </p>
                      <p className="text-xs text-green-600">
                        Batch: {settlementImpact.releaseBatchRef || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Debit Information (Lost) */}
              {dispute.outcome === 'LOST' && settlementImpact.debitAmountPaise && (
                <div className="p-4 bg-red-50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-red-900">Amount Debited</p>
                      <div className="space-y-2 mt-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-red-700">Dispute Amount:</span>
                          <span className="font-medium text-red-900">{formatCurrency(settlementImpact.debitAmountPaise)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-red-700">Processing Fee:</span>
                          <span className="font-medium text-red-900">{formatCurrency(settlementImpact.feeAmountPaise || 0n)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-red-700">GST (18%):</span>
                          <span className="font-medium text-red-900">{formatCurrency(settlementImpact.gstAmountPaise || 0n)}</span>
                        </div>
                        <div className="border-t pt-2 flex justify-between">
                          <span className="font-medium text-red-900">Total Debit:</span>
                          <span className="text-xl font-bold text-red-900">
                            {formatCurrency(
                              (settlementImpact.debitAmountPaise || 0n) + 
                              (settlementImpact.feeAmountPaise || 0n) + 
                              (settlementImpact.gstAmountPaise || 0n)
                            )}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-red-700 mt-3">
                        Debit Date: {settlementImpact.debitDate ? format(new Date(settlementImpact.debitDate), 'dd MMM yyyy') : 'N/A'}
                      </p>
                      <p className="text-xs text-red-600">
                        Batch: {settlementImpact.debitBatchRef || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!settlementImpact.holdAmountPaise && !settlementImpact.releasedAmountPaise && !settlementImpact.debitAmountPaise && (
                <div className="text-center py-8 text-gray-500">
                  <Info className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">No settlement impact yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Log Tab */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>
                Complete timeline of dispute events
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Activity className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">No activities recorded</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activities.map((activity, index) => (
                    <div key={activity.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full ${
                          activity.action === 'DECISION_RECEIVED' 
                            ? activity.metadata?.outcome === 'WON' 
                              ? 'bg-green-500' 
                              : 'bg-red-500'
                            : activity.action === 'EVIDENCE_SUBMITTED'
                            ? 'bg-blue-500'
                            : 'bg-gray-400'
                        }`} />
                        {index < activities.length - 1 && (
                          <div className="w-0.5 h-16 bg-gray-200 mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <p className="font-medium text-gray-900">{activity.description}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {format(new Date(activity.timestamp), 'dd MMM yyyy, hh:mm a')} IST
                          {activity.actor && ` • ${activity.actor}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Submit Confirmation Dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Evidence</DialogTitle>
            <DialogDescription>
              Are you sure you want to submit the evidence? Once submitted, you cannot add or remove files.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              {evidence.filter(e => e.status === 'pending' || e.status === 'uploaded').length} file(s) will be submitted
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmSubmit} disabled={submitMutation.isPending}>
              {submitMutation.isPending ? 'Submitting...' : 'Confirm Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}