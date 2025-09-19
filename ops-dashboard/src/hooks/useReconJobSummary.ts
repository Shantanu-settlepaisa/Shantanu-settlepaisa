import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

// Hook for KPI tiles - NEVER filtered, always job-level totals
export function useReconJobSummary(jobId?: string | null) {
  return useQuery({
    queryKey: ['recon-job-summary', jobId], // NO status/filter in key
    enabled: !!jobId,
    queryFn: async () => {
      if (!jobId) throw new Error('No job ID');
      try {
        // Use API on port 5103 - NEVER pass filters to summary
        const response = await axios.get(`http://localhost:5103/recon/jobs/${jobId}/summary`);
        
        // Validate invariant on frontend
        const data = response.data;
        const totalCount = data.totals?.count || 0;
        const sumCount = (data.matched?.count || 0) + (data.unmatched?.count || 0) + (data.exceptions?.count || 0);
        if (totalCount !== sumCount) {
          console.error(`[INVARIANT VIOLATION] Job ${jobId}: Total (${totalCount}) != Sum (${sumCount})`);
        }
        
        return data;
      } catch (error) {
        console.error('Failed to fetch job summary:', error);
        throw error;
      }
    },
    refetchInterval: 5000, 
    staleTime: 1000, 
    retry: 2,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

// Hook for tab badges - NEVER filtered, always job-level counts only
export function useReconJobCounts(jobId?: string | null) {
  return useQuery({
    queryKey: ['recon-job-counts', jobId], // NO status/filter in key
    enabled: !!jobId,
    queryFn: async () => {
      if (!jobId) throw new Error('No job ID');
      try {
        const response = await axios.get(`http://localhost:5103/recon/jobs/${jobId}/counts`);
        return response.data; // { all, matched, unmatched, exceptions }
      } catch (error) {
        console.error('Failed to fetch job counts:', error);
        // Return default counts on error
        return {
          all: 0,
          matched: 0,
          unmatched: 0,
          exceptions: 0
        };
      }
    },
    refetchInterval: 30000, // Refresh every 30s
    staleTime: 20000,
    retry: 1,
  });
}

// Hook for table data - FILTERED by tab/search, paginated
export function useReconJobResults(jobId?: string | null, activeTab?: string, searchQuery?: string, page = 1) {
  return useQuery({
    queryKey: ['recon-job-results', jobId, activeTab, searchQuery, page], // Include all filters in key
    queryFn: async () => {
      if (!jobId) return [];
      
      console.log(`[useReconJobResults] Fetching data for jobId: ${jobId}, tab: ${activeTab}`);
      
      // Build params for filtered results
      let params: any = { 
        limit: 50,
        page,
        query: searchQuery || ''
      };
      
      // Map tab to status filter
      if (activeTab === 'matched') {
        params.status = 'matched';
      } else if (activeTab === 'unmatchedPg') {
        params.status = 'unmatchedPg';
      } else if (activeTab === 'unmatchedBank') {
        params.status = 'unmatchedBank';
      } else if (activeTab === 'unmatched') {
        params.status = 'unmatched';  // API handles both PG and BANK
      } else if (activeTab === 'exceptions') {
        params.status = 'exceptions';
      }
      // For 'all', don't set status filter
      
      console.log(`[useReconJobResults] API params:`, params);
      
      try {
        const response = await axios.get(`http://localhost:5103/recon/jobs/${jobId}/results`, { params });
        const results = response.data.results || [];
        
        console.log(`[useReconJobResults] API returned ${results.length} results for tab: ${activeTab}`);
        if (results.length > 0) {
          console.log(`[useReconJobResults] First result status:`, results[0].status);
        }
        
        // Enhanced API handles all filtering server-side
        return results;
      } catch (error) {
        console.error('Failed to fetch job results:', error);
        return [];
      }
    },
    enabled: !!jobId,
    retry: 1,
    staleTime: 0, // Don't cache results
    gcTime: 0, // Use gcTime instead of deprecated cacheTime
    refetchOnMount: 'always', // Always refetch when component mounts
    refetchOnWindowFocus: false, // Don't refetch on window focus
    placeholderData: undefined, // Don't use placeholder data
    networkMode: 'always' // Always fetch from network
  });
}