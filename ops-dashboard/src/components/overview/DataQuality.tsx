import { DataQuality as DataQualityType } from '@/services/overview';
import { CheckCircle, AlertTriangle, XCircle, TrendingUp } from 'lucide-react';

interface DataQualityProps {
  quality: DataQualityType;
  isLoading?: boolean;
}

export function DataQuality({ quality, isLoading }: DataQualityProps) {
  if (isLoading || !quality) {
    return (
      <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Data Quality</h3>
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

  const getScoreColor = (score: number) => {
    if (score >= 95) return 'text-green-600';
    if (score >= 80) return 'text-amber-600';
    if (score >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  const getStatusIcon = (isOk: boolean) => {
    return isOk ? 
      <CheckCircle className="w-4 h-4 text-green-500" /> : 
      <XCircle className="w-4 h-4 text-red-500" />;
  };

  const metrics = [
    {
      label: 'Pipeline Sum Check',
      value: quality.pipelineSumOk,
      description: 'inSettlement + unsettled = captured',
      isBoolean: true,
    },
    {
      label: 'Credit Constraint',
      value: quality.creditConstraintOk,
      description: 'credited ≤ sentToBank',
      isBoolean: true,
    },
    {
      label: 'Normalization Success',
      value: quality.normalizationSuccessPct,
      description: 'Fields normalized correctly',
      isBoolean: false,
    },
    {
      label: 'Duplicate UTR Rate',
      value: quality.duplicateUtrPct,
      description: 'Duplicate transaction IDs',
      isBoolean: false,
      isInverse: true, // Lower is better
    },
  ];

  const overallScore = Math.round(
    (Number(quality.pipelineSumOk) * 25 + 
     Number(quality.creditConstraintOk) * 25 + 
     quality.normalizationSuccessPct * 0.25 + 
     (100 - quality.duplicateUtrPct) * 0.25)
  );

  return (
    <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-slate-900">Data Quality</h3>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-500" />
          <span className={`text-lg font-bold ${getScoreColor(overallScore)}`}>
            {overallScore}%
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-slate-900">{metric.label}</span>
                <p className="text-xs text-slate-500">{metric.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {metric.isBoolean ? (
                  <>
                    {getStatusIcon(metric.value as boolean)}
                    <span className={`text-sm font-medium ${metric.value ? 'text-green-600' : 'text-red-600'}`}>
                      {metric.value ? 'PASSED' : 'FAILED'}
                    </span>
                  </>
                ) : (
                  <span className={`text-sm font-medium ${
                    metric.isInverse 
                      ? (metric.value as number) <= 1 ? 'text-green-600' : 'text-amber-600'
                      : getScoreColor(metric.value as number)
                  }`}>
                    {metric.value}%
                  </span>
                )}
              </div>
            </div>
            {!metric.isBoolean && (
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    metric.isInverse
                      ? (metric.value as number) <= 1 ? 'bg-green-500' :
                        (metric.value as number) <= 5 ? 'bg-amber-500' : 'bg-red-500'
                      : (metric.value as number) >= 95 ? 'bg-green-500' :
                        (metric.value as number) >= 80 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ 
                    width: metric.isInverse 
                      ? `${Math.min(100, (metric.value as number) * 10)}%` 
                      : `${metric.value}%` 
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            <span className="text-xs text-slate-600">
              {quality.duplicateUtrPct > 1 ? 'Duplicate UTRs detected' : 'All checks passing'}
            </span>
          </div>
          <button className="text-xs text-blue-600 hover:text-blue-700 font-medium">
            Details →
          </button>
        </div>
      </div>
    </div>
  );
}