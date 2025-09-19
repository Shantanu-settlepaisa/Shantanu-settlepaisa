export type ConnectorType = 'PG_API' | 'BANK_SFTP' | 'BANK_API';

export type ConnectorStatus = 'active' | 'inactive' | 'error';

export type JobRunStatus = 'queued' | 'running' | 'done' | 'failed';

export interface Connector {
  id: string;
  name: string;
  type: ConnectorType;
  endpoint?: string;
  root?: string;
  pattern?: string;
  mapping?: Record<string, string>;
  status: ConnectorStatus;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobRun {
  id: string;
  connectorId: string;
  connectorName: string;
  cycleDate: string;
  status: JobRunStatus;
  stats: {
    ingested: number;
    normalized: number;
    matched: number;
    unmatched: number;
    exceptions: number;
  };
  logs?: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface ConnectorEvent {
  type: 'job_update' | 'job_complete' | 'job_error';
  jobId: string;
  connectorId: string;
  status: JobRunStatus;
  stats?: JobRun['stats'];
  error?: string;
  timestamp: string;
}