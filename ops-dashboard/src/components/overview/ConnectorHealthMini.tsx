import { Activity, CheckCircle, AlertCircle, XCircle, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { KpiFilters } from '@/hooks/opsOverview';

interface ConnectorStatus {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  lastSync: string;
  lag?: number; // in minutes
}

interface ConnectorHealthMiniProps {
  filters: KpiFilters;
  isLoading?: boolean;
}

export function ConnectorHealthMini({ filters, isLoading: parentLoading }: ConnectorHealthMiniProps) {
  const navigate = useNavigate();

  // Fetch connector health status
  const { data: connectors, isLoading } = useQuery({
    queryKey: ['connector-health-mini', filters],
    queryFn: async () => {
      const { data } = await apiClient.get<ConnectorStatus[]>('/api/connectors/health-summary', {
        params: filters,
        baseURL: 'http://localhost:5105'
      });
      return data;
    },
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const loading = parentLoading || isLoading;

  if (loading) {
    return (
      <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-5 bg-slate-200 rounded w-32 mb-4"></div>
          <div className="grid grid-cols-3 gap-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const healthSummary = {
    healthy: connectors?.filter(c => c.status === 'healthy').length || 0,
    degraded: connectors?.filter(c => c.status === 'degraded').length || 0,
    down: connectors?.filter(c => c.status === 'down').length || 0,
  };

  const totalConnectors = (healthSummary.healthy + healthSummary.degraded + healthSummary.down) || 1;
  const healthPercentage = Math.round((healthSummary.healthy / totalConnectors) * 100);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'degraded':
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      case 'down':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'degraded':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'down':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const handleViewAll = () => {
    navigate('/ops/connectors');
  };

  const handleConnectorClick = (connectorId: string) => {
    navigate(`/ops/connectors/${connectorId}`);
  };

  return (
    <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Connector Health</h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Activity className={`w-4 h-4 ${healthPercentage >= 80 ? 'text-green-500' : healthPercentage >= 50 ? 'text-amber-500' : 'text-red-500'}`} />
            <span className="text-sm font-medium text-slate-600">
              {healthPercentage}% Healthy
            </span>
          </div>
        </div>
      </div>

      {/* Health Summary Cards */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center justify-between mb-1">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-2xl font-bold text-green-700">{healthSummary.healthy}</span>
          </div>
          <p className="text-xs text-green-600 font-medium">Healthy</p>
        </div>
        
        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
          <div className="flex items-center justify-between mb-1">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span className="text-2xl font-bold text-amber-700">{healthSummary.degraded}</span>
          </div>
          <p className="text-xs text-amber-600 font-medium">Degraded</p>
        </div>
        
        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-center justify-between mb-1">
            <XCircle className="w-4 h-4 text-red-600" />
            <span className="text-2xl font-bold text-red-700">{healthSummary.down}</span>
          </div>
          <p className="text-xs text-red-600 font-medium">Down</p>
        </div>
      </div>

      {/* Critical Connectors */}
      {connectors && connectors.length > 0 && (
        <div className="space-y-2">
          {connectors
            .filter(c => c.status !== 'healthy')
            .slice(0, 3)
            .map((connector) => (
              <div
                key={connector.id}
                className="group cursor-pointer p-2 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-between"
                onClick={() => handleConnectorClick(connector.id)}
              >
                <div className="flex items-center gap-2">
                  {getStatusIcon(connector.status)}
                  <div>
                    <p className="text-sm font-medium text-slate-900">{connector.name}</p>
                    <p className="text-xs text-slate-500">
                      {connector.lag ? `${connector.lag}m lag` : 'Last sync unknown'}
                    </p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(connector.status)}`}>
                  {connector.status}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* View All Button */}
      <button
        onClick={handleViewAll}
        className="mt-4 w-full flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
      >
        View All Connectors
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* Alert if any connector is down */}
      {healthSummary.down > 0 && (
        <div className="mt-3 p-3 bg-red-50 rounded-lg">
          <div className="flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-red-900">Critical Alert</p>
              <p className="text-xs text-red-700 mt-0.5">
                {healthSummary.down} connector{healthSummary.down > 1 ? 's' : ''} down - data sync interrupted
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}