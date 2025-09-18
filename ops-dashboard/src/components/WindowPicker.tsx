import React, { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import type { Window } from '@/services/aggregator/reconMetrics';

interface WindowPickerProps {
  value: Window;
  onChange: (window: Window) => void;
  className?: string;
}

const PRESET_WINDOWS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 }
];

export function WindowPicker({ value, onChange, className = '' }: WindowPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customFrom, setCustomFrom] = useState(value.from);
  const [customTo, setCustomTo] = useState(value.to);
  
  const handlePresetClick = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    
    onChange({
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0],
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      label: `Last ${days} days`
    });
    setIsOpen(false);
  };
  
  const handleCustomApply = () => {
    onChange({
      from: customFrom,
      to: customTo,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      label: 'Custom range'
    });
    setIsOpen(false);
    setCustomMode(false);
  };
  
  const formatDateRange = () => {
    if (value.label) return value.label;
    
    const from = new Date(value.from);
    const to = new Date(value.to);
    return `${from.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${to.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };
  
  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Calendar className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">{formatDateRange()}</span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>
      
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          {!customMode ? (
            <>
              <div className="p-2">
                {PRESET_WINDOWS.map(preset => (
                  <button
                    key={preset.days}
                    onClick={() => handlePresetClick(preset.days)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-100 p-2">
                <button
                  onClick={() => setCustomMode(true)}
                  className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                >
                  Custom range...
                </button>
              </div>
            </>
          ) : (
            <div className="p-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setCustomMode(false)}
                  className="flex-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCustomApply}
                  className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => {
            setIsOpen(false);
            setCustomMode(false);
          }}
        />
      )}
    </div>
  );
}