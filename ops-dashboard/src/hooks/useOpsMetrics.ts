import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { opsApiExtended } from '../lib/ops-api-extended'
import type { OverviewSnapshot } from '../types/overview'
import type { TimeRange } from '../components/TimeRangePicker'
import { getTimeRangeBounds } from '../components/TimeRangePicker'

interface UseOpsMetricsOptions {
  live?: boolean
  timezone?: string
  pollingInterval?: number
}

export function useOpsMetrics(options: UseOpsMetricsOptions = {}) {
  const {
    live = true,
    timezone = 'Asia/Kolkata',
    pollingInterval = 30000
  } = options
  
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState<OverviewSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  
  const esRef = useRef<EventSource | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  
  // Parse range from URL or default to last7d
  const rangeParam = searchParams.get('range') || 'last7d'
  const tzParam = searchParams.get('tz') || timezone
  
  const timeRange: TimeRange = rangeParam as TimeRange
  
  // Update URL when range changes
  const setTimeRange = useCallback((range: TimeRange) => {
    const newParams = new URLSearchParams(searchParams)
    if (typeof range === 'string') {
      newParams.set('range', range)
    } else {
      newParams.set('range', 'custom')
      newParams.set('start', range.start.toISOString())
      newParams.set('end', range.end.toISOString())
    }
    newParams.set('tz', tzParam)
    setSearchParams(newParams)
  }, [searchParams, setSearchParams, tzParam])
  
  // Fetch snapshot with time range
  const fetchSnapshot = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const bounds = getTimeRangeBounds(timeRange, tzParam)
      const snapshot = await opsApiExtended.getOverviewSnapshot(
        rangeParam,
        tzParam,
        bounds.start.toISOString(),
        bounds.end.toISOString()
      )
      
      setData(snapshot)
      setLastUpdated(new Date().toISOString())
    } catch (err) {
      console.error('Failed to fetch metrics snapshot:', err)
      setError(err instanceof Error ? err : new Error('Failed to fetch metrics'))
    } finally {
      setLoading(false)
    }
  }, [timeRange, rangeParam, tzParam])
  
  // Set up SSE connection for live updates
  useEffect(() => {
    // Initial fetch
    fetchSnapshot()
    
    if (!live) {
      // Clear any existing connections
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    
    // Set up SSE connection
    const es = opsApiExtended.createOverviewEventSource(rangeParam as any)
    if (!es) {
      // Fallback to polling if SSE not available
      pollRef.current = setInterval(fetchSnapshot, pollingInterval)
      return
    }
    
    esRef.current = es
    
    // Handle SSE events
    es.addEventListener('metrics.updated', (event: any) => {
      try {
        const snapshot = JSON.parse(event.data)
        setData(snapshot)
        setLastUpdated(new Date().toISOString())
        setIsConnected(true)
      } catch (error) {
        console.error('Failed to parse metrics update:', error)
      }
    })
    
    es.addEventListener('exceptions.updated', () => {
      // Trigger a refresh on exceptions update
      fetchSnapshot()
    })
    
    es.addEventListener('heartbeat', () => {
      setIsConnected(true)
    })
    
    // Handle errors and fallback to polling
    const handleError = () => {
      console.warn('SSE connection lost, falling back to polling')
      setIsConnected(false)
      es.close()
      esRef.current = null
      
      // Start polling as fallback
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchSnapshot, pollingInterval)
      }
    }
    
    if ('onerror' in es) {
      es.onerror = handleError
    }
    
    // Cleanup
    return () => {
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [live, rangeParam, fetchSnapshot, pollingInterval])
  
  return {
    data,
    loading,
    error,
    lastUpdated,
    isConnected,
    timeRange,
    setTimeRange,
    timezone: tzParam,
    refresh: fetchSnapshot
  }
}