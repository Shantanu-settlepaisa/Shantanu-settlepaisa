import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { 
  Activity, 
  RefreshCw, 
  Pause, 
  Play,
  AlertCircle
} from 'lucide-react';
import { OverviewTiles } from '../../components/overview/OverviewTiles';
import { SettlementPipeline } from '../../components/overview/SettlementPipeline';
import { TopReasons } from '../../components/overview/TopReasons';
import { BySource } from '../../components/overview/BySource';
import { TimeRangePicker, getTimeRangeLabel, getTimeRangeShortLabel, getTimeRangeBounds } from '../../components/TimeRangePicker';
import type { TimeRange } from '../../components/TimeRangePicker';
import type { OverviewConsistentData } from '../../types/overview-consistent';

// API client to fetch overview data
const fetchOverviewData = async (from: string, to: string, tz: string): Promise<OverviewConsistentData> => {
  const params = new URLSearchParams({ from, to, tz });
  const url = `http://localhost:5105/api/ops/overview?${params}`;
  console.log('[OverviewConsistent] Fetching from:', url);
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch overview data: ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log('[OverviewConsistent] Received pipeline data:', data.pipeline?.exclusive);
  return data;
};

export default function OverviewConsistent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [live, setLive] = useState(true);
  
  // Parse range from URL or default to last7d
  const rangeParam = searchParams.get('range') || 'last7d';
  const tzParam = searchParams.get('tz') || 'Asia/Kolkata';
  const timeRange: TimeRange = rangeParam as TimeRange;
  
  // Get time bounds for the selected range
  const bounds = getTimeRangeBounds(timeRange, tzParam);
  
  // Fetch overview data
  const { 
    data: overview, 
    isLoading, 
    error, 
    refetch 
  } = useQuery({
    queryKey: ['overview-consistent', bounds.start.toISOString(), bounds.end.toISOString(), tzParam],
    queryFn: () => fetchOverviewData(
      bounds.start.toISOString().split('T')[0],
      bounds.end.toISOString().split('T')[0],
      tzParam
    ),
    refetchInterval: live ? 30000 : false,
    staleTime: 10000,
  });
  
  // Update URL when range changes
  const setTimeRange = (range: TimeRange) => {
    const newParams = new URLSearchParams(searchParams);
    if (typeof range === 'string') {
      newParams.set('range', range);
    } else {
      newParams.set('range', 'custom');
      newParams.set('start', range.start.toISOString());
      newParams.set('end', range.end.toISOString());
    }
    newParams.set('tz', tzParam);
    setSearchParams(newParams);
  };
  
  const rangeLabel = getTimeRangeLabel(timeRange);
  const rangeShortLabel = getTimeRangeShortLabel(timeRange);
  
  // Handle source click navigation
  const handleSourceClick = (source: 'manual' | 'connector') => {
    // Navigate to recon page with source filter
    const newParams = new URLSearchParams(searchParams);
    newParams.set('source', source);
    window.location.href = `/ops/recon?${newParams.toString()}`;
  };
  
  // Handle reason click navigation
  const handleReasonClick = (reason: string) => {
    // Navigate to exceptions page with reason filter
    const newParams = new URLSearchParams(searchParams);
    newParams.set('reason', reason);
    window.location.href = `/ops/exceptions?${newParams.toString()}`;
  };
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Failed to load dashboard metrics</p>
          <p className="text-sm text-gray-500 mt-2">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  
  if (isLoading && !overview) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard metrics...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reconciliation Overview</h1>
          <p className="text-sm text-gray-500">
            Numerically consistent metrics across all components
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Time Range Picker */}
          <TimeRangePicker
            value={timeRange}
            onChange={setTimeRange}
            timezone={tzParam}
          />
          
          {/* Live Controls */}
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            {live ? (
              <Activity className="w-4 h-4 text-green-500 animate-pulse" />
            ) : (
              <Activity className="w-4 h-4 text-gray-400" />
            )}
            <span className={live ? 'text-green-600 font-medium' : 'text-gray-500'}>
              {live ? `Live • ${rangeShortLabel}` : `Paused • ${rangeShortLabel}`}
            </span>
          </div>
          
          <button
            onClick={() => setLive(!live)}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            {live ? (
              <>
                <Pause className="w-3 h-3 mr-1" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-3 h-3 mr-1" />
                Resume
              </>
            )}
          </button>
          
          <button
            onClick={() => refetch()}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh
          </button>
        </div>
      </div>
      
      {overview && (
        <>
          {/* KPI Tiles */}
          <OverviewTiles 
            tiles={overview.tiles} 
            window={overview.window}
            definitions={overview.definitions}
          />
          
          {/* Settlement Pipeline with Exclusive Buckets */}
          <SettlementPipeline 
            pipeline={overview.pipeline}
            definitions={overview.definitions}
          />
          
          {/* Bottom Grid: Top Reasons and By Source */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Exception Reasons */}
            <TopReasons 
              topReasons={overview.topReasons}
              onReasonClick={handleReasonClick}
            />
            
            {/* By Source */}
            <BySource 
              bySource={overview.bySource}
              onSourceClick={handleSourceClick}
            />
          </div>
          
          {/* Data Validation Info (only in dev mode) */}
          {process.env.NODE_ENV === 'development' && overview.pipeline.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-amber-900 mb-2">
                Data Consistency Warnings
              </h3>
              <ul className="space-y-1 text-sm text-amber-700">
                {overview.pipeline.warnings.map((warning, idx) => (
                  <li key={idx}>
                    • <span className="font-mono">{warning.code}</span>: {warning.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Arithmetic Validation (always runs in background) */}
          <div className="hidden">
            {(() => {
              const { pipeline, tiles, topReasons } = overview;
              const { exclusive } = pipeline;
              
              // Check 1: Pipeline sum
              const pipelineSum = exclusive.inSettlementOnly + 
                                 exclusive.sentToBankOnly + 
                                 exclusive.credited + 
                                 exclusive.unsettled;
              console.assert(
                pipelineSum === pipeline.totalCaptured,
                `Pipeline sum mismatch: ${pipelineSum} != ${pipeline.totalCaptured}`
              );
              
              // Check 2: Credited tile vs pipeline
              console.assert(
                tiles.creditedToMerchant.txnCount === exclusive.credited,
                `Credited mismatch: tile=${tiles.creditedToMerchant.txnCount} vs pipeline=${exclusive.credited}`
              );
              
              // Check 3: Top reasons sum (in impacted mode)
              if (topReasons.mode === 'impacted') {
                console.assert(
                  topReasons.total === tiles.openExceptions.count,
                  `Reasons sum mismatch: ${topReasons.total} != ${tiles.openExceptions.count}`
                );
              }
              
              return null;
            })()}
          </div>
        </>
      )}
      
      {/* No data message */}
      {overview && overview.tiles.reconRate.total === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
          <p className="text-gray-600">No transactions found for {rangeLabel}</p>
          <p className="text-sm text-gray-500 mt-2">
            Try selecting a different time range or check if data ingestion is running.
          </p>
        </div>
      )}
    </div>
  );
}