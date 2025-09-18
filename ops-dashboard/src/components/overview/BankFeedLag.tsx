import { BankLagItem } from '@/services/overview';
import { Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface BankFeedLagProps {
  banks: BankLagItem[];
  isLoading?: boolean;
  onBankClick?: (bankId: string) => void;
}

export function BankFeedLag({ banks, isLoading, onBankClick }: BankFeedLagProps) {
  if (isLoading || !banks) {
    return (
      <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Bank Feed Lag</h3>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-12 bg-slate-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const getStatusIcon = (status: BankLagItem['status']) => {
    switch (status) {
      case 'OK':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'WARN':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'BREACH':
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusColor = (status: BankLagItem['status']) => {
    switch (status) {
      case 'OK':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'WARN':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'BREACH':
        return 'bg-red-50 text-red-700 border-red-200';
    }
  };

  const getLagColor = (hours: number) => {
    if (hours <= 4) return 'text-green-600';
    if (hours <= 8) return 'text-amber-600';
    if (hours <= 12) return 'text-orange-600';
    return 'text-red-600';
  };

  const formatLag = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    return `${hours}h`;
  };

  const maxLag = Math.max(...banks.map(b => b.avgLagHours));

  const healthyCount = banks.filter(b => b.status === 'OK').length;

  return (
    <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Bank Feed Lag</h3>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" />
          <span className="text-sm text-slate-600">
            {healthyCount}/{banks.length} OK
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {banks.map((bank) => {
          const barWidth = maxLag > 0 ? (bank.avgLagHours / maxLag) * 100 : 0;
          
          return (
            <div
              key={bank.bank}
              className="group cursor-pointer p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all"
              onClick={() => onBankClick?.(bank.bank.toLowerCase())}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{bank.bank}</span>
                  {getStatusIcon(bank.status)}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(bank.status)}`}>
                  {bank.status}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        bank.avgLagHours <= 4 ? 'bg-green-500' :
                        bank.avgLagHours <= 8 ? 'bg-amber-500' :
                        bank.avgLagHours <= 12 ? 'bg-orange-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
                <div className="ml-3 text-right">
                  <div className={`text-sm font-bold ${getLagColor(bank.avgLagHours)}`}>
                    {formatLag(bank.avgLagHours)}
                  </div>
                  <div className="text-xs text-slate-500">avg lag</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {banks.some(b => b.status !== 'OK') && (
        <div className="mt-4 p-3 bg-amber-50 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">Feed Delays Detected</p>
              <p className="text-xs text-amber-700 mt-1">
                {banks.filter(b => b.status === 'BREACH').length} bank(s) breaching SLA,
                {' '}{banks.filter(b => b.status === 'WARN').length} warning
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}