// Chargeback Types for OP-0011

// Chargeback Status Enum
export type ChargebackStatus = 
  | 'OPEN' 
  | 'EVIDENCE_REQUIRED' 
  | 'REPRESENTMENT_SUBMITTED' 
  | 'PENDING_BANK' 
  | 'WON' 
  | 'LOST' 
  | 'CANCELLED'

// Chargeback Category
export type ChargebackCategory = 
  | 'FRAUD' 
  | 'QUALITY' 
  | 'PROCESSING' 
  | 'AUTHORIZATION' 
  | 'NON_RECEIPT'
  | 'OTHER'

// Allocation Type
export type AllocationType = 
  | 'RESERVE_HOLD' 
  | 'RESERVE_RELEASE' 
  | 'LOSS_ADJUSTMENT'

// Network Type
export type NetworkType = 
  | 'VISA' 
  | 'MASTERCARD' 
  | 'RUPAY' 
  | 'UPI' 
  | 'AMEX' 
  | 'DINERS'
  | 'OTHER'

// Main Chargeback Entity
export interface Chargeback {
  id: string
  merchantId: string
  merchantName: string
  acquirer: string
  network: NetworkType
  caseRef: string // Unique case reference from acquirer
  txnId: string // Gateway transaction ID
  rrn?: string // Retrieval Reference Number
  utr?: string // Unique Transaction Reference
  pgRef?: string // Payment Gateway Reference
  reasonCode: string
  reasonDesc: string
  category: ChargebackCategory
  disputedAmountPaise: bigint
  currency: string
  status: ChargebackStatus
  openedAt: string // ISO timestamp
  evidenceDueAt?: string // ISO timestamp
  decisionAt?: string // ISO timestamp
  ownerUserId?: string
  ownerEmail?: string
  createdAt: string
  updatedAt: string
}

// Chargeback Event (Timeline)
export interface ChargebackEvent {
  id: string
  chargebackId: string
  ts: string // Timestamp
  actorEmail: string
  action: string
  payload?: Record<string, any>
}

// Evidence File
export interface ChargebackEvidenceFile {
  id: string
  chargebackId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  storageUrl: string
  uploadedBy: string
  uploadedAt: string
}

// Ledger Allocation
export interface ChargebackAllocation {
  id: string
  chargebackId: string
  journalEntryId: string
  type: AllocationType
  amountPaise: bigint
  createdAt: string
}

// Transaction Details (for display)
export interface ChargebackTransaction {
  txnId: string
  originalAmountPaise: bigint
  feePaise: bigint
  taxPaise: bigint
  netAmountPaise: bigint
  paymentMethod: string
  paymentDate: string
  settlementDate?: string
  customerEmail?: string
  customerPhone?: string
  orderId?: string
}

// API Request/Response Types

// Intake Request
export interface ChargebackIntakeRequest {
  caseRef: string
  merchantId: string
  acquirer: string
  network: NetworkType
  txnId: string
  rrn?: string
  utr?: string
  reasonCode: string
  reasonDesc: string
  category: ChargebackCategory
  disputedAmountPaise: bigint
  currency: string
  openedAt: string
  evidenceDueAt?: string
  idempotencyKey?: string
}

// List Request
export interface ChargebackListRequest {
  merchantId?: string
  acquirer?: string
  status?: ChargebackStatus[]
  category?: ChargebackCategory[]
  ownerUserId?: string
  dateFrom?: string
  dateTo?: string
  searchQuery?: string // Search by caseRef, txnId, rrn, utr
  cursor?: string
  limit?: number
  sortBy?: 'openedAt' | 'evidenceDueAt' | 'disputedAmount'
  sortOrder?: 'asc' | 'desc'
}

// Status Update Request
export interface ChargebackStatusUpdateRequest {
  status: ChargebackStatus
  reason?: string
  actorEmail: string
  idempotencyKey?: string
}

// Assign Request
export interface ChargebackAssignRequest {
  ownerUserId: string
  ownerEmail: string
  actorEmail: string
}

// Evidence Upload Request
export interface ChargebackEvidenceUploadRequest {
  files: File[]
  uploadedBy: string
  notes?: string
}

// Representment Request
export interface ChargebackRepresentmentRequest {
  evidenceIds: string[]
  representmentNotes: string
  submittedBy: string
  idempotencyKey?: string
}

// Decision Request
export interface ChargebackDecisionRequest {
  outcome: 'WON' | 'LOST'
  decisionNotes?: string
  decisionAt?: string
  actorEmail: string
  idempotencyKey?: string
}

// Response Types

// Chargeback Detail Response
export interface ChargebackDetailResponse {
  chargeback: Chargeback
  transaction?: ChargebackTransaction
  timeline: ChargebackEvent[]
  evidence: ChargebackEvidenceFile[]
  allocations: ChargebackAllocation[]
  settlementImpact?: {
    reserveHoldPaise?: bigint
    adjustmentPaise?: bigint
    settlementBatchId?: string
    impactDate?: string
  }
}

// List Response
export interface ChargebackListResponse {
  chargebacks: Chargeback[]
  total: number
  cursor?: string
  hasMore: boolean
}

// KPI Response
export interface ChargebackKPIResponse {
  openCount: number
  evidenceRequiredCount: number
  dueTodayCount: number
  overdueCount: number
  wonLast7Days: number
  lostLast7Days: number
  wonLast30Days: number
  lostLast30Days: number
  totalDisputedPaise: bigint
  winRate7Days: number // percentage
  winRate30Days: number // percentage
  avgResolutionTimeDays: number
}

// Notification Types
export interface ChargebackNotification {
  type: 'NEW_CHARGEBACK' | 'EVIDENCE_DUE_SOON' | 'EVIDENCE_OVERDUE' | 'DECISION_RECEIVED'
  chargebackId: string
  merchantId: string
  merchantEmail?: string
  caseRef: string
  message: string
  metadata?: Record<string, any>
  scheduledAt?: string
  sentAt?: string
}

// Connector Configuration
export interface ChargebackConnectorConfig {
  id: string
  name: string
  type: 'CHARGEBACK_SFTP' | 'CHARGEBACK_API'
  acquirer: string
  enabled: boolean
  schedule?: string // Cron expression
  sftpConfig?: {
    host: string
    port: number
    username: string
    pathPattern: string // e.g., CB_{yyyyMMdd}.csv
  }
  apiConfig?: {
    baseUrl: string
    authType: 'bearer' | 'basic' | 'apikey'
    endpoint: string
  }
  mappingTemplateId: string
  lastRunAt?: string
  lastSuccessAt?: string
}

// Mapping Template for normalization
export interface ChargebackMappingTemplate {
  id: string
  name: string
  acquirer: string
  fieldMap: {
    caseRef: string
    txnId: string
    rrn?: string
    utr?: string
    reasonCode: string
    reasonDesc?: string
    disputedAmount: string
    currency?: string
    openedAt: string
    evidenceDueAt?: string
  }
  dateFormats?: Record<string, string>
  amountParser?: {
    type: 'inr_to_paise' | 'decimal_to_paise' | 'cents_to_paise'
    decimalPlaces?: number
  }
}

// Dashboard Stats
export interface ChargebackDashboardStats {
  kpis: ChargebackKPIResponse
  statusDistribution: Array<{
    status: ChargebackStatus
    count: number
    amountPaise: bigint
  }>
  categoryDistribution: Array<{
    category: ChargebackCategory
    count: number
    percentage: number
  }>
  acquirerDistribution: Array<{
    acquirer: string
    count: number
    winRate: number
  }>
  agingBuckets: {
    due0to3Days: number
    due4to7Days: number
    due8to14Days: number
    overdue: number
  }
}

// Export Request
export interface ChargebackExportRequest {
  filters: ChargebackListRequest
  format: 'CSV' | 'XLSX'
  columns?: string[]
}

// Helper Types
export interface ChargebackSummary {
  id: string
  caseRef: string
  merchantName: string
  txnId: string
  reasonCode: string
  disputedAmountPaise: bigint
  status: ChargebackStatus
  evidenceDueAt?: string
  daysUntilDue?: number
  isOverdue: boolean
  ownerEmail?: string
  lastUpdateAt: string
}

// Status Transition Rules
export const VALID_STATUS_TRANSITIONS: Record<ChargebackStatus, ChargebackStatus[]> = {
  'OPEN': ['EVIDENCE_REQUIRED', 'CANCELLED', 'WON', 'LOST'],
  'EVIDENCE_REQUIRED': ['REPRESENTMENT_SUBMITTED', 'CANCELLED', 'LOST'],
  'REPRESENTMENT_SUBMITTED': ['PENDING_BANK', 'WON', 'LOST'],
  'PENDING_BANK': ['WON', 'LOST'],
  'WON': [],
  'LOST': [],
  'CANCELLED': []
}

// Reason Code Categories Mapping
export const REASON_CODE_CATEGORIES: Record<string, ChargebackCategory> = {
  // Visa codes
  '10.1': 'FRAUD',
  '10.2': 'FRAUD',
  '10.3': 'FRAUD',
  '10.4': 'FRAUD',
  '10.5': 'FRAUD',
  '11.1': 'AUTHORIZATION',
  '11.2': 'AUTHORIZATION',
  '11.3': 'AUTHORIZATION',
  '12.1': 'PROCESSING',
  '12.2': 'PROCESSING',
  '12.3': 'PROCESSING',
  '13.1': 'QUALITY',
  '13.2': 'QUALITY',
  '13.3': 'QUALITY',
  '13.4': 'NON_RECEIPT',
  '13.5': 'NON_RECEIPT',
  
  // Mastercard codes
  '4837': 'FRAUD',
  '4840': 'FRAUD',
  '4849': 'FRAUD',
  '4853': 'QUALITY',
  '4855': 'NON_RECEIPT',
  '4859': 'QUALITY',
  '4860': 'AUTHORIZATION',
  '4863': 'FRAUD',
  
  // UPI codes
  'U001': 'PROCESSING',
  'U002': 'FRAUD',
  'U003': 'QUALITY',
  'U004': 'NON_RECEIPT'
}