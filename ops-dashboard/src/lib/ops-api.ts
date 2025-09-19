import { apiClient } from './api-client'
import { mockOpsData } from './mock-ops-data'
import { opsApiExtended } from './ops-api-extended'

const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API !== 'false'

// Types
export interface OverviewMetrics {
  matchedPercentage: number
  matchedCount: number
  totalTransactions: number
  matchedTrend?: { value: number; direction: 'up' | 'down' | 'flat' }
  unmatchedValuePaise: number
  unmatchedCount: number
  unmatchedTrend?: { value: number; direction: 'up' | 'down' | 'flat' }
  openExceptions: number
  criticalExceptions: number
  exceptionTrend?: { value: number; direction: 'up' | 'down' | 'flat' }
  settlementValuePaise: number
  settlementTrend?: { value: number; direction: 'up' | 'down' | 'flat' }
}

export interface SettlementProgress {
  stages: Array<{
    name: string
    status: 'completed' | 'active' | 'pending'
    count: number
    valuePaise: number
    percentage: number
  }>
}

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

export interface NormalizationTemplate {
  id: string
  name: string
  acquirer: string
  version: string
  mappings: Record<string, string>
  transforms?: Record<string, string>
  createdAt: string
  updatedAt: string
}

// API client - combining base and extended
class OpsApi {
  // Overview APIs
  async getOverviewMetrics(): Promise<OverviewMetrics> {
    if (USE_MOCK_API) return mockOpsData.getOverviewMetrics()
    const { data } = await apiClient.get('/ops/overview/metrics')
    return data
  }

  async getSettlementProgress(): Promise<SettlementProgress> {
    if (USE_MOCK_API) return mockOpsData.getSettlementProgress()
    const { data } = await apiClient.get('/ops/overview/progress')
    return data
  }

  async getExceptionSnapshot(limit: number = 8) {
    if (USE_MOCK_API) return mockOpsData.getExceptionSnapshot(limit)
    const { data } = await apiClient.get(`/ops/overview/exceptions?limit=${limit}`)
    return data
  }

  async getDataSourcesStatus() {
    if (USE_MOCK_API) return mockOpsData.getDataSourcesStatus()
    const { data } = await apiClient.get('/ops/overview/datasources')
    return data
  }

  // Recon Workspace APIs - delegate to extended
  async createReconJob(data: any) {
    return opsApiExtended.createReconJob(data)
  }

  async getReconJobs(params?: any) {
    return opsApiExtended.getReconJobs(params)
  }

  async uploadReconFile(file: File, metadata: any) {
    return opsApiExtended.uploadReconFile(file, metadata)
  }

  async getFilePreview(fileId: string, limit?: number) {
    return opsApiExtended.getFilePreview(fileId, limit)
  }

  async normalizeReconData(jobId: string, templateId?: string, dryRun: boolean = false) {
    if (dryRun) {
      return opsApiExtended.normalizePreview(jobId, undefined, templateId)
    }
    return opsApiExtended.normalizeReconData(jobId, undefined, templateId)
  }

  async normalizePreview(jobId: string, fileId?: string, templateId?: string) {
    return opsApiExtended.normalizePreview(jobId, fileId, templateId)
  }

  async matchReconData(jobId: string, tolerances?: any) {
    return opsApiExtended.matchReconData(jobId, tolerances || { amountPaise: 0, minutes: 10 })
  }

  async getTemplates() {
    return opsApiExtended.getTemplates()
  }

  async saveTemplate(template: any) {
    return opsApiExtended.saveTemplate(template)
  }

  // Settlement Details APIs
  async getSettlementDetails(settlementId: string) {
    if (USE_MOCK_API) return mockOpsData.getSettlementDetails(settlementId)
    const { data } = await apiClient.get(`/ops/settlements/${settlementId}`)
    return data
  }

  async getSettlementTransactions(settlementId: string, cursor?: string) {
    if (USE_MOCK_API) return mockOpsData.getSettlementTransactions(settlementId)
    const { data } = await apiClient.get(`/ops/settlements/${settlementId}/transactions`, {
      params: { cursor }
    })
    return data
  }

  async getSettlementVariances(settlementId: string) {
    if (USE_MOCK_API) return mockOpsData.getSettlementVariances(settlementId)
    const { data } = await apiClient.get(`/ops/settlements/${settlementId}/variances`)
    return data
  }

  // Exception APIs - delegate to extended
  async getExceptions(filters?: any) {
    return opsApiExtended.getExceptions(filters)
  }

  async resolveException(exceptionId: string, action: string, reason: string, linkToSettlementId?: string) {
    return opsApiExtended.resolveException(exceptionId, action as any, reason, linkToSettlementId)
  }

  // Analytics APIs
  async getAnalytics(type: string, params?: { from?: string; to?: string }) {
    if (USE_MOCK_API) return mockOpsData.getAnalytics(type, params)
    const { data } = await apiClient.get(`/ops/analytics/${type}`, { params })
    return data
  }

  async generateReport(type: string, params: { from: string; to: string }) {
    if (USE_MOCK_API) return { reportId: 'mock-report-123', status: 'processing' }
    const { data } = await apiClient.post('/ops/mis/reports', { type, ...params })
    return data
  }

  async getReportStatus(reportId: string) {
    if (USE_MOCK_API) return mockOpsData.getReportStatus(reportId)
    const { data } = await apiClient.get(`/ops/mis/reports/${reportId}`)
    return data
  }

  // Sample Files
  async getSampleFiles() {
    return opsApiExtended.getSampleFiles()
  }
}

export const opsApi = new OpsApi()