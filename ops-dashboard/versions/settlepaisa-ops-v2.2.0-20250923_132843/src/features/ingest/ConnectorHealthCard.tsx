import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Activity, 
  AlertCircle, 
  CheckCircle, 
  XCircle,
  Clock,
  FileText,
  RefreshCw,
  ChevronRight,
  Download,
  Upload
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface ConnectorHealth {
  bank: string;
  last_file_at: string | null;
  expected_count: number;
  received_count: number;
  lag_minutes: number;
  window_status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
  message: string;
  updated_at: string;
}

interface IngestedFile {
  id: number;
  bank: string;
  filename: string;
  business_date: string;
  size_bytes: number;
  status: string;
  fail_reason: string | null;
  seen_at: string;
  completed_at: string | null;
  downloaded_at: string | null;
  validated_at: string | null;
}

interface FileExpectation {
  bank: string;
  window_start: string;
  window_end: string;
  business_date: string;
  expected_name: string;
  expected_seq: number | null;
  required: boolean;
  received: boolean;
  received_at: string | null;
}

const API_BASE = 'http://localhost:5106'; // Direct URL for Ingest API

export const ConnectorHealthCard: React.FC = () => {
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<'files' | 'windows'>('files');

  // Check feature flag - temporarily always true for debugging
  const isFeatureEnabled = true; // import.meta.env.VITE_FEATURE_BANK_SFTP_INGESTION === 'true';

  // Fetch connector health
  const { data: healthData, refetch: refetchHealth } = useQuery({
    queryKey: ['connector-health'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/ingest/health`, {
        headers: {
          'X-User-Role': 'admin'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch health');
      return response.json() as Promise<ConnectorHealth[]>;
    },
    enabled: isFeatureEnabled,
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Fetch files for selected bank
  const { data: filesData } = useQuery({
    queryKey: ['ingested-files', selectedBank],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/ingest/files?bank=${selectedBank}`, {
        headers: {
          'X-User-Role': 'admin'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch files');
      return response.json() as Promise<IngestedFile[]>;
    },
    enabled: !!selectedBank
  });

  // Fetch expectations for selected bank
  const { data: expectationsData } = useQuery({
    queryKey: ['file-expectations', selectedBank],
    queryFn: async () => {
      const date = new Date().toISOString().split('T')[0];
      const response = await fetch(`${API_BASE}/api/ingest/expectations?bank=${selectedBank}&date=${date}`, {
        headers: {
          'X-User-Role': 'admin'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch expectations');
      return response.json() as Promise<FileExpectation[]>;
    },
    enabled: !!selectedBank
  });

  // Removed feature check for debugging
  // if (!isFeatureEnabled) {
  //   return null;
  // }

  const healthSummary = {
    healthy: healthData?.filter(h => h.window_status === 'HEALTHY').length || 0,
    degraded: healthData?.filter(h => h.window_status === 'DEGRADED').length || 0,
    down: healthData?.filter(h => h.window_status === 'DOWN').length || 0,
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'HEALTHY':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'DEGRADED':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'DOWN':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Activity className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full";
    switch (status) {
      case 'HEALTHY':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'DEGRADED':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'DOWN':
        return `${baseClasses} bg-red-100 text-red-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const handleRecompute = async () => {
    const date = new Date().toISOString().split('T')[0];
    try {
      const response = await fetch(`${API_BASE}/api/ingest/reconcile?bank=${selectedBank}&date=${date}`, {
        method: 'POST',
        headers: {
          'X-User-Role': 'admin'
        }
      });
      if (response.ok) {
        refetchHealth();
      }
    } catch (error) {
      console.error('Failed to recompute:', error);
    }
  };

  const handlePollNow = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/ingest/pull-now?bank=${selectedBank}`, {
        method: 'POST',
        headers: {
          'X-User-Role': 'admin'
        }
      });
      if (response.ok) {
        refetchHealth();
      }
    } catch (error) {
      console.error('Failed to trigger poll:', error);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Connector Health</h2>
        </div>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
            {healthSummary.healthy} Healthy
          </span>
          <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full">
            {healthSummary.degraded} Degraded
          </span>
          <span className="px-3 py-1 bg-red-100 text-red-800 text-sm rounded-full">
            {healthSummary.down} Down
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {healthData?.map((health) => (
          <div
            key={health.bank}
            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
            onClick={() => setSelectedBank(health.bank)}
          >
            <div className="flex items-center gap-4">
              {getStatusIcon(health.window_status)}
              <div>
                <p className="font-medium text-gray-900">{health.bank}</p>
                <p className="text-sm text-gray-500">{health.message}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-sm text-gray-500">Last File</p>
                <p className="text-sm font-medium">
                  {health.last_file_at 
                    ? formatDistanceToNow(new Date(health.last_file_at), { addSuffix: true })
                    : 'Never'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Files</p>
                <p className="text-sm font-medium">
                  {health.received_count}/{health.expected_count}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Lag</p>
                <p className="text-sm font-medium">
                  {health.lag_minutes < 60 
                    ? `${health.lag_minutes}m`
                    : `${Math.round(health.lag_minutes / 60)}h`}
                </p>
              </div>
              <span className={getStatusBadge(health.window_status)}>
                {health.window_status}
              </span>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        ))}
      </div>

      {/* Drawer Panel */}
      {selectedBank && (
        <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-50 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{selectedBank} Details</h3>
              <button
                onClick={() => setSelectedBank(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <div className="flex gap-2">
              <button
                className={`px-3 py-1 rounded ${drawerTab === 'files' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}
                onClick={() => setDrawerTab('files')}
              >
                <FileText className="w-4 h-4 inline mr-1" />
                Files
              </button>
              <button
                className={`px-3 py-1 rounded ${drawerTab === 'windows' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}
                onClick={() => setDrawerTab('windows')}
              >
                <Clock className="w-4 h-4 inline mr-1" />
                Windows
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {drawerTab === 'files' && (
              <div className="space-y-3">
                {filesData?.map((file) => (
                  <div key={file.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{file.filename}</p>
                        <p className="text-xs text-gray-500">
                          {formatBytes(file.size_bytes)} • {format(new Date(file.seen_at), 'MMM d, HH:mm')}
                        </p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        file.status === 'VALIDATED' ? 'bg-green-100 text-green-800' :
                        file.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {file.status}
                      </span>
                    </div>
                    {file.fail_reason && (
                      <p className="text-xs text-red-600 mt-2">{file.fail_reason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {drawerTab === 'windows' && (
              <div className="space-y-4">
                {expectationsData?.map((exp, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{exp.expected_name}</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(exp.window_start), 'HH:mm')} - {format(new Date(exp.window_end), 'HH:mm')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {exp.received ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                      <span className={`text-sm ${exp.received ? 'text-green-600' : 'text-red-600'}`}>
                        {exp.received ? 'Received' : 'Missing'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-200">
            <div className="flex gap-2">
              <button
                onClick={handleRecompute}
                className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                <RefreshCw className="w-4 h-4 inline mr-1" />
                Recompute
              </button>
              <button
                onClick={handlePollNow}
                className="flex-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                <Download className="w-4 h-4 inline mr-1" />
                Poll Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};