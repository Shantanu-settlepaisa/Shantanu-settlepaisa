// Connector Management Types

export type ConnectorType = 'SFTP' | 'API'
export type ConnectorProvider = 'AXIS' | 'BOB' | 'HDFC' | 'ICICI' | 'PG' | 'CUSTOM'
export type ConnectorStatus = 'ACTIVE' | 'PAUSED'
export type ConnectorHealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'NEVER_RUN'
export type RunOutcome = 'SUCCESS' | 'PARTIAL' | 'FAILED'
export type FileState = 'DISCOVERED' | 'DOWNLOADED' | 'NORMALIZED' | 'MATCHED' | 'ERROR'

// SFTP Configuration
export interface SFTPConfig {
  host: string
  port: number
  username: string
  authType: 'password' | 'privateKey'
  password?: string
  privateKey?: string
  remotePath: string
  filePattern: string // glob pattern like AXIS_RECON_YYYYMMDD*.csv
  checksumExt?: string // .sha256, .md5
  pgpPublicKey?: string
  timezone: string // default IST
  schedule: string // cron expression
  targetCycleRule: string // 'yesterday', 'today', 'custom'
}

// API Configuration
export interface APIConfig {
  baseUrl: string
  authType: 'bearer' | 'apiKey' | 'basic'
  token?: string
  apiKey?: string
  username?: string
  password?: string
  endpoint: string
  queryParams?: Record<string, string>
  headers?: Record<string, string>
  schedule: string // cron expression
  timezone: string
  responseFormat: 'csv' | 'json' | 'xml'
}

// Main Connector Model
export interface Connector {
  id: string
  name: string
  type: ConnectorType
  provider: ConnectorProvider
  merchantId?: string
  merchantName?: string
  acquirerCode?: string
  config: SFTPConfig | APIConfig
  mappingTemplateId?: string
  mappingTemplateName?: string
  status: ConnectorStatus
  lastRunAt?: string
  lastOkAt?: string
  healthStatus?: ConnectorHealthStatus
  createdAt: string
  updatedAt: string
  createdBy?: string
  updatedBy?: string
}

// Connector Run
export interface ConnectorRun {
  id: string
  connectorId: string
  connectorName: string
  cycleDate: string
  startedAt: string
  finishedAt?: string
  outcome?: RunOutcome
  filesDiscovered: number
  filesDownloaded: number
  reconJobId?: string
  error?: string
  metrics?: {
    duration?: number
    bytesDownloaded?: number
    rowsProcessed?: number
    matchesFound?: number
    exceptionsCreated?: number
  }
  createdAt: string
}

// Ingested File
export interface IngestedFile {
  id: string
  connectorId: string
  connectorRunId?: string
  cycleDate: string
  remotePath: string
  localUri?: string
  sha256?: string
  pgpVerified: boolean
  fileBytes?: number
  dedupeKey: string
  state: FileState
  error?: string
  reconFileId?: string
  createdAt: string
  updatedAt: string
}

// Connector Health
export interface ConnectorHealth {
  connectorId: string
  connectorName: string
  status: ConnectorHealthStatus
  lastRunAt?: string
  lastOkAt?: string
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  successRate: number
  avgDuration?: number
  nextScheduledRun?: string
  backlog: {
    missingDays: number
    oldestMissing?: string
  }
}

// Connector Request/Response Types
export interface CreateConnectorRequest {
  name: string
  type: ConnectorType
  provider: ConnectorProvider
  merchantId?: string
  acquirerCode?: string
  config: SFTPConfig | APIConfig
  mappingTemplateId?: string
}

export interface UpdateConnectorRequest {
  name?: string
  config?: Partial<SFTPConfig | APIConfig>
  mappingTemplateId?: string
  status?: ConnectorStatus
}

export interface TestConnectorResponse {
  success: boolean
  message: string
  details?: {
    connected: boolean
    authenticated: boolean
    filesFound?: string[]
    error?: string
  }
}

export interface RunConnectorRequest {
  cycleDate?: string // optional, defaults to yesterday
  force?: boolean // ignore dedupe
}

export interface BackfillRequest {
  startDate: string
  endDate: string
  force?: boolean
}

export interface ConnectorListResponse {
  connectors: Connector[]
  total: number
  cursor?: string
  hasMore: boolean
}

export interface ConnectorRunsResponse {
  runs: ConnectorRun[]
  total: number
  cursor?: string
  hasMore: boolean
}

// Scheduler Configuration
export interface ScheduleConfig {
  cron: string
  timezone: string
  enabled: boolean
  retryCount: number
  retryDelay: number // milliseconds
  timeout: number // milliseconds
}

// Health Check
export interface HealthCheck {
  connector: Connector
  health: ConnectorHealth
  recentRuns: ConnectorRun[]
  missingFiles?: {
    cycleDate: string
    expectedFile: string
  }[]
  alerts?: {
    type: 'MISSING_FILE' | 'FAILED_RUN' | 'SLA_BREACH'
    message: string
    severity: 'info' | 'warning' | 'error' | 'critical'
    timestamp: string
  }[]
}