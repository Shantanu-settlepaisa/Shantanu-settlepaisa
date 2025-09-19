// Exception Management Types

export type ExceptionStatus = 
  | 'open' 
  | 'investigating' 
  | 'snoozed' 
  | 'resolved' 
  | 'wont_fix' 
  | 'escalated'

export type ExceptionSeverity = 'low' | 'medium' | 'high' | 'critical'

export type ExceptionReason = 
  | 'AMOUNT_MISMATCH'
  | 'DATE_MISMATCH'
  | 'FEE_MISMATCH'
  | 'BANK_FILE_AWAITED'
  | 'PG_ONLY'
  | 'BANK_ONLY'
  | 'DUPLICATE'
  | 'REFUND_PENDING'
  | 'MISSING_UTR'
  | 'STATUS_MISMATCH'
  | 'MERCHANT_MISMATCH'

export type BulkAction = 
  | 'assign'
  | 'investigate'
  | 'resolve'
  | 'wont_fix'
  | 'snooze'
  | 'escalate'
  | 'tag'
  | 'reprocess'

export interface Exception {
  id: string
  exceptionCode: string
  merchantId: string
  merchantName: string
  acquirerCode: string
  cycleDate: string
  reason: ExceptionReason
  status: ExceptionStatus
  severity: ExceptionSeverity
  
  // Money fields (in paise)
  pgAmount: number
  bankAmount: number
  amountDelta: number
  
  // Transaction details
  pgTransactionId?: string
  bankReferenceId?: string
  utr?: string
  
  // Workflow fields
  assignedTo?: string
  assignedToName?: string
  tags: string[]
  snoozeUntil?: string
  slaDueAt: string
  lastTransitionAt: string
  
  // Source info
  sourceJobId: string
  pgRowId?: string
  bankRowId?: string
  
  // Metadata
  ruleApplied?: string
  notes?: any
  createdAt: string
  updatedAt: string
}

export interface ExceptionDetail extends Exception {
  pgData?: Record<string, any>
  bankData?: Record<string, any>
  variance?: Record<string, any>
  timeline: ExceptionAction[]
  relatedMatches?: any[]
  suggestions?: string[]
}

export interface ExceptionAction {
  id: string
  exceptionId: string
  userId: string
  userName: string
  action: string
  timestamp: string
  before?: Record<string, any>
  after?: Record<string, any>
  note?: string
}

export interface ExceptionRule {
  id: string
  name: string
  priority: number
  enabled: boolean
  scope: RuleScope
  actions: RuleAction[]
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  lastAppliedAt?: string
  appliedCount: number
}

export interface RuleScope {
  reasonCodes?: ExceptionReason[]
  amountDeltaGt?: number
  amountDeltaLt?: number
  ageGt?: number // hours
  ageLt?: number
  acquirers?: string[]
  merchantIds?: string[]
  tagsIncludes?: string[]
  tagsExcludes?: string[]
  statusIn?: ExceptionStatus[]
  severityIn?: ExceptionSeverity[]
}

export interface RuleAction {
  type: 'assign' | 'setSeverity' | 'addTag' | 'removeTag' | 'resolve' | 'snooze' | 'reprocess'
  params: Record<string, any>
}

export interface SavedView {
  id: string
  name: string
  description?: string
  query: ExceptionQuery
  ownerId: string
  ownerName: string
  shared: boolean
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
  useCount: number
}

export interface ExceptionQuery {
  q?: string
  status?: ExceptionStatus[]
  reason?: ExceptionReason[]
  merchantId?: string
  acquirer?: string
  severity?: ExceptionSeverity[]
  assignedTo?: string
  tags?: string[]
  dateFrom?: string
  dateTo?: string
  amountDeltaGt?: number
  amountDeltaLt?: number
  slaBreached?: boolean
}

export interface ExceptionListResponse {
  counts: {
    byStatus: Record<ExceptionStatus, number>
    bySeverity: Record<ExceptionSeverity, number>
    byReason: Record<ExceptionReason, number>
    slaBreached: number
    total: number
  }
  items: Exception[]
  cursor?: string
  hasMore: boolean
}

export interface BulkActionRequest {
  ids: string[]
  action: BulkAction
  params?: {
    assignTo?: string
    severity?: ExceptionSeverity
    tags?: string[]
    snoozeUntil?: string
    resolutionNote?: string
  }
  note?: string
}

export interface ExportRequest {
  query: ExceptionQuery
  format: 'csv' | 'xlsx'
  columns?: string[]
  template?: 'summary' | 'full' | 'sla_breaches'
}

export interface ExportResponse {
  url: string
  expiresAt: string
  fileName: string
  rowCount: number
}

// SLA Configuration
export interface SLAConfig {
  reason: ExceptionReason
  severity: ExceptionSeverity
  hoursToResolve: number
}

// Default SLA configurations
export const DEFAULT_SLA_CONFIGS: SLAConfig[] = [
  { reason: 'AMOUNT_MISMATCH', severity: 'critical', hoursToResolve: 4 },
  { reason: 'AMOUNT_MISMATCH', severity: 'high', hoursToResolve: 8 },
  { reason: 'AMOUNT_MISMATCH', severity: 'medium', hoursToResolve: 24 },
  { reason: 'AMOUNT_MISMATCH', severity: 'low', hoursToResolve: 48 },
  { reason: 'BANK_FILE_AWAITED', severity: 'high', hoursToResolve: 12 },
  { reason: 'BANK_FILE_AWAITED', severity: 'medium', hoursToResolve: 24 },
  { reason: 'BANK_FILE_AWAITED', severity: 'low', hoursToResolve: 72 },
  { reason: 'FEE_MISMATCH', severity: 'medium', hoursToResolve: 48 },
  { reason: 'DATE_MISMATCH', severity: 'low', hoursToResolve: 72 },
]