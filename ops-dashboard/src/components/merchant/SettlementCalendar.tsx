import { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameDay } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IST, computeWindows, minutesToLabelIST } from '@/lib/merchant/settlementSchedule';
import type { SettlementSchedule } from '@/lib/merchantApi';

interface SettlementCalendarProps {
  schedule: SettlementSchedule;
  nowISO?: string;
}

export default function SettlementCalendar({ schedule, nowISO = new Date().toISOString() }: SettlementCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date(nowISO));

  // Get windows for highlighting
  const windows = computeWindows(nowISO, schedule);
  const windowDates = new Set();
  
  windows.forEach(window => {
    const startDate = new Date(window.captureStartISO);
    const endDate = new Date(window.captureEndISO);
    
    // Add all dates in the window range
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    days.forEach(day => {
      windowDates.add(format(day, 'yyyy-MM-dd'));
    });
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const today = new Date(nowISO);

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + (direction === 'next' ? 1 : -1));
    setCurrentMonth(newMonth);
  };

  const getDayType = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const currentWindow = windows.find(w => {
      const start = format(new Date(w.captureStartISO), 'yyyy-MM-dd');
      const end = format(new Date(w.captureEndISO), 'yyyy-MM-dd');
      return dayStr >= start && dayStr <= end;
    });
    
    return currentWindow?.label || null;
  };

  const getWindowColor = (windowType: string | null) => {
    switch (windowType) {
      case 'previous': return 'bg-gray-100 border-gray-300';
      case 'current': return 'bg-blue-100 border-blue-300';
      case 'next': return 'bg-green-100 border-green-300';
      default: return '';
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        {/* Calendar Header */}
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateMonth('prev')}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          <h3 className="text-lg font-semibold">
            {format(currentMonth, 'MMMM yyyy')}
          </h3>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateMonth('next')}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map(day => {
            const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
            const isToday = isSameDay(day, today);
            const windowType = getDayType(day);
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            
            return (
              <div
                key={day.toISOString()}
                className={`
                  relative p-2 min-h-[60px] border rounded-lg text-sm
                  ${isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}
                  ${isToday ? 'ring-2 ring-blue-500' : ''}
                  ${windowType ? getWindowColor(windowType) : 'border-gray-200'}
                  ${isWeekend && !windowType ? 'bg-gray-50' : ''}
                `}
                title={windowType ? `${windowType} window - Cutoff ${minutesToLabelIST(schedule.cutoffMinutesIST)}` : undefined}
              >
                <div className="flex flex-col h-full">
                  <span className={`font-medium ${isToday ? 'text-blue-600' : ''}`}>
                    {format(day, 'd')}
                  </span>
                  
                  {isCurrentMonth && !isWeekend && (
                    <div className="mt-1 space-y-1">
                      <Badge variant="outline" className="text-xs px-1 py-0">
                        T+{schedule.tPlusDays}
                      </Badge>
                      <div className="text-xs text-gray-600">
                        {minutesToLabelIST(schedule.cutoffMinutesIST).replace(' IST', '')}
                      </div>
                    </div>
                  )}
                  
                  {windowType && (
                    <Badge 
                      variant={windowType === 'current' ? 'default' : 'secondary'}
                      className="absolute -top-1 -right-1 text-xs px-1 py-0 capitalize"
                    >
                      {windowType}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded"></div>
            <span>Previous</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded"></div>
            <span>Current</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
            <span>Next</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}