// UC-DISPUTES-0001: Merchant Disputes Types

export interface MerchantDispute {
  id: string
  caseRef: string
  merchantId: string
  merchantName: string
  txnId: string
  rrn?: string
  utr?: string
  reasonCode: string
  reasonDesc: string
  disputedAmountPaise: bigint
  currency: string
  status: DisputeStatus
  openedAt: string
  evidenceDueAt?: string
  lastUpdateAt: string
  canUploadEvidence: boolean
  evidenceSubmittedAt?: string
  decisionAt?: string
  outcome?: 'WON' | 'LOST'
}

export type DisputeStatus = 
  | 'OPEN' 
  | 'EVIDENCE_REQUIRED' 
  | 'SUBMITTED'
  | 'PENDING_BANK' 
  | 'WON' 
  | 'LOST'

export interface DisputeEvidence {
  id: string
  disputeId: string
  fileName: string
  fileSize: number
  mimeType: string
  evidenceType: EvidenceType
  uploadedAt: string
  uploadedBy: string
  status: 'pending' | 'uploaded' | 'submitted'
  localFile?: File
}

export type EvidenceType = 
  | 'INVOICE'
  | 'PROOF_OF_DELIVERY'
  | 'CUSTOMER_COMMS'
  | 'REFUND_PROOF'
  | 'OTHERS'

export interface DisputeSettlementImpact {
  disputeId: string
  holdAmountPaise?: bigint
  holdDate?: string
  holdBatchRef?: string
  debitAmountPaise?: bigint
  feeAmountPaise?: bigint
  gstAmountPaise?: bigint
  debitBatchRef?: string
  debitDate?: string
  releasedAmountPaise?: bigint
  releaseBatchRef?: string
  releaseDate?: string
}

export interface DisputeActivity {
  id: string
  disputeId: string
  timestamp: string
  action: string
  description: string
  actor?: string
  metadata?: Record<string, any>
}

// List filters
export interface DisputeListFilters {
  status?: DisputeStatus[]
  dateFrom?: string
  dateTo?: string
  searchQuery?: string
  cursor?: string
  limit?: number
}

// API Response types
export interface DisputeListResponse {
  disputes: MerchantDispute[]
  total: number
  cursor?: string
  hasMore: boolean
}

export interface DisputeDetailResponse {
  dispute: MerchantDispute
  evidence: DisputeEvidence[]
  settlementImpact: DisputeSettlementImpact
  activities: DisputeActivity[]
}

// Evidence upload
export interface EvidenceUploadRequest {
  files: File[]
  evidenceTypes: Record<string, EvidenceType>
}

export interface EvidenceSubmitRequest {
  disputeId: string
  evidenceIds: string[]
  notes?: string
}

// Helper functions
export function getStatusColor(status: DisputeStatus): string {
  const colors: Record<DisputeStatus, string> = {
    'OPEN': 'bg-gray-100 text-gray-800',
    'EVIDENCE_REQUIRED': 'bg-red-100 text-red-800',
    'SUBMITTED': 'bg-blue-100 text-blue-800',
    'PENDING_BANK': 'bg-yellow-100 text-yellow-800',
    'WON': 'bg-green-100 text-green-800',
    'LOST': 'bg-red-100 text-red-800'
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

export function getEvidenceTypeLabel(type: EvidenceType): string {
  const labels: Record<EvidenceType, string> = {
    'INVOICE': 'Invoice',
    'PROOF_OF_DELIVERY': 'Proof of Delivery',
    'CUSTOMER_COMMS': 'Customer Communications',
    'REFUND_PROOF': 'Refund Proof',
    'OTHERS': 'Others'
  }
  return labels[type] || 'Others'
}

export function calculateDaysUntilDue(dueDate?: string): number | null {
  if (!dueDate) return null
  const now = new Date()
  const due = new Date(dueDate)
  const diffMs = due.getTime() - now.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

export function formatDueDate(dueDate?: string): string {
  if (!dueDate) return ''
  const days = calculateDaysUntilDue(dueDate)
  if (days === null) return ''
  if (days < 0) return `Overdue by ${Math.abs(days)} days`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}

// File validation
export const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]

export const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.csv', '.xlsx']
export const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB
export const MAX_FILES = 20

export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    const ext = file.name.substring(file.name.lastIndexOf('.'))
    if (!ALLOWED_EXTENSIONS.includes(ext.toLowerCase())) {
      return { valid: false, error: `File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}` }
    }
  }
  
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File size exceeds 25MB limit` }
  }
  
  return { valid: true }
}