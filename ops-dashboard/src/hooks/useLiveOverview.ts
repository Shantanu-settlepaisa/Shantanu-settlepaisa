import { useEffect, useRef, useState } from 'react'
import { opsApiExtended } from '../lib/ops-api-extended'
import type { OverviewSnapshot } from '../types/overview'

export function useLiveOverview(window: 'day' | '7d' | '30d' = '7d') {
  const [data, setData] = useState<OverviewSnapshot | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [live, setLive] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSnapshot = async () => {
    try {
      const snapshot = await opsApiExtended.getOverviewSnapshot(window)
      setData(snapshot)
      setLastUpdated(new Date().toISOString())
    } catch (error) {
      console.error('Failed to fetch overview snapshot:', error)
    }
  }

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
    const es = opsApiExtended.createOverviewEventSource(window)
    if (!es) {
      // Fallback to polling if SSE not available
      pollRef.current = setInterval(fetchSnapshot, 30000)
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

    es.addEventListener('exceptions.updated', (event: any) => {
      // Just update the timestamp as the data will come in the next metrics update
      setLastUpdated(new Date().toISOString())
    })

    es.addEventListener('heartbeat', (event: any) => {
      setIsConnected(true)
      // Optional: Update connection status
    })

    // Handle errors and fallback to polling
    const handleError = () => {
      console.warn('SSE connection lost, falling back to polling')
      setIsConnected(false)
      es.close()
      esRef.current = null
      
      // Start polling as fallback
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchSnapshot, 30000)
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
  }, [live, window])

  return {
    data,
    lastUpdated,
    live,
    setLive,
    refresh: fetchSnapshot,
    isConnected
  }
}