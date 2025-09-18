import { useState } from 'react';
import { TrendingUp, CheckCircle, XCircle } from 'lucide-react';

type OutcomeWindow = '7d' | '30d';

interface OutcomeTileProps {
  wonCount: number;
  lostCount: number;
  winRate: number;
  avgResolutionDays: number;
  onWonClick: () => void;
  onLostClick: () => void;
  onWindowChange: (window: OutcomeWindow) => void;
  isLoading?: boolean;
}

export function OutcomeTile({ 
  wonCount, 
  lostCount, 
  winRate, 
  avgResolutionDays,
  onWonClick,
  onLostClick,
  onWindowChange,
  isLoading 
}: OutcomeTileProps) {
  const [window, setWindow] = useState<OutcomeWindow>('7d');

  const handleWindowChange = (newWindow: OutcomeWindow) => {
    setWindow(newWindow);
    onWindowChange(newWindow);
  };

  if (isLoading) {
    return (
      <div className="min-w-[220px] flex flex-col justify-between p-4 rounded-2xl shadow-sm bg-white border border-slate-200">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-24 mb-3"></div>
          <div className="h-8 bg-slate-200 rounded w-32 mb-2"></div>
          <div className="h-4 bg-slate-200 rounded w-20"></div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-w-[220px] flex flex-col justify-between p-4 rounded-2xl shadow-sm bg-white border border-slate-200 hover:shadow-md transition-all"
      data-testid="kpi-outcome"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-600">Outcome</h3>
        <div className="flex gap-1">
          <button
            onClick={() => handleWindowChange('7d')}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              window === '7d' 
                ? 'bg-blue-100 text-blue-700' 
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            7d
          </button>
          <button
            onClick={() => handleWindowChange('30d')}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              window === '30d' 
                ? 'bg-blue-100 text-blue-700' 
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            30d
          </button>
        </div>
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onWonClick}
            className="flex items-center gap-1.5 hover:bg-green-50 rounded-lg px-2 py-1 transition-colors"
            aria-label="Filter by won cases"
          >
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-lg font-semibold text-green-700">{wonCount}</span>
            <span className="text-sm text-slate-500">Won</span>
          </button>
          
          <span className="text-slate-300">•</span>
          
          <button
            onClick={onLostClick}
            className="flex items-center gap-1.5 hover:bg-red-50 rounded-lg px-2 py-1 transition-colors"
            aria-label="Filter by lost cases"
          >
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-lg font-semibold text-red-700">{lostCount}</span>
            <span className="text-sm text-slate-500">Lost</span>
          </button>
        </div>
        
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-blue-500" />
              <span className="text-slate-600">Win Rate</span>
              <span className="font-semibold text-slate-900">{winRate}%</span>
            </div>
            <div className="text-slate-600">
              Avg <span className="font-semibold text-slate-900">{avgResolutionDays}d</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}