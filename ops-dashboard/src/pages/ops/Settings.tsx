import { Settings as SettingsIcon, FileText, Save } from 'lucide-react'
import { ReconRuleSettings } from '../../features/settings/reconRules/ReconRuleSettings'
import { useState, useEffect } from 'react'

export default function Settings() {
  const [userRole, setUserRole] = useState<string>('admin'); // In production, get from auth context
  
  // Check if user is admin
  const isAdmin = userRole === 'admin';
  
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Configure templates and system preferences</p>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center">
            <FileText className="w-5 h-5 text-gray-400 mr-3" />
            <h2 className="text-lg font-medium text-gray-900">Normalization Templates</h2>
          </div>
        </div>
        
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">
            Manage field mapping templates for different acquirers and file formats.
          </p>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">ICICI CSV v1</p>
                <p className="text-sm text-gray-500">Last updated: 5 days ago</p>
              </div>
              <button className="text-sm text-blue-600 hover:text-blue-800">Edit</button>
            </div>
            
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">BOB XLS v2</p>
                <p className="text-sm text-gray-500">Last updated: 3 days ago</p>
              </div>
              <button className="text-sm text-blue-600 hover:text-blue-800">Edit</button>
            </div>
          </div>
          
          <button className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
            <FileText className="w-4 h-4 mr-2" />
            Create Template
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center">
            <SettingsIcon className="w-5 h-5 text-gray-400 mr-3" />
            <h2 className="text-lg font-medium text-gray-900">System Preferences</h2>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Default SLA (hours)</label>
            <input
              type="number"
              defaultValue="24"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Auto-refresh interval (seconds)</label>
            <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
              <option value="30">30 seconds</option>
              <option value="60">1 minute</option>
              <option value="300">5 minutes</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Exception auto-escalation</label>
            <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          
          <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700">
            <Save className="w-4 h-4 mr-2" />
            Save Preferences
          </button>
        </div>
      </div>

      {/* Recon Rule Settings - Only visible when feature flag is ON and user is admin */}
      <ReconRuleSettings isAdmin={isAdmin} />
    </div>
  )
}