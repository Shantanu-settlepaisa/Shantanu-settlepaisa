import { ConnectorsHealthItem, formatTimeAgo } from '@/services/overview';
import { Activity, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';

interface ConnectorsHealthProps {
  connectors: ConnectorsHealthItem[];
  isLoading?: boolean;
  onConnectorClick?: (connectorId: string) => void;
}

export function ConnectorsHealth({ connectors, isLoading, onConnectorClick }: ConnectorsHealthProps) {
  if (isLoading || !connectors) {
    return (
      <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Connectors Health</h3>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-12 bg-slate-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const getStatusIcon = (status: ConnectorsHealthItem['status']) => {
    switch (status) {
      case 'OK':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'LAGGING':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'FAILING':
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusColor = (status: ConnectorsHealthItem['status']) => {
    switch (status) {
      case 'OK':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'LAGGING':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'FAILING':
        return 'bg-red-50 text-red-700 border-red-200';
    }
  };

  const healthySummary = connectors.filter(c => c.status === 'OK').length;
  const totalConnectors = connectors.length;

  return (
    <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Connectors Health</h3>
        <div className="flex items-center gap-1">
          <Activity className="w-4 h-4 text-green-500" />
          <span className="text-sm text-slate-600">
            {healthySummary}/{totalConnectors} healthy
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {connectors.map((connector) => (
          <div
            key={connector.name}
            className="group cursor-pointer p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all"
            onClick={() => onConnectorClick?.(connector.name.toLowerCase())}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900">{connector.name}</span>
                {getStatusIcon(connector.status)}
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(connector.status)}`}>
                {connector.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-slate-500">Last Sync</p>
                <p className="text-slate-900 font-medium">
                  {formatTimeAgo(connector.lastSync)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Queue</p>
                <p className="text-slate-900 font-medium">
                  {connector.queuedFiles} files
                </p>
              </div>
            </div>

            {connector.failures > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  <span className="text-xs text-amber-600">
                    {connector.failures} recent failures
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {connectors.some(c => c.status !== 'OK') && (
        <div className="mt-4 p-3 bg-amber-50 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">Action Required</p>
              <p className="text-xs text-amber-700 mt-1">
                {connectors.filter(c => c.status === 'FAILING').length} connector(s) failing,
                {' '}{connectors.filter(c => c.status === 'LAGGING').length} lagging
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}