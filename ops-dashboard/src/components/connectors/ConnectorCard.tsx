import React, { useState } from 'react';
import { 
  Activity, 
  Clock, 
  Database, 
  FileText, 
  Globe,
  Play,
  Eye,
  AlertCircle,
  Wifi,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react';
import type { Connector } from '@/types/connector';

interface ConnectorCardProps {
  connector: Connector;
  onRunNow: (id: string) => void;
  onViewJobs: (id: string) => void;
  onCheck?: (id: string) => Promise<{ status: string; error?: string; hint?: string }>;
}

export function ConnectorCard({ connector, onRunNow, onViewJobs, onCheck }: ConnectorCardProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState<'healthy' | 'unhealthy' | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  
  const handleCheck = async () => {
    if (!onCheck) return;
    
    setIsChecking(true);
    setCheckStatus(null);
    setCheckError(null);
    
    try {
      const result = await onCheck(connector.id);
      setCheckStatus(result.status === 'healthy' ? 'healthy' : 'unhealthy');
      if (result.error) {
        setCheckError(result.hint || result.error);
      }
    } catch (error: any) {
      setCheckStatus('unhealthy');
      setCheckError(error.message || 'Connection check failed');
    } finally {
      setIsChecking(false);
      // Clear status after 5 seconds
      setTimeout(() => {
        setCheckStatus(null);
        setCheckError(null);
      }, 5000);
    }
  };
  const getTypeIcon = () => {
    switch (connector.type) {
      case 'PG_API':
        return <Globe className="w-5 h-5" />;
      case 'BANK_SFTP':
        return <FileText className="w-5 h-5" />;
      case 'BANK_API':
        return <Database className="w-5 h-5" />;
      default:
        return <Activity className="w-5 h-5" />;
    }
  };

  const getStatusColor = () => {
    switch (connector.status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatRelativeTime = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diff = Math.abs(now.getTime() - then.getTime());
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-gray-100 rounded-lg">
            {getTypeIcon()}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{connector.name}</h3>
            <p className="text-sm text-gray-500">{connector.type.replace('_', ' ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {checkStatus && (
            <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
              checkStatus === 'healthy' 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {checkStatus === 'healthy' ? (
                <><CheckCircle className="w-3 h-3" /> Connected</>
              ) : (
                <><XCircle className="w-3 h-3" /> Failed</>
              )}
            </span>
          )}
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor()}`}>
            {connector.status}
          </span>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {connector.endpoint && (
          <div className="flex items-center text-sm">
            <span className="text-gray-500 w-20">Endpoint:</span>
            <span className="text-gray-900 font-mono text-xs">{connector.endpoint}</span>
          </div>
        )}
        {connector.root && (
          <div className="flex items-center text-sm">
            <span className="text-gray-500 w-20">Path:</span>
            <span className="text-gray-900 font-mono text-xs">{connector.root}</span>
          </div>
        )}
        {connector.pattern && (
          <div className="flex items-center text-sm">
            <span className="text-gray-500 w-20">Pattern:</span>
            <span className="text-gray-900 font-mono text-xs">{connector.pattern}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
        <div className="flex items-center space-x-4">
          {connector.lastRun && (
            <div className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>Last run: {formatRelativeTime(connector.lastRun)}</span>
            </div>
          )}
          {connector.nextRun && (
            <div className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>Next: {formatRelativeTime(connector.nextRun)}</span>
            </div>
          )}
        </div>
      </div>

      {checkError && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {checkError}
        </div>
      )}
      
      <div className="flex space-x-2">
        {onCheck && (
          <button
            onClick={handleCheck}
            disabled={isChecking}
            className="inline-flex items-center justify-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isChecking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wifi className="w-4 h-4" />
            )}
          </button>
        )}
        <button
          onClick={() => onRunNow(connector.id)}
          className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
        >
          <Play className="w-4 h-4 mr-1" />
          Run Now
        </button>
        <button
          onClick={() => onViewJobs(connector.id)}
          className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
        >
          <Eye className="w-4 h-4 mr-1" />
          View Jobs
        </button>
      </div>
    </div>
  );
}