import React, { useState, useEffect } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { reconRulesApi } from './api';
import { ReconRule } from './types';
import { useRuleSettingsStore } from './useRuleSettingsStore';

export function RuleList() {
  const [rules, setRules] = useState<ReconRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  const { selectedRuleId, selectRule } = useRuleSettingsStore();

  // Fetch rules
  useEffect(() => {
    fetchRules();
  }, [page, scopeFilter, statusFilter, searchQuery]);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const params: any = {
        page,
        pageSize: 10
      };
      
      if (searchQuery) params.q = searchQuery;
      if (scopeFilter !== 'all') params.scope = scopeFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      
      const response = await reconRulesApi.listRules(params);
      setRules(response.rules);
      setTotal(response.total);
      setTotalPages(Math.ceil(response.total / response.pageSize));
    } catch (error) {
      console.error('Failed to fetch rules:', error);
      // For demo, use mock data if API fails
      setRules(getMockRules());
      setTotal(2);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };

  const getMockRules = (): ReconRule[] => [
    {
      id: 'rule-001',
      name: 'Default UTR First',
      scope: null,
      match_chain: ['UTR', 'TXNID_AMOUNT_±100'],
      tolerances: { amount_paise: 100, date_days: 1 },
      status: 'live',
      version: 3,
      updatedAt: '2025-09-15T10:00:00Z',
      updatedBy: 'admin@settlepaisa.com'
    },
    {
      id: 'rule-002',
      name: 'High Value Strict (Merchant X)',
      scope: { merchantId: 'MERCH001' },
      match_chain: ['UTR', 'TXNID', 'AMOUNT_EXACT'],
      exceptions: [
        { when: 'AMOUNT_MISMATCH', reason: 'Amount difference detected', severity: 'HIGH' }
      ],
      status: 'draft',
      version: 1,
      updatedAt: '2025-09-18T08:30:00Z',
      updatedBy: 'ops@settlepaisa.com'
    }
  ];

  const getScopeLabel = (scope: ReconRule['scope']) => {
    if (!scope) return 'Global';
    if (scope.merchantId) return `Merchant`;
    if (scope.acquirer) return `Acquirer`;
    if (scope.mode) return `Mode`;
    return 'Custom';
  };

  const getStatusBadge = (status: ReconRule['status']) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-700',
      canary: 'bg-yellow-100 text-yellow-700',
      live: 'bg-green-100 text-green-700',
      archived: 'bg-red-100 text-red-700'
    };
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${styles[status]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Filters */}
      <div className="p-4 border-b space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search rules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div className="flex gap-2">
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Scopes</option>
            <option value="global">Global</option>
            <option value="merchant">Merchant</option>
            <option value="acquirer">Acquirer</option>
            <option value="mode">Mode</option>
          </select>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="canary">Canary</option>
            <option value="live">Live</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Rules List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : rules.length > 0 ? (
          <div className="divide-y">
            {rules.map((rule) => (
              <div
                key={rule.id}
                onClick={() => selectRule(rule)}
                className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                  selectedRuleId === rule.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{rule.name}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                      <span>{getScopeLabel(rule.scope)}</span>
                      <span>•</span>
                      <span>v{rule.version}</span>
                      <span>•</span>
                      <span>{new Date(rule.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {getStatusBadge(rule.status)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <Filter className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No rules found</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-4 border-t flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing {rules.length} of {total} rules
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}