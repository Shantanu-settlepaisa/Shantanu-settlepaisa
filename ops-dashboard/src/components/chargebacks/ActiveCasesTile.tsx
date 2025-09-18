import { FileWarning, AlertCircle } from 'lucide-react';

interface ActiveCasesTileProps {
  openCount: number;
  evidenceRequiredCount: number;
  onOpenClick: () => void;
  onEvidenceClick: () => void;
  isLoading?: boolean;
}

export function ActiveCasesTile({ 
  openCount, 
  evidenceRequiredCount, 
  onOpenClick, 
  onEvidenceClick,
  isLoading 
}: ActiveCasesTileProps) {
  if (isLoading) {
    return (
      <div className="min-w-[220px] flex flex-col justify-between p-4 rounded-2xl shadow-sm bg-white border border-slate-200">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-24 mb-3"></div>
          <div className="h-8 bg-slate-200 rounded w-16 mb-2"></div>
          <div className="h-4 bg-slate-200 rounded w-32"></div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-w-[220px] flex flex-col justify-between p-4 rounded-2xl shadow-sm bg-white border border-slate-200 hover:shadow-md transition-all"
      data-testid="kpi-active-cases"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-600">Active Cases</h3>
        <FileWarning className="w-4 h-4 text-slate-400" />
      </div>
      
      <div className="space-y-2">
        <button
          onClick={onOpenClick}
          className="w-full text-left hover:bg-slate-50 rounded-lg p-1 -ml-1 transition-colors"
          aria-label="Filter by open cases"
        >
          <div className="text-2xl font-semibold text-slate-900">
            {openCount}
          </div>
          <div className="text-xs text-slate-500">Open</div>
        </button>
        
        <button
          onClick={onEvidenceClick}
          className="w-full text-left hover:bg-amber-50 rounded-lg p-1 -ml-1 transition-colors"
          aria-label="Filter by evidence required"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-700">
              {evidenceRequiredCount} Evidence Required
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}