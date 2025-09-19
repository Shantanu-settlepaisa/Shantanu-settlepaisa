// Report Types for Finance MIS (OP-0009)

export type ReportType = 'SETTLEMENT_SUMMARY' | 'BANK_MIS' | 'RECON_OUTCOME' | 'TAX'
export type ReportFormat = 'CSV' | 'XLSX'
export type DeliveryMethod = 'EMAIL' | 'S3' | 'BOTH'
export type ScheduleStatus = 'SUCCESS' | 'FAILED' | 'RUNNING'

// Settlement Summary Report
export interface SettlementSummaryRow {
  cycleDate: string
  acquirer: string
  merchant: string
  merchantName: string
  grossAmountPaise: bigint
  grossAmountRupees: number
  feesPaise: bigint
  feesRupees: number
  gstPaise: bigint
  gstRupees: number
  tdsPaise: bigint
  tdsRupees: number
  netAmountPaise: bigint
  netAmountRupees: number
  transactionCount: number
}

// Bank MIS Report
export interface BankMISRow {
  txnId: string
  utr: string
  rrn?: string
  pgAmountPaise: bigint
  pgAmountRupees: number
  bankAmountPaise: bigint
  bankAmountRupees: number
  deltaPaise: bigint
  deltaRupees: number
  pgDate: string
  bankDate: string
  reconStatus: 'MATCHED' | 'UNMATCHED' | 'EXCEPTION'
  reasonCode?: string
  acquirer: string
  merchant: string
  merchantName: string
  paymentMethod: string
}

// Recon Outcome Report
export interface ReconOutcomeRow {
  reconJobId: string
  cycleDate: string
  txnId: string
  pgRefId?: string
  bankRefId?: string
  amountPaise: bigint
  amountRupees: number
  status: 'MATCHED' | 'UNMATCHED' | 'EXCEPTION'
  matchedAt?: string
  exceptionType?: string
  exceptionReason?: string
  merchant: string
  merchantName: string
  acquirer: string
  paymentMethod: string
}

// Tax Report
export interface TaxReportRow {
  cycleDate: string
  merchant: string
  merchantName: string
  grossAmountPaise: bigint
  grossAmountRupees: number
  commissionPaise: bigint
  commissionRupees: number
  gstRatePct: number
  gstAmountPaise: bigint
  gstAmountRupees: number
  tdsRatePct: number
  tdsAmountPaise: bigint
  tdsAmountRupees: number
  hsnCode?: string
  sacCode?: string
  invoiceNumber?: string
}

// Report Schedule
export interface ReportSchedule {
  id: string
  type: ReportType
  filters: Record<string, any>
  cadenceCron: string
  timezone: string
  format: ReportFormat
  delivery: DeliveryMethod
  recipients: string[]
  s3Prefix?: string
  isEnabled: boolean
  lastRunAt?: string
  lastRunStatus?: ScheduleStatus
  nextRunAt?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

// Report Export Audit
export interface ReportExportAudit {
  id: string
  reportType: ReportType
  filters: Record<string, any>
  format: ReportFormat
  generatedBy: string
  generatedAt: string
  objectKey?: string
  fileSizeBytes?: number
  rowCount?: number
  signature?: string
  signedUrl?: string
  expiresAt?: string
  createdAt: string
}

// Report Generation Request
export interface ReportRequest {
  type: ReportType
  filters: ReportFilters
  format: ReportFormat
  preview?: boolean
  limit?: number
}

// Report Filters
export interface ReportFilters {
  fromDate?: string
  toDate?: string
  cycleDate?: string
  acquirer?: string
  merchant?: string
  status?: 'MATCHED' | 'UNMATCHED' | 'EXCEPTION'
}

// Report Response
export interface ReportResponse {
  reportId: string
  type: ReportType
  format: ReportFormat
  rowCount: number
  generatedAt: string
  signedUrl?: string
  expiresAt?: string
  signature?: string
  preview?: any[]
}

// Export Request
export interface ExportRequest {
  reportId?: string
  type: ReportType
  filters: ReportFilters
  format: ReportFormat
}

// Export Response
export interface ExportResponse {
  exportId: string
  signedUrl: string
  expiresAt: string
  signature: string
  fileSizeBytes: number
  rowCount: number
}

// Schedule Create/Update Request
export interface ScheduleRequest {
  type: ReportType
  filters: ReportFilters
  cadenceCron: string
  timezone?: string
  format: ReportFormat
  delivery: DeliveryMethod
  recipients: string[]
  s3Prefix?: string
}

// Report Metadata (for .sig.json sidecar)
export interface ReportMetadata {
  reportId: string
  type: ReportType
  generatedAt: string
  generatorVersion: string
  filters: ReportFilters
  rowCount: number
  fileSizeBytes: number
  sha256: string
  cycleDate?: string
}