import { apiClient } from './api-client'
import { v4 as uuidv4 } from 'uuid'
import { computeSnapshot, overviewBus } from '../services/overview-aggregator'
import type { OverviewSnapshot } from '../types/overview'

const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === 'true'

// Extended types for reconciliation
export interface ReconJob {
  id: string
  merchantId: string
  merchantName: string
  acquirer: string
  cycleDate: string
  status: 'awaiting_file' | 'ingested' | 'normalized' | 'matching' | 'exceptions' | 'resolved'
  fileCount: number
  lastUpdated: string
  slaStatus: 'on_track' | 'at_risk' | 'breached'
  matchedCount?: number
  unmatchedCount?: number
  exceptionCount?: number
}

export interface MappingTemplate {
  id: string
  name: string
  scope: 'global' | 'merchant'
  acquirer: string
  fieldMap: Record<string, string>
  dateFormats: Record<string, string>
  amountParsers: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface FileUploadResult {
  fileId: string
  rowsIngested: number
  status: string
  message?: string
}

export interface NormalizePreviewResult {
  rows: Array<{
    raw: Record<string, any>
    normalized: Record<string, any>
    types?: Record<string, string>
    validations?: Record<string, { status: string; message?: string }>
  }>
  summary: {
    totalRows: number
    validRows: number
    invalidRows: number
    warningRows: number
  }
}

export interface MatchResult {
  matched: number
  unmatched: number
  exceptionsCount: number
  variancePaise: number
  confidence: number
}

// Mock implementations
const mockTemplates: MappingTemplate[] = [
  {
    id: 'tmpl-001',
    name: 'ICICI NEFT v1',
    scope: 'global',
    acquirer: 'ICICI Bank',
    fieldMap: {
      'UTR': 'utr',
      'TXN_ID': 'bank_txn_id',
      'AMOUNT_INR': 'amount',
      'FEE_INR': 'fee',
      'GST_INR': 'tax',
      'TXN_DATE': 'txn_time',
      'STATUS': 'bank_status',
    },
    dateFormats: {
      'TXN_DATE': 'dd-MMM-yy HH:mm:ss',
    },
    amountParsers: {
      'AMOUNT_INR': { type: 'inr_to_paise' },
      'FEE_INR': { type: 'inr_to_paise' },
      'GST_INR': { type: 'inr_to_paise' },
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-05T00:00:00Z',
  },
  {
    id: 'tmpl-002',
    name: 'BOB RTGS v2',
    scope: 'global',
    acquirer: 'Bank of Baroda',
    fieldMap: {
      'ReferenceNo': 'utr',
      'RRN': 'rrn',
      'Amount (₹)': 'amount',
      'Charges (₹)': 'fee',
      'Tax (₹)': 'tax',
      'TxnDateTime': 'txn_time',
      'TxnStatus': 'bank_status',
    },
    dateFormats: {
      'TxnDateTime': 'yyyy-MM-dd HH:mm:ss',
    },
    amountParsers: {
      'Amount (₹)': { type: 'inr_to_paise' },
      'Charges (₹)': { type: 'inr_to_paise' },
      'Tax (₹)': { type: 'inr_to_paise' },
    },
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-06T00:00:00Z',
  },
  {
    id: 'tmpl-003',
    name: 'AXIS BANK',
    scope: 'global',
    acquirer: 'AXIS',
    fieldMap: {
      'transaction_id': 'TXNID',
      'payee_amount': 'NET_CR_AMT',
      'paid_amount': 'CREDIT_AMT',
      'transaction_date_time': 'VALUE_DATE',
      'payment_date_time': 'POST_DATE',
      'bank_name': 'BANK',
      'utr': 'UTR',
      'rrn': 'RRN',
      'approval_code': 'AUTH',
      'settlement_status': 'STATUS',
      'remarks': 'REMARKS'
    },
    dateFormats: {
      'VALUE_DATE': 'yyyy-MM-dd',
      'POST_DATE': 'yyyy-MM-dd',
    },
    amountParsers: {
      'CREDIT_AMT': { type: 'inr_to_paise' },
      'NET_CR_AMT': { type: 'inr_to_paise' },
    },
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-07T00:00:00Z',
  },
]

// Extended API client
export class OpsApiExtended {
  // Job Management
  async createReconJob(data: {
    merchantId: string
    acquirer: string
    cycleDate: string
  }): Promise<{ jobId: string }> {
    if (USE_MOCK_API) {
      return { jobId: `job-${Date.now()}` }
    }
    const response = await apiClient.post('/ops/recon/jobs', data)
    return response.data
  }

  async getReconJobs(params?: any): Promise<{ data: ReconJob[]; total: number; hasMore: boolean }> {
    if (USE_MOCK_API) {
      // Return mock jobs with sample reconciliation data
      const jobs: ReconJob[] = [
        {
          id: 'job-001',
          merchantId: 'MERCH001',
          merchantName: 'Flipkart',
          acquirer: 'ICICI Bank',
          cycleDate: '2025-09-11',
          status: 'resolved',
          fileCount: 2,
          lastUpdated: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          slaStatus: 'on_track',
          matchedCount: 4523,
          unmatchedCount: 12,
          exceptionCount: 3,
        },
        {
          id: 'job-002',
          merchantId: 'MERCH002',
          merchantName: 'Amazon',
          acquirer: 'HDFC Bank',
          cycleDate: '2025-09-11',
          status: 'exceptions',
          fileCount: 2,
          lastUpdated: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          slaStatus: 'at_risk',
          matchedCount: 8921,
          unmatchedCount: 45,
          exceptionCount: 8,
        },
        {
          id: 'job-003',
          merchantId: 'MERCH003',
          merchantName: 'Paytm',
          acquirer: 'Axis Bank',
          cycleDate: '2025-09-11',
          status: 'matching',
          fileCount: 2,
          lastUpdated: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          slaStatus: 'on_track',
          matchedCount: 2341,
          unmatchedCount: 23,
        },
        {
          id: 'job-004',
          merchantId: 'MERCH004',
          merchantName: 'Swiggy',
          acquirer: 'SBI',
          cycleDate: '2025-09-11',
          status: 'normalized',
          fileCount: 1,
          lastUpdated: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
          slaStatus: 'on_track',
        },
        {
          id: 'job-005',
          merchantId: 'MERCH005',
          merchantName: 'Zomato',
          acquirer: 'Kotak Bank',
          cycleDate: '2025-09-11',
          status: 'ingested',
          fileCount: 1,
          lastUpdated: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          slaStatus: 'on_track',
        },
        {
          id: 'job-006',
          merchantId: 'MERCH006',
          merchantName: 'Myntra',
          acquirer: 'ICICI Bank',
          cycleDate: '2025-09-10',
          status: 'resolved',
          fileCount: 2,
          lastUpdated: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          slaStatus: 'on_track',
          matchedCount: 6782,
          unmatchedCount: 5,
          exceptionCount: 0,
        },
        {
          id: 'job-007',
          merchantId: 'MERCH007',
          merchantName: 'BookMyShow',
          acquirer: 'HDFC Bank',
          cycleDate: '2025-09-10',
          status: 'resolved',
          fileCount: 2,
          lastUpdated: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
          slaStatus: 'on_track',
          matchedCount: 3421,
          unmatchedCount: 8,
          exceptionCount: 1,
        },
        {
          id: 'job-008',
          merchantId: 'MERCH001',
          merchantName: 'Flipkart',
          acquirer: 'ICICI Bank',
          cycleDate: '2025-09-12',
          status: 'awaiting_file',
          fileCount: 0,
          lastUpdated: new Date().toISOString(),
          slaStatus: 'on_track',
        },
      ]
      
      // Apply filters if provided
      let filteredJobs = [...jobs]
      if (params) {
        if (params.status) {
          filteredJobs = filteredJobs.filter(j => j.status === params.status)
        }
        if (params.acquirer) {
          filteredJobs = filteredJobs.filter(j => j.acquirer === params.acquirer)
        }
        if (params.merchant) {
          filteredJobs = filteredJobs.filter(j => j.merchantId === params.merchant)
        }
      }
      
      return { data: filteredJobs, total: filteredJobs.length, hasMore: false }
    }
    const response = await apiClient.get('/ops/recon/jobs', { params })
    return response.data
  }

  // File Upload
  async uploadReconFile(
    file: File,
    metadata: {
      jobId?: string
      merchantId?: string
      acquirer?: string
      cycleDate?: string
      checksumMd5?: string
      signaturePgp?: string
    }
  ): Promise<FileUploadResult> {
    if (USE_MOCK_API) {
      // Parse CSV to count rows
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      const rowCount = lines.length - 1 // Exclude header
      
      return {
        fileId: `file-${Date.now()}`,
        rowsIngested: rowCount,
        status: 'success',
        message: `Successfully uploaded ${file.name}`,
      }
    }

    const formData = new FormData()
    formData.append('file', file)
    Object.entries(metadata).forEach(([key, value]) => {
      if (value) formData.append(key, value)
    })

    const response = await apiClient.post('/ops/recon/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }

  // File Preview
  async getFilePreview(fileId: string, limit: number = 20): Promise<any[]> {
    if (USE_MOCK_API) {
      // Return mock preview data
      return [
        {
          TXN_ID: 'TXN20240114001',
          UTR: 'ICICINEFT2024011410001',
          AMOUNT_INR: '125000.00',
          FEE_INR: '1250.00',
          GST_INR: '225.00',
          STATUS: 'SUCCESS',
          TXN_DATE: '14-Jan-24 10:22:05',
        },
        {
          TXN_ID: 'TXN20240114002',
          UTR: 'ICICINEFT2024011410002',
          AMOUNT_INR: '89500.50',
          FEE_INR: '895.00',
          GST_INR: '161.10',
          STATUS: 'SUCCESS',
          TXN_DATE: '14-Jan-24 10:35:12',
        },
      ]
    }
    const response = await apiClient.get(`/ops/recon/files/${fileId}/preview`, {
      params: { limit },
    })
    return response.data
  }

  // Templates
  async getTemplates(params?: { merchantId?: string; acquirer?: string }): Promise<MappingTemplate[]> {
    if (USE_MOCK_API) {
      return mockTemplates
    }
    const response = await apiClient.get('/ops/recon/templates', { params })
    return response.data
  }

  async saveTemplate(template: Partial<MappingTemplate>): Promise<MappingTemplate> {
    if (USE_MOCK_API) {
      const newTemplate = {
        ...template,
        id: `tmpl-${Date.now()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as MappingTemplate
      mockTemplates.push(newTemplate)
      return newTemplate
    }
    const response = await apiClient.post('/ops/recon/templates', template)
    return response.data
  }

  async updateTemplate(id: string, updates: Partial<MappingTemplate>): Promise<MappingTemplate> {
    if (USE_MOCK_API) {
      const index = mockTemplates.findIndex(t => t.id === id)
      if (index >= 0) {
        mockTemplates[index] = {
          ...mockTemplates[index],
          ...updates,
          updatedAt: new Date().toISOString(),
        }
        return mockTemplates[index]
      }
      throw new Error('Template not found')
    }
    const response = await apiClient.patch(`/ops/recon/templates/${id}`, updates)
    return response.data
  }

  // Normalization
  async normalizePreview(
    jobId: string,
    fileId?: string,
    templateId?: string
  ): Promise<NormalizePreviewResult> {
    if (USE_MOCK_API) {
      // Mock normalization preview
      return {
        rows: [
          {
            raw: {
              TXN_ID: 'TXN20240114001',
              UTR: 'ICICINEFT2024011410001',
              AMOUNT_INR: '125000.00',
              FEE_INR: '1250.00',
              GST_INR: '225.00',
              STATUS: 'SUCCESS',
              TXN_DATE: '14-Jan-24 10:22:05',
            },
            normalized: {
              bank_txn_id: 'TXN20240114001',
              utr: 'ICICINEFT2024011410001',
              amount: '12500000', // in paise
              fee: '125000',
              tax: '22500',
              bank_status: 'SUCCESS',
              txn_time: '2024-01-14T10:22:05Z',
            },
            types: {
              amount: 'amount',
              fee: 'amount',
              tax: 'amount',
              txn_time: 'date',
            },
            validations: {
              amount: { status: 'valid' },
              fee: { status: 'valid' },
              tax: { status: 'valid' },
              txn_time: { status: 'valid' },
            },
          },
        ],
        summary: {
          totalRows: 15,
          validRows: 14,
          invalidRows: 0,
          warningRows: 1,
        },
      }
    }
    const response = await apiClient.post('/ops/recon/normalize', {
      jobId,
      fileId,
      templateId,
      dryRun: true,
    })
    return response.data
  }

  async normalizeReconData(
    jobId: string,
    fileId?: string,
    templateId?: string
  ): Promise<{ success: boolean; normalizedRows: number }> {
    if (USE_MOCK_API) {
      return { success: true, normalizedRows: 15 }
    }
    const response = await apiClient.post('/ops/recon/normalize', {
      jobId,
      fileId,
      templateId,
    })
    return response.data
  }

  // Matching
  async matchReconData(
    jobId: string,
    tolerances: { amountPaise: number; minutes: number }
  ): Promise<MatchResult> {
    if (USE_MOCK_API) {
      return {
        matched: 13,
        unmatched: 2,
        exceptionsCount: 1,
        variancePaise: -50000, // ₹500 short
        confidence: 87,
      }
    }
    const response = await apiClient.post('/ops/recon/match', {
      jobId,
      tolerances,
    })
    return response.data
  }

  async getMatchSummary(jobId: string): Promise<MatchResult> {
    if (USE_MOCK_API) {
      return {
        matched: 13,
        unmatched: 2,
        exceptionsCount: 1,
        variancePaise: -50000,
        confidence: 87,
      }
    }
    const response = await apiClient.get(`/ops/recon/match/${jobId}/summary`)
    return response.data
  }

  // Exceptions
  async getExceptions(params?: {
    jobId?: string
    type?: string
    severity?: string
    aging?: string
    cursor?: string
  }): Promise<{ data: any[]; total: number; hasMore: boolean }> {
    if (USE_MOCK_API) {
      const exceptions = [
        {
          id: 'exc-001',
          jobId: 'job-001',
          type: 'amount_mismatch',
          severity: 'high',
          rawData: {
            UTR: 'ICICINEFT2024011410005',
            AMOUNT_INR: '67890.25',
            STATUS: 'FAILED',
          },
          normalizedData: {
            utr: 'ICICINEFT2024011410005',
            amount: '6789025',
            bank_status: 'FAILED',
          },
          engineData: {
            pg_txn_id: 'PG20240114005',
            amount_paise: '6789025',
            status: 'failed',
          },
          variance: {
            field: 'status',
            expected: 'captured',
            actual: 'failed',
            delta: 'status_mismatch',
          },
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          status: 'new',
          auditTrail: [
            {
              action: 'created',
              user: 'system',
              timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            },
          ],
        },
      ]
      return { data: exceptions, total: 1, hasMore: false }
    }
    const response = await apiClient.get('/ops/exceptions', { params })
    return response.data
  }

  async resolveException(
    exceptionId: string,
    action: 'link' | 'ignore' | 'adjust',
    reason: string,
    linkToSettlementId?: string
  ): Promise<{ success: boolean }> {
    if (USE_MOCK_API) {
      return { success: true }
    }
    const response = await apiClient.post(`/ops/exceptions/${exceptionId}/resolve`, {
      action,
      reason,
      link_to_settlement_id: linkToSettlementId,
    })
    return response.data
  }

  // Manual Recon APIs
  async initManualRecon(params: {
    merchantId: string
    acquirerCode: string
    cycleDate: string
    jobKey: string
  }): Promise<{ jobId: string; uploadUrls?: { pg: string; bank: string } }> {
    if (USE_MOCK_API) {
      return { 
        jobId: `job-${params.jobKey}-${Date.now()}`,
        uploadUrls: {
          pg: '/upload/pg',
          bank: '/upload/bank'
        }
      }
    }
    const response = await apiClient.post('/ops/v1/recon/manual/init', params)
    return response.data
  }

  async uploadManualFile(formData: FormData): Promise<{
    checksum: string
    rowCount: number
    headers: string[]
    preview: any[]
    validations: {
      fileType: boolean
      delimiter: string
      encoding: string
      headerRecognized: boolean
    }
  }> {
    if (USE_MOCK_API) {
      // Parse the file and return mock data
      const file = formData.get('file') as File
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      const headers = lines[0].split(',').map(h => h.trim())
      const preview = lines.slice(1, 6).map(line => {
        const values = line.split(',')
        const row: any = {}
        headers.forEach((header, i) => {
          row[header] = values[i]?.trim() || ''
        })
        return row
      })
      
      return {
        checksum: 'md5:' + Math.random().toString(36).substring(7),
        rowCount: lines.length - 1,
        headers,
        preview,
        validations: {
          fileType: true,
          delimiter: 'comma',
          encoding: 'UTF-8',
          headerRecognized: true
        }
      }
    }
    const response = await apiClient.post('/ops/v1/recon/manual/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  }

  async normalizeManualRecon(params: {
    jobId: string
    mappingTemplateId: string
  }): Promise<{ success: boolean; normalizedRows: number }> {
    if (USE_MOCK_API) {
      return { success: true, normalizedRows: 20 }
    }
    const response = await apiClient.post('/ops/v1/recon/manual/normalize', params)
    return response.data
  }

  async matchManualRecon(params: {
    jobId: string
    tolerancePaise: number
    dateWindowDays: number
  }): Promise<{ matched: number; unmatched: number; confidence: number }> {
    if (USE_MOCK_API) {
      return { matched: 18, unmatched: 2, confidence: 90 }
    }
    const response = await apiClient.post('/ops/v1/recon/manual/match', params)
    return response.data
  }

  async getManualReconResults(jobId: string): Promise<any> {
    if (USE_MOCK_API) {
      // Return mock results with matched/unmatched data
      return {
        matched: {
          count: 18,
          rows: Array(18).fill(null).map((_, i) => ({
            txn_id: `TXN20240114${String(i + 1).padStart(2, '0')}`,
            utr: `AXISN0240114100${String(i + 1).padStart(2, '0')}`,
            amount: 10000000 + i * 100000,
            bank_status: 'SUCCESS',
            pg_status: 'captured',
            match_confidence: 100
          }))
        },
        unmatchedPG: {
          count: 1,
          rows: [{
            txn_id: 'TXN2024011417',
            utr: 'AXISN024011410017',
            amount: 7650000,
            status: 'captured',
            reason: 'Not found in bank file'
          }]
        },
        unmatchedBank: {
          count: 1,
          rows: [{
            txn_id: 'TXN2024011421',
            utr: 'AXISR024011410021',
            amount: 18750000,
            status: 'SUCCESS',
            reason: 'Not found in PG file'
          }]
        },
        summary: {
          totalPG: 20,
          totalBank: 19,
          matchRate: 90,
          variancePaise: -7650000
        }
      }
    }
    const response = await apiClient.get(`/ops/v1/recon/manual/job/${jobId}/results`)
    return response.data
  }

  async exportManualReconResults(jobId: string, tab: string): Promise<string> {
    if (USE_MOCK_API) {
      // Return a mock download URL
      return `/demo/exports/${jobId}_${tab}.csv`
    }
    
    // Call real backend on port 5110
    const response = await fetch(`http://localhost:5110/api/ops/v1/recon/manual/job/${jobId}/export?tab=${tab}`)
    
    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`)
    }
    
    // Get file as blob and trigger download
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const filename = `manual_recon_${jobId}_${tab}.csv`
    
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    return url
  }

  // Mapping Template APIs
  async getMappingTemplates(acquirerCode?: string): Promise<MappingTemplate[]> {
    if (USE_MOCK_API) {
      return mockTemplates.filter(t => !acquirerCode || t.acquirer.includes(acquirerCode))
    }
    const response = await apiClient.get('/ops/v1/recon/mapping/templates', {
      params: { acquirerCode }
    })
    return response.data
  }

  async getMappingTemplate(acquirerCode: string): Promise<any> {
    if (USE_MOCK_API) {
      const template = mockTemplates.find(t => t.acquirer.includes(acquirerCode))
      if (template) {
        // Convert to the format expected by ReconConfig
        return {
          id: template.id,
          name: template.name,
          acquirerCode,
          columns: template.fieldMap
        }
      }
      return null
    }
    const response = await apiClient.get(`/ops/v1/recon/mapping/templates/${acquirerCode}`)
    return response.data
  }

  async saveMappingTemplate(params: {
    acquirerCode: string
    name: string
    columns: Record<string, string>
  }): Promise<any> {
    if (USE_MOCK_API) {
      // Update or create template in mock data
      const existingIndex = mockTemplates.findIndex(t => t.acquirer.includes(params.acquirerCode))
      if (existingIndex >= 0) {
        mockTemplates[existingIndex] = {
          ...mockTemplates[existingIndex],
          fieldMap: params.columns,
          updatedAt: new Date().toISOString()
        }
      } else {
        mockTemplates.push({
          id: `tmpl-${Date.now()}`,
          name: params.name,
          scope: 'global',
          acquirer: params.acquirerCode,
          fieldMap: params.columns,
          dateFormats: {},
          amountParsers: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      }
      return { success: true }
    }
    const response = await apiClient.post('/ops/v1/recon/mapping/templates', params)
    return response.data
  }

  async getRecentFileHeaders(acquirerCode: string): Promise<Array<{ fileName: string; headers: string[] }>> {
    if (USE_MOCK_API) {
      // Return mock headers based on acquirer
      if (acquirerCode === 'AXIS') {
        return [
          {
            fileName: 'bank_axis_demo.csv',
            headers: ['TXNID', 'CREDIT_AMT', 'NET_CR_AMT', 'VALUE_DATE', 'UTR', 'RRN', 'AUTH', 'POST_DATE', 'BANK', 'STATUS', 'REMARKS']
          },
          {
            fileName: 'pg_axis_demo.csv',
            headers: ['order_id', 'txn_id', 'gross_amount', 'net_amount', 'txn_date', 'utr', 'rrn', 'approval_code', 'payment_date_time', 'bank_name']
          }
        ]
      }
      return []
    }
    const response = await apiClient.get(`/ops/v1/recon/files/recent-headers`, {
      params: { acquirerCode }
    })
    return response.data
  }

  // Preview APIs for OP-0006
  async createReconPreview(params: {
    merchantId: string
    acquirerCode: string
    cycleDate: string
    pgFileId: string
    bankFileId: string
    mappingTemplateId: string
    idempotencyKey: string
  }): Promise<{ jobId: string }> {
    if (USE_MOCK_API) {
      return { jobId: `preview-${params.idempotencyKey}` }
    }
    const response = await apiClient.post('/ops/recon/manual/preview', params, {
      headers: { 'X-Idempotency-Key': params.idempotencyKey }
    })
    return response.data
  }

  async getPreviewStatus(jobId: string): Promise<{
    ready: boolean
    stats?: any
  }> {
    if (USE_MOCK_API) {
      // Mock preview is always ready
      return {
        ready: true,
        stats: {
          total: 20,
          matched: 15,
          unmatched: 3,
          awaitingBank: 2,
          reasons: {
            amountMismatch: 1,
            dateMismatch: 1,
            notInBank: 1,
            notInPG: 0,
            duplicate: 0,
            other: 0
          }
        }
      }
    }
    const response = await apiClient.get(`/ops/recon/manual/preview/${jobId}`)
    return response.data
  }

  async getPreviewRows(jobId: string, params: {
    status?: string
    limit?: number
    cursor?: string
  }): Promise<{
    data: any[]
    cursor?: string
    hasMore: boolean
  }> {
    if (USE_MOCK_API) {
      // Generate mock rows
      const mockRows = Array(20).fill(null).map((_, i) => ({
        id: `row-${i + 1}`,
        transactionId: `TXN20240114${String(i + 1).padStart(2, '0')}`,
        utr: `AXISN0240114100${String(i + 1).padStart(2, '0')}`,
        grossAmount: 10000000 + i * 100000,
        netAmount: 9900000 + i * 100000,
        paymentBank: 'AXIS',
        paymentDate: '2024-01-14T18:00:00Z',
        transactionDate: '2024-01-14T10:00:00Z',
        isOnUs: i % 3 === 0,
        status: i < 15 ? 'matched' : i < 18 ? 'unmatched' : 'awaiting',
        reason: i === 15 ? 'amount_mismatch' : i === 16 ? 'date_mismatch' : i === 17 ? 'not_in_bank' : undefined,
        pgData: {
          transactionId: `TXN20240114${String(i + 1).padStart(2, '0')}`,
          utr: `AXISN0240114100${String(i + 1).padStart(2, '0')}`,
          grossAmount: 10000000 + i * 100000,
          netAmount: 9900000 + i * 100000,
          fee: 100000,
          tax: 18000,
          bank: 'AXIS',
          status: 'SUCCESS',
          paymentDate: '2024-01-14T18:00:00Z',
          transactionDate: '2024-01-14T10:00:00Z'
        },
        bankData: i < 18 ? {
          transactionId: `TXN20240114${String(i + 1).padStart(2, '0')}`,
          utr: `AXISN0240114100${String(i + 1).padStart(2, '0')}`,
          grossAmount: i === 15 ? 10100000 + i * 100000 : 10000000 + i * 100000, // Amount mismatch for row 15
          netAmount: i === 15 ? 9950000 + i * 100000 : 9900000 + i * 100000,
          fee: 100000,
          tax: 18000,
          bank: 'AXIS',
          status: 'SETTLED',
          paymentDate: i === 16 ? '2024-01-15T18:00:00Z' : '2024-01-14T18:00:00Z', // Date mismatch for row 16
          transactionDate: '2024-01-14T10:00:00Z'
        } : null
      }))

      const start = params.cursor ? parseInt(params.cursor) : 0
      const limit = params.limit || 50
      const rows = mockRows.slice(start, start + limit)

      return {
        data: rows,
        cursor: start + limit < mockRows.length ? String(start + limit) : undefined,
        hasMore: start + limit < mockRows.length
      }
    }
    const response = await apiClient.get(`/ops/recon/manual/preview/${jobId}/rows`, { params })
    return response.data
  }

  async exportPreview(jobId: string, type: 'matched' | 'unmatched' | 'awaiting'): Promise<string> {
    if (USE_MOCK_API) {
      return `/demo/exports/${jobId}_${type}.csv`
    }
    const response = await apiClient.get(`/ops/recon/manual/preview/${jobId}/export`, {
      params: { type }
    })
    return response.data.url
  }

  async uploadFileToS3(file: File, type: 'pg' | 'bank'): Promise<{
    fileId: string
    checksum: string
    rowCount: number
    headers: string[]
    preview: any[]
    validations: any
    detectedSchema?: string // Added for bank files
  }> {
    if (USE_MOCK_API) {
      // Parse the file and return mock data
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())
      const headers = lines[0].split(',').map(h => h.trim())
      const preview = lines.slice(1, 6).map(line => {
        const values = line.split(',')
        const row: any = {}
        headers.forEach((header, i) => {
          row[header] = values[i]?.trim() || ''
        })
        return row
      })
      
      // Auto-detect bank schema for bank files
      let detectedSchema = undefined
      if (type === 'bank') {
        // Simple pattern matching for known bank formats
        if (headers.some(h => h.includes('UTR Number')) && headers.some(h => h.includes('Transaction ID'))) {
          detectedSchema = 'AXIS'
        } else if (headers.some(h => h === 'TXN_ID') && headers.some(h => h === 'UTR_NO')) {
          detectedSchema = 'HDFC'
        } else if (headers.some(h => h.includes('ICICI'))) {
          detectedSchema = 'ICICI'
        } else {
          // Default fallback schema
          detectedSchema = 'GENERIC'
        }
      }
      
      return {
        fileId: `s3-file-${Date.now()}`,
        checksum: 'md5:' + Math.random().toString(36).substring(7),
        rowCount: lines.length - 1,
        headers,
        preview,
        validations: {
          fileType: true,
          delimiter: 'comma',
          encoding: 'UTF-8',
          headerRecognized: true,
          schemaDetected: detectedSchema || 'N/A'
        },
        detectedSchema
      }
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', type)
    
    const response = await apiClient.post('/ops/recon/files/s3/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  }

  // Connector APIs for OP-0006
  async getConnectors(filters?: { type?: string; merchantId?: string; acquirerCode?: string }): Promise<any[]> {
    if (USE_MOCK_API) {
      return [
        {
          sourceId: 'conn-001',
          name: 'Axis SFTP - Bank Recon',
          type: 'BANK_SFTP',
          pathOrEndpoint: '/home/demo/incoming',
          fileGlob: 'AXIS_RECON_{yyyyMMdd}.csv',
          mappingTemplateId: 'axis_v1',
          timezone: 'Asia/Kolkata',
          isEnabled: true,
          createdAt: '2024-01-01T10:00:00Z',
          updatedAt: '2024-01-15T10:00:00Z',
          schedule: {
            scheduleId: 'sched-001',
            cronExpr: '0 0 19 * * ?',
            nextRunAt: new Date(Date.now() + 3600000).toISOString(),
            lastRunAt: new Date(Date.now() - 86400000).toISOString(),
            isPaused: false
          },
          lastJob: {
            jobId: 'job-001',
            cycleDate: '2024-01-14',
            status: 'SUCCEEDED',
            rowsIngested: 1250,
            bytesIngested: 524288,
            createdAt: new Date(Date.now() - 86400000).toISOString()
          },
          health: {
            status: 'healthy',
            lastCheck: new Date().toISOString(),
            latency: 245,
            message: 'Connection successful'
          }
        },
        {
          sourceId: 'conn-002',
          name: 'ICICI SFTP - Bank Recon',
          type: 'BANK_SFTP',
          pathOrEndpoint: '/home/demo/icici',
          fileGlob: 'ICICI_*_{yyyyMMdd}.csv',
          mappingTemplateId: 'icici_v1',
          timezone: 'Asia/Kolkata',
          isEnabled: true,
          createdAt: '2024-01-01T10:00:00Z',
          updatedAt: '2024-01-10T10:00:00Z',
          schedule: {
            scheduleId: 'sched-002',
            cronExpr: '0 0 19 * * ?',
            nextRunAt: new Date(Date.now() + 3600000).toISOString(),
            lastRunAt: new Date(Date.now() - 86400000).toISOString(),
            isPaused: false
          },
          lastJob: {
            jobId: 'job-002',
            cycleDate: '2024-01-14',
            status: 'FAILED',
            errorMessage: 'File not found: ICICI_RECON_20240114.csv',
            createdAt: new Date(Date.now() - 86400000).toISOString()
          },
          health: {
            status: 'degraded',
            lastCheck: new Date().toISOString(),
            latency: 1250,
            message: 'High latency detected'
          }
        },
        {
          sourceId: 'conn-003',
          name: 'PG Demo API - Transactions',
          type: 'PG_HTTP_API',
          pathOrEndpoint: 'https://api.demo.com/v1/transactions',
          httpMethod: 'GET',
          mappingTemplateId: 'pg_trx_v1',
          timezone: 'Asia/Kolkata',
          isEnabled: true,
          createdAt: '2024-01-01T10:00:00Z',
          updatedAt: '2024-01-20T10:00:00Z',
          schedule: {
            scheduleId: 'sched-003',
            cronExpr: '0 0 * * * ?',
            nextRunAt: new Date(Date.now() + 600000).toISOString(),
            lastRunAt: new Date(Date.now() - 3600000).toISOString(),
            isPaused: false
          },
          lastJob: {
            jobId: 'job-003',
            cycleDate: '2024-01-14',
            status: 'SUCCEEDED',
            rowsIngested: 3450,
            bytesIngested: 1048576,
            createdAt: new Date(Date.now() - 3600000).toISOString()
          },
          health: {
            status: 'healthy',
            lastCheck: new Date().toISOString(),
            latency: 125,
            message: 'API responding normally'
          }
        }
      ].filter(conn => {
        if (filters?.type && conn.type !== filters.type) return false
        if (filters?.merchantId && conn.merchantId !== filters.merchantId) return false
        if (filters?.acquirerCode && conn.acquirerCode !== filters.acquirerCode) return false
        return true
      })
    }
    const response = await apiClient.get('/ops/connectors', { params: filters })
    return response.data
  }

  async createConnector(data: any): Promise<any> {
    if (USE_MOCK_API) {
      return {
        sourceId: `conn-${Date.now()}`,
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    }
    const response = await apiClient.post('/ops/connectors', data)
    return response.data
  }

  async updateConnector(sourceId: string, data: any): Promise<any> {
    if (USE_MOCK_API) {
      return {
        sourceId,
        ...data,
        updatedAt: new Date().toISOString()
      }
    }
    const response = await apiClient.put(`/ops/connectors/${sourceId}`, data)
    return response.data
  }

  async testConnectorConnection(connector: any): Promise<any> {
    if (USE_MOCK_API) {
      // Simulate connection test
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      if (Math.random() > 0.2) {
        return {
          success: true,
          latency: Math.floor(Math.random() * 500) + 100,
          message: 'Connection successful',
          details: {
            filesFound: connector.type.includes('SFTP') ? 5 : undefined,
            apiVersion: connector.type.includes('HTTP') ? 'v1.2.3' : undefined,
            serverTime: new Date().toISOString()
          }
        }
      } else {
        throw new Error('Connection timeout: Unable to reach server')
      }
    }
    const response = await apiClient.post(`/ops/connectors/${connector.sourceId}/test`)
    return response.data
  }

  async runConnector(sourceId: string, cycleDate?: string): Promise<any> {
    if (USE_MOCK_API) {
      return {
        jobId: `job-${Date.now()}`,
        sourceId,
        cycleDate: cycleDate || new Date().toISOString().split('T')[0],
        status: 'QUEUED',
        createdAt: new Date().toISOString()
      }
    }
    const response = await apiClient.post(`/ops/connectors/${sourceId}/run`, { cycleDate })
    return response.data
  }

  async getIngestJobs(params?: { sourceId?: string; status?: string; cycleDate?: string }): Promise<any[]> {
    if (USE_MOCK_API) {
      const jobs = [
        {
          jobId: 'job-001',
          sourceId: params?.sourceId || 'conn-001',
          cycleDate: '2024-01-14',
          status: 'SUCCEEDED',
          attempt: 1,
          maxAttempt: 3,
          artifactUri: 's3://bucket/artifacts/job-001.csv',
          rowsIngested: 1250,
          bytesIngested: 524288,
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          startedAt: new Date(Date.now() - 86400000).toISOString(),
          completedAt: new Date(Date.now() - 86300000).toISOString(),
          duration: 100000
        },
        {
          jobId: 'job-002',
          sourceId: params?.sourceId || 'conn-001',
          cycleDate: '2024-01-13',
          status: 'SUCCEEDED',
          attempt: 1,
          maxAttempt: 3,
          artifactUri: 's3://bucket/artifacts/job-002.csv',
          rowsIngested: 1180,
          bytesIngested: 491520,
          createdAt: new Date(Date.now() - 172800000).toISOString(),
          duration: 95000
        },
        {
          jobId: 'job-003',
          sourceId: params?.sourceId || 'conn-001',
          cycleDate: '2024-01-12',
          status: 'FAILED',
          attempt: 3,
          maxAttempt: 3,
          errorMessage: 'Connection timeout after 3 attempts',
          createdAt: new Date(Date.now() - 259200000).toISOString(),
          duration: 180000
        },
        {
          jobId: 'job-004',
          sourceId: params?.sourceId || 'conn-001',
          cycleDate: '2024-01-15',
          status: 'RUNNING',
          attempt: 1,
          maxAttempt: 3,
          createdAt: new Date(Date.now() - 300000).toISOString()
        }
      ]
      
      return jobs.filter(job => {
        if (params?.sourceId && job.sourceId !== params.sourceId) return false
        if (params?.status && job.status !== params.status) return false
        if (params?.cycleDate && job.cycleDate !== params.cycleDate) return false
        return true
      })
    }
    const response = await apiClient.get('/ops/ingest-jobs', { params })
    return response.data
  }

  async getIngestEvents(jobId: string): Promise<any[]> {
    if (USE_MOCK_API) {
      return [
        {
          eventId: 'evt-001',
          jobId,
          kind: 'CONNECT',
          payload: { host: 'sftp.example.com', port: 22 },
          createdAt: new Date(Date.now() - 86400000).toISOString()
        },
        {
          eventId: 'evt-002',
          jobId,
          kind: 'LIST',
          payload: { path: '/home/demo/incoming', filesFound: 5 },
          createdAt: new Date(Date.now() - 86395000).toISOString()
        },
        {
          eventId: 'evt-003',
          jobId,
          kind: 'DOWNLOAD',
          payload: { file: 'AXIS_RECON_20240114.csv', size: 524288 },
          createdAt: new Date(Date.now() - 86390000).toISOString()
        },
        {
          eventId: 'evt-004',
          jobId,
          kind: 'VERIFY',
          payload: { checksum: 'sha256:abcd1234...', valid: true },
          createdAt: new Date(Date.now() - 86385000).toISOString()
        },
        {
          eventId: 'evt-005',
          jobId,
          kind: 'UPLOAD_RAW',
          payload: { destination: 's3://bucket/raw/job-001.csv' },
          createdAt: new Date(Date.now() - 86380000).toISOString()
        },
        {
          eventId: 'evt-006',
          jobId,
          kind: 'COMPLETE',
          payload: { rowsProcessed: 1250, duration: 100000 },
          createdAt: new Date(Date.now() - 86300000).toISOString()
        }
      ]
    }
    const response = await apiClient.get(`/ops/ingest-jobs/${jobId}/events`)
    return response.data
  }

  // Sample Files
  async getSampleFiles(): Promise<Array<{ name: string; path: string; description: string }>> {
    if (USE_MOCK_API) {
      return [
        {
          name: 'pg_txns_sample.csv',
          path: '/demo/pg/pg_txns_sample.csv',
          description: 'Axis Bank PG transactions (20 rows)',
        },
        {
          name: 'axis_recon_sample.csv',
          path: '/demo/recon/axis_recon_sample.csv',
          description: 'Axis Bank reconciliation file (19 rows)',
        },
        {
          name: 'icici_neft_2024-01-14.csv',
          path: '/demo/recon/icici_neft_2024-01-14.csv',
          description: 'ICICI NEFT transactions (15 rows)',
        },
        {
          name: 'pg_txns_2024-01-14.csv',
          path: '/demo/pg/pg_txns_2024-01-14.csv',
          description: 'Payment Gateway transactions (17 rows)',
        },
      ]
    }
    const response = await apiClient.get('/ops/sample-files')
    return response.data
  }

  // Auto-reconciliation check
  async checkForAutoReconciliation(cycleDate: string): Promise<{ shouldTrigger: boolean; pgFile?: string; bankFile?: string }> {
    if (USE_MOCK_API) {
      // Mock: randomly decide if both files are available
      const hasBothFiles = Math.random() > 0.3
      if (hasBothFiles) {
        return {
          shouldTrigger: true,
          pgFile: `pg_txns_${cycleDate}.csv`,
          bankFile: `bank_recon_${cycleDate}.csv`
        }
      }
      return { shouldTrigger: false }
    }
    const response = await apiClient.get(`/ops/recon/check-auto-trigger/${cycleDate}`)
    return response.data
  }

  // Trigger auto-reconciliation
  async triggerAutoReconciliation(cycleDate: string, pgFile: string, bankFile: string): Promise<ReconJob> {
    if (USE_MOCK_API) {
      const jobId = `job_${Date.now()}`
      return {
        id: jobId,
        merchantId: 'ALL',
        merchantName: 'All Merchants',
        acquirer: 'Multiple',
        cycleDate,
        status: 'matching',
        fileCount: 2,
        lastUpdated: new Date().toISOString(),
        slaStatus: 'on_track',
        matchedCount: 0,
        unmatchedCount: 0,
        exceptionCount: 0
      }
    }
    const response = await apiClient.post('/ops/recon/auto-trigger', {
      cycleDate,
      pgFile,
      bankFile
    })
    return response.data
  }

  // Get reconciliation results
  async getReconResults(params: {
    merchantId?: string
    acquirer?: string
    cycleDate: string
    status?: string[]
    q?: string
    cursor?: string
    limit?: number
  }) {
    if (USE_MOCK_API) {
      // Generate mock results
      const results = []
      const statuses = params.status || ['MATCHED', 'PG_ONLY', 'BANK_ONLY', 'AMOUNT_MISMATCH', 'DATE_MISMATCH']
      
      for (let i = 0; i < (params.limit || 50); i++) {
        const status = statuses[Math.floor(Math.random() * statuses.length)]
        const hasPg = status !== 'BANK_ONLY'
        const hasBank = status !== 'PG_ONLY' && status !== 'BANK_FILE_AWAITED'
        const pgAmount = Math.floor(Math.random() * 1000000) + 10000 // 100-10000 rupees in paise
        const bankAmount = status === 'AMOUNT_MISMATCH' 
          ? pgAmount + (Math.random() > 0.5 ? 100 : -100) // ±1 rupee difference
          : pgAmount
        
        results.push({
          id: `result_${Date.now()}_${i}`,
          pgTxnId: hasPg ? `TXN${String(i + 1).padStart(6, '0')}` : undefined,
          bankRef: hasBank ? `BANK${String(i + 1).padStart(6, '0')}` : undefined,
          utr: hasBank ? `UTR${String(i + 1).padStart(12, '0')}` : undefined,
          rrn: hasBank && Math.random() > 0.5 ? `RRN${String(i + 1).padStart(12, '0')}` : undefined,
          pgAmount: hasPg ? pgAmount : undefined,
          bankAmount: hasBank ? bankAmount : undefined,
          amountDelta: hasPg && hasBank ? bankAmount - pgAmount : undefined,
          pgDate: hasPg ? params.cycleDate : undefined,
          bankDate: hasBank ? (status === 'DATE_MISMATCH' ? 
            new Date(new Date(params.cycleDate).getTime() + 86400000).toISOString().split('T')[0] : 
            params.cycleDate) : undefined,
          dateDelta: status === 'DATE_MISMATCH' ? 1 : 0,
          pgFee: hasPg ? Math.floor(pgAmount * 0.02) : undefined,
          bankFee: hasBank ? Math.floor(bankAmount * 0.02) : undefined,
          feeDelta: status === 'FEE_MISMATCH' ? 50 : 0,
          status,
          reasonCode: status,
          reasonDetail: this.getReasonDetail(status),
          suggestedAction: this.getSuggestedAction(status),
          resolution: Math.random() > 0.8 ? {
            action: 'accept_pg' as const,
            note: 'Verified with merchant',
            resolvedBy: 'ops@example.com',
            resolvedAt: new Date().toISOString()
          } : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      }

      // Calculate summary
      const summary = {
        totalCount: 150,
        matchedCount: 95,
        matchedAmount: 9500000, // 95,000 rupees in paise
        unmatchedCount: 35,
        unmatchedAmount: 3500000, // 35,000 rupees in paise
        exceptionCount: 20,
        lastRunAt: new Date().toISOString()
      }

      return {
        summary,
        items: results,
        hasMore: results.length === (params.limit || 50),
        cursor: `cursor_${Date.now()}`
      }
    }
    
    const response = await apiClient.get('/ops/recon/results', { params })
    return response.data
  }

  // Get single recon result with details
  async getReconResult(id: string) {
    if (USE_MOCK_API) {
      return {
        // Return the same result with additional audit trail
        auditTrail: [
          {
            id: `audit_1`,
            action: 'Created from matching job',
            actor: 'System',
            timestamp: new Date(Date.now() - 3600000).toISOString()
          },
          {
            id: `audit_2`,
            action: 'Amount mismatch detected',
            actor: 'System',
            timestamp: new Date(Date.now() - 1800000).toISOString(),
            note: 'PG amount: ₹1,250.00, Bank amount: ₹1,251.00'
          }
        ]
      }
    }
    const response = await apiClient.get(`/ops/recon/results/${id}`)
    return response.data
  }

  // Resolve reconciliation exceptions
  async resolveRecon(params: {
    items: string[]
    action: 'accept_pg' | 'accept_bank' | 'mark_investigate' | 'write_off' | 'assign'
    assignTo?: string
    note?: string
  }) {
    if (USE_MOCK_API) {
      return {
        success: true,
        resolved: params.items.length,
        message: `Successfully resolved ${params.items.length} items`
      }
    }
    const response = await apiClient.post('/ops/recon/resolve', params, {
      headers: {
        'Idempotency-Key': uuidv4()
      }
    })
    return response.data
  }

  // Export reconciliation results
  async exportRecon(params: {
    merchantId?: string
    acquirer?: string
    cycleDate: string
    subset: 'all' | 'matched' | 'unmatched' | 'exceptions'
    columns?: string[]
    format?: 'csv' | 'xlsx'
    includeMetadata?: boolean
  }) {
    if (USE_MOCK_API) {
      // Return a mock signed URL
      return `https://mock-export.s3.amazonaws.com/recon-export-${params.cycleDate}-${params.subset}.csv?signature=abc123`
    }
    
    // Call real backend on port 5110
    const response = await fetch('http://localhost:5110/api/ops/recon/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cycleDate: params.cycleDate,
        subset: params.subset,
        format: params.format || 'csv',
        includeMetadata: params.includeMetadata || false
      })
    })
    
    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`)
    }
    
    // Get file as blob and trigger download
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const filename = `recon_${params.cycleDate}_${params.subset}.${params.format || 'csv'}`
    
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    return url
  }

  // Helper methods for mock data
  getReasonDetail(status: string): string {
    switch (status) {
      case 'AMOUNT_MISMATCH':
        return 'Transaction amounts do not match between PG and Bank'
      case 'DATE_MISMATCH':
        return 'Transaction dates differ by more than tolerance window'
      case 'PG_ONLY':
        return 'Transaction found in PG but not in Bank file'
      case 'BANK_ONLY':
        return 'Transaction found in Bank but not in PG records'
      case 'FEE_MISMATCH':
        return 'Processing fees do not match expected values'
      case 'DUPLICATE':
        return 'Duplicate transaction detected'
      case 'BANK_FILE_AWAITED':
        return 'Waiting for bank reconciliation file'
      default:
        return ''
    }
  }

  getSuggestedAction(status: string): string {
    switch (status) {
      case 'AMOUNT_MISMATCH':
        return 'Verify with merchant and accept correct amount'
      case 'DATE_MISMATCH':
        return 'Check for settlement delays or timezone issues'
      case 'PG_ONLY':
        return 'Check if transaction is pending settlement or failed'
      case 'BANK_ONLY':
        return 'Verify if this is a manual adjustment or reversal'
      case 'FEE_MISMATCH':
        return 'Review fee structure and contact acquirer if needed'
      case 'DUPLICATE':
        return 'Investigate duplicate and process refund if needed'
      case 'BANK_FILE_AWAITED':
        return 'Wait for bank file or contact bank for status'
      default:
        return ''
    }
  }

  // ===== Exception Management APIs =====
  
  async getExceptions(params: {
    q?: string
    status?: string[]
    reason?: string[]
    merchantId?: string
    acquirer?: string
    severity?: string[]
    assignedTo?: string
    tags?: string[]
    dateFrom?: string
    dateTo?: string
    amountDeltaGt?: number
    amountDeltaLt?: number
    slaBreached?: boolean
    cursor?: string
    limit?: number
  }): Promise<any> {
    if (USE_MOCK_API) {
      // Generate mock exceptions
      const exceptions = []
      const reasons = ['AMOUNT_MISMATCH', 'BANK_FILE_AWAITED', 'FEE_MISMATCH', 'DATE_MISMATCH', 'PG_ONLY', 'BANK_ONLY']
      const statuses = ['open', 'investigating', 'snoozed', 'resolved', 'wont_fix']
      const severities = ['low', 'medium', 'high', 'critical']
      const merchants = ['Merchant A', 'Merchant B', 'Merchant C']
      const assignees = ['ops1@demo.com', 'ops2@demo.com', 'finance@demo.com', null]
      
      const total = 150
      const limit = params.limit || 50
      const offset = params.cursor ? parseInt(params.cursor) : 0
      
      for (let i = offset; i < Math.min(offset + limit, total); i++) {
        const createdHoursAgo = Math.floor(Math.random() * 168) // up to 7 days
        const createdAt = new Date(Date.now() - createdHoursAgo * 3600000)
        const slaDue = new Date(createdAt.getTime() + (Math.random() * 48 + 4) * 3600000)
        
        exceptions.push({
          id: `exc_${i + 1}`,
          exceptionCode: `EXC${String(i + 1).padStart(6, '0')}`,
          merchantId: `mid_${(i % 3) + 1}`,
          merchantName: merchants[i % 3],
          acquirerCode: ['AXIS', 'ICICI', 'HDFC'][i % 3],
          cycleDate: new Date(Date.now() - (i % 7) * 86400000).toISOString().split('T')[0],
          reason: reasons[i % reasons.length],
          status: i < 10 ? 'open' : statuses[i % statuses.length],
          severity: i < 5 ? 'critical' : severities[i % severities.length],
          pgAmount: 100000 + Math.floor(Math.random() * 900000),
          bankAmount: 100000 + Math.floor(Math.random() * 900000),
          amountDelta: Math.floor(Math.random() * 10000) - 5000,
          pgTransactionId: `TXN${String(i + 1).padStart(8, '0')}`,
          bankReferenceId: `REF${String(i + 1).padStart(8, '0')}`,
          utr: Math.random() > 0.3 ? `UTR${String(i + 1).padStart(10, '0')}` : undefined,
          assignedTo: assignees[i % assignees.length],
          assignedToName: assignees[i % assignees.length]?.split('@')[0],
          tags: i < 20 ? ['urgent'] : i < 40 ? ['review'] : [],
          snoozeUntil: i % 10 === 5 ? new Date(Date.now() + 86400000).toISOString() : undefined,
          slaDueAt: slaDue.toISOString(),
          lastTransitionAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
          sourceJobId: `job_${i + 1}`,
          createdAt: createdAt.toISOString(),
          updatedAt: new Date(Date.now() - Math.random() * 3600000).toISOString()
        })
      }
      
      // Apply filters
      let filtered = exceptions
      if (params.status?.length) {
        filtered = filtered.filter(e => params.status!.includes(e.status))
      }
      if (params.reason?.length) {
        filtered = filtered.filter(e => params.reason!.includes(e.reason))
      }
      if (params.severity?.length) {
        filtered = filtered.filter(e => params.severity!.includes(e.severity))
      }
      if (params.slaBreached) {
        filtered = filtered.filter(e => new Date(e.slaDueAt) < new Date())
      }
      
      return {
        counts: {
          byStatus: {
            open: exceptions.filter(e => e.status === 'open').length,
            investigating: exceptions.filter(e => e.status === 'investigating').length,
            snoozed: exceptions.filter(e => e.status === 'snoozed').length,
            resolved: exceptions.filter(e => e.status === 'resolved').length,
            wont_fix: exceptions.filter(e => e.status === 'wont_fix').length,
            escalated: exceptions.filter(e => e.status === 'escalated').length
          },
          bySeverity: {
            low: exceptions.filter(e => e.severity === 'low').length,
            medium: exceptions.filter(e => e.severity === 'medium').length,
            high: exceptions.filter(e => e.severity === 'high').length,
            critical: exceptions.filter(e => e.severity === 'critical').length
          },
          byReason: reasons.reduce((acc, r) => ({
            ...acc,
            [r]: exceptions.filter(e => e.reason === r).length
          }), {}),
          slaBreached: exceptions.filter(e => new Date(e.slaDueAt) < new Date()).length,
          total: filtered.length
        },
        items: filtered,
        cursor: offset + limit < total ? String(offset + limit) : undefined,
        hasMore: offset + limit < total
      }
    }
    
    // Use V2 API with new exception workflow
    const queryParams = new URLSearchParams()
    if (params.q) queryParams.append('q', params.q)
    if (params.status) params.status.forEach(s => queryParams.append('status', s))
    if (params.severity) params.severity.forEach(s => queryParams.append('severity', s))
    if (params.reason) params.reason.forEach(r => queryParams.append('reason', r))
    if (params.merchantId) queryParams.append('merchantId', params.merchantId)
    if (params.acquirer) queryParams.append('acquirer', params.acquirer)
    if (params.assignedTo) queryParams.append('assignedTo', params.assignedTo)
    if (params.tags) params.tags.forEach(t => queryParams.append('tags', t))
    if (params.dateFrom) queryParams.append('dateFrom', params.dateFrom)
    if (params.dateTo) queryParams.append('dateTo', params.dateTo)
    if (params.amountDeltaGt) queryParams.append('amountDeltaGt', params.amountDeltaGt.toString())
    if (params.amountDeltaLt) queryParams.append('amountDeltaLt', params.amountDeltaLt.toString())
    if (params.slaBreached !== undefined) queryParams.append('slaBreached', params.slaBreached.toString())
    if (params.cursor) queryParams.append('offset', params.cursor)
    if (params.limit) queryParams.append('limit', params.limit.toString())
    
    const reconApiUrl = import.meta.env.VITE_RECON_API_URL || 'http://localhost:5103'
    const response = await fetch(`${reconApiUrl}/exceptions-v2?${queryParams.toString()}`)
    const data = await response.json()
    return data
  }

  async getException(id: string): Promise<any> {
    if (USE_MOCK_API) {
      const baseException = {
        id,
        exceptionCode: `EXC${id.slice(-6)}`,
        merchantId: 'mid_1',
        merchantName: 'Demo Merchant',
        acquirerCode: 'AXIS',
        cycleDate: '2024-01-14',
        reason: 'AMOUNT_MISMATCH',
        status: 'investigating',
        severity: 'high',
        pgAmount: 150000,
        bankAmount: 145000,
        amountDelta: 5000,
        pgTransactionId: 'TXN12345678',
        bankReferenceId: 'REF87654321',
        utr: 'UTR1234567890',
        assignedTo: 'ops1@demo.com',
        assignedToName: 'ops1',
        tags: ['urgent', 'review'],
        slaDueAt: new Date(Date.now() + 8 * 3600000).toISOString(),
        lastTransitionAt: new Date(Date.now() - 2 * 3600000).toISOString(),
        sourceJobId: 'job_123',
        createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 3600000).toISOString()
      }
      
      return {
        ...baseException,
        pgData: {
          transaction_id: 'TXN12345678',
          amount: 1500.00,
          status: 'SUCCESS',
          timestamp: '2024-01-14T10:30:00Z',
          merchant_ref: 'ORD123456',
          payment_method: 'UPI'
        },
        bankData: {
          reference_id: 'REF87654321',
          amount: 1450.00,
          status: 'CREDITED',
          value_date: '2024-01-14',
          utr: 'UTR1234567890',
          remarks: 'Payment received'
        },
        variance: {
          amount: { pg: 150000, bank: 145000, delta: 5000 },
          status: { pg: 'SUCCESS', bank: 'CREDITED', match: true }
        },
        timeline: [
          {
            id: 'act_1',
            exceptionId: id,
            userId: 'system',
            userName: 'System',
            action: 'created',
            timestamp: new Date(Date.now() - 24 * 3600000).toISOString(),
            note: 'Exception created from reconciliation job'
          },
          {
            id: 'act_2',
            exceptionId: id,
            userId: 'rule_engine',
            userName: 'Rules Engine',
            action: 'auto_assigned',
            timestamp: new Date(Date.now() - 23 * 3600000).toISOString(),
            note: 'Applied rule: Assign high-value mismatches to ops1',
            after: { assignedTo: 'ops1@demo.com' }
          },
          {
            id: 'act_3',
            exceptionId: id,
            userId: 'ops1@demo.com',
            userName: 'ops1',
            action: 'status_changed',
            timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
            before: { status: 'open' },
            after: { status: 'investigating' },
            note: 'Looking into the mismatch with bank team'
          }
        ],
        suggestions: [
          'Check if merchant applied any discounts',
          'Verify bank charges or fees',
          'Contact bank for transaction details',
          'Review merchant settlement rules'
        ]
      }
    }
    
    // Use V2 API
    const response = await fetch(`http://localhost:5103/exceptions-v2/${id}`)
    const data = await response.json()
    return data.success ? data.data : data
  }

  async bulkUpdateExceptions(request: {
    ids: string[]
    action: string
    params?: any
    note?: string
  }): Promise<any> {
    if (USE_MOCK_API) {
      return {
        success: true,
        updated: request.ids.length,
        failures: [],
        message: `Successfully applied ${request.action} to ${request.ids.length} exceptions`
      }
    }
    
    // Use V2 API
    const response = await fetch('http://localhost:5103/exceptions-v2/bulk-update', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `bulk_${Date.now()}`
      },
      body: JSON.stringify(request)
    })
    const data = await response.json()
    return data
  }

  async getSavedViews(): Promise<any[]> {
    if (USE_MOCK_API) {
      return [
        {
          id: 'view_1',
          name: 'Aging > 48h',
          description: 'Exceptions older than 48 hours',
          query: { ageGt: 48 },
          ownerId: 'user_1',
          ownerName: 'Admin',
          shared: true,
          createdAt: '2024-01-01T00:00:00Z',
          useCount: 45
        },
        {
          id: 'view_2',
          name: 'Amount mismatch > ₹1,000',
          description: 'High value amount mismatches',
          query: { reason: ['AMOUNT_MISMATCH'], amountDeltaGt: 100000 },
          ownerId: 'user_1',
          ownerName: 'Admin',
          shared: true,
          createdAt: '2024-01-02T00:00:00Z',
          useCount: 32
        },
        {
          id: 'view_3',
          name: 'Bank file awaited',
          description: 'Waiting for bank reconciliation files',
          query: { reason: ['BANK_FILE_AWAITED'] },
          ownerId: 'user_2',
          ownerName: 'Ops Manager',
          shared: true,
          createdAt: '2024-01-03T00:00:00Z',
          useCount: 28
        },
        {
          id: 'view_4',
          name: 'SLA Breaches',
          description: 'Exceptions that have breached SLA',
          query: { slaBreached: true },
          ownerId: 'user_1',
          ownerName: 'Admin',
          shared: true,
          createdAt: '2024-01-04T00:00:00Z',
          useCount: 55
        },
        {
          id: 'view_5',
          name: 'Unassigned Critical',
          description: 'Critical exceptions without assignment',
          query: { severity: ['critical'], assignedTo: null },
          ownerId: 'user_1',
          ownerName: 'Admin',
          shared: true,
          createdAt: '2024-01-05T00:00:00Z',
          useCount: 41
        }
      ]
    }
    
    // Use V2 API
    const response = await fetch('http://localhost:5103/exception-saved-views?userId=current_user')
    const data = await response.json()
    return data.success ? data.data : []
  }

  async createSavedView(view: {
    name: string
    description?: string
    query: any
    shared: boolean
  }): Promise<any> {
    if (USE_MOCK_API) {
      return {
        id: `view_${Date.now()}`,
        ...view,
        ownerId: 'current_user',
        ownerName: 'Current User',
        createdAt: new Date().toISOString(),
        useCount: 0
      }
    }
    
    const response = await apiClient.post('/ops/exceptions/views', view)
    return response.data
  }

  async exportExceptions(request: {
    query: any
    format: 'csv' | 'xlsx'
    template?: string
  }): Promise<any> {
    if (USE_MOCK_API) {
      return {
        url: `https://demo.settlepaisa.com/exports/exceptions_${Date.now()}.${request.format}`,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        fileName: `exceptions_export_${new Date().toISOString().split('T')[0]}.${request.format}`,
        rowCount: 150
      }
    }
    
    // Call real backend on port 5110
    const response = await fetch('http://localhost:5110/api/ops/exceptions/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
    
    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`)
    }
    
    // Get file as blob and create download URL
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const filename = `exceptions_export_${new Date().toISOString().split('T')[0]}.${request.format}`
    
    // Trigger download
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    return {
      url,
      fileName: filename,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      rowCount: 'unknown'
    }
  }

  async getExceptionRules(): Promise<any[]> {
    if (USE_MOCK_API) {
      return [
        {
          id: 'rule_1',
          name: 'Auto-assign high-value mismatches',
          priority: 1,
          enabled: true,
          scope: {
            reasonCodes: ['AMOUNT_MISMATCH'],
            amountDeltaGt: 100000
          },
          actions: [
            { type: 'assign', params: { to: 'finance@demo.com' } },
            { type: 'setSeverity', params: { severity: 'high' } },
            { type: 'addTag', params: { tag: 'high-value' } }
          ],
          createdBy: 'admin',
          updatedBy: 'admin',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-10T00:00:00Z',
          lastAppliedAt: new Date(Date.now() - 300000).toISOString(),
          appliedCount: 245
        },
        {
          id: 'rule_2',
          name: 'Auto-resolve when bank file received',
          priority: 2,
          enabled: true,
          scope: {
            reasonCodes: ['BANK_FILE_AWAITED']
          },
          actions: [
            { type: 'resolve', params: { note: 'Bank file received and processed' } }
          ],
          createdBy: 'admin',
          updatedBy: 'admin',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-11T00:00:00Z',
          lastAppliedAt: new Date(Date.now() - 600000).toISOString(),
          appliedCount: 128
        },
        {
          id: 'rule_3',
          name: 'Escalate aged critical exceptions',
          priority: 3,
          enabled: true,
          scope: {
            severity: ['critical'],
            ageGt: 24,
            statusIn: ['open', 'investigating']
          },
          actions: [
            { type: 'escalate', params: {} },
            { type: 'assign', params: { to: 'manager@demo.com' } },
            { type: 'addTag', params: { tag: 'escalated' } }
          ],
          createdBy: 'admin',
          updatedBy: 'admin',
          createdAt: '2024-01-03T00:00:00Z',
          updatedAt: '2024-01-12T00:00:00Z',
          lastAppliedAt: new Date(Date.now() - 900000).toISOString(),
          appliedCount: 67
        }
      ]
    }
    
    // Use V2 API
    const response = await fetch('http://localhost:5103/exception-rules')
    const data = await response.json()
    return data.success ? data.data : []
  }

  async reprocessException(exceptionId: string): Promise<any> {
    if (USE_MOCK_API) {
      return {
        success: true,
        jobId: `reprocess_${Date.now()}`,
        message: 'Reprocessing job queued successfully'
      }
    }
    
    const response = await apiClient.post(
      `/ops/exceptions/${exceptionId}/reprocess`,
      {},
      { headers: { 'X-Idempotency-Key': `reprocess_${exceptionId}_${Date.now()}` } }
    )
    return response.data
  }

  // ===== Connector Management APIs (OP-0008) =====

  async getConnectors(params?: { 
    status?: string
    provider?: string
    cursor?: string
    limit?: number 
  }): Promise<any> {
    if (USE_MOCK_API) {
      const connectors = [
        {
          id: 'conn_1',
          name: 'AXIS Bank SFTP',
          type: 'SFTP',
          provider: 'AXIS',
          status: 'ACTIVE',
          config: {
            host: 'sftp.axisbank.com',
            port: 22,
            username: 'settlepaisa',
            authType: 'password',
            remotePath: '/recon/daily',
            filePattern: 'AXIS_RECON_YYYYMMDD*.csv',
            checksumExt: '.sha256',
            timezone: 'Asia/Kolkata',
            schedule: '0 19 * * *', // 7 PM IST daily
            targetCycleRule: 'yesterday'
          },
          lastRunAt: new Date(Date.now() - 3600000).toISOString(),
          lastOkAt: new Date(Date.now() - 3600000).toISOString(),
          healthStatus: 'HEALTHY',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-15T00:00:00Z'
        },
        {
          id: 'conn_2',
          name: 'BOB API',
          type: 'API',
          provider: 'BOB',
          status: 'ACTIVE',
          config: {
            baseUrl: 'https://api.bob.com',
            authType: 'bearer',
            endpoint: '/v1/reconciliation/daily',
            schedule: '30 19 * * *', // 7:30 PM IST daily
            timezone: 'Asia/Kolkata',
            responseFormat: 'csv'
          },
          lastRunAt: new Date(Date.now() - 7200000).toISOString(),
          lastOkAt: new Date(Date.now() - 7200000).toISOString(),
          healthStatus: 'HEALTHY',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-16T00:00:00Z'
        },
        {
          id: 'conn_3',
          name: 'HDFC SFTP',
          type: 'SFTP',
          provider: 'HDFC',
          status: 'PAUSED',
          config: {
            host: 'sftp.hdfcbank.com',
            port: 22,
            username: 'sp_recon',
            authType: 'privateKey',
            remotePath: '/outgoing',
            filePattern: 'HDFC_*.csv',
            timezone: 'Asia/Kolkata',
            schedule: '0 20 * * *', // 8 PM IST daily
            targetCycleRule: 'yesterday'
          },
          lastRunAt: new Date(Date.now() - 86400000).toISOString(),
          lastOkAt: new Date(Date.now() - 172800000).toISOString(),
          healthStatus: 'WARNING',
          createdAt: '2024-01-03T00:00:00Z',
          updatedAt: '2024-01-17T00:00:00Z'
        }
      ]

      return {
        connectors: params?.status ? connectors.filter(c => c.status === params.status) : connectors,
        total: connectors.length,
        hasMore: false
      }
    }

    const response = await apiClient.get('http://localhost:5103/connectors', { params })
    return response.data
  }

  async getConnectorDetails(id: string): Promise<any> {
    if (USE_MOCK_API) {
      return {
        id,
        name: 'AXIS Bank SFTP',
        type: 'SFTP',
        provider: 'AXIS',
        status: 'ACTIVE',
        config: {
          host: 'sftp.axisbank.com',
          port: 22,
          username: 'settlepaisa',
          authType: 'password',
          remotePath: '/recon/daily',
          filePattern: 'AXIS_RECON_YYYYMMDD*.csv',
          checksumExt: '.sha256',
          timezone: 'Asia/Kolkata',
          schedule: '0 19 * * *',
          targetCycleRule: 'yesterday'
        },
        lastRunAt: new Date(Date.now() - 3600000).toISOString(),
        lastOkAt: new Date(Date.now() - 3600000).toISOString(),
        healthStatus: 'HEALTHY',
        health: {
          totalRuns: 30,
          successfulRuns: 28,
          failedRuns: 2,
          successRate: 93.33,
          avgDuration: 45000,
          nextScheduledRun: new Date(Date.now() + 82800000).toISOString(),
          backlog: {
            missingDays: 0
          }
        },
        recentRuns: [
          {
            id: 'run_1',
            connectorId: id,
            cycleDate: new Date(Date.now() - 86400000).toISOString().split('T')[0],
            startedAt: new Date(Date.now() - 3600000).toISOString(),
            finishedAt: new Date(Date.now() - 3540000).toISOString(),
            outcome: 'SUCCESS',
            filesDiscovered: 1,
            filesDownloaded: 1,
            metrics: {
              duration: 60000,
              bytesDownloaded: 245678,
              rowsProcessed: 1250
            }
          }
        ]
      }
    }

    const response = await apiClient.get(`http://localhost:5103/connectors/${id}`)
    return response.data
  }

  async createConnector(params: any): Promise<any> {
    if (USE_MOCK_API) {
      return {
        id: `conn_${Date.now()}`,
        ...params,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    }

    const response = await apiClient.post('http://localhost:5103/connectors', params)
    return response.data
  }

  async updateConnector(id: string, params: any): Promise<any> {
    if (USE_MOCK_API) {
      return {
        id,
        ...params,
        updatedAt: new Date().toISOString()
      }
    }

    const response = await apiClient.put(`http://localhost:5103/connectors/${id}`, params)
    return response.data
  }

  async testConnector(id: string): Promise<any> {
    if (USE_MOCK_API) {
      const success = Math.random() > 0.2
      return {
        success,
        message: success ? 'Connection test successful' : 'Connection failed',
        details: {
          connected: success,
          authenticated: success,
          filesFound: success ? ['AXIS_RECON_20250109.csv', 'AXIS_RECON_20250110.csv'] : [],
          error: success ? undefined : 'Authentication failed: Invalid credentials'
        }
      }
    }

    const response = await apiClient.post(`http://localhost:5103/connectors/${id}/test`)
    return response.data
  }

  async runConnectorNow(id: string, params?: { cycleDate?: string; force?: boolean }): Promise<any> {
    if (USE_MOCK_API) {
      return {
        runId: `run_${Date.now()}`,
        connectorId: id,
        cycleDate: params?.cycleDate || new Date(Date.now() - 86400000).toISOString().split('T')[0],
        status: 'STARTED',
        message: 'Connector run initiated successfully'
      }
    }

    const response = await apiClient.post(`http://localhost:5103/connectors/${id}/run`, params)
    return response.data
  }
  
  async pauseConnector(id: string): Promise<any> {
    if (USE_MOCK_API) {
      return {
        success: true,
        connector: { id, status: 'PAUSED' },
        message: 'Connector paused successfully'
      }
    }

    const response = await apiClient.post(`http://localhost:5103/connectors/${id}/pause`)
    return response.data
  }
  
  async resumeConnector(id: string): Promise<any> {
    if (USE_MOCK_API) {
      return {
        success: true,
        connector: { id, status: 'ACTIVE' },
        message: 'Connector resumed successfully'
      }
    }

    const response = await apiClient.post(`http://localhost:5103/connectors/${id}/resume`)
    return response.data
  }

  async backfillConnector(id: string, params: { startDate: string; endDate: string; force?: boolean }): Promise<any> {
    if (USE_MOCK_API) {
      return {
        jobId: `backfill_${Date.now()}`,
        connectorId: id,
        startDate: params.startDate,
        endDate: params.endDate,
        daysToProcess: 3,
        status: 'QUEUED',
        message: 'Backfill job queued successfully'
      }
    }

    const response = await apiClient.post(`/ops/connectors/${id}/backfill`, params, {
      headers: { 'X-Idempotency-Key': `backfill_${id}_${Date.now()}` }
    })
    return response.data
  }

  async getConnectorRuns(connectorId: string, params?: { 
    outcome?: string
    cycleDate?: string
    cursor?: string
    limit?: number 
  }): Promise<any> {
    if (USE_MOCK_API) {
      const runs = []
      for (let i = 0; i < 10; i++) {
        const daysAgo = i
        const outcome = i === 7 ? 'FAILED' : 'SUCCESS'
        runs.push({
          id: `run_${i}`,
          connectorId,
          connectorName: 'AXIS Bank SFTP',
          cycleDate: new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0],
          startedAt: new Date(Date.now() - daysAgo * 86400000 - 3600000).toISOString(),
          finishedAt: new Date(Date.now() - daysAgo * 86400000 - 3540000).toISOString(),
          outcome,
          filesDiscovered: outcome === 'SUCCESS' ? 1 : 0,
          filesDownloaded: outcome === 'SUCCESS' ? 1 : 0,
          error: outcome === 'FAILED' ? 'Connection timeout' : undefined,
          metrics: outcome === 'SUCCESS' ? {
            duration: 60000,
            bytesDownloaded: 200000 + Math.floor(Math.random() * 100000),
            rowsProcessed: 1000 + Math.floor(Math.random() * 500)
          } : undefined
        })
      }

      return {
        runs: params?.outcome ? runs.filter(r => r.outcome === params.outcome) : runs,
        total: runs.length,
        hasMore: false
      }
    }

    const response = await apiClient.get(`http://localhost:5103/connectors/${connectorId}/history`, { params })
    return response.data
  }

  // ============================================
  // REPORT ENDPOINTS (OP-0009)
  // ============================================

  async getSettlementSummary(params?: {
    fromDate?: string
    toDate?: string
    cycleDate?: string
    acquirer?: string
    merchant?: string
  }): Promise<any> {
    const response = await fetch('http://localhost:5103/reports/settlement-summary?' + new URLSearchParams(
      Object.entries(params || {}).filter(([_, v]) => v != null).map(([k, v]) => [k, String(v)])
    ))
    return response.json()
  }

  async getBankMIS(params?: {
    cycleDate?: string
    fromDate?: string
    toDate?: string
    acquirer?: string
  }): Promise<any> {
    const response = await fetch('http://localhost:5103/reports/bank-mis?' + new URLSearchParams(
      Object.entries(params || {}).filter(([_, v]) => v != null).map(([k, v]) => [k, String(v)])
    ))
    return response.json()
  }

  async getReconOutcome(params?: {
    cycleDate?: string
    fromDate?: string
    toDate?: string
    acquirer?: string
    status?: 'MATCHED' | 'UNMATCHED' | 'EXCEPTION'
  }): Promise<any> {
    const response = await fetch('http://localhost:5103/reports/recon-outcome?' + new URLSearchParams(
      Object.entries(params || {}).filter(([_, v]) => v != null).map(([k, v]) => [k, String(v)])
    ))
    return response.json()
  }

  async getTaxReport(params?: {
    fromDate?: string
    toDate?: string
    cycleDate?: string
    merchant?: string
  }): Promise<any> {
    const response = await fetch('http://localhost:5103/reports/tax-report?' + new URLSearchParams(
      Object.entries(params || {}).filter(([_, v]) => v != null).map(([k, v]) => [k, String(v)])
    ))
    return response.json()
  }

  async getSettlementTransactions(params?: {
    fromDate?: string
    toDate?: string
    cycleDate?: string
    merchantId?: string
    batchId?: string
  }): Promise<any> {
    const response = await fetch('http://localhost:5103/reports/settlement-transactions?' + new URLSearchParams(
      Object.entries(params || {}).filter(([_, v]) => v != null).map(([k, v]) => [k, String(v)])
    ))
    return response.json()
  }

  async exportReport(params: {
    type: string
    filters: any
    format: 'CSV' | 'XLSX'
  }): Promise<any> {
    if (USE_MOCK_API) {
      const { reportExportService } = await import('@/services/report-export')
      return reportExportService.exportReport(params.type as any, params.filters, params.format)
    }
    return apiClient.post('/ops/reports/export', params)
  }

  async getReportSchedules(): Promise<any> {
    if (USE_MOCK_API) {
      const { reportScheduler } = await import('@/services/report-scheduler')
      return { schedules: reportScheduler.getSchedules() }
    }
    return apiClient.get('/ops/reports/schedules')
  }

  async createReportSchedule(params: any): Promise<any> {
    if (USE_MOCK_API) {
      const { reportScheduler } = await import('@/services/report-scheduler')
      return reportScheduler.createSchedule(params)
    }
    return apiClient.post('/ops/reports/schedules', params)
  }

  async updateReportSchedule(id: string, params: any): Promise<any> {
    if (USE_MOCK_API) {
      const { reportScheduler } = await import('@/services/report-scheduler')
      return reportScheduler.updateSchedule(id, params)
    }
    return apiClient.put(`/ops/reports/schedules/${id}`, params)
  }

  async deleteReportSchedule(id: string): Promise<any> {
    if (USE_MOCK_API) {
      const { reportScheduler } = await import('@/services/report-scheduler')
      return { success: reportScheduler.deleteSchedule(id) }
    }
    return apiClient.delete(`/ops/reports/schedules/${id}`)
  }

  async runReportScheduleNow(id: string): Promise<any> {
    if (USE_MOCK_API) {
      const { reportScheduler } = await import('@/services/report-scheduler')
      await reportScheduler.runScheduleNow(id)
      return { success: true }
    }
    return apiClient.post(`/ops/reports/schedules/${id}/run`)
  }

  // ============================================
  // ANALYTICS ENDPOINTS (OP-0009 Analytics)
  // ============================================

  async getAnalyticsKPIs(params?: {
    date?: string // YYYY-MM-DD, defaults to today
    acquirer?: string
  }): Promise<any> {
    if (USE_MOCK_API) {
      const { analyticsService } = await import('@/services/analytics-service')
      const kpis = analyticsService.calculateKPIs(params?.date)
      return { data: kpis }
    }
    return apiClient.get('/v1/analytics/kpis', { params })
  }

  async getMatchRateTrends(params: {
    from: string // YYYY-MM-DD
    to: string // YYYY-MM-DD
    acquirer?: string
  }): Promise<any> {
    if (USE_MOCK_API) {
      const { analyticsService } = await import('@/services/analytics-service')
      // Calculate number of days between from and to
      const fromDate = new Date(params.from)
      const toDate = new Date(params.to)
      const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const trends = analyticsService.generateMatchRateTrends(daysDiff, params.acquirer)
      return { data: trends }
    }
    return apiClient.get('/v1/analytics/trends/match-rate', { params })
  }

  async getReasonCodeDistribution(params: {
    from: string // YYYY-MM-DD
    to: string // YYYY-MM-DD
    acquirer?: string
  }): Promise<any> {
    if (USE_MOCK_API) {
      const { analyticsService } = await import('@/services/analytics-service')
      // Calculate number of days between from and to
      const fromDate = new Date(params.from)
      const toDate = new Date(params.to)
      const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const distribution = analyticsService.generateReasonCodeDistribution(daysDiff, params.acquirer)
      return { data: distribution }
    }
    return apiClient.get('/v1/analytics/trends/reason-codes', { params })
  }

  async getSLAHeatmap(params: {
    from: string // YYYY-MM-DD
    to: string // YYYY-MM-DD
  }): Promise<any> {
    if (USE_MOCK_API) {
      const { analyticsService } = await import('@/services/analytics-service')
      // Calculate number of days between from and to
      const fromDate = new Date(params.from)
      const toDate = new Date(params.to)
      const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const heatmap = analyticsService.generateSLAHeatmap(daysDiff)
      return { data: heatmap }
    }
    return apiClient.get('/v1/analytics/sla/heatmap', { params })
  }

  async getAgingBacklog(params: {
    bucket: '24h' | '48h' | '72h'
    acquirer?: string
    limit?: number
    offset?: number
  }): Promise<any> {
    if (USE_MOCK_API) {
      const { analyticsService } = await import('@/services/analytics-service')
      // Generate aging exceptions for the specified bucket
      const exceptionData = analyticsService.generateExceptionBuckets(7) // Last 7 days
      const filtered = params.acquirer 
        ? exceptionData.filter(d => d.acquirer === params.acquirer)
        : exceptionData
      
      // Transform to aging exception format
      const agingExceptions = filtered.flatMap(bucket => {
        const count = bucket[`aged_${params.bucket}` as keyof typeof bucket] as number
        if (count === 0) return []
        
        return Array(count).fill(null).map((_, i) => ({
          txn_id: `TXN${Date.now()}${i}`,
          acquirer: bucket.acquirer,
          merchant: ['Flipkart', 'Amazon', 'Myntra'][i % 3],
          merchant_name: ['Flipkart', 'Amazon', 'Myntra'][i % 3],
          reason_code: bucket.reason_code,
          reason_description: this.getReasonDescription(bucket.reason_code),
          age_hours: params.bucket === '24h' ? 30 : params.bucket === '48h' ? 54 : 78,
          amount_paise: bucket.total_amount_paise / BigInt(bucket.count),
          amount_rupees: bucket.total_amount_rupees / bucket.count,
          cycle_date: bucket.cycle_date,
          created_at: new Date(Date.now() - (params.bucket === '24h' ? 30 : params.bucket === '48h' ? 54 : 78) * 3600000).toISOString(),
          bucket: params.bucket
        }))
      })

      const start = params.offset || 0
      const limit = params.limit || 50
      const paginatedData = agingExceptions.slice(start, start + limit)

      return {
        data: paginatedData,
        total: agingExceptions.length,
        hasMore: start + limit < agingExceptions.length
      }
    }
    return apiClient.get('/v1/analytics/backlog/aging', { params })
  }

  async getThroughputHourly(params?: {
    date?: string // YYYY-MM-DD, defaults to today
    acquirer?: string
  }): Promise<any> {
    if (USE_MOCK_API) {
      const { analyticsService } = await import('@/services/analytics-service')
      const throughput = analyticsService.generateThroughputHourly(params?.date)
      const filtered = params?.acquirer 
        ? throughput.filter(d => d.acquirer === params.acquirer)
        : throughput
      return { data: filtered }
    }
    return apiClient.get('/v1/analytics/throughput/hourly', { params })
  }

  async getLateBankFiles(params?: {
    from?: string // YYYY-MM-DD
    to?: string // YYYY-MM-DD
    acquirer?: string
    status?: 'LATE' | 'MISSING'
  }): Promise<any> {
    if (USE_MOCK_API) {
      const { analyticsService } = await import('@/services/analytics-service')
      // Generate SLA data for the date range
      const fromDate = params?.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const toDate = params?.to || new Date().toISOString().split('T')[0]
      const daysDiff = Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
      
      const slaData = analyticsService.generateSLACycles(daysDiff)
      const filtered = slaData.filter(d => {
        if (params?.acquirer && d.acquirer !== params.acquirer) return false
        if (params?.status && d.status !== params.status) return false
        if (d.status === 'ON_TIME') return false // Only show late/missing files
        return true
      })

      // Transform to LateBankFile format
      const lateBankFiles = filtered.map(sla => ({
        acquirer: sla.acquirer,
        cycle_date: sla.cycle_date,
        expected_at: sla.file_expected_at_ist,
        received_at: sla.file_received_at_ist,
        hours_late: sla.hours_late,
        impacted_merchants_count: sla.impacted_merchants_count,
        impacted_merchants: Array(sla.impacted_merchants_count).fill(null).map((_, i) => 
          ['Flipkart', 'Amazon', 'Myntra'][i % 3]
        ),
        file_size_bytes: sla.status === 'MISSING' ? undefined : 1024 * 512 + Math.floor(Math.random() * 1024 * 512),
        status: sla.status as 'LATE' | 'MISSING'
      }))

      return { data: lateBankFiles }
    }
    return apiClient.get('/v1/analytics/late-files', { params })
  }

  // Helper method for reason code descriptions
  private getReasonDescription(code: string): string {
    const descriptions: Record<string, string> = {
      'BANK_FILE_AWAITED': 'Waiting for bank reconciliation file',
      'AMOUNT_MISMATCH': 'Transaction amounts do not match between PG and bank',
      'DATE_MISMATCH': 'Transaction dates differ beyond tolerance window',
      'MISSING_IN_BANK': 'Transaction found in PG but missing in bank file',
      'MISSING_IN_PG': 'Transaction found in bank but missing in PG records',
      'DUPLICATE_IN_BANK': 'Duplicate transaction found in bank file'
    }
    return descriptions[code] || 'Unknown exception reason'
  }

  // ============================================
  // CHARGEBACK ENDPOINTS (OP-0011)
  // ============================================

  async getChargebacks(params?: {
    status?: string[]
    merchantId?: string
    acquirer?: string
    category?: string[]
    ownerUserId?: string
    dateFrom?: string
    dateTo?: string
    searchQuery?: string
    slaBucket?: 'overdue' | 'today' | 'twoToThree'
    cursor?: string
    limit?: number
    sortBy?: string
    sortOrder?: string
  }): Promise<any> {
    // Always use V2 database endpoint (port 5105)
    const queryParams = new URLSearchParams();
    
    if (params?.status && params.status.length > 0) {
      queryParams.append('status', params.status[0]); // Take first status
    }
    if (params?.searchQuery) {
      queryParams.append('searchQuery', params.searchQuery);
    }
    if (params?.acquirer) {
      queryParams.append('acquirer', params.acquirer);
    }
    if (params?.slaBucket) {
      queryParams.append('slaBucket', params.slaBucket);
    }
    if (params?.dateFrom) {
      queryParams.append('from', params.dateFrom);
    }
    if (params?.dateTo) {
      queryParams.append('to', params.dateTo);
    }
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params?.cursor) {
      queryParams.append('offset', params.cursor);
    }
    
    const response = await fetch(`http://localhost:5105/api/chargebacks?${queryParams.toString()}`);
    const data = await response.json();
    
    return {
      chargebacks: data.chargebacks || [],
      total: data.pagination?.total || 0,
      cursor: data.pagination?.offset + data.pagination?.limit < data.pagination?.total 
        ? String(data.pagination.offset + data.pagination.limit) 
        : undefined,
      hasMore: data.pagination?.offset + data.pagination?.limit < data.pagination?.total
    };
  }

  async getChargebackById(id: string): Promise<any> {
    if (USE_MOCK_API) {
      const { chargebackService } = await import('@/services/chargeback-service')
      return chargebackService.getChargebackById(id)
    }
    return apiClient.get(`/v1/chargebacks/${id}`)
  }

  async getChargebackKPIs(): Promise<any> {
    if (USE_MOCK_API) {
      const { chargebackService } = await import('@/services/chargeback-service')
      return chargebackService.getKPIs()
    }
    return apiClient.get('/v1/chargebacks/kpis')
  }

  async getChargebackDashboardStats(): Promise<any> {
    if (USE_MOCK_API) {
      const { chargebackService } = await import('@/services/chargeback-service')
      return chargebackService.getDashboardStats()
    }
    return apiClient.get('/v1/chargebacks/dashboard-stats')
  }

  async updateChargebackStatus(id: string, params: {
    status: string
    reason?: string
    actorEmail: string
    idempotencyKey?: string
  }): Promise<any> {
    if (USE_MOCK_API) {
      const { chargebackService } = await import('@/services/chargeback-service')
      const success = await chargebackService.updateStatus(
        id,
        params.status as any,
        params.actorEmail,
        params.reason
      )
      return { success }
    }
    return apiClient.post(`/v1/chargebacks/${id}/status`, params, {
      headers: params.idempotencyKey ? { 'X-Idempotency-Key': params.idempotencyKey } : {}
    })
  }

  async assignChargebackOwner(id: string, params: {
    ownerUserId: string
    ownerEmail: string
    actorEmail: string
  }): Promise<any> {
    if (USE_MOCK_API) {
      const { chargebackService } = await import('@/services/chargeback-service')
      const success = await chargebackService.assignOwner(
        id,
        params.ownerUserId,
        params.ownerEmail,
        params.actorEmail
      )
      return { success }
    }
    return apiClient.post(`/v1/chargebacks/${id}/assign`, params)
  }

  async uploadChargebackEvidence(id: string, files: File[], uploadedBy: string): Promise<any> {
    if (USE_MOCK_API) {
      const { chargebackService } = await import('@/services/chargeback-service')
      const fileData = files.map(f => ({
        fileName: f.name,
        mimeType: f.type,
        sizeBytes: f.size
      }))
      const success = await chargebackService.addEvidence(id, fileData, uploadedBy)
      return { success, filesUploaded: files.length }
    }
    
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    formData.append('uploadedBy', uploadedBy)
    
    return apiClient.post(`/v1/chargebacks/${id}/evidence`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }

  async submitChargebackRepresentment(id: string, params: {
    evidenceIds?: string[]
    representmentNotes: string
    submittedBy: string
    idempotencyKey?: string
  }): Promise<any> {
    if (USE_MOCK_API) {
      const { chargebackService } = await import('@/services/chargeback-service')
      const success = await chargebackService.submitRepresentment(
        id,
        params.submittedBy,
        params.representmentNotes
      )
      return { success }
    }
    return apiClient.post(`/v1/chargebacks/${id}/represent`, params, {
      headers: params.idempotencyKey ? { 'X-Idempotency-Key': params.idempotencyKey } : {}
    })
  }

  async recordChargebackDecision(id: string, params: {
    outcome: 'WON' | 'LOST'
    decisionNotes?: string
    decisionAt?: string
    actorEmail: string
    idempotencyKey?: string
  }): Promise<any> {
    if (USE_MOCK_API) {
      const { chargebackService } = await import('@/services/chargeback-service')
      const success = await chargebackService.updateStatus(
        id,
        params.outcome,
        params.actorEmail,
        params.decisionNotes
      )
      return { success }
    }
    return apiClient.post(`/v1/chargebacks/${id}/decision`, params, {
      headers: params.idempotencyKey ? { 'X-Idempotency-Key': params.idempotencyKey } : {}
    })
  }

  async intakeChargebacks(params: {
    chargebacks: Array<{
      caseRef: string
      merchantId: string
      acquirer: string
      network: string
      txnId: string
      rrn?: string
      utr?: string
      reasonCode: string
      reasonDesc: string
      category: string
      disputedAmountPaise: number
      currency: string
      openedAt: string
      evidenceDueAt?: string
    }>
    source: 'MANUAL' | 'SFTP' | 'API'
    idempotencyKey?: string
  }): Promise<any> {
    if (USE_MOCK_API) {
      return {
        success: true,
        processed: params.chargebacks.length,
        created: params.chargebacks.length,
        updated: 0,
        errors: []
      }
    }
    return apiClient.post('/v1/chargebacks/intake', params, {
      headers: params.idempotencyKey ? { 'X-Idempotency-Key': params.idempotencyKey } : {}
    })
  }

  async exportChargebacks(params: {
    filters: any
    format: 'CSV' | 'XLSX'
    columns?: string[]
  }): Promise<any> {
    if (USE_MOCK_API) {
      // Generate a mock download URL
      return {
        url: `/demo/exports/chargebacks_${Date.now()}.${params.format.toLowerCase()}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }
    }
    return apiClient.post('/v1/chargebacks/export', params)
  }

  async getChargebackSummaries(params?: {
    status?: string[]
    merchantId?: string
  }): Promise<any> {
    if (USE_MOCK_API) {
      const { chargebackService } = await import('@/services/chargeback-service')
      const summaries = await chargebackService.getChargebackSummaries({
        status: params?.status as any,
        merchantId: params?.merchantId
      })
      return { data: summaries }
    }
    return apiClient.get('/v1/chargebacks/summaries', { params })
  }

  // Overview Live APIs
  async getOverviewSnapshot(
    range: string = 'last7d',
    timezone: string = 'Asia/Kolkata',
    windowStart?: string,
    windowEnd?: string
  ): Promise<OverviewSnapshot> {
    if (USE_MOCK_API) {
      return computeSnapshot(range, timezone, windowStart, windowEnd)
    }
    const response = await apiClient.get('/ops/metrics/snapshot', { 
      params: { range, tz: timezone, start: windowStart, end: windowEnd } 
    })
    return response.data
  }

  createOverviewEventSource(window: 'day' | '7d' | '30d' = '7d'): EventSource | null {
    if (USE_MOCK_API) {
      // Create a mock EventSource that emits from the overviewBus
      const mockEventSource = {
        listeners: new Map<string, Set<Function>>(),
        readyState: 1, // OPEN
        url: `/ops/overview/live?window=${window}`,
        withCredentials: false,
        
        addEventListener(event: string, handler: Function) {
          if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set())
          }
          this.listeners.get(event)?.add(handler)
        },
        
        removeEventListener(event: string, handler: Function) {
          this.listeners.get(event)?.delete(handler)
        },
        
        close() {
          this.readyState = 2 // CLOSED
          this.listeners.clear()
        },
        
        dispatchEvent(event: any) {
          const handlers = this.listeners.get(event.type)
          if (handlers) {
            handlers.forEach(handler => handler(event))
          }
          return true
        },
        
        onmessage: null as any,
        onerror: null as any,
        onopen: null as any
      }

      // Wire up to overviewBus
      const handleMetricsUpdate = async () => {
        const snapshot = await computeSnapshot(window)
        const event = new MessageEvent('metrics.updated', { data: JSON.stringify(snapshot) })
        mockEventSource.dispatchEvent(event)
      }

      const handleExceptionsUpdate = (payload: any) => {
        const event = new MessageEvent('exceptions.updated', { data: JSON.stringify(payload) })
        mockEventSource.dispatchEvent(event)
      }

      const handleHeartbeat = (payload: any) => {
        const event = new MessageEvent('heartbeat', { data: JSON.stringify(payload) })
        mockEventSource.dispatchEvent(event)
      }

      overviewBus.on('metrics.updated', handleMetricsUpdate)
      overviewBus.on('exceptions.updated', handleExceptionsUpdate)
      overviewBus.on('heartbeat', handleHeartbeat)

      // Initial snapshot
      setTimeout(async () => {
        const snapshot = await computeSnapshot(window)
        const event = new MessageEvent('metrics.updated', { data: JSON.stringify(snapshot) })
        mockEventSource.dispatchEvent(event)
      }, 100)

      // Override close to cleanup listeners
      const originalClose = mockEventSource.close.bind(mockEventSource)
      mockEventSource.close = () => {
        overviewBus.off('metrics.updated', handleMetricsUpdate)
        overviewBus.off('exceptions.updated', handleExceptionsUpdate)
        overviewBus.off('heartbeat', handleHeartbeat)
        originalClose()
      }

      return mockEventSource as any
    }

    // Real SSE connection (for production)
    return new EventSource(`${apiClient.defaults.baseURL}/ops/overview/live?window=${window}`)
  }

  // ===== Connector Management APIs =====
  
  async getConnectorsDemo(params?: {
    type?: string
    status?: string
  }): Promise<any[]> {
    // Always return mock data for demo
    return [
      {
        id: 'conn_pg_demo',
        name: 'PG Demo API',
        type: 'PG_API',
        endpoint: 'http://localhost:5101',
        status: 'active',
        lastRun: new Date(Date.now() - 3600000).toISOString(),
        nextRun: new Date(Date.now() + 60000).toISOString(),
        createdAt: '2025-09-01T00:00:00Z',
        updatedAt: new Date().toISOString()
      },
      {
        id: 'conn_axis_sftp',
        name: 'Axis Bank SFTP',
        type: 'BANK_SFTP',
        root: '/home/sp-sftp/incoming',
        pattern: 'AXIS_RECON_{yyyyMMdd}.csv',
        status: 'active',
        lastRun: new Date(Date.now() - 7200000).toISOString(),
        nextRun: new Date(Date.now() + 120000).toISOString(),
        createdAt: '2025-09-01T00:00:00Z',
        updatedAt: new Date().toISOString()
      }
    ]
  }

  async getConnectorJobsDemo(connectorId: string): Promise<any[]> {
    if (USE_MOCK_API) {
      const today = new Date().toISOString().split('T')[0]
      return [
        {
          id: uuidv4(),
          connectorId,
          connectorName: connectorId === 'conn_pg_demo' ? 'PG Demo API' : 'Axis Bank SFTP',
          cycleDate: today,
          status: 'done',
          stats: {
            ingested: 15,
            normalized: 15,
            matched: 12,
            unmatched: 2,
            exceptions: 1
          },
          startedAt: new Date(Date.now() - 300000).toISOString(),
          completedAt: new Date(Date.now() - 240000).toISOString()
        }
      ]
    }
    return apiClient.get(`/api/ops/connectors/${connectorId}/jobs`).then(r => r.data)
  }

  async runConnectorDemo(connectorId: string): Promise<any> {
    if (USE_MOCK_API) {
      return {
        jobId: uuidv4(),
        message: 'Connector job started'
      }
    }
    return apiClient.post(`/api/ops/connectors/${connectorId}/run`).then(r => r.data)
  }

  createConnectorEventSourceDemo(): EventSource {
    if (USE_MOCK_API) {
      // Mock SSE for connector updates
      let interval: any = null
      const mockSource: any = {
        close: () => {
          if (interval) {
            clearInterval(interval)
          }
        },
        addEventListener: (event: string, handler: Function) => {
          if (event === 'job_update') {
            // Simulate job updates every 5 seconds
            interval = setInterval(() => {
              handler({
                data: JSON.stringify({
                  type: 'job_update',
                  jobId: uuidv4(),
                  connectorId: 'conn_pg_demo',
                  status: 'running',
                  stats: {
                    ingested: Math.floor(Math.random() * 20),
                    normalized: Math.floor(Math.random() * 20),
                    matched: Math.floor(Math.random() * 15),
                    unmatched: Math.floor(Math.random() * 5),
                    exceptions: Math.floor(Math.random() * 3)
                  },
                  timestamp: new Date().toISOString()
                })
              })
            }, 5000)
          }
        },
        removeEventListener: () => {}
      }
      return mockSource
    }
    return new EventSource('/api/ops/connectors/events')
  }
}

export const opsApiExtended = new OpsApiExtended()