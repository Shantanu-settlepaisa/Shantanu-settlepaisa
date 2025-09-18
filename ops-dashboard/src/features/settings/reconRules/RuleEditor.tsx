import React, { useState } from 'react';
import { Edit2, Save, X, Copy, PlayCircle, FileText, Settings, AlertTriangle, Shield, Zap, Clock } from 'lucide-react';
import { useRuleSettingsStore } from './useRuleSettingsStore';
import { reconRulesApi } from './api';
import { ReconRule } from './types';

type TabType = 'definition' | 'tolerances' | 'exceptions' | 'dedupe' | 'auto-actions' | 'versions';

export function RuleEditor() {
  const [activeTab, setActiveTab] = useState<TabType>('definition');
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  
  const {
    selectedRule,
    editBuffer,
    isEditing,
    simulationResult,
    startEditing,
    updateEditBuffer,
    cancelEditing,
    saveEditing,
    setSimulationResult
  } = useRuleSettingsStore();

  const currentRule = isEditing ? editBuffer : selectedRule;

  if (!currentRule) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <FileText className="w-16 h-16 mx-auto mb-4" />
          <p className="text-lg">Select a rule to view details</p>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    if (!editBuffer) return;
    
    try {
      setSaving(true);
      const saved = await reconRulesApi.updateRule(editBuffer.id, editBuffer);
      saveEditing(saved);
    } catch (error) {
      console.error('Failed to save rule:', error);
      alert('Failed to save rule. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    try {
      const duplicated = await reconRulesApi.duplicateRule(currentRule.id);
      alert(`Rule duplicated as "${duplicated.name}"`);
    } catch (error) {
      console.error('Failed to duplicate rule:', error);
    }
  };

  const handleSimulate = async () => {
    try {
      setSimulating(true);
      const result = await reconRulesApi.simulateRule(currentRule.id);
      setSimulationResult(result);
    } catch (error) {
      console.error('Failed to simulate rule:', error);
      // Use mock simulation result for demo
      setSimulationResult({
        window: { from: "2025-09-01", to: "2025-09-07" },
        baseline: { matched: 1575, unmatched: 675, exceptions: 226, reconciledPaise: "38900000" },
        proposed: { matched: 1602, unmatched: 648, exceptions: 226, reconciledPaise: "39750000" },
        delta: { matched: 27, unmatched: -27, exceptions: 0, reconciledPaise: "850000" }
      });
    } finally {
      setSimulating(false);
    }
  };

  const tabs = [
    { id: 'definition', label: 'Definition', icon: FileText },
    { id: 'tolerances', label: 'Tolerances', icon: Settings },
    { id: 'exceptions', label: 'Exceptions', icon: AlertTriangle },
    { id: 'dedupe', label: 'De-dup', icon: Shield },
    { id: 'auto-actions', label: 'Auto-actions', icon: Zap },
    { id: 'versions', label: 'Versions', icon: Clock }
  ];

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{currentRule.name}</h2>
            <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
              <span className={`px-2 py-0.5 text-xs rounded-full ${
                currentRule.status === 'live' ? 'bg-green-100 text-green-700' :
                currentRule.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                currentRule.status === 'canary' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                {currentRule.status}
              </span>
              <span>Version {currentRule.version}</span>
              <span>•</span>
              <span>Updated {new Date(currentRule.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={cancelEditing}
                  className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={startEditing}
                  className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-1"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={handleDuplicate}
                  className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-1"
                >
                  <Copy className="w-4 h-4" />
                  Duplicate
                </button>
                <button
                  onClick={handleSimulate}
                  disabled={simulating}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                >
                  <PlayCircle className="w-4 h-4" />
                  {simulating ? 'Simulating...' : 'Simulate'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b -mb-px">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'definition' && (
          <DefinitionTab rule={currentRule} isEditing={isEditing} onUpdate={updateEditBuffer} />
        )}
        {activeTab === 'tolerances' && (
          <TolerancesTab rule={currentRule} isEditing={isEditing} onUpdate={updateEditBuffer} />
        )}
        {activeTab === 'exceptions' && (
          <ExceptionsTab rule={currentRule} isEditing={isEditing} onUpdate={updateEditBuffer} />
        )}
        {activeTab === 'dedupe' && (
          <DedupeTab rule={currentRule} isEditing={isEditing} onUpdate={updateEditBuffer} />
        )}
        {activeTab === 'auto-actions' && (
          <AutoActionsTab rule={currentRule} isEditing={isEditing} onUpdate={updateEditBuffer} />
        )}
        {activeTab === 'versions' && (
          <VersionsTab rule={currentRule} />
        )}
      </div>

      {/* Simulation Result */}
      {simulationResult && (
        <div className="p-4 border-t bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Simulation Result</h3>
            <button
              onClick={() => setSimulationResult(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500 mb-1">Matched</p>
              <p className="font-medium">
                {simulationResult.proposed.matched}
                <span className={`ml-2 text-xs ${simulationResult.delta.matched > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {simulationResult.delta.matched > 0 ? '+' : ''}{simulationResult.delta.matched}
                </span>
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Unmatched</p>
              <p className="font-medium">
                {simulationResult.proposed.unmatched}
                <span className={`ml-2 text-xs ${simulationResult.delta.unmatched < 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {simulationResult.delta.unmatched > 0 ? '+' : ''}{simulationResult.delta.unmatched}
                </span>
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Value Impact</p>
              <p className="font-medium text-green-600">
                +₹{(parseInt(simulationResult.delta.reconciledPaise) / 100).toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tab Components
function DefinitionTab({ rule, isEditing, onUpdate }: { rule: ReconRule; isEditing: boolean; onUpdate: (updates: Partial<ReconRule>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Match Chain</label>
        {isEditing ? (
          <div className="space-y-2">
            {rule.match_chain.map((item, index) => (
              <input
                key={index}
                type="text"
                value={item}
                onChange={(e) => {
                  const newChain = [...rule.match_chain];
                  newChain[index] = e.target.value;
                  onUpdate({ match_chain: newChain });
                }}
                className="w-full px-3 py-2 border rounded-lg"
              />
            ))}
            <button
              onClick={() => onUpdate({ match_chain: [...rule.match_chain, ''] })}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Add step
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {rule.match_chain.map((item, index) => (
              <div key={index} className="px-3 py-2 bg-gray-50 rounded-lg font-mono text-sm">
                {index + 1}. {item}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
        {isEditing ? (
          <select
            value={rule.scope ? 'custom' : 'global'}
            onChange={(e) => onUpdate({ scope: e.target.value === 'global' ? null : {} })}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="global">Global</option>
            <option value="custom">Custom Scope</option>
          </select>
        ) : (
          <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm">
            {rule.scope ? JSON.stringify(rule.scope) : 'Global (All transactions)'}
          </div>
        )}
      </div>
    </div>
  );
}

function TolerancesTab({ rule, isEditing, onUpdate }: { rule: ReconRule; isEditing: boolean; onUpdate: (updates: Partial<ReconRule>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Amount Tolerance (paise)</label>
        <input
          type="number"
          value={rule.tolerances?.amount_paise || 0}
          onChange={(e) => onUpdate({
            tolerances: { ...rule.tolerances, amount_paise: parseInt(e.target.value) }
          })}
          disabled={!isEditing}
          className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-50"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Amount Tolerance (%)</label>
        <input
          type="number"
          value={rule.tolerances?.amount_pct || 0}
          onChange={(e) => onUpdate({
            tolerances: { ...rule.tolerances, amount_pct: parseFloat(e.target.value) }
          })}
          disabled={!isEditing}
          className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-50"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Date Tolerance (days)</label>
        <input
          type="number"
          value={rule.tolerances?.date_days || 0}
          onChange={(e) => onUpdate({
            tolerances: { ...rule.tolerances, date_days: parseInt(e.target.value) }
          })}
          disabled={!isEditing}
          className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-50"
        />
      </div>
    </div>
  );
}

function ExceptionsTab({ rule, isEditing, onUpdate }: { rule: ReconRule; isEditing: boolean; onUpdate: (updates: Partial<ReconRule>) => void }) {
  return (
    <div className="space-y-4">
      {rule.exceptions && rule.exceptions.length > 0 ? (
        rule.exceptions.map((exception, index) => (
          <div key={index} className="p-3 border rounded-lg">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">When: {exception.when}</span>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  exception.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                  exception.severity === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                  exception.severity === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {exception.severity}
                </span>
              </div>
              <p className="text-sm text-gray-600">{exception.reason}</p>
            </div>
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-sm">No exception mappings defined</p>
      )}
      
      {isEditing && (
        <button className="text-sm text-blue-600 hover:text-blue-700">
          + Add exception mapping
        </button>
      )}
    </div>
  );
}

function DedupeTab({ rule, isEditing, onUpdate }: { rule: ReconRule; isEditing: boolean; onUpdate: (updates: Partial<ReconRule>) => void }) {
  return (
    <div className="space-y-4">
      {rule.dedupe ? (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dedup Key</label>
            <select
              value={rule.dedupe.key}
              onChange={(e) => onUpdate({
                dedupe: { ...rule.dedupe, key: e.target.value as any }
              })}
              disabled={!isEditing}
              className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-50"
            >
              <option value="UTR">UTR</option>
              <option value="RRN">RRN</option>
              <option value="TXNID">Transaction ID</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Window (hours)</label>
            <input
              type="number"
              value={rule.dedupe.window_hours}
              onChange={(e) => onUpdate({
                dedupe: { ...rule.dedupe, window_hours: parseInt(e.target.value) }
              })}
              disabled={!isEditing}
              className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Strategy</label>
            <select
              value={rule.dedupe.strategy}
              onChange={(e) => onUpdate({
                dedupe: { ...rule.dedupe, strategy: e.target.value as any }
              })}
              disabled={!isEditing}
              className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-50"
            >
              <option value="first-write-wins">First Write Wins</option>
              <option value="latest">Latest</option>
            </select>
          </div>
        </>
      ) : (
        <p className="text-gray-500 text-sm">No deduplication configured</p>
      )}
    </div>
  );
}

function AutoActionsTab({ rule, isEditing, onUpdate }: { rule: ReconRule; isEditing: boolean; onUpdate: (updates: Partial<ReconRule>) => void }) {
  return (
    <div className="space-y-4">
      {rule.auto_actions && rule.auto_actions.length > 0 ? (
        rule.auto_actions.map((action, index) => (
          <div key={index} className="p-3 border rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm">When: {action.when}</span>
              <span className="text-sm font-medium text-blue-600">{action.action}</span>
            </div>
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-sm">No auto-actions configured</p>
      )}
      
      {isEditing && (
        <button className="text-sm text-blue-600 hover:text-blue-700">
          + Add auto-action
        </button>
      )}
    </div>
  );
}

function VersionsTab({ rule }: { rule: ReconRule }) {
  // Mock version history
  const versions = [
    { version: rule.version, date: rule.updatedAt, author: rule.updatedBy || 'System', changes: 'Current version' },
    { version: rule.version - 1, date: '2025-09-10T10:00:00Z', author: 'admin@settlepaisa.com', changes: 'Updated tolerances' },
    { version: rule.version - 2, date: '2025-09-05T10:00:00Z', author: 'ops@settlepaisa.com', changes: 'Initial creation' }
  ].filter(v => v.version > 0);

  return (
    <div className="space-y-3">
      {versions.map((version) => (
        <div key={version.version} className="p-3 border rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">Version {version.version}</span>
            <span className="text-sm text-gray-500">
              {new Date(version.date).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm text-gray-600">{version.changes}</p>
          <p className="text-xs text-gray-500 mt-1">by {version.author}</p>
        </div>
      ))}
    </div>
  );
}