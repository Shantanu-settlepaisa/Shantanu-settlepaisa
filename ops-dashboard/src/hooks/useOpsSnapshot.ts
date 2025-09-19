import { useEffect, useState, useCallback } from 'react';
import { computeOpsSnapshot } from '../services/overview-aggregator';
import type { OpsSnapshot } from '../types/opsSnapshot';

export function useOpsSnapshot(rangeStartISO: string, rangeEndISO: string, tz = 'Asia/Kolkata') {
  const [data, setData] = useState<OpsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchOnce = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // In production, this would be a fetch call to the backend
      // For demo, we use the local compute function
      const snapshot = await computeOpsSnapshot(rangeStartISO, rangeEndISO, tz);
      setData(snapshot);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch snapshot'));
    } finally {
      setLoading(false);
    }
  }, [rangeStartISO, rangeEndISO, tz]);

  useEffect(() => {
    fetchOnce();
  }, [fetchOnce]);

  // Listen for refresh events from manual upload
  useEffect(() => {
    function onRefresh() {
      fetchOnce();
    }
    window.addEventListener('ops:snapshot:refresh', onRefresh);
    return () => window.removeEventListener('ops:snapshot:refresh', onRefresh);
  }, [fetchOnce]);

  return { data, loading, error, refetch: fetchOnce };
}