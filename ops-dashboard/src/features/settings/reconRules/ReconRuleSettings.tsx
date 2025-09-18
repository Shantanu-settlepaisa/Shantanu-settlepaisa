import React, { useState } from 'react';
import { Shield, Plus, Upload, Download } from 'lucide-react';
import { RuleList } from './RuleList';
import { RuleEditor } from './RuleEditor';
import { useRuleSettingsStore } from './useRuleSettingsStore';
import { reconRulesApi } from './api';

interface ReconRuleSettingsProps {
  isAdmin: boolean;
}

export function ReconRuleSettings({ isAdmin }: ReconRuleSettingsProps) {
  const [creating, setCreating] = useState(false);
  const { clearSelection } = useRuleSettingsStore();

  // Check feature flag (would come from env/config in production)
  const FEATURE_RECON_RULE_SETTINGS = true; // Default false in production

  // Don't render if feature flag is off or user is not admin
  if (!FEATURE_RECON_RULE_SETTINGS || !isAdmin) {
    return null;
  }

  const handleCreateRule = async () => {
    try {
      setCreating(true);
      const newRule = await reconRulesApi.createRule({
        name: 'New Rule',
        scope: null,
        match_chain: ['UTR'],
        status: 'draft',
        updatedBy: 'current-user@settlepaisa.com'
      });
      alert(`Created new rule: ${newRule.name}`);
      // Refresh list
      window.location.reload();
    } catch (error) {
      console.error('Failed to create rule:', error);
      alert('Failed to create rule. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const rules = JSON.parse(e.target?.result as string);
            alert(`Import functionality would import ${Array.isArray(rules) ? rules.length : 1} rule(s)`);
          } catch (error) {
            alert('Invalid JSON file');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleExport = async () => {
    try {
      const { rules } = await reconRulesApi.listRules({ pageSize: 1000 });
      const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recon-rules-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export rules:', error);
      alert('Failed to export rules. Please try again.');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Shield className="w-5 h-5 text-gray-400 mr-3" />
            <h2 className="text-lg font-medium text-gray-900">Recon Rule Settings</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateRule}
              disabled={creating}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus className="w-4 h-4 mr-1" />
              {creating ? 'Creating...' : 'New Rule'}
            </button>
            <button
              onClick={handleImport}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium border rounded-lg hover:bg-gray-50"
            >
              <Upload className="w-4 h-4 mr-1" />
              Import
            </button>
            <button
              onClick={handleExport}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium border rounded-lg hover:bg-gray-50"
            >
              <Download className="w-4 h-4 mr-1" />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="flex" style={{ height: '600px' }}>
        {/* Left: Rule List (35%) */}
        <div className="w-[35%] border-r">
          <RuleList />
        </div>

        {/* Right: Rule Editor (65%) */}
        <div className="flex-1">
          <RuleEditor />
        </div>
      </div>
    </div>
  );
}