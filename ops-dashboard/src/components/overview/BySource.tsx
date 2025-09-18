import { BySourceItem, formatIndianCurrency } from '@/services/overview';
import { ArrowRight, Clock, AlertCircle } from 'lucide-react';

interface BySourceProps {
  data: BySourceItem[];
  isLoading?: boolean;
  onSourceClick?: (source: string) => void;
}

export function BySource({ data, isLoading, onSourceClick }: BySourceProps) {
  if (isLoading || !data) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Reconciliation by Source</h3>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-12 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const maxValue = data.length > 0 ? Math.max(...data.map(d => d.pipeline.captured)) : 1;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Data Sources</h3>
        <span className="text-sm text-gray-500">Last 7 days</span>
      </div>
      
      <div className="space-y-4">
        {data.map((item) => {
          const isConnector = item.source !== 'MANUAL';
          const barWidth = item.pipeline.captured > 0 ? (item.pipeline.captured / maxValue) * 100 : 0;
          
          // Calculate matched count: captured - unsettled (since pipeline stages are cumulative)
          const matchedCount = (item.pipeline?.captured || 0) - (item.pipeline?.unsettled || 0);
          const actualMatchRate = (item.pipeline?.captured || 0) > 0 ? Math.round((matchedCount / (item.pipeline?.captured || 1)) * 100) : 0;
          
          return (
            <div
              key={item.source}
              className="group cursor-pointer"
              onClick={() => onSourceClick?.(item.source)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{item.source}</span>
                  {isConnector && item.lastSync && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="w-3 h-3" />
                      <span>{item.lastSync}</span>
                    </div>
                  )}
                  {item.exceptions > 0 && (
                    <div className="flex items-center gap-1 text-xs text-amber-600">
                      <AlertCircle className="w-3 h-3" />
                      <span>{item.exceptions} exceptions</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900">
                    {actualMatchRate}% match
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                </div>
              </div>
              
              <div className="relative">
                <div className="w-full bg-gray-100 rounded-full h-8 overflow-hidden">
                  <div className="flex h-full">
                    <div
                      className="bg-green-500 transition-all duration-500"
                      style={{ width: `${(item.pipeline.credited / item.pipeline.captured) * barWidth}%` }}
                    />
                    <div
                      className="bg-blue-400 transition-all duration-500"
                      style={{ width: `${((item.pipeline.sentToBank - item.pipeline.credited) / item.pipeline.captured) * barWidth}%` }}
                    />
                    <div
                      className="bg-amber-400 transition-all duration-500"
                      style={{ width: `${((item.pipeline.inSettlement - item.pipeline.sentToBank) / item.pipeline.captured) * barWidth}%` }}
                    />
                    <div
                      className="bg-red-400 transition-all duration-500"
                      style={{ width: `${(item.pipeline.unsettled / item.pipeline.captured) * barWidth}%` }}
                    />
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <span>{formatIndianCurrency(item.pipeline.captured * 10000)} captured</span>
                    <span className="font-medium text-green-600">{actualMatchRate}% matched</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {item.pipeline.captured.toLocaleString('en-IN')} txns
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span className="text-gray-600">Credited</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-400 rounded"></div>
              <span className="text-gray-600">Sent to Bank</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-amber-400 rounded"></div>
              <span className="text-gray-600">In Settlement</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-400 rounded"></div>
              <span className="text-gray-600">Unsettled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}