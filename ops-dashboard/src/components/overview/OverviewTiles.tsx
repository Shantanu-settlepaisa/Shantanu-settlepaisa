import React from 'react';
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle, IndianRupee, Info } from 'lucide-react';
import { OverviewTiles as OverviewTilesType, OverviewWindow } from '../../types/overview-consistent';

interface OverviewTilesProps {
  tiles: OverviewTilesType;
  window: OverviewWindow;
  definitions: Record<string, string>;
}

export function OverviewTiles({ tiles, window, definitions }: OverviewTilesProps) {
  const formatCurrency = (paise: number): string => {
    const rupees = Math.abs(paise) / 100;
    const sign = paise < 0 ? '-' : '';
    
    if (rupees >= 10000000) {
      return `${sign}₹${(rupees / 10000000).toFixed(2)} Cr`;
    } else if (rupees >= 100000) {
      return `${sign}₹${(rupees / 100000).toFixed(2)} L`;
    }
    return `${sign}₹${rupees.toLocaleString('en-IN')}`;
  };

  const formatNumber = (num: number): string => {
    return num.toLocaleString('en-IN');
  };

  const DeltaIndicator = ({ delta }: { delta?: number }) => {
    if (!delta) return null;
    
    const isPositive = delta > 0;
    const Icon = isPositive ? TrendingUp : TrendingDown;
    const color = isPositive ? 'text-green-600' : 'text-red-600';
    
    return (
      <div className={`flex items-center gap-1 ${color} text-sm font-medium`}>
        <Icon className="w-4 h-4" />
        <span>{Math.abs(delta).toFixed(1)}%</span>
      </div>
    );
  };

  const Tooltip = ({ content }: { content: string }) => (
    <div className="group relative inline-block">
      <Info className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help" />
      <div className="invisible group-hover:visible absolute z-10 w-64 p-2 mt-1 text-sm text-white bg-gray-800 rounded-lg shadow-lg -left-28 top-6">
        <div className="absolute w-2 h-2 bg-gray-800 transform rotate-45 -top-1 left-1/2 -translate-x-1/2"></div>
        {content}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Reconciliation Rate */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="p-2 bg-blue-100 rounded-lg">
            <CheckCircle className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex items-center gap-2">
            <DeltaIndicator delta={tiles.reconRate.deltaPct} />
            <Tooltip content={definitions.reconRate || ''} />
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-2xl font-bold text-gray-900">
            {tiles.reconRate.pct.toFixed(2)}%
          </div>
          <div className="text-sm text-gray-500">
            {formatNumber(tiles.reconRate.matched)} / {formatNumber(tiles.reconRate.total)}
          </div>
          <div className="text-xs text-gray-400">{window.label}</div>
        </div>
      </div>

      {/* Unmatched Value */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="p-2 bg-amber-100 rounded-lg">
            <AlertCircle className="w-6 h-6 text-amber-600" />
          </div>
          <div className="flex items-center gap-2">
            <DeltaIndicator delta={tiles.unmatchedValue.deltaPct} />
            <Tooltip content={definitions.unmatchedValue || ''} />
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(tiles.unmatchedValue.amount)}
          </div>
          <div className="text-sm text-gray-500">
            {formatNumber(tiles.unmatchedValue.txnCount)} transactions
          </div>
          <div className="text-xs text-gray-400">{window.label}</div>
        </div>
      </div>

      {/* Open Exceptions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="p-2 bg-red-100 rounded-lg">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <div className="flex items-center gap-2">
            <DeltaIndicator delta={tiles.openExceptions.deltaPct} />
            <Tooltip content={definitions.openExceptions || ''} />
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-2xl font-bold text-gray-900">
            {formatNumber(tiles.openExceptions.count)}
          </div>
          <div className="text-sm text-gray-500">
            <span className="text-red-600">{tiles.openExceptions.critical} critical</span>
            {', '}
            <span className="text-amber-600">{tiles.openExceptions.high} high</span>
          </div>
          <div className="text-xs text-gray-400">{window.label}</div>
        </div>
      </div>

      {/* Credited to Merchant */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="p-2 bg-green-100 rounded-lg">
            <IndianRupee className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex items-center gap-2">
            <DeltaIndicator delta={tiles.creditedToMerchant.deltaPct} />
            <Tooltip content={definitions.creditedToMerchant || ''} />
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(tiles.creditedToMerchant.amount)}
          </div>
          <div className="text-sm text-gray-500">
            {formatNumber(tiles.creditedToMerchant.txnCount)} txns
          </div>
          <div className="text-xs text-gray-400">{window.label}</div>
        </div>
      </div>
    </div>
  );
}