import { useState } from 'react'
import { 
  FileUp,
  Wifi
} from 'lucide-react'
import { ManualUploadEnhanced } from '@/components/ManualUploadEnhanced'
import { ConnectorsAutomated } from '@/components/ConnectorsAutomated'

export default function ReconWorkspaceSimplified() {
  const [activeTab, setActiveTab] = useState<'manual' | 'connectors'>('manual')

  return (
    <div className="h-full flex flex-col">
      {/* Header with Tabs */}
      <div className="border-b border-gray-200 bg-white">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Reconciliation Workspace</h1>
              <p className="text-sm text-gray-500">Manage reconciliation jobs and file processing</p>
            </div>
          </div>
        </div>
        
        {/* Tab Navigation - Only Manual Upload and Connectors */}
        <div className="px-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('manual')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'manual'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FileUp className="w-4 h-4 inline mr-1.5" />
              Manual Upload
            </button>
            <button
              onClick={() => setActiveTab('connectors')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'connectors'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Wifi className="w-4 h-4 inline mr-1.5" />
              Connectors
            </button>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          {activeTab === 'manual' ? (
            <ManualUploadEnhanced />
          ) : (
            <ConnectorsAutomated />
          )}
        </div>
      </div>
    </div>
  )
}