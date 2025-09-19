import { useQuery } from '@tanstack/react-query'
import { opsApi } from '@/lib/ops-api'
import { DataSourceStatus } from '@/components/DataSourceStatus'
import { Database, RefreshCw } from 'lucide-react'

export default function DataSources() {
  const { data: sources, isLoading, refetch } = useQuery({
    queryKey: ['data-sources'],
    queryFn: () => opsApi.getDataSourcesStatus(),
    refetchInterval: 60000,
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Sources</h1>
          <p className="text-sm text-gray-500">Monitor connectivity and sync status</p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh All
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Payment Gateways</h2>
          </div>
          <DataSourceStatus 
            sources={sources?.filter((s: any) => s.type === 'pg') || []} 
          />
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Bank Feeds</h2>
          </div>
          <DataSourceStatus 
            sources={sources?.filter((s: any) => s.type === 'bank') || []} 
          />
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">ERP Systems</h2>
          </div>
          <DataSourceStatus 
            sources={sources?.filter((s: any) => s.type === 'erp') || []} 
          />
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <Database className="w-12 h-12 text-gray-400 mx-auto mb-3 animate-pulse" />
            <p className="text-gray-600">Loading data sources...</p>
          </div>
        </div>
      )}
    </div>
  )
}