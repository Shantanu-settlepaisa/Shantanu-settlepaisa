import { useState, useCallback, useEffect } from 'react'
import { FileUp, Settings, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FileCard, type UploadedFile } from './recon/FileCard'
import { ReconResultsTable, type ReconRow } from './recon/ReconResultsTable'
import { ReconConfigDrawer } from './recon/ReconConfigDrawer'
import ManualUploadTiles from './recon/ManualUploadTiles'
import { useReconJobSummary, useReconJobCounts, useReconJobResults } from '../hooks/useReconJobSummary'
import { useQueryClient } from '@tanstack/react-query'
import axios from 'axios'


// Helper to detect PG schema from headers
function detectPGSchema(headers: string[]): string {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  
  // V1 PG format indicators
  const v1Indicators = ['transaction id', 'client code', 'payee amount', 'paid amount', 'trans complete date'];
  const v1Score = v1Indicators.filter(indicator => 
    lowerHeaders.some(h => h.includes(indicator))
  ).length;
  
  // V2 PG format indicators
  const v2Indicators = ['transaction_id', 'merchant_id', 'amount_paise', 'payment_method'];
  const v2Score = v2Indicators.filter(indicator =>
    lowerHeaders.some(h => h.includes(indicator))
  ).length;
  
  if (v1Score >= 3) {
    return 'STANDARD_PG_V1';
  } else if (v2Score >= 2) {
    return 'STANDARD_PG_V2';
  }
  
  return 'STANDARD_PG';
}

// Helper to detect bank from filename
function detectBankFromFilename(filename: string): string {
  const normalized = filename.toUpperCase();
  
  const patterns: Record<string, string[]> = {
    'HDFC_BANK': ['HDFC BANK', 'HDFC_BANK', 'HDFCBANK', 'HDFC'],
    'AXIS_BANK': ['AXIS BANK', 'AXIS_BANK', 'AXISBANK', 'AXIS'],
    'SBI_BANK': ['SBI BANK', 'SBI_BANK', 'SBIBANK', 'SBI'],
    'ICICI_BANK': ['ICICI BANK', 'ICICI_BANK', 'ICICIBANK', 'ICICI'],
    'YES_BANK': ['YES BANK', 'YES_BANK', 'YESBANK', 'YES'],
    'BOB': ['BOB', 'BANK OF BARODA'],
    'CANARA': ['CANARA'],
    'IDBI': ['IDBI'],
    'INDIAN_BANK': ['INDIAN BANK', 'INDIAN_BANK'],
    'FEDERAL': ['FEDERAL'],
    'BOI': ['BOI', 'BANK OF INDIA']
  };
  
  for (const [bankSchema, bankPatterns] of Object.entries(patterns)) {
    for (const pattern of bankPatterns) {
      if (normalized.includes(pattern)) {
        console.log(`[Bank Detection] Matched "${filename}" → "${bankSchema}"`);
        return bankSchema;
      }
    }
  }
  
  console.warn(`[Bank Detection] Could not detect bank from: ${filename}`);
  return 'UNKNOWN_BANK';
}

// Helper to compute MD5 (simplified)
async function computeMD5(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex.substring(0, 8)
}

// Helper to read file preview
async function readFilePreview(file: File, rows = 5): Promise<{ columns: string[], rows: any[][] }> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split('\n').filter(line => line.trim())
      const columns = lines[0]?.split(',').map(h => h.trim()) || []
      const previewRows = lines.slice(1, rows + 1).map(line => 
        line.split(',').map(cell => cell.trim())
      )
      resolve({ columns, rows: previewRows })
    }
    reader.readAsText(file.slice(0, 50000)) // Read first 50KB
  })
}

// Helper to parse entire CSV file
async function parseCSVFile(file: File): Promise<any[]> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split('\n').filter(line => line.trim())
      const headers = lines[0]?.split(',').map(h => h.trim()) || []
      
      const data = lines.slice(1).map(line => {
        const values = line.split(',').map(cell => cell.trim())
        const obj: any = {}
        headers.forEach((header, index) => {
          obj[header] = values[index] || ''
        })
        return obj
      })
      
      resolve(data)
    }
    reader.readAsText(file)
  })
}

// All mock data removed - using real V2 API data only

export function ManualUploadEnhanced() {
  const queryClient = useQueryClient()
  const [cycleDate, setCycleDate] = useState('2025-10-02')
  const [merchant] = useState('All Merchants')
  const [acquirer] = useState('All Banks')
  // Restore file metadata from localStorage (create mock File objects for display)
  const [pgFiles, setPgFiles] = useState<UploadedFile[]>(() => {
    try {
      const saved = localStorage.getItem('lastPgFileMetadata');
      if (saved) {
        const metadata = JSON.parse(saved);
        console.log('[ManualUploadEnhanced] Restoring PG file metadata:', metadata);
        return metadata.map((m: any) => ({
          ...m,
          file: new File([], m.file.name, { type: m.file.type })
        }));
      }
    } catch (error) {
      console.error('[ManualUploadEnhanced] Failed to restore PG file metadata:', error);
    }
    return [];
  })
  
  const [bankFiles, setBankFiles] = useState<UploadedFile[]>(() => {
    try {
      const saved = localStorage.getItem('lastBankFileMetadata');
      if (saved) {
        const metadata = JSON.parse(saved);
        console.log('[ManualUploadEnhanced] Restoring Bank file metadata:', metadata);
        return metadata.map((m: any) => ({
          ...m,
          file: new File([], m.file.name, { type: m.file.type })
        }));
      }
    } catch (error) {
      console.error('[ManualUploadEnhanced] Failed to restore Bank file metadata:', error);
    }
    return [];
  })
  
  const [configDrawerOpen, setConfigDrawerOpen] = useState(false)
  const [reconResults, setReconResults] = useState<ReconRow[]>([])
  
  // Persist jobId in localStorage
  const [jobId, setJobId] = useState<string | null>(() => {
    const savedJobId = localStorage.getItem('lastReconJobId');
    console.log('[ManualUploadEnhanced] Restoring jobId from localStorage:', savedJobId);
    return savedJobId;
  })
  
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'matched' | 'unmatchedPg' | 'unmatchedBank' | 'exceptions'>('all')
  const [isTabChanging, setIsTabChanging] = useState(false)
  
  // Store the breakdown counts for display
  const [breakdownCounts, setBreakdownCounts] = useState({
    totalCount: 0,
    matchedCount: 0,
    unmatchedPgCount: 0,
    unmatchedBankCount: 0,
    exceptionsCount: 0
  })
  
  // Fetch job summary from backend using custom hooks
  const { data: jobSummary } = useReconJobSummary(jobId);
  const { data: jobCounts } = useReconJobCounts(jobId);
  const { data: jobResults } = useReconJobResults(jobId, activeTab);

  // Convert API results to UI format
  const convertToReconRows = (results: any[]): ReconRow[] => {
    return results.map(r => {
      // Normalize status to uppercase format expected by UI
      // API returns lowercase status like 'exception', 'unmatchedBank'
      let normalizedStatus: ReconRow['status'] = 'Unknown';
      const apiStatus = (r.status || '').toLowerCase();
      
      if (apiStatus === 'matched') {
        normalizedStatus = 'MATCHED';
      } else if (apiStatus === 'unmatchedpg' || apiStatus === 'unmatched_pg') {
        normalizedStatus = 'UNMATCHED_PG';
      } else if (apiStatus === 'unmatchedbank' || apiStatus === 'unmatched_bank') {
        normalizedStatus = 'UNMATCHED_BANK';
      } else if (apiStatus === 'exception' || apiStatus === 'exceptions') {
        normalizedStatus = 'EXCEPTION';
      }
      
      return {
        id: r.id,
        txnId: r.txnId || '',
        utr: r.utr || '',
        rrn: r.rrn,
        // API returns amounts in paise, convert to rupees
        pgAmount: r.pgAmount ? Number(r.pgAmount) / 100 : 0,
        bankAmount: r.bankAmount ? Number(r.bankAmount) / 100 : null,
        delta: r.delta !== undefined ? Number(r.delta) / 100 : null,
        pgDate: r.pgDate,
        bankDate: r.bankDate,
        status: normalizedStatus,
        reasonCode: r.reasonCode,
        reasonLabel: r.reasonLabel
      };
    });
  };
  
  // Save jobId to localStorage whenever it changes
  useEffect(() => {
    if (jobId) {
      console.log('[ManualUploadEnhanced] Saving jobId to localStorage:', jobId);
      localStorage.setItem('lastReconJobId', jobId);
    }
  }, [jobId]);
  
  // Save PG file metadata to localStorage (serialize without File object)
  useEffect(() => {
    if (pgFiles.length > 0) {
      const metadata = pgFiles.map(f => ({
        id: f.id,
        file: { name: f.file.name, size: f.file.size, type: f.file.type },
        size: f.size,
        md5: f.md5,
        analysis: f.analysis,
        preview: f.preview,
        parsedData: f.parsedData
      }));
      console.log('[ManualUploadEnhanced] Saving PG file metadata to localStorage');
      localStorage.setItem('lastPgFileMetadata', JSON.stringify(metadata));
    }
  }, [pgFiles]);
  
  // Save Bank file metadata to localStorage (serialize without File object)
  useEffect(() => {
    if (bankFiles.length > 0) {
      const metadata = bankFiles.map(f => ({
        id: f.id,
        file: { name: f.file.name, size: f.file.size, type: f.file.type },
        size: f.size,
        md5: f.md5,
        analysis: f.analysis,
        preview: f.preview,
        parsedData: f.parsedData
      }));
      console.log('[ManualUploadEnhanced] Saving Bank file metadata to localStorage');
      localStorage.setItem('lastBankFileMetadata', JSON.stringify(metadata));
    }
  }, [bankFiles]);
  
  // Restore results from saved jobId on component mount
  useEffect(() => {
    const savedJobId = localStorage.getItem('lastReconJobId');
    if (savedJobId && !jobId) {
      console.log('[ManualUploadEnhanced] Restoring results from saved jobId:', savedJobId);
      setJobId(savedJobId);
      // The useReconJobResults hook will automatically fetch results for this jobId
    }
  }, []); // Empty deps - run only on mount
  
  // Clear results immediately when tab changes to prevent showing stale data
  useEffect(() => {
    console.log(`[Tab Change] Switching to tab: ${activeTab}`);
    // Mark that we're changing tabs
    setIsTabChanging(true);
    // Clear results immediately when switching tabs to avoid showing wrong data
    setReconResults([]);
    
    // Force React Query to refetch by invalidating the query
    if (jobId) {
      // Invalidate all result queries to force fresh fetch
      queryClient.invalidateQueries({ queryKey: ['recon-job-results'] });
      console.log(`[Tab Change] Cleared results and invalidated queries, waiting for new data for tab: ${activeTab}`);
    }
    
    // Reset the flag after a brief delay to allow new data to load
    const timer = setTimeout(() => {
      setIsTabChanging(false);
    }, 100);
    
    return () => clearTimeout(timer);
  }, [activeTab, jobId, queryClient]);
  
  // Update local state when job results change
  useEffect(() => {
    // Don't update if we're in the middle of changing tabs
    if (isTabChanging) {
      console.log(`[ManualUploadEnhanced] Tab is changing, skipping update`);
      return;
    }
    
    console.log(`[ManualUploadEnhanced] jobResults update for tab: ${activeTab}, results:`, jobResults?.length);
    
    // Only update if we have valid results that match the current tab
    if (jobResults !== undefined) {
      if (Array.isArray(jobResults)) {
        const convertedRows = convertToReconRows(jobResults);
        console.log(`[ManualUploadEnhanced] Setting ${convertedRows.length} rows for tab: ${activeTab}`);
        
        // Double-check that results match the expected tab filter
        if (activeTab !== 'all' && convertedRows.length > 0) {
          const firstRowStatus = convertedRows[0].status?.toLowerCase();
          console.log(`[ManualUploadEnhanced] First row status: ${firstRowStatus}, expected tab: ${activeTab}`);
        }
        
        setReconResults(convertedRows);
      } else {
        // Clear results if no data
        console.log(`[ManualUploadEnhanced] No results for tab: ${activeTab}, clearing`);
        setReconResults([]);
      }
    }
    // If undefined, keep existing results (might be loading)
  }, [jobResults, activeTab, isTabChanging]);
  
  // Update stats from job summary and send to Overview API
  useEffect(() => {
    // Try to get stats from jobSummary first, then fall back to jobCounts
    if (jobSummary || jobCounts) {
      let matchedCount = 0;
      let unmatchedPgCount = 0;
      let unmatchedBankCount = 0;
      let exceptionsCount = 0;
      let totalCount = 0;
      
      if (jobSummary?.breakdown) {
        // Use breakdown structure if available
        matchedCount = jobSummary.breakdown.matched?.count || 0;
        unmatchedPgCount = jobSummary.breakdown.unmatchedPg?.count || 0;
        unmatchedBankCount = jobSummary.breakdown.unmatchedBank?.count || 0;
        exceptionsCount = jobSummary.breakdown.exceptions?.count || 0;
        totalCount = jobSummary.totals?.count || 0;
      } else if (jobSummary) {
        // Alternative structure from API
        matchedCount = jobSummary.matched?.count || jobSummary.matchedCount || 0;
        unmatchedPgCount = jobSummary.unmatchedPg?.count || jobSummary.unmatchedPgCount || 0;
        unmatchedBankCount = jobSummary.unmatchedBank?.count || jobSummary.unmatchedBankCount || 0;
        exceptionsCount = jobSummary.exceptions?.count || jobSummary.exceptionsCount || 0;
        totalCount = jobSummary.totals?.count || jobSummary.totalCount || jobSummary.total || 0;
      } else if (jobCounts) {
        // Use jobCounts as fallback
        matchedCount = jobCounts.matched || 0;
        unmatchedPgCount = jobCounts.unmatchedPg || 0;
        unmatchedBankCount = jobCounts.unmatchedBank || 0;
        exceptionsCount = jobCounts.exceptions || 0;
        totalCount = jobCounts.all || 0;
      }
      
      // Store breakdown counts for display
      setBreakdownCounts({
        totalCount,
        matchedCount,
        unmatchedPgCount,
        unmatchedBankCount,
        exceptionsCount
      });
      
      // Send results to Overview API
      if (jobId && (jobSummary || jobCounts)) {
        const sendToOverview = async () => {
          try {
            const summary = {
              totalTransactions: totalCount,
              matchedCount: matchedCount,
              unmatchedPgCount: unmatchedPgCount,
              unmatchedBankCount: unmatchedBankCount,
              exceptionsCount: exceptionsCount
            };
            
            const response = await axios.post('http://localhost:5105/api/recon-results/manual', {
              jobId,
              summary
            });
            
            if (response.data.success) {
              console.log('Manual upload results sent to Overview API');
            }
          } catch (error) {
            console.error('Failed to send results to Overview API:', error);
          }
        };
        
        sendToOverview();
      }
    }
  }, [jobSummary, jobCounts, jobId]);
  
  // Trigger automatic reconciliation when both files are uploaded
  useEffect(() => {
    if (pgFiles.length > 0 && bankFiles.length > 0) {
      const startRecon = async () => {
        setIsLoading(true)
        
        try {
          // cycleDate is already in YYYY-MM-DD format
          const reconDate = cycleDate || new Date().toISOString().split('T')[0];
          
          console.log('[Manual Upload] Starting reconciliation for date:', reconDate);
          console.log('[Manual Upload] PG File:', pgFiles[0].file.name);
          console.log('[Manual Upload] Bank File:', bankFiles[0].file.name);
          
          // Get parsed CSV data
          const pgData = pgFiles[0].parsedData || [];
          const bankData = bankFiles[0].parsedData || [];
          
          console.log('[Manual Upload] Sending PG data:', pgData.length, 'records');
          console.log('[Manual Upload] Sending bank data:', bankData.length, 'records');
          
          // Call the real recon API with uploaded data
          const response = await fetch('http://localhost:5103/recon/run', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              date: reconDate,
              dryRun: false,
              pgTransactions: pgData,
              bankRecords: bankData,
              bankFilename: bankFiles[0].file.name  // Pass filename for bank detection
            })
          });
          
          if (!response.ok) {
            throw new Error(`Recon API error: ${response.status}`);
          }
          
          const data = await response.json();
          console.log('[Manual Upload] Recon API response:', data);
          
          if (data.success && data.jobId) {
            const newJobId = data.jobId;
            setJobId(newJobId);
            
            // Extract counters from response
            const counters = data.counters || {};
            const matchedCount = counters.matched || 0;
            const unmatchedPgCount = counters.unmatchedPg || 0;
            const unmatchedBankCount = counters.unmatchedBank || 0;
            const exceptionsCount = counters.exceptions || 0;
            const totalCount = counters.pgFetched || (matchedCount + unmatchedPgCount);
            
            console.log('[Manual Upload] Job created:', newJobId);
            console.log('[Manual Upload] Counters:', counters);
            console.log('[Manual Upload] Setting breakdownCounts:', {
              totalCount,
              matchedCount,
              unmatchedPgCount,
              unmatchedBankCount,
              exceptionsCount
            });
            
            setBreakdownCounts({
              totalCount,
              matchedCount,
              unmatchedPgCount,
              unmatchedBankCount,
              exceptionsCount
            });
            
            // Create stats for display
            console.log('[Manual Upload] Reconciliation completed successfully');
          } else {
            throw new Error('Invalid response from recon API');
          }
        } catch (error: any) {
          console.error('[Manual Upload] Reconciliation failed:', error);
          console.error('[Manual Upload] Error details:', error.message);
        } finally {
          setIsLoading(false);
        }
      };
      
      startRecon();
    } else if (pgFiles.length === 0 && bankFiles.length === 0 && !jobId) {
      // Only clear when BOTH files are removed AND there's no active job
      console.log('Files cleared and no active job, showing empty state');
      setReconResults([]);
      setIsLoading(false);
    }
  }, [pgFiles, bankFiles, cycleDate])
  
  // Trigger refetch when jobId changes  
  useEffect(() => {
    if (jobId) {
      // The hooks are now enabled with the new jobId
      // They will automatically fetch on mount
      console.log('Job ID set, hooks will fetch data:', jobId);
      console.log('Current breakdownCounts:', breakdownCounts);
      console.log('Current reconResults length:', reconResults.length);
    }
  }, [jobId, breakdownCounts, reconResults.length])

  // Handle PG file upload with V2 API
  const handlePGUpload = useCallback(async (files: File[]) => {
    console.log(`📁 [V2 Upload] Uploading ${files.length} PG files to V2 API...`);
    
    try {
      // Upload files to V2 API for processing and database insertion
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });
      formData.append('fileType', 'transactions');
      
      const response = await fetch('http://localhost:5107/api/upload/multiple', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      console.log('V2 Upload response:', data);
      
      if (data.success) {
        console.log(`✅ [V2 Upload] Successfully uploaded ${data.results.length} files`);
        
        // Create uploaded file objects for UI display
        const uploadedFiles: UploadedFile[] = await Promise.all(
          files.map(async (file, _index) => {
            const id = `pg_${Date.now()}_${_index}`
            const md5 = await computeMD5(file)
            const preview = await readFilePreview(file)
            const parsedData = await parseCSVFile(file)  // Parse full CSV
            
            console.log(`[CSV Parse] PG file parsed: ${parsedData.length} records`);
            
            return {
              id,
              file,
              size: file.size,
              md5,
              analysis: {
                fileTypeOk: true,
                delimiter: 'comma' as const,
                encoding: 'utf-8' as const,
                headersRecognized: true,
                schemaDetected: detectPGSchema(preview.columns)
              },
              preview,
              parsedData  // Store parsed data
            }
          })
        );
        
        setPgFiles(prev => [...prev, ...uploadedFiles]);
        
        // Show processing summary
        const summary = data.summary;
        if (summary) {
          console.log(`📊 [V2 Upload] Processing summary: ${summary.successful} successful, ${summary.failed} failed`);
        }
      } else {
        console.error('❌ [V2 Upload] Failed to upload files:', data.error);
      }
    } catch (error) {
      console.error('❌ [V2 Upload] Upload error:', error);
      
      // Fallback: create file objects for UI display even if API fails
      const uploadedFiles: UploadedFile[] = await Promise.all(
        files.map(async (file, index) => {
          const id = `pg_${Date.now()}_${index}`
          const md5 = await computeMD5(file)
          const preview = await readFilePreview(file)
          const parsedData = await parseCSVFile(file)  // Parse full CSV in fallback too
          
          console.log(`[CSV Parse Fallback] PG file "${file.name}" parsed: ${parsedData.length} records`);
          
          return {
            id,
            file,
            size: file.size,
            md5,
            analysis: {
              fileTypeOk: true,
              delimiter: 'comma' as const,
              encoding: 'utf-8' as const,
              headersRecognized: true,
              schemaDetected: detectPGSchema(preview.columns)
            },
            preview,
            parsedData  // Store parsed data
          }
        })
      );
      
      setPgFiles(prev => [...prev, ...uploadedFiles]);
    }
  }, [])

  // Handle Bank file upload with V2 API
  const handleBankUpload = useCallback(async (files: File[]) => {
    console.log(`🏦 [V2 Upload] Uploading ${files.length} Bank files to V2 API...`);
    
    try {
      // Upload files to V2 API for processing and database insertion
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });
      formData.append('fileType', 'bank_statements');
      
      const response = await fetch('http://localhost:5107/api/upload/multiple', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      console.log('V2 Bank Upload response:', data);
      
      if (data.success) {
        console.log(`✅ [V2 Upload] Successfully uploaded ${data.results.length} bank files`);
        
        // Create uploaded file objects for UI display
        const uploadedFiles: UploadedFile[] = await Promise.all(
          files.map(async (file, _index) => {
            const id = `bank_${Date.now()}_${_index}`
            const md5 = await computeMD5(file)
            const preview = await readFilePreview(file)
            const parsedData = await parseCSVFile(file)  // Parse full CSV
            
            console.log(`[CSV Parse] Bank file parsed: ${parsedData.length} records`);
            
            return {
              id,
              file,
              size: file.size,
              md5,
              analysis: {
                fileTypeOk: true,
                delimiter: 'comma' as const,
                encoding: 'utf-8' as const,
                headersRecognized: true,
                schemaDetected: detectBankFromFilename(file.name)
              },
              preview,
              parsedData  // Store parsed data
            }
          })
        );
        
        setBankFiles(prev => [...prev, ...uploadedFiles]);
        
        // Show processing summary
        const summary = data.summary;
        if (summary) {
          console.log(`📊 [V2 Upload] Bank processing summary: ${summary.successful} successful, ${summary.failed} failed`);
        }
      } else {
        console.error('❌ [V2 Upload] Failed to upload bank files:', data.error);
      }
    } catch (error) {
      console.error('❌ [V2 Upload] Bank upload error:', error);
      
      // Fallback: create file objects for UI display even if API fails
      const uploadedFiles: UploadedFile[] = await Promise.all(
        files.map(async (file, index) => {
          const id = `bank_${Date.now()}_${index}`
          const md5 = await computeMD5(file)
          const preview = await readFilePreview(file)
          const parsedData = await parseCSVFile(file)  // Parse full CSV in fallback too
          
          console.log(`[CSV Parse Fallback] Bank file "${file.name}" parsed: ${parsedData.length} records`);
          
          return {
            id,
            file,
            size: file.size,
            md5,
            analysis: {
              fileTypeOk: true,
              delimiter: 'comma' as const,
              encoding: 'utf-8' as const,
              headersRecognized: true,
              schemaDetected: detectBankFromFilename(file.name)
            },
            preview,
            parsedData  // Store parsed data
          }
        })
      );
      
      setBankFiles(prev => [...prev, ...uploadedFiles]);
    }
  }, [])

  // Upload sample files from V2 API
  const handleUploadSampleFiles = async () => {
    try {
      setIsLoading(true)
      console.log('Starting sample file upload...')
      
      // Get sample files from V2 API
      const sampleResponse = await fetch('http://localhost:5106/api/upload/sample-files')
      const sampleData = await sampleResponse.json()
      console.log('Sample files response:', sampleData)
      
      if (sampleData.sampleFiles && sampleData.sampleFiles.length >= 2) {
        // Download the first two sample files (PG and Bank)
        const pgFile = sampleData.sampleFiles.find((f: any) => f.file_type === 'PG_SAMPLE')
        const bankFile = sampleData.sampleFiles.find((f: any) => f.file_type === 'BANK_SAMPLE')
        
        if (pgFile && bankFile) {
          console.log('Found PG and Bank files:', pgFile.file_name, bankFile.file_name)
          
          // Download file contents
          const pgResponse = await fetch(`http://localhost:5106/api/upload/sample-files/${pgFile.file_id}/download`)
          const bankResponse = await fetch(`http://localhost:5106/api/upload/sample-files/${bankFile.file_id}/download`)
          
          const pgContent = await pgResponse.text()
          const bankContent = await bankResponse.text()
          console.log('Downloaded file contents, PG:', pgContent.length, 'chars, Bank:', bankContent.length, 'chars')
          
          // Create file objects
          const pgFileObj = new File([pgContent], pgFile.file_name, { type: 'text/csv' })
          const bankFileObj = new File([bankContent], bankFile.file_name, { type: 'text/csv' })
          
          // Upload the files which will trigger automatic reconciliation
          console.log('Uploading files to trigger reconciliation...')
          await handlePGUpload([pgFileObj])
          await handleBankUpload([bankFileObj])
          console.log('Sample files uploaded successfully!')
        } else {
          console.error('Could not find both PG and Bank sample files:', { pgFile, bankFile })
        }
      }
    } catch (error) {
      console.error('Failed to upload sample files:', error)
      // Fallback: create simple demo files if API fails
      const pgContent = 'transaction_id,utr,amount,date\nTXN001,UTR001,1000,2025-09-18\nTXN002,UTR002,2000,2025-09-18'
      const bankContent = 'reference,utr,amount,date\nREF001,UTR001,1000,2025-09-18\nREF002,UTR002,2000,2025-09-18'
      
      const pgFileObj = new File([pgContent], 'pg_demo_2025-09-18.csv', { type: 'text/csv' })
      const bankFileObj = new File([bankContent], 'bank_demo_2025-09-18.csv', { type: 'text/csv' })
      
      await handlePGUpload([pgFileObj])
      await handleBankUpload([bankFileObj])
    } finally {
      setIsLoading(false)
    }
  }

  // Remove a PG file
  const handleRemovePgFile = (id: string) => {
    setPgFiles(prev => prev.filter(f => f.id !== id))
  }

  // Remove a Bank file
  const handleRemoveBankFile = (id: string) => {
    setBankFiles(prev => prev.filter(f => f.id !== id))
  }

  // Replace all PG files
  const handleReplaceAllPg = () => {
    setPgFiles([])
  }

  // Replace all Bank files
  const handleReplaceAllBank = () => {
    setBankFiles([])
  }

  // Handle export to CSV
  const handleExportResults = () => {
    if (!jobId || reconResults.length === 0) {
      console.warn('[Export] No results to export');
      return;
    }

    console.log('[Export] Exporting', reconResults.length, 'results for job', jobId);

    // CSV headers
    const headers = [
      'Transaction ID',
      'UTR',
      'RRN',
      'PG Amount (₹)',
      'Bank Amount (₹)',
      'Delta (₹)',
      'Status',
      'Reason Code',
      'Reason Label',
      'PG Date',
      'Bank Date'
    ];

    // Convert results to CSV rows
    const csvRows = [headers.join(',')];
    
    reconResults.forEach(row => {
      const values = [
        row.txnId || '',
        row.utr || '',
        row.rrn || '',
        row.pgAmount?.toString() || '',
        row.bankAmount?.toString() || '',
        row.delta?.toString() || '',
        row.status || '',
        row.reasonCode || '',
        row.reasonLabel || '',
        row.pgDate || '',
        row.bankDate || ''
      ];
      
      // Escape values that contain commas
      const escapedValues = values.map(val => {
        const strVal = String(val);
        return strVal.includes(',') ? `"${strVal}"` : strVal;
      });
      
      csvRows.push(escapedValues.join(','));
    });

    // Create CSV content
    const csvContent = csvRows.join('\n');
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `recon-results-${jobId}-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    // Cleanup
    window.URL.revokeObjectURL(url);
    
    console.log('[Export] CSV downloaded successfully');
  }

  // Handle row action
  const handleRowAction = (row: ReconRow, action: 'view' | 'edit') => {
    console.log(`${action} row:`, row)
  }
  
  // Clear all and start fresh
  const handleStartNew = () => {
    console.log('[ManualUploadEnhanced] Starting new reconciliation');
    setPgFiles([]);
    setBankFiles([]);
    setReconResults([]);
    setJobId(null);
    localStorage.removeItem('lastReconJobId');
    localStorage.removeItem('lastPgFileMetadata');
    localStorage.removeItem('lastBankFileMetadata');
    setBreakdownCounts({
      totalCount: 0,
      matchedCount: 0,
      unmatchedPgCount: 0,
      unmatchedBankCount: 0,
      exceptionsCount: 0,
    });
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 min-h-screen overflow-auto">
      {/* Header Section */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Reconciliation Workspace</h1>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-slate-500 truncate">
                    Auto-detects and normalizes bank files using Recon Config.
                  </p>
                  {jobSummary && !jobSummary.finalized && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                      Preview — not persisted
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Cycle Date</label>
                <input
                  type="date"
                  value={cycleDate}
                  onChange={(e) => setCycleDate(e.target.value)}
                  className="px-2 py-1 text-sm border border-gray-300 rounded"
                />
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {jobId && (
              <button 
                onClick={handleStartNew}
                className="px-4 py-2 text-sm border border-blue-500 text-blue-600 rounded hover:bg-blue-50 flex items-center gap-2 whitespace-nowrap"
              >
                <FileUp className="h-4 w-4" />
                Start New
              </button>
            )}
            <button 
              onClick={() => setConfigDrawerOpen(true)}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap"
            >
              <Settings className="h-4 w-4" />
              Recon Config
            </button>
          </div>
        </div>
      </div>

      {/* File Upload Section */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-2 gap-6">
          {/* Transaction/PG File Card */}
          <FileCard
            title="Transaction/PG File"
            meta={{
              merchant,
              acquirer,
              cycle: cycleDate // Already in YYYY-MM-DD format
            }}
            files={pgFiles}
            onDropFiles={handlePGUpload}
            onRemoveFile={handleRemovePgFile}
            onReplaceAll={pgFiles.length > 0 ? handleReplaceAllPg : undefined}
          />

          {/* Bank Recon File Card */}
          <FileCard
            title="Bank Recon File"
            meta={{
              merchant,
              acquirer,
              cycle: cycleDate // Already in YYYY-MM-DD format
            }}
            files={bankFiles}
            onDropFiles={handleBankUpload}
            onRemoveFile={handleRemoveBankFile}
            onReplaceAll={bankFiles.length > 0 ? handleReplaceAllBank : undefined}
          />
        </div>
      </div>

      {/* Summary Tiles - Only show after files are uploaded */}
      {(pgFiles.length > 0 && bankFiles.length > 0) && (
        <div className="px-6 py-4">
          <ManualUploadTiles
          summary={jobSummary || jobCounts || breakdownCounts.totalCount > 0 ? {
            finalized: true,
            totals: {
              count: breakdownCounts.totalCount,
              amountPaise: jobSummary?.totals?.amountPaise || '0'
            },
            breakdown: {
              matched: {
                count: breakdownCounts.matchedCount,
                amountPaise: jobSummary?.breakdown?.matched?.amountPaise || jobSummary?.matched?.amountPaise || '0'
              },
              unmatchedPg: {
                count: breakdownCounts.unmatchedPgCount,
                amountPaise: jobSummary?.breakdown?.unmatchedPg?.amountPaise || jobSummary?.unmatchedPg?.amountPaise || '0'
              },
              unmatchedBank: {
                count: breakdownCounts.unmatchedBankCount,
                amountPaise: jobSummary?.breakdown?.unmatchedBank?.amountPaise || jobSummary?.unmatchedBank?.amountPaise || '0'
              },
              exceptions: {
                count: breakdownCounts.exceptionsCount,
                amountPaise: jobSummary?.breakdown?.exceptions?.amountPaise || jobSummary?.exceptions?.amountPaise || '0'
              }
            }
          } : undefined}
          preview={jobCounts}
          onDrill={(key) => {
            if (key === 'all') setActiveTab('all');
            if (key === 'matched') setActiveTab('matched');
            if (key === 'unmatched') setActiveTab('unmatchedPg');
            if (key === 'exceptions') setActiveTab('exceptions');
          }}
          />
        </div>
      )}

      {/* Results Table - Only show after files are uploaded */}
      {(pgFiles.length > 0 && bankFiles.length > 0) && (
        <div className="px-6 pb-6">
          {/* Export Button */}
          {jobId && reconResults.length > 0 && (
            <div className="mb-4 flex justify-end">
              <Button
                onClick={handleExportResults}
                disabled={isLoading}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download Results CSV
              </Button>
            </div>
          )}
          
          <ReconResultsTable
              rows={isTabChanging ? [] : reconResults}
              totalCount={breakdownCounts.totalCount || reconResults.length}
              matchedCount={breakdownCounts.matchedCount}
              unmatchedPgCount={breakdownCounts.unmatchedPgCount}
              unmatchedBankCount={breakdownCounts.unmatchedBankCount}
              exceptionsCount={breakdownCounts.exceptionsCount}
              jobId={jobId || (isLoading ? 'preview-loading' : undefined)}
              isLoading={isLoading || isTabChanging}
              activeTab={activeTab}
              onTabChange={(tab) => setActiveTab(tab as any)}
              onRefresh={async () => {
                if (pgFiles.length > 0 && bankFiles.length > 0) {
                  try {
                    setIsLoading(true)
                    // Use the latest reconciliation job from V2 API
                    const response = await fetch(`http://localhost:5106/api/reconciliation/results`)
                    const data = await response.json()
                    
                    if (data.reconciliationJobs && data.reconciliationJobs.length > 0) {
                      const latestJob = data.reconciliationJobs[0]
                      const newJobId = latestJob.job_id
                      setJobId(newJobId)
                      
                      // Update breakdown counts
                      setBreakdownCounts({
                        totalCount: latestJob.total_pg_records || 0,
                        matchedCount: latestJob.matched_records || 0,
                        unmatchedPgCount: latestJob.unmatched_pg || 0,
                        unmatchedBankCount: latestJob.unmatched_bank || 0,
                        exceptionsCount: latestJob.exception_records || 0
                      })
                      
                      // Invalidate queries to refetch fresh data
                      queryClient.invalidateQueries({ queryKey: ['recon-job-summary'] })
                      queryClient.invalidateQueries({ queryKey: ['recon-job-results'] })
                      
                      // Also invalidate Overview queries so tiles update
                      queryClient.invalidateQueries({ queryKey: ['overview-v2'] })
                      console.log('[ManualUploadEnhanced] Reconciliation completed, invalidated Overview cache')
                    }
                  } catch (error) {
                    console.error('Error fetching V2 reconciliation data:', error)
                  } finally {
                    setIsLoading(false)
                  }
                }
              }}
              onExport={handleExportResults}
              onRowAction={handleRowAction}
            />
        </div>
      )}

      {/* Recon Config Drawer */}
      <ReconConfigDrawer
        isOpen={configDrawerOpen}
        onClose={() => setConfigDrawerOpen(false)}
        acquirerCode={acquirer !== 'All Banks' ? acquirer : 'AXIS'}
        onSave={() => {
          console.log('Configuration saved')
        }}
      />
    </div>
  )
}