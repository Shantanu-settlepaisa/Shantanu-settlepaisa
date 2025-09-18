import { X, AlertTriangle, CheckCircle, XCircle, Clock, FileText, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';

interface ReconciliationError {
  code: string;
  message: string;
  stack?: string;
  userSafeHint?: string;
}

interface ReconciliationJob {
  id: string;
  correlationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  stage?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: ReconciliationError;
  counters?: {
    pgFetched: number;
    bankFetched: number;
    normalized: number;
    matched: number;
    unmatchedPg: number;
    unmatchedBank: number;
    exceptions: number;
  };
}

interface ReconciliationErrorModalProps {
  jobId?: string;
  error?: ReconciliationError;
  onClose: () => void;
  onRetry?: () => void;
  onViewLogs?: (jobId: string) => void;
}

export function ReconciliationErrorModal({
  jobId,
  error: initialError,
  onClose,
  onRetry,
  onViewLogs
}: ReconciliationErrorModalProps) {
  const [job, setJob] = useState<ReconciliationJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [connectorHealth, setConnectorHealth] = useState<{
    pg?: { status: string; error?: string; hint?: string };
    bank?: { status: string; error?: string; hint?: string };
  }>({});

  useEffect(() => {
    if (jobId) {
      fetchJobDetails();
      checkConnectorHealth();
    }
  }, [jobId]);

  const fetchJobDetails = async () => {
    if (!jobId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:5103/recon/jobs/${jobId}`);
      if (response.ok) {
        const data = await response.json();
        setJob(data);
      }
    } catch (error) {
      console.error('Failed to fetch job details:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkConnectorHealth = async () => {
    // Check PG connector
    try {
      const pgResponse = await fetch('http://localhost:5103/connectors/pg/health');
      const pgData = await pgResponse.json();
      setConnectorHealth(prev => ({ ...prev, pg: pgData }));
    } catch (error) {
      setConnectorHealth(prev => ({ 
        ...prev, 
        pg: { status: 'error', error: 'Failed to check PG connector' }
      }));
    }

    // Check Bank connector
    try {
      const bankResponse = await fetch('http://localhost:5103/connectors/bank/health');
      const bankData = await bankResponse.json();
      setConnectorHealth(prev => ({ ...prev, bank: bankData }));
    } catch (error) {
      setConnectorHealth(prev => ({ 
        ...prev, 
        bank: { status: 'error', error: 'Failed to check Bank connector' }
      }));
    }
  };

  const error = job?.error || initialError;
  const hasPartialData = job?.counters && (
    job.counters.pgFetched > 0 || job.counters.bankFetched > 0
  );

  const getStageIcon = (stage?: string) => {
    switch (stage) {
      case 'validation':
        return <FileText className="w-4 h-4" />;
      case 'fetch_pg':
      case 'fetch_bank':
        return <RefreshCw className="w-4 h-4" />;
      case 'matching':
        return <CheckCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getErrorSeverity = (code?: string) => {
    if (!code) return 'warning';
    if (code.includes('UNREACHABLE') || code.includes('AUTH_FAILED')) return 'critical';
    if (code.includes('TIMEOUT') || code.includes('MISMATCH')) return 'error';
    return 'warning';
  };

  const severityStyles = {
    critical: 'bg-red-50 border-red-200 text-red-800',
    error: 'bg-orange-50 border-orange-200 text-orange-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-semibold text-slate-900">
              Reconciliation Failed
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Error Summary */}
              {error && (
                <div className={`p-4 rounded-lg border ${severityStyles[getErrorSeverity(error.code)]}`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium">
                        {error.code || 'UNKNOWN_ERROR'}
                      </div>
                      <div className="text-sm mt-1 opacity-90">
                        {error.message}
                      </div>
                      {error.userSafeHint && (
                        <div className="mt-3 p-3 bg-white bg-opacity-60 rounded border border-current border-opacity-20">
                          <div className="text-sm font-medium mb-1">Suggested Action:</div>
                          <div className="text-sm">{error.userSafeHint}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Job Progress */}
              {job && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="text-sm font-medium text-slate-700 mb-3">Job Progress</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Job ID:</span>
                      <code className="font-mono text-xs bg-white px-2 py-1 rounded">
                        {job.id.substring(0, 8)}...
                      </code>
                    </div>
                    {job.stage && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Failed at stage:</span>
                        <div className="flex items-center gap-2">
                          {getStageIcon(job.stage)}
                          <span className="font-medium">{job.stage}</span>
                        </div>
                      </div>
                    )}
                    {job.correlationId && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Correlation ID:</span>
                        <code className="font-mono text-xs bg-white px-2 py-1 rounded">
                          {job.correlationId.substring(0, 8)}...
                        </code>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Partial Data */}
              {hasPartialData && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-sm font-medium text-blue-900 mb-2">
                    Partial Data Retrieved
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-blue-700">PG Records:</span>
                      <span className="ml-2 font-medium text-blue-900">
                        {job?.counters?.pgFetched || 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-blue-700">Bank Records:</span>
                      <span className="ml-2 font-medium text-blue-900">
                        {job?.counters?.bankFetched || 0}
                      </span>
                    </div>
                    {job?.counters?.matched && job.counters.matched > 0 && (
                      <div className="col-span-2">
                        <span className="text-blue-700">Matched before failure:</span>
                        <span className="ml-2 font-medium text-blue-900">
                          {job.counters.matched}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Connector Health */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700">Connector Status</div>
                
                {/* PG Connector */}
                <div className="flex items-center justify-between p-3 bg-white border rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      connectorHealth.pg?.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                    <span className="text-sm font-medium">PG API</span>
                  </div>
                  {connectorHealth.pg?.status === 'healthy' ? (
                    <span className="text-xs text-green-600">Connected</span>
                  ) : (
                    <span className="text-xs text-red-600">
                      {connectorHealth.pg?.error || 'Disconnected'}
                    </span>
                  )}
                </div>

                {/* Bank Connector */}
                <div className="flex items-center justify-between p-3 bg-white border rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      connectorHealth.bank?.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                    <span className="text-sm font-medium">Bank SFTP</span>
                  </div>
                  {connectorHealth.bank?.status === 'healthy' ? (
                    <span className="text-xs text-green-600">Connected</span>
                  ) : (
                    <span className="text-xs text-red-600">
                      {connectorHealth.bank?.error || 'Disconnected'}
                    </span>
                  )}
                </div>
              </div>

              {/* Technical Details */}
              {error?.stack && (
                <div>
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {showDetails ? 'Hide' : 'Show'} Technical Details
                  </button>
                  {showDetails && (
                    <pre className="mt-2 p-3 bg-slate-900 text-slate-100 rounded text-xs overflow-x-auto">
                      {error.stack}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {jobId && onViewLogs && (
              <button
                onClick={() => onViewLogs(jobId)}
                className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                View Logs
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Close
            </button>
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
              >
                Retry Reconciliation
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}