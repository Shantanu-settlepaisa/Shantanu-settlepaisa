import { TrendingDown, IndianRupee, AlertCircle } from 'lucide-react';
import { paiseToINR } from '@/lib/currency';
import { useNavigate } from 'react-router-dom';
import { generateDrillThroughParams, KpiFilters } from '@/hooks/opsOverview';

interface CashImpactCardProps {
  variancePaise: string;
  reconciledAmountPaise: string;
  totalAmountPaise: string;
  unreconciledCount: number;
  filters: KpiFilters;
  isLoading?: boolean;
}

export function CashImpactCard({
  variancePaise,
  reconciledAmountPaise,
  totalAmountPaise,
  unreconciledCount,
  filters,
  isLoading
}: CashImpactCardProps) {
  const navigate = useNavigate();
  
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-5 bg-slate-200 rounded w-32 mb-4"></div>
          <div className="h-8 bg-slate-200 rounded w-48 mb-4"></div>
          <div className="space-y-2">
            <div className="h-4 bg-slate-200 rounded w-full"></div>
            <div className="h-4 bg-slate-200 rounded w-full"></div>
          </div>
        </div>
      </div>
    );
  }

  const variance = BigInt(variancePaise);
  const total = BigInt(totalAmountPaise);
  const reconciled = BigInt(reconciledAmountPaise);
  const variancePct = total > 0n ? Number((variance * 100n) / total) : 0;
  const isHighImpact = variancePct > 5;

  const handleClick = () => {
    const params = generateDrillThroughParams(filters, { status: 'unreconciled' });
    navigate(`/ops/reconciliation?${params.toString()}`);
  };

  return (
    <div 
      className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-6 hover:shadow-md transition-all cursor-pointer"
      onClick={handleClick}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Cash Impact</h3>
        <div className={`p-2 rounded-lg ${isHighImpact ? 'bg-red-50' : 'bg-amber-50'}`}>
          <TrendingDown className={`w-5 h-5 ${isHighImpact ? 'text-red-600' : 'text-amber-600'}`} />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-sm text-slate-600 mb-1">Unreconciled Amount</p>
          <p className={`text-3xl font-bold ${isHighImpact ? 'text-red-600' : 'text-amber-600'}`}>
            {paiseToINR(variancePaise)}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {variancePct.toFixed(2)}% of total volume
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-500">Total Processed</p>
            <p className="text-sm font-semibold text-slate-900">
              {paiseToINR(totalAmountPaise)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Reconciled</p>
            <p className="text-sm font-semibold text-green-600">
              {paiseToINR(reconciledAmountPaise)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-700">
            <span className="font-semibold">{unreconciledCount.toLocaleString('en-IN')}</span> transactions
            need reconciliation
          </p>
        </div>

        {isHighImpact && (
          <div className="p-3 bg-red-50 rounded-lg">
            <p className="text-xs font-medium text-red-700">
              High variance detected - immediate action required
            </p>
          </div>
        )}
      </div>
    </div>
  );
}