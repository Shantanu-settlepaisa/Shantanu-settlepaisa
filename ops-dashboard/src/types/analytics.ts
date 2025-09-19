// Analytics Types for OP-0009

// KPI Dashboard Types
export interface AnalyticsKPIs {
  match_rate_today: number // percentage
  unmatched_today: number // count
  unmatched_value_paise: bigint
  unmatched_value_rupees: number
  exceptions_open: number // count
  exceptions_value_paise: bigint
  exceptions_value_rupees: number
  sla_met_pct_today: number // percentage
  avg_bank_file_delay_hours: number // decimal hours
  last_updated: string // ISO timestamp
}

// Match Rate Daily Aggregation
export interface MatchRateDaily {
  acquirer: string
  merchant?: string
  cycle_date: string
  matched: number
  unmatched: number
  exceptions: number
  match_rate_pct: number
  total_transactions: number
  total_amount_paise: bigint
  total_amount_rupees: number
}

// SLA Cycle Tracking
export interface SLACycle {
  acquirer: string
  cycle_date: string
  file_expected_at_ist: string
  file_received_at_ist?: string
  hours_late: number
  sla_met_bool: boolean
  impacted_merchants_count: number
  status: 'ON_TIME' | 'LATE' | 'MISSING'
}

// Exception Aging Buckets
export interface ExceptionBuckets {
  cycle_date: string
  acquirer: string
  reason_code: string
  count: number
  aged_24h: number
  aged_48h: number
  aged_72h: number
  total_amount_paise: bigint
  total_amount_rupees: number
}

// Throughput Hourly
export interface ThroughputHourly {
  acquirer: string
  hour_ist: string // YYYY-MM-DD HH:00
  ingested: number
  normalized: number
  matched: number
  completion_rate_pct: number
}

// Trend Series Data
export interface TrendSeries {
  date: string
  value: number
  label?: string
}

export interface TrendData {
  series: Array<{
    name: string // acquirer name
    data: TrendSeries[]
  }>
  categories: string[] // dates
}

// Reason Code Distribution
export interface ReasonCodeData {
  reason_code: string
  count: number
  percentage: number
  amount_paise: bigint
  amount_rupees: number
  acquirer: string
}

// SLA Heatmap Data
export interface SLAHeatmapCell {
  acquirer: string
  date: string
  hours_late: number
  sla_met: boolean
  status: 'ON_TIME' | 'LATE' | 'MISSING'
  impacted_merchants: number
}

export interface SLAHeatmapData {
  acquirers: string[]
  dates: string[]
  cells: SLAHeatmapCell[]
}

// Aging Exceptions Table
export interface AgingException {
  txn_id: string
  acquirer: string
  merchant: string
  merchant_name: string
  reason_code: string
  reason_description: string
  age_hours: number
  amount_paise: bigint
  amount_rupees: number
  cycle_date: string
  created_at: string
  bucket: '24h' | '48h' | '72h'
}

// Late Bank Files Table
export interface LateBankFile {
  acquirer: string
  cycle_date: string
  expected_at: string
  received_at?: string
  hours_late: number
  impacted_merchants_count: number
  impacted_merchants: string[]
  file_size_bytes?: number
  status: 'LATE' | 'MISSING'
}

// Alert Configuration
export interface AlertThreshold {
  id: string
  metric: 'match_rate_today' | 'sla_met_today' | 'exception_aging'
  warn_threshold: number
  critical_threshold: number
  enabled: boolean
  acquirer?: string // null for all acquirers
  created_by: string
  created_at: string
  updated_at: string
}

// Alert Event
export interface AlertEvent {
  id: string
  alert_type: 'ops.alert.match_rate_low' | 'ops.alert.sla_breach' | 'ops.alert.exception_backlog'
  severity: 'WARN' | 'CRITICAL'
  metric_value: number
  threshold_value: number
  acquirer?: string
  message: string
  created_at: string
  acknowledged_at?: string
  acknowledged_by?: string
}

// API Request/Response Types
export interface AnalyticsKPIRequest {
  date?: string // YYYY-MM-DD, defaults to today
  acquirer?: string
}

export interface AnalyticsTrendRequest {
  from: string // YYYY-MM-DD
  to: string // YYYY-MM-DD
  acquirer?: string
  metric?: string
}

export interface AnalyticsBacklogRequest {
  bucket: '24h' | '48h' | '72h'
  acquirer?: string
  limit?: number
  offset?: number
}

export interface AnalyticsExportRequest {
  type: 'kpis' | 'trends' | 'heatmap' | 'aging' | 'late_files'
  format: 'CSV' | 'XLSX'
  filters: Record<string, any>
}

// Response wrappers
export interface AnalyticsResponse<T> {
  data: T
  meta?: {
    total_count?: number
    page?: number
    limit?: number
    generated_at: string
    cache_expires_at?: string
  }
}

// Chart configuration
export interface ChartConfig {
  type: 'line' | 'bar' | 'heatmap' | 'pie'
  title: string
  subtitle?: string
  height?: number
  colors?: string[]
  thresholds?: {
    warn: number
    critical: number
  }
}

// Dashboard refresh state
export interface DashboardState {
  lastRefresh: string
  refreshInterval: number // seconds
  autoRefresh: boolean
  loading: boolean
  error?: string
}

// Materialized view refresh status
export interface MVRefreshStatus {
  view_name: string
  last_refresh: string
  next_refresh: string
  refresh_duration_ms: number
  row_count: number
  status: 'SUCCESS' | 'FAILED' | 'RUNNING'
  error?: string
}