import type {
  ReportType,
  ReportFormat,
  ReportFilters,
  ReportMetadata,
  ExportResponse
} from '@/types/reports'
import { reportGeneratorV2DB } from './report-generator-v2-db'

export class ReportExportService {
  private readonly S3_BUCKET = 'settlepaisa-reports'
  private readonly SIGNED_URL_TTL = 24 * 60 * 60 // 24 hours in seconds
  
  // Generate SHA256 signature for file (browser-compatible)
  private async generateSignature(data: string): Promise<string> {
    // Use Web Crypto API for browser compatibility
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(data)
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    return hashHex
  }

  // Convert data to CSV format
  private async toCSV(data: any[]): Promise<string> {
    if (data.length === 0) return ''
    
    const headers = Object.keys(data[0])
    const csvHeaders = headers.join(',')
    
    const csvRows = data.map(row => {
      return headers.map(header => {
        const value = row[header]
        // Handle special cases
        if (value === null || value === undefined) return ''
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value.replace(/"/g, '""')}"` // Escape quotes and wrap in quotes
        }
        if (typeof value === 'bigint') return value.toString()
        return value
      }).join(',')
    })
    
    return [csvHeaders, ...csvRows].join('\n')
  }

  // Convert data to XLSX format (mock - in production use xlsx library)
  private async toXLSX(data: any[]): Promise<string> {
    // In production, use a library like xlsx or exceljs
    // For now, return CSV with .xlsx extension (Excel can open it)
    return this.toCSV(data)
  }

  // Generate signed URL for S3 object
  private generateSignedUrl(objectKey: string): string {
    // In production, use AWS SDK to generate actual signed URL
    // For demo, return a mock URL
    const baseUrl = process.env.S3_ENDPOINT || 'http://localhost:4566'
    const expiresAt = new Date(Date.now() + this.SIGNED_URL_TTL * 1000)
    
    // Mock signed URL with expiry
    return `${baseUrl}/${this.S3_BUCKET}/${objectKey}?X-Amz-Expires=${this.SIGNED_URL_TTL}&X-Amz-SignedHeaders=host&X-Amz-Signature=mock_signature`
  }

  // Store file to S3 (mock)
  private async storeToS3(objectKey: string, content: string, contentType: string): Promise<void> {
    // In production, use AWS SDK to upload to S3
    console.log(`Storing to S3: ${objectKey} (${contentType}, ${content.length} bytes)`)
    
    // Mock storage - in production, actually upload to S3
    if (typeof window !== 'undefined') {
      // Store in localStorage for demo
      localStorage.setItem(`s3_${objectKey}`, content)
    }
  }

  // Create metadata sidecar file
  private createMetadata(
    reportType: ReportType,
    filters: ReportFilters,
    rowCount: number,
    fileSizeBytes: number,
    signature: string
  ): ReportMetadata {
    return {
      reportId: `RPT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: reportType,
      generatedAt: new Date().toISOString(),
      generatorVersion: '1.0.0',
      filters,
      rowCount,
      fileSizeBytes,
      sha256: signature,
      cycleDate: filters.cycleDate
    }
  }

  // Export report to file
  async exportReport(
    type: ReportType,
    filters: ReportFilters,
    format: ReportFormat
  ): Promise<ExportResponse> {
    // Generate report data from V2 database
    const data = await reportGeneratorV2DB.generateReport(type, filters)
    
    // Convert to requested format
    let content: string
    let contentType: string
    
    if (format === 'CSV') {
      // Use V2 DB generator's CSV method for proper formatting
      content = await reportGeneratorV2DB.generateCSV(type, filters)
      contentType = 'text/csv'
    } else {
      // For XLSX, convert data to CSV for now (can enhance later)
      content = await reportGeneratorV2DB.generateCSV(type, filters)
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
    
    // Generate file metadata
    const signature = await this.generateSignature(content)
    const fileSizeBytes = new Blob([content]).size
    const rowCount = data.length
    
    // Create object key
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const objectKey = `reports/${type.toLowerCase()}/${timestamp}_${type}.${format.toLowerCase()}`
    
    // Store to S3
    await this.storeToS3(objectKey, content, contentType)
    
    // Create and store metadata sidecar
    const metadata = this.createMetadata(type, filters, rowCount, fileSizeBytes, signature)
    const metadataKey = `${objectKey}.sig.json`
    await this.storeToS3(metadataKey, JSON.stringify(metadata, null, 2), 'application/json')
    
    // Generate signed URL
    const signedUrl = this.generateSignedUrl(objectKey)
    const expiresAt = new Date(Date.now() + this.SIGNED_URL_TTL * 1000).toISOString()
    
    return {
      exportId: metadata.reportId,
      signedUrl,
      expiresAt,
      signature,
      fileSizeBytes,
      rowCount
    }
  }

  // Download report directly (for frontend)
  async downloadReportDirect(
    type: ReportType, 
    filters: ReportFilters, 
    format: ReportFormat, 
    filename?: string
  ): void {
    if (typeof window === 'undefined') return
    
    try {
      // Generate content directly from V2 database
      const content = await reportGeneratorV2DB.generateCSV(type, filters)
      
      if (!content) {
        console.error('No data available for export')
        return
      }
      
      // Create filename if not provided
      const defaultFilename = this.generateFilename(type, filters, format)
      const actualFilename = filename || defaultFilename
      
      // Create blob and download
      const blob = new Blob([content], { 
        type: format === 'CSV' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = actualFilename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download report:', error)
      throw error
    }
  }
  
  // Generate filename for report
  private generateFilename(type: ReportType, filters: ReportFilters, format: ReportFormat): string {
    const date = filters.cycleDate || filters.fromDate || new Date().toISOString().split('T')[0]
    const acquirer = filters.acquirer && filters.acquirer !== 'all' ? `_${filters.acquirer.toLowerCase()}` : '_all'
    const reportName = type.toLowerCase().replace(/_/g, '-')
    const extension = format.toLowerCase()
    
    return `${reportName}_${date}${acquirer}.${extension}`
  }
  
  // Download report (for frontend) - legacy method
  downloadReport(signedUrl: string, filename: string): void {
    if (typeof window === 'undefined') return
    
    // Extract object key from URL (mock)
    const urlParts = signedUrl.split('/')
    const objectKey = urlParts[urlParts.length - 1].split('?')[0]
    
    // Get content from localStorage (mock)
    const content = localStorage.getItem(`s3_${objectKey}`)
    if (!content) {
      console.error('Report not found in storage')
      return
    }
    
    // Create blob and download
    const blob = new Blob([content], { 
      type: objectKey.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Get report columns for display
  getReportColumns(type: ReportType): string[] {
    switch (type) {
      case 'SETTLEMENT_SUMMARY':
        return ['cycleDate', 'acquirer', 'merchant', 'grossAmountRupees', 'feesRupees', 'gstRupees', 'tdsRupees', 'netAmountRupees', 'transactionCount']
      case 'BANK_MIS':
        return ['txnId', 'utr', 'pgAmountRupees', 'bankAmountRupees', 'deltaRupees', 'pgDate', 'bankDate', 'reconStatus', 'acquirer', 'merchant', 'paymentMethod']
      case 'RECON_OUTCOME':
        return ['txnId', 'pgRefId', 'bankRefId', 'amountRupees', 'status', 'exceptionType', 'merchant', 'acquirer', 'paymentMethod']
      case 'TAX':
        return ['cycleDate', 'merchant', 'grossAmountRupees', 'commissionRupees', 'gstRatePct', 'gstAmountRupees', 'tdsRatePct', 'tdsAmountRupees', 'invoiceNumber']
      default:
        return []
    }
  }
}

// Singleton instance
export const reportExportService = new ReportExportService()