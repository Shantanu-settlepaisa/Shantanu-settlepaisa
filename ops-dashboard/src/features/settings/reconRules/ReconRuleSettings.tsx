import React, { useState } from 'react';
import { Shield, Plus, Upload, Download, X } from 'lucide-react';
import { RuleList } from './RuleList';
import { RuleEditor } from './RuleEditor';
import { useRuleSettingsStore } from './useRuleSettingsStore';
import { reconRulesApi } from './api';

interface ReconRuleSettingsProps {
  isAdmin: boolean;
}

export function ReconRuleSettings({ isAdmin }: ReconRuleSettingsProps) {
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleDescription, setNewRuleDescription] = useState('');
  const [scopeType, setScopeType] = useState<'global' | 'merchant' | 'acquirer'>('global');
  const [scopeValue, setScopeValue] = useState('');
  const [matchChain, setMatchChain] = useState<string[]>(['UTR', 'amount']);
  const [priority, setPriority] = useState(50);
  const { clearSelection, selectRule, refreshRules } = useRuleSettingsStore();

  // Check feature flag (would come from env/config in production)
  const FEATURE_RECON_RULE_SETTINGS = true; // Default false in production

  // Don't render if feature flag is off or user is not admin
  if (!FEATURE_RECON_RULE_SETTINGS || !isAdmin) {
    return null;
  }

  const handleCreateRule = async () => {
    if (!newRuleName.trim()) {
      alert('Please enter a rule name');
      return;
    }
    
    if (matchChain.length === 0) {
      alert('Please add at least one matching field');
      return;
    }
    
    try {
      setCreating(true);
      const newRule = await reconRulesApi.createRule({
        name: newRuleName,
        description: newRuleDescription,
        scope: scopeType === 'global' ? null : scopeValue,
        scope_type: scopeType,
        match_chain: matchChain,
        status: 'draft',
        priority: priority,
        created_by: 'current-user@settlepaisa.com',
        updated_by: 'current-user@settlepaisa.com'
      });
      
      setShowCreateModal(false);
      setNewRuleName('');
      setNewRuleDescription('');
      setScopeType('global');
      setScopeValue('');
      setMatchChain(['UTR', 'amount']);
      setPriority(50);
      
      // Refresh list and select the new rule
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
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-1" />
              New Rule
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

      {/* Create Rule Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Create New Reconciliation Rule</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">Define how transactions should be matched between PG and Bank data</p>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900">Basic Information</h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rule Name *
                  </label>
                  <input
                    type="text"
                    value={newRuleName}
                    onChange={(e) => setNewRuleName(e.target.value)}
                    placeholder="e.g., High Value Merchant Rule"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={newRuleDescription}
                    onChange={(e) => setNewRuleDescription(e.target.value)}
                    placeholder="Describe the purpose of this rule..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Scope */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900">Scope</h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Apply this rule to *
                  </label>
                  <select
                    value={scopeType}
                    onChange={(e) => setScopeType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="global">All transactions (Global)</option>
                    <option value="merchant">Specific merchant only</option>
                    <option value="acquirer">Specific acquirer/bank only</option>
                  </select>
                </div>

                {scopeType !== 'global' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {scopeType === 'merchant' ? 'Merchant ID' : 'Acquirer Code'}
                    </label>
                    <input
                      type="text"
                      value={scopeValue}
                      onChange={(e) => setScopeValue(e.target.value)}
                      placeholder={scopeType === 'merchant' ? 'e.g., merchant-1' : 'e.g., ICICI'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* Match Chain */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900">Matching Logic</h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Match Chain (in order of priority) *
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    Define which fields should be matched and in what order. The system will try each field sequentially.
                  </p>
                  <div className="space-y-2">
                    {matchChain.map((field, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 w-6">{index + 1}.</span>
                        <select
                          value={field}
                          onChange={(e) => {
                            const newChain = [...matchChain];
                            newChain[index] = e.target.value;
                            setMatchChain(newChain);
                          }}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="UTR">UTR (Unique Transaction Reference)</option>
                          <option value="RRN">RRN (Retrieval Reference Number)</option>
                          <option value="amount">Amount (Exact match)</option>
                          <option value="date">Transaction Date</option>
                          <option value="merchant_id">Merchant ID</option>
                          <option value="gateway_ref">Gateway Reference</option>
                          <option value="bank_ref">Bank Reference</option>
                        </select>
                        <button
                          onClick={() => setMatchChain(matchChain.filter((_, i) => i !== index))}
                          className="px-2 py-2 text-red-600 hover:bg-red-50 rounded"
                          disabled={matchChain.length === 1}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setMatchChain([...matchChain, 'UTR'])}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      + Add matching field
                    </button>
                  </div>
                </div>
              </div>

              {/* Priority */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900">Priority</h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rule Priority (0-100)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Higher priority rules are evaluated first</p>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t p-6">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateRule}
                  disabled={creating || !newRuleName.trim() || matchChain.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating...' : 'Create Rule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}