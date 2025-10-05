import { IndianRupee, TrendingDown, TrendingUp } from 'lucide-react';
import { paiseToCompactINR } from '@/lib/currency';

interface FinancialImpactTileProps {
  disputedPaise: string;
  recoveredPaise: string;
  writtenOffPaise: string;
  onClickDisputed: () => void;
  onClickRecovered: () => void;
  onClickWrittenOff: () => void;
  onClickNet: () => void;
  isLoading?: boolean;
}

export function FinancialImpactTile({ 
  disputedPaise, 
  recoveredPaise, 
  writtenOffPaise,
  onClickDisputed,
  onClickRecovered,
  onClickWrittenOff,
  onClickNet,
  isLoading 
}: FinancialImpactTileProps) {
  if (isLoading) {
    return (
      <div className="min-w-[220px] flex flex-col justify-between p-4 rounded-2xl shadow-sm bg-white border border-slate-200">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-32 mb-3"></div>
          <div className="space-y-2">
            <div className="h-6 bg-slate-200 rounded w-24"></div>
            <div className="h-6 bg-slate-200 rounded w-24"></div>
            <div className="h-6 bg-slate-200 rounded w-24"></div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate net impact
  const recovered = BigInt(recoveredPaise || 0);
  const writtenOff = BigInt(writtenOffPaise || 0);
  const disputed = BigInt(disputedPaise || 0);
  const net = recovered - writtenOff;
  const netPercentage = disputed > 0n 
    ? Number((net * 100n) / disputed) 
    : 0;
  const isPositive = net >= 0n;

  return (
    <div 
      className="min-w-[220px] flex flex-col justify-between p-4 rounded-2xl shadow-sm bg-white border border-slate-200 hover:shadow-md transition-all"
      data-testid="kpi-financial-impact"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-600">Financial Impact</h3>
        <IndianRupee className="w-4 h-4 text-slate-400" />
      </div>
      
      <div className="space-y-2">
        <button
          onClick={onClickDisputed}
          className="w-full flex items-center justify-between hover:bg-slate-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
          aria-label="View all disputed cases"
        >
          <span className="text-xs text-slate-600">Disputed</span>
          <span className="text-sm font-semibold text-slate-900">
            {paiseToCompactINR(disputedPaise)}
          </span>
        </button>
        
        <button
          onClick={onClickRecovered}
          className="w-full flex items-center justify-between hover:bg-green-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
          aria-label="View recovered cases"
        >
          <span className="text-xs text-slate-600">Recovered</span>
          <span className="text-sm font-semibold text-green-700">
            {paiseToCompactINR(recoveredPaise)}
          </span>
        </button>
        
        <button
          onClick={onClickWrittenOff}
          className="w-full flex items-center justify-between hover:bg-red-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
          aria-label="View written-off cases"
        >
          <span className="text-xs text-slate-600">Written-off</span>
          <span className="text-sm font-semibold text-red-700">
            {paiseToCompactINR(writtenOffPaise)}
          </span>
        </button>
        
        <div className="pt-2 border-t border-slate-100">
          <button
            onClick={onClickNet}
            className="w-full flex items-center justify-between hover:bg-blue-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
            aria-label="View net impact"
          >
            <div className="flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="w-3 h-3 text-green-500" />
              ) : (
                <TrendingDown className="w-3 h-3 text-red-500" />
              )}
              <span className="text-xs text-slate-600">Net</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${isPositive ? 'text-green-700' : 'text-red-700'}`}>
                {paiseToCompactINR(net.toString())}
              </span>
              <span className={`text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                ({netPercentage.toFixed(1)}%)
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}