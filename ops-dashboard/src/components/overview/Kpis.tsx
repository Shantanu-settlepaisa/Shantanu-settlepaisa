import { ArrowUpRight, ArrowDownRight, TrendingUp, AlertCircle, CheckCircle, IndianRupee } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/lib/auth';
import { paiseToCompactINR, formatPercentage, safePercentage } from '@/lib/currency';
import { Kpis as KpisType, generateDrillThroughParams, hasFinanceAccess } from '@/hooks/opsOverview';
import { KpiFilters } from '@/hooks/opsOverview';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface KpisProps {
  kpis?: KpisType;
  isLoading?: boolean;
  filters: KpiFilters;
}

// Sparkline component
function Sparkline({ data, color = 'blue' }: { data?: number[]; color?: string }) {
  if (!data || data.length === 0) return null;
  
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 50 - ((value - min) / range) * 40;
    return `${x},${y}`;
  }).join(' ');

  const colorClasses = {
    green: 'stroke-green-500',
    red: 'stroke-red-500',
    blue: 'stroke-blue-500',
    amber: 'stroke-amber-500',
  };

  return (
    <svg className="w-full h-10" viewBox="0 0 100 60" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={colorClasses[color as keyof typeof colorClasses] || colorClasses.blue}
        points={points}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// Individual KPI Card - Compact version for one-row layout
function KpiCard({
  title,
  value,
  subtitle,
  tooltip,
  trendPct,
  sparkline,
  color = 'blue',
  icon: Icon,
  onClick,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  tooltip: string;
  trendPct?: number;
  sparkline?: number[];
  color?: string;
  icon?: any;
  onClick?: () => void;
}) {
  const isPositive = trendPct && trendPct > 0;
  const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight;

  const iconColors = {
    green: 'text-green-600 bg-green-50',
    red: 'text-red-600 bg-red-50',
    blue: 'text-blue-600 bg-blue-50',
    amber: 'text-amber-600 bg-amber-50',
  };

  const trendColors = {
    green: isPositive ? 'text-green-600' : 'text-red-600',
    red: isPositive ? 'text-red-600' : 'text-green-600', // Inverted for exceptions
    blue: isPositive ? 'text-green-600' : 'text-red-600',
    amber: isPositive ? 'text-red-600' : 'text-green-600', // Inverted for unmatched
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className="flex-1 min-w-[200px] bg-white rounded-lg ring-1 ring-slate-200 shadow-sm p-4 hover:shadow-md transition-all cursor-pointer"
            onClick={onClick}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {Icon && (
                  <div className={`p-1.5 rounded ${iconColors[color as keyof typeof iconColors]}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                )}
                <p className="text-xs font-medium text-slate-600">{title}</p>
              </div>
              {trendPct !== undefined && (
                <div className={`flex items-center gap-0.5 ${trendColors[color as keyof typeof trendColors]}`}>
                  <TrendIcon className="w-3 h-3" />
                  <span className="text-xs font-medium">{Math.abs(trendPct)}%</span>
                </div>
              )}
            </div>
            <p className="text-xl font-bold text-slate-900">{value}</p>
            {subtitle && (
              <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function Kpis({ kpis, isLoading, filters }: KpisProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const userRole = user?.role;

  const handleDrillThrough = (page: string, additionalParams?: Record<string, string>) => {
    const params = generateDrillThroughParams(filters, additionalParams);
    navigate(`${page}?${params.toString()}`);
  };

  if (isLoading || !kpis) {
    return (
      <div className="w-full grid gap-4 xl:grid-cols-5 lg:grid-cols-3 md:grid-cols-2 grid-cols-1">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-24 mb-3"></div>
              <div className="h-8 bg-slate-200 rounded w-32 mb-4"></div>
              <div className="h-10 bg-slate-200 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const kpiCards = [
    {
      title: "Match Rate",
      value: formatPercentage(kpis.recon.matchRatePct),
      subtitle: `${kpis.recon.matchedCount.toLocaleString('en-IN')} of ${kpis.totals.transactionsCount.toLocaleString('en-IN')} transactions`,
      tooltip: "Percentage of transactions successfully matched with bank records",
      color: "green",
      icon: CheckCircle,
      onClick: () => handleDrillThrough('/ops/reconciliation', { status: 'matched' })
    },
    {
      title: "Total Amount",
      value: paiseToCompactINR(kpis.totals.totalAmountPaise),
      subtitle: `${kpis.totals.transactionsCount.toLocaleString('en-IN')} transactions processed`,
      tooltip: "Total transaction amount in selected period",
      color: "blue",
      icon: IndianRupee,
      onClick: () => handleDrillThrough('/ops/transactions')
    },
    {
      title: "Reconciled Amount",
      value: paiseToCompactINR(kpis.totals.reconciledAmountPaise),
      subtitle: `${kpis.recon.matchedCount.toLocaleString('en-IN')} transactions matched`,
      tooltip: "Total amount of successfully reconciled transactions",
      color: "green",
      icon: CheckCircle,
      onClick: () => handleDrillThrough('/ops/reconciliation', { status: 'matched' })
    },
    {
      title: "Variance",
      value: paiseToCompactINR(kpis.totals.variancePaise),
      subtitle: `${kpis.recon.unmatchedPgCount + kpis.recon.exceptionsCount} unreconciled`,
      tooltip: "Amount difference between total and reconciled transactions",
      color: "amber",
      icon: AlertCircle,
      onClick: () => handleDrillThrough('/ops/reconciliation', { status: 'unmatched' })
    },
    {
      title: "Exceptions",
      value: kpis.recon.exceptionsCount,
      subtitle: "Requiring manual review",
      tooltip: "Transactions with data quality issues requiring attention",
      color: "red",
      icon: AlertCircle,
      onClick: () => handleDrillThrough('/ops/exceptions')
    }
  ];

  // Add finance-only cards for sp-finance role
  const financeCards = hasFinanceAccess(userRole) && kpis.settlements ? [
    {
      title: "Settlement Batches",
      value: kpis.settlements.batchCount,
      subtitle: `Last: ${new Date(kpis.settlements.lastCycleISO || '').toLocaleDateString('en-IN')}`,
      tooltip: "Number of settlement batches processed",
      color: "blue",
      icon: TrendingUp,
      onClick: () => handleDrillThrough('/ops/settlements')
    },
    {
      title: "Net to Merchants",
      value: paiseToCompactINR(kpis.settlements.netToMerchantsPaise || '0'),
      subtitle: "After fees and deductions",
      tooltip: "Total amount credited to merchant accounts",
      color: "green",
      icon: IndianRupee,
      onClick: () => handleDrillThrough('/ops/settlements')
    }
  ] : [];

  const allCards = [...kpiCards, ...financeCards];

  return (
    <div className="w-full grid gap-4 xl:grid-cols-5 lg:grid-cols-3 md:grid-cols-2 grid-cols-1">
      {allCards.map((card, index) => (
        <KpiCard
          key={index}
          title={card.title}
          value={card.value}
          subtitle={card.subtitle}
          tooltip={card.tooltip}
          color={card.color}
          icon={card.icon}
          onClick={card.onClick}
        />
      ))}
    </div>
  );
}