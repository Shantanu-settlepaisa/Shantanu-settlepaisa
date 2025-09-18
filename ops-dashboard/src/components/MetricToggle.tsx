import React, { useEffect, useState } from 'react';
import { IndianRupee, Hash } from 'lucide-react';
import type { MetricMode } from '@/types/metrics';

interface MetricToggleProps {
  value: MetricMode;
  onChange: (value: MetricMode) => void;
  className?: string;
}

export function MetricToggle({ value, onChange, className = '' }: MetricToggleProps) {
  // Persist preference in localStorage
  useEffect(() => {
    localStorage.setItem('ops.metricMode', value);
  }, [value]);

  return (
    <div className={`inline-flex items-center bg-white rounded-lg border border-gray-200 p-1 ${className}`}>
      <button
        onClick={() => onChange('count')}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded transition-colors
          ${value === 'count' 
            ? 'bg-blue-50 text-blue-600' 
            : 'text-gray-600 hover:text-gray-900'
          }
        `}
        aria-label="Show counts"
      >
        <Hash className="h-3 w-3" />
        Count
      </button>
      <button
        onClick={() => onChange('amount')}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded transition-colors
          ${value === 'amount' 
            ? 'bg-blue-50 text-blue-600' 
            : 'text-gray-600 hover:text-gray-900'
          }
        `}
        aria-label="Show monetary values"
      >
        <IndianRupee className="h-3 w-3" />
        Value
      </button>
    </div>
  );
}

export function useMetricMode(): [MetricMode, (mode: MetricMode) => void] {
  const [mode, setMode] = useState<MetricMode>(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('ops.metricMode');
    return (saved === 'amount' || saved === 'count') ? saved : 'count';
  });

  const updateMode = (newMode: MetricMode) => {
    setMode(newMode);
    localStorage.setItem('ops.metricMode', newMode);
  };

  return [mode, updateMode];
}