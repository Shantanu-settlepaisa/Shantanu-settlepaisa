import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Clock } from 'lucide-react';
import { minutesToLabelIST, nextBusinessDay } from '@/lib/merchant/settlementSchedule';
import { format } from 'date-fns';
import type { SettlementSchedule } from '@/lib/merchantApi';

interface CutoffSelectorProps {
  role: string;
  schedule: SettlementSchedule;
  onChange: (schedule: SettlementSchedule) => void;
}

// Generate time options from 12:00 to 23:00 at 30-min steps
const generateTimeOptions = () => {
  const options = [];
  for (let h = 12; h <= 23; h++) {
    for (let m = 0; m < 60; m += 30) {
      const minutes = h * 60 + m;
      options.push({
        value: minutes.toString(),
        label: minutesToLabelIST(minutes)
      });
    }
  }
  return options;
};

const timeOptions = generateTimeOptions();

export default function CutoffSelector({ role, schedule, onChange }: CutoffSelectorProps) {
  const isAdmin = role === 'merchant-admin';
  const effectiveFrom = nextBusinessDay(format(new Date(), 'yyyy-MM-dd'));

  const handleTPlusChange = (value: string) => {
    onChange({
      ...schedule,
      tPlusDays: parseInt(value) as 0 | 1 | 2
    });
  };

  const handleTimeChange = (value: string) => {
    onChange({
      ...schedule,
      cutoffMinutesIST: parseInt(value)
    });
  };

  const getTPlusHelpText = (tPlus: 0 | 1 | 2) => {
    switch (tPlus) {
      case 0:
        return "Same day settlement - funds credited on the day of cutoff";
      case 1:
        return "Next day settlement - funds credited 1 business day after cutoff";
      case 2:
        return "Two day settlement - funds credited 2 business days after cutoff";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" />
          <CardTitle className="text-base">Adjust Cut-off</CardTitle>
          {!isAdmin && (
            <Badge variant="secondary" className="text-xs">View Only</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isAdmin && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
            <div className="text-sm text-amber-700">
              View only — contact admin to request changes
            </div>
          </div>
        )}

        {/* Settlement Schedule */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Settlement Schedule</Label>
          <RadioGroup
            value={schedule.tPlusDays.toString()}
            onValueChange={handleTPlusChange}
            disabled={!isAdmin}
            aria-label="Settlement schedule"
          >
            {[0, 1, 2].map(tPlus => (
              <div key={tPlus} className="space-y-1">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value={tPlus.toString()} id={`t-plus-${tPlus}`} />
                  <Label 
                    htmlFor={`t-plus-${tPlus}`} 
                    className={`font-medium ${!isAdmin ? 'text-gray-500' : ''}`}
                  >
                    T+{tPlus} Settlement
                  </Label>
                  {schedule.tPlusDays === tPlus && (
                    <Badge variant="default" className="text-xs">Current</Badge>
                  )}
                </div>
                <p className="text-xs text-gray-600 ml-6">
                  {getTPlusHelpText(tPlus as 0 | 1 | 2)}
                </p>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Cutoff Time */}
        <div className="space-y-2">
          <Label htmlFor="cutoff-time" className="text-sm font-medium">
            Daily Cutoff Time
          </Label>
          <Select
            value={schedule.cutoffMinutesIST.toString()}
            onValueChange={handleTimeChange}
            disabled={!isAdmin}
          >
            <SelectTrigger id="cutoff-time" aria-label="Select cutoff time">
              <SelectValue placeholder="Select time" />
            </SelectTrigger>
            <SelectContent>
              {timeOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">
            All transactions captured before this time will be included in the settlement
          </p>
        </div>

        {/* Effective From */}
        {isAdmin && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Effective From</Label>
            <div className="p-2 bg-gray-50 rounded border">
              <div className="text-sm font-medium">{effectiveFrom}</div>
              <div className="text-xs text-gray-600">Next business day</div>
            </div>
            <p className="text-xs text-gray-500">
              Changes become effective from the next business day and are not retroactive
            </p>
          </div>
        )}

        {/* Current Settings Summary */}
        <div className="pt-3 border-t border-gray-200">
          <div className="text-xs text-gray-600 space-y-1">
            <div>
              <span className="font-medium">Current:</span> T+{schedule.tPlusDays}, {minutesToLabelIST(schedule.cutoffMinutesIST)}
            </div>
            <div>
              <span className="font-medium">Timezone:</span> Asia/Kolkata (IST)
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}