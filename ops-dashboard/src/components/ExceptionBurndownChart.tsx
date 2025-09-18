import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, TrendingDown } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  Dot
} from 'recharts';
import { buildExceptionsLink, formatDateForAPI } from '@/lib/linking';
import type { BurndownResponse, Window } from '@/types/metrics';

interface ExceptionBurndownChartProps {
  data: BurndownResponse;
  window: Window;
}

export function ExceptionBurndownChart({ data, window }: ExceptionBurndownChartProps) {
  const navigate = useNavigate();
  
  // Calculate backlog days
  const backlogDays = data.resolved7dAvg > 0.1 
    ? (data.openTotal / data.resolved7dAvg).toFixed(1)
    : '—';

  // Calculate target line (linear reduction)
  const targetReductionRate = data.targetReductionRate || 10;
  const chartDataWithTarget = data.series.map((point, index) => ({
    ...point,
    target: Math.max(0, data.openTotal - (targetReductionRate * index))
  }));

  // Handle point click for drill-through
  const handlePointClick = (data: any, dataKey: string) => {
    let link: string;
    
    switch (dataKey) {
      case 'new':
        link = buildExceptionsLink({
          createdDate: data.date,
          from: window.from,
          to: window.to
        });
        break;
      case 'resolved':
        link = buildExceptionsLink({
          resolvedDate: data.date,
          from: window.from,
          to: window.to,
          status: ['resolved', 'closed']
        });
        break;
      case 'open':
      default:
        link = buildExceptionsLink({
          openOnDate: data.date,
          from: window.from,
          to: window.to
        });
        break;
    }
    
    navigate(link);
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload[0]) return null;
    
    const date = new Date(label);
    const formattedDate = date.toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });

    return (
      <div className="bg-white p-3 border rounded-lg shadow-lg">
        <p className="font-semibold mb-2">{formattedDate}</p>
        <div className="space-y-1 text-sm">
          {payload.map((entry: any) => {
            if (entry.dataKey === 'target') return null;
            return (
              <div key={entry.dataKey} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="capitalize">{entry.dataKey}:</span>
                <span className="font-medium">{entry.value}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Custom dot for clickable points
  const CustomDot = (props: any) => {
    const { cx, cy, payload, dataKey } = props;
    
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill={props.fill}
        stroke="#fff"
        strokeWidth={2}
        style={{ cursor: 'pointer' }}
        onClick={() => handlePointClick(payload, dataKey)}
      />
    );
  };

  // Format X-axis dates
  const formatXAxis = (tickItem: string) => {
    const date = new Date(tickItem);
    return date.toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'short' 
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header with Backlog Days KPI */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900">
            Exception Burn-down
            <span className="text-sm font-normal text-gray-500 ml-2">
              ({window.label || 'Last 14 days'})
            </span>
          </h3>
          <div className="group relative">
            <Info className="h-4 w-4 text-gray-400" />
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-80">
              <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3">
                Flow of exceptions over time: Open backlog vs New and Resolved. 
                Goal: red line trending down; green line ≥ orange. 
                Target line shows desired daily reduction.
                <div className="absolute top-full left-4 -mt-1">
                  <div className="border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Backlog Days KPI */}
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg">
          <TrendingDown className="h-4 w-4 text-gray-500" />
          <div className="text-sm">
            <span className="text-gray-600">Backlog days:</span>
            <span className="ml-1 font-semibold text-gray-900 text-lg">
              {backlogDays}
            </span>
          </div>
          <div className="group relative">
            <Info className="h-3 w-3 text-gray-400" />
            <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-50 w-64">
              <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3">
                Estimated days to clear the current backlog at the last-7-day average resolution rate.
                <div className="absolute top-full right-4 -mt-1">
                  <div className="border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart 
          data={chartDataWithTarget}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="date" 
            tickFormatter={formatXAxis}
          />
          <YAxis />
          <ChartTooltip content={<CustomTooltip />} />
          <Legend />
          
          {/* Target line */}
          <Line
            type="monotone"
            dataKey="target"
            stroke="#9ca3af"
            strokeDasharray="5 5"
            strokeWidth={1}
            dot={false}
            name="Target"
            opacity={0.5}
          />
          
          {/* Open exceptions line */}
          <Line
            type="monotone"
            dataKey="open"
            stroke="#ef4444"
            strokeWidth={2}
            name="Open Exceptions"
            dot={<CustomDot fill="#ef4444" />}
            activeDot={{ r: 6 }}
          />
          
          {/* New exceptions line */}
          <Line
            type="monotone"
            dataKey="new"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 5"
            name="New"
            dot={<CustomDot fill="#f59e0b" />}
            activeDot={{ r: 6 }}
          />
          
          {/* Resolved exceptions line */}
          <Line
            type="monotone"
            dataKey="resolved"
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="5 5"
            name="Resolved"
            dot={<CustomDot fill="#10b981" />}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Summary Stats */}
      <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-gray-600">Current Open:</span>
          <span className="ml-2 font-semibold text-red-600">
            {data.openTotal}
          </span>
        </div>
        <div>
          <span className="text-gray-600">Avg Resolution/Day:</span>
          <span className="ml-2 font-semibold text-green-600">
            {data.resolved7dAvg.toFixed(1)}
          </span>
        </div>
        <div>
          <span className="text-gray-600">Target Reduction:</span>
          <span className="ml-2 font-semibold text-gray-700">
            {targetReductionRate}/day
          </span>
        </div>
      </div>

      {/* Performance Indicator */}
      {data.series.length > 0 && (
        <div className="mt-3 text-sm">
          {(() => {
            const recent = data.series.slice(-7);
            const avgNew = recent.reduce((sum, p) => sum + p.new, 0) / recent.length;
            const avgResolved = recent.reduce((sum, p) => sum + p.resolved, 0) / recent.length;
            const trend = avgResolved >= avgNew ? 'positive' : 'negative';
            
            return (
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${
                trend === 'positive' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
              }`}>
                <TrendingDown className={`h-4 w-4 ${
                  trend === 'positive' ? '' : 'rotate-180'
                }`} />
                <span>
                  {trend === 'positive' 
                    ? `Resolving ${(avgResolved - avgNew).toFixed(1)} more than created daily`
                    : `Creating ${(avgNew - avgResolved).toFixed(1)} more than resolved daily`
                  }
                </span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}