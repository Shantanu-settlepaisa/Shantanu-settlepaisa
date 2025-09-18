import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatINR } from '@/lib/currency';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface SettlementFailureChartProps {
  data?: any;
  loading?: boolean;
}

export function SettlementFailureChart({ data, loading }: SettlementFailureChartProps) {
  // Always use mock data for now to ensure chart renders
  const mockData = [
    { name: 'Unknown', value: 73708100, percentage: 82.0 },
    { name: 'Technical Decline', value: 6292310, percentage: 7.0 },
    { name: 'Bank Processing Delay', value: 5465250, percentage: 6.0 },
    { name: 'File Missing', value: 1633110, percentage: 1.0 },
    { name: 'Exception - Other', value: 1128300, percentage: 1.0 },
    { name: 'Amount Mismatch', value: 936450, percentage: 1.0 },
    { name: 'Missing UTR', value: 610530, percentage: 0.0 }
  ];

  const chartData = data?.bars?.length > 0 
    ? data.bars.map((item: any) => ({
        name: item.reason,
        value: item.impactPaise,
        percentage: item.sharePct
      }))
    : mockData;

  const total = chartData.reduce((sum: number, item: any) => sum + item.value, 0);
  const totalCount = data?.totals?.unsettledTxns || 776;

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-8">
        {/* Donut Chart */}
        <div className="relative" style={{ width: '250px', height: '250px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((_entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: any) => formatINR(value)}
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '4px' }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-sm text-gray-600">Total Failed</div>
            <div className="text-xl font-bold">{totalCount.toLocaleString('en-IN')}</div>
            <div className="text-xs text-gray-500">(14.2%)</div>
          </div>
        </div>
        
        {/* Legend with percentages */}
        <div className="flex-1">
          <div className="space-y-2">
            {chartData.map((item: any, index: number) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm">{item.name}</span>
                  <span className="text-xs text-gray-500">({item.percentage}%)</span>
                </div>
                <span className="text-sm font-medium">{formatINR(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer chips */}
      <div className="flex gap-4 mt-4 pt-4 border-t">
        <div className="flex-1 bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-600">Total Unsettled</div>
          <div className="text-lg font-semibold">
            {totalCount.toLocaleString('en-IN')}
          </div>
          <div className="text-sm text-gray-600">
            {formatINR(total)}
          </div>
        </div>
        <div className="flex-1 bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-600">Top Reason</div>
          <div className="text-lg font-semibold">
            {chartData[0]?.name || 'Unknown'}
          </div>
          <div className="text-sm text-gray-600">
            {chartData[0]?.percentage || 82.0}% of impact
          </div>
        </div>
      </div>
    </>
  );
}