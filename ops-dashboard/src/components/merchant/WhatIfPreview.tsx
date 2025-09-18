import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, TrendingUp } from 'lucide-react';
import { computeWindows } from '@/lib/merchant/settlementSchedule';
import { format } from 'date-fns';
import type { SettlementSchedule } from '@/lib/merchantApi';

interface WhatIfPreviewProps {
  schedule: SettlementSchedule;
  nowISO?: string;
}

const IST = 'Asia/Kolkata';

export default function WhatIfPreview({ schedule, nowISO = new Date().toISOString() }: WhatIfPreviewProps) {
  const windows = computeWindows(nowISO, schedule);

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return format(date, 'MMM dd, yyyy hh:mm a');
  };

  const WindowCard = ({ window, index }: { window: typeof windows[0], index: number }) => {
    const colors = [
      'border-gray-200 bg-gray-50',
      'border-blue-200 bg-blue-50', 
      'border-green-200 bg-green-50'
    ];

    return (
      <div className={`p-3 rounded-lg border ${colors[index]}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-3 h-3 text-gray-500" />
            <span className="text-sm font-medium capitalize">{window.label} Window</span>
          </div>
          <Badge variant="outline" className="text-xs">
            T+{schedule.tPlusDays}
          </Badge>
        </div>
        
        <div className="space-y-2 text-xs">
          <div>
            <span className="text-gray-500">Capture Period:</span>
            <div className="font-mono text-gray-900">
              {formatDateTime(window.captureStartISO)}
            </div>
            <div className="text-gray-400 text-center">↓</div>
            <div className="font-mono text-gray-900">
              {formatDateTime(window.captureEndISO)}
            </div>
          </div>
          
          <div>
            <span className="text-gray-500">Auto-settlement:</span>
            <div className="font-medium text-blue-600">{window.cutoffTimeLabel}</div>
          </div>
          
          <div>
            <span className="text-gray-500">Bank Credit ETA:</span>
            <div className="font-medium text-green-600">
              {formatDateTime(window.bankCreditEtaISO)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-600" />
          <CardTitle className="text-base">What-If Preview</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-3">
          {windows.map((window, index) => (
            <WindowCard key={window.label} window={window} index={index} />
          ))}
        </div>
        
        {/* Summary */}
        <div className="pt-3 border-t border-gray-200">
          <div className="text-xs text-gray-600 space-y-1">
            <div className="flex items-center justify-between">
              <span>Settlement Schedule:</span>
              <Badge variant="secondary" className="text-xs">
                T+{schedule.tPlusDays}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Daily Cutoff:</span>
              <span className="font-medium">{windows[0].cutoffTimeLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Timezone:</span>
              <span className="font-medium">{IST}</span>
            </div>
          </div>
        </div>

        {/* Live Update Indicator */}
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span>Live preview updates as you change settings</span>
        </div>
      </CardContent>
    </Card>
  );
}