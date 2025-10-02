import React from 'react';
import { Activity, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

export const ConnectorHealthCardSimple: React.FC = () => {
  // Hardcoded mock data for testing
  const mockHealth = [
    {
      bank: 'AXIS',
      status: 'HEALTHY',
      lastFile: '30 minutes ago',
      files: '3/3',
      lag: '30m'
    },
    {
      bank: 'HDFC',
      status: 'DEGRADED',
      lastFile: '2 hours ago',
      files: '3/4',
      lag: '2h'
    },
    {
      bank: 'ICICI',
      status: 'DOWN',
      lastFile: '8 hours ago',
      files: '0/2',
      lag: '8h'
    }
  ];

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

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Connector Health (SFTP Ingestion)</h2>
        </div>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
            1 Healthy
          </span>
          <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full">
            1 Degraded
          </span>
          <span className="px-3 py-1 bg-red-100 text-red-800 text-sm rounded-full">
            1 Down
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {mockHealth.map((health) => (
          <div
            key={health.bank}
            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-4">
              {getStatusIcon(health.status)}
              <div>
                <p className="font-medium text-gray-900">{health.bank} Bank</p>
                <p className="text-sm text-gray-500">SFTP File Ingestion</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-sm text-gray-500">Last File</p>
                <p className="text-sm font-medium">{health.lastFile}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Files</p>
                <p className="text-sm font-medium">{health.files}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Lag</p>
                <p className="text-sm font-medium">{health.lag}</p>
              </div>
              <span className={getStatusBadge(health.status)}>
                {health.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-700">
          ℹ️ This component shows real-time health of SFTP file ingestion from partner banks. 
          Click on any bank to view detailed file history and expectations.
        </p>
      </div>
    </div>
  );
};