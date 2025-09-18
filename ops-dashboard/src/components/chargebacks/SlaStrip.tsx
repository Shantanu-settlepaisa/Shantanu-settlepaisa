import { Clock, AlertTriangle, Calendar } from 'lucide-react';
import { formatINR } from '@/lib/currency';
import { SlaBuckets } from '@/hooks/useDisputesKpis';

interface SlaStripProps {
  buckets: SlaBuckets;
  onClickBucket: (bucket: 'overdue' | 'today' | 'twoToThree') => void;
  isLoading?: boolean;
}

export function SlaStrip({ buckets, onClickBucket, isLoading }: SlaStripProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200" data-testid="sla-strip">
        <div className="animate-pulse flex items-center gap-3">
          <div className="h-8 w-32 bg-slate-200 rounded"></div>
          <div className="h-8 w-32 bg-slate-200 rounded"></div>
          <div className="h-8 w-32 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  const chips = [
    {
      key: 'overdue' as const,
      label: 'Overdue',
      icon: AlertTriangle,
      count: buckets.overdue.count,
      amount: buckets.overdue.amountPaise,
      color: 'red',
      bgColor: 'bg-red-50 hover:bg-red-100',
      textColor: 'text-red-700',
      iconColor: 'text-red-500'
    },
    {
      key: 'today' as const,
      label: 'Today',
      icon: Clock,
      count: buckets.today.count,
      amount: buckets.today.amountPaise,
      color: 'amber',
      bgColor: 'bg-amber-50 hover:bg-amber-100',
      textColor: 'text-amber-700',
      iconColor: 'text-amber-500'
    },
    {
      key: 'twoToThree' as const,
      label: '2-3d',
      icon: Calendar,
      count: buckets.twoToThree.count,
      amount: buckets.twoToThree.amountPaise,
      color: 'blue',
      bgColor: 'bg-blue-50 hover:bg-blue-100',
      textColor: 'text-blue-700',
      iconColor: 'text-blue-500'
    }
  ];

  return (
    <div 
      className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200"
      data-testid="sla-strip"
    >
      <span className="text-sm font-medium text-slate-600 mr-2">SLA Status:</span>
      
      <div className="flex items-center gap-2 flex-wrap">
        {chips.map((chip) => {
          const Icon = chip.icon;
          const hasItems = chip.count > 0;
          
          return (
            <button
              key={chip.key}
              onClick={() => hasItems && onClickBucket(chip.key)}
              disabled={!hasItems}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                ${hasItems 
                  ? `${chip.bgColor} ${chip.textColor} cursor-pointer` 
                  : 'bg-slate-50 text-slate-400 cursor-not-allowed opacity-50'
                }
              `}
              aria-label={`Filter by ${chip.label} cases`}
            >
              <Icon className={`w-3.5 h-3.5 ${hasItems ? chip.iconColor : 'text-slate-300'}`} />
              <span>{chip.label}</span>
              <span className="font-bold">{chip.count}</span>
              {hasItems && chip.amount !== '0' && (
                <>
                  <span className="text-xs opacity-70">•</span>
                  <span className="text-xs font-medium">
                    {formatINR(chip.amount, { compact: true })}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}