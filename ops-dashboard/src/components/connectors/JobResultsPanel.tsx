import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Eye,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { ReconResultsTable } from '../recon/ReconResultsTable';
import type { JobSummary } from '@/shared/reconMap';
import { formatINR, toUiStatus } from '@/shared/reconMap';

interface JobResultsPanelProps {
  jobId: string;
  onClose?: () => void;
}

export function JobResultsPanel({ jobId, onClose }: JobResultsPanelProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'matched' | 'exceptions'>('all');
  
  // Fetch job summary
  const { data: summary, isLoading: loadingSummary } = useQuery<JobSummary>({
    queryKey: ['recon-job-summary', jobId],
    queryFn: async () => {
      const response = await axios.get(`http://localhost:5103/recon/jobs/${jobId}/summary`);
      return response.data;
    },
    refetchInterval: 10000
  });

  // Fetch job results based on active tab
  const statusFilter = activeTab === 'matched' ? 'MATCHED' : 
                       activeTab === 'exceptions' ? 'EXCEPTION' : 
                       undefined;
  
  const { data: resultsData, isLoading: loadingResults } = useQuery({
    queryKey: ['recon-job-results', jobId, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      params.append('limit', '100');
      
      const response = await axios.get(
        `http://localhost:5103/recon/jobs/${jobId}/results?${params}`
      );
      return response.data;
    },
    refetchInterval: 10000
  });

  if (loadingSummary || !summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Transform results to table format
  const tableRows = resultsData?.results?.map((r: any) => ({
    id: r.id,
    txnId: r.txnId,
    utr: r.utr,
    rrn: r.rrn,
    pgAmount: Number(r.pgAmountPaise) / 100,
    bankAmount: r.bankAmountPaise ? Number(r.bankAmountPaise) / 100 : null,
    delta: r.pgAmountPaise && r.bankAmountPaise ? 
      (Number(r.pgAmountPaise) - Number(r.bankAmountPaise)) / 100 : null,
    pgDate: r.pgDate,
    bankDate: r.bankDate,
    status: r.status === 'MATCHED' ? 'Matched' :
            r.status === 'UNMATCHED_PG' ? 'Pending Bank' :
            r.status === 'UNMATCHED_BANK' ? 'Processing' :
            r.status === 'EXCEPTION' ? 'Mismatched' : 'Unknown'
  })) || [];

  const totalCount = summary.totals.count;
  const matchedCount = summary.breakdown.matched.count;
  const exceptionsCount = summary.breakdown.exceptions.count;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Reconciliation Results</h2>
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-500">Job ID: {jobId}</p>
              {summary && !summary.finalized && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                  Preview — not persisted
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.open(`/ops/recon/job/${jobId}`, '_blank')}
              className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              View Full Report
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Tiles */}
      <div className="px-6 py-4 border-b bg-gray-50">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Total</p>
                <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
                <p className="text-xs text-gray-500">
                  {formatINR(summary.totals.amountPaise)}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-gray-400" />
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Matched</p>
                <p className="text-2xl font-bold text-green-600">{matchedCount}</p>
                <p className="text-xs text-gray-500">
                  {formatINR(summary.breakdown.matched.amountPaise)}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Unmatched</p>
                <p className="text-2xl font-bold text-amber-600">
                  {summary.breakdown.unmatchedPg.count + summary.breakdown.unmatchedBank.count}
                </p>
                <p className="text-xs text-gray-500">
                  {formatINR(
                    BigInt(summary.breakdown.unmatchedPg.amountPaise || '0') +
                    BigInt(summary.breakdown.unmatchedBank.amountPaise || '0')
                  )}
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-amber-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Exceptions</p>
                <p className="text-2xl font-bold text-red-600">{exceptionsCount}</p>
                <p className="text-xs text-gray-500">
                  {formatINR(summary.breakdown.exceptions.amountPaise)}
                </p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </div>
        </div>

        {/* Exception Reasons */}
        {summary.byExceptionReason && summary.byExceptionReason.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Top Exception Reasons</p>
            <div className="flex gap-2">
              {summary.byExceptionReason.slice(0, 3).map((reason) => (
                <span
                  key={reason.reasonCode}
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"
                >
                  {reason.reasonLabel} ({reason.count})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <ReconResultsTable
          rows={tableRows}
          totalCount={totalCount}
          matchedCount={matchedCount}
          exceptionsCount={exceptionsCount}
          jobId={jobId}
          isLoading={loadingResults}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>
    </div>
  );
}