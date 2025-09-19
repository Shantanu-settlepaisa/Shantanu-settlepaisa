import React, { useState } from 'react';
import SettlementPipelineCard from '@/components/settlements/SettlementPipelineCard';
import { Calendar } from 'lucide-react';

export default function SettlementPipelineDemo() {
  // Default to last 14 days
  const today = new Date();
  const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  
  const [dateRange, setDateRange] = useState({
    from: twoWeeksAgo.toISOString().split('T')[0],
    to: today.toISOString().split('T')[0],
  });
  
  const handleDateChange = (field: 'from' | 'to', value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };
  
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settlement Pipeline Demo</h1>
        <p className="text-sm text-gray-500 mt-1">
          Mutually-exclusive state tracking with PostgreSQL backend
        </p>
      </div>
      
      {/* Date Range Selector */}
      <div className="bg-white rounded-lg shadow-sm p-4 border">
        <div className="flex items-center gap-4">
          <Calendar className="h-5 w-5 text-gray-400" />
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">From:</label>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => handleDateChange('from', e.target.value)}
              max={dateRange.to}
              className="px-3 py-1 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">To:</label>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => handleDateChange('to', e.target.value)}
              min={dateRange.from}
              max={today.toISOString().split('T')[0]}
              className="px-3 py-1 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="ml-auto">
            <button
              onClick={() => setDateRange({
                from: twoWeeksAgo.toISOString().split('T')[0],
                to: today.toISOString().split('T')[0],
              })}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Last 14 days
            </button>
          </div>
        </div>
      </div>
      
      {/* Settlement Pipeline Card */}
      <SettlementPipelineCard
        from={dateRange.from}
        to={dateRange.to}
      />
      
      {/* Expected Demo Data Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">
          Demo Data (Last 14 Days)
        </h3>
        <div className="text-sm text-blue-700 space-y-1">
          <p>The database has been seeded with exactly 2,250 transactions:</p>
          <ul className="ml-4 mt-2 space-y-1">
            <li>• <b>In Settlement:</b> 237 transactions (10.5%)</li>
            <li>• <b>Sent to Bank:</b> 575 transactions (25.6%)</li>
            <li>• <b>Credited:</b> 1,338 transactions (59.5%)</li>
            <li>• <b>Unsettled:</b> 100 transactions (4.4%)</li>
          </ul>
          <p className="mt-2">
            <b>Invariant:</b> Captured (2,250) = In Settlement (237) + Sent to Bank (575) + Credited (1,338) + Unsettled (100)
          </p>
        </div>
      </div>
      
      {/* Technical Details */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">
          Technical Implementation
        </h3>
        <div className="text-sm text-gray-600 space-y-2">
          <div>
            <b>Backend:</b> PostgreSQL with settlement_state enum (IN_SETTLEMENT, SENT_TO_BANK, CREDITED, UNSETTLED)
          </div>
          <div>
            <b>Principle:</b> Each transaction (UTR) exists in exactly ONE state at any time
          </div>
          <div>
            <b>API:</b> GET /api/settlement/pipeline?from=ISO&to=ISO
          </div>
          <div>
            <b>Validation:</b> Server validates that captured.count = Σ(all states) before returning data
          </div>
          <div>
            <b>Frontend:</b> React + TypeScript + Tailwind CSS + shadcn/ui components
          </div>
        </div>
      </div>
    </div>
  );
}