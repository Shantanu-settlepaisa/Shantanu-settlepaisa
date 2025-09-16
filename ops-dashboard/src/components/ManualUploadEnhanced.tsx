import { useState, useCallback, useEffect } from 'react'
import { FileUp, Settings, Activity, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { FileCard, type UploadedFile } from './recon/FileCard'
import { ReconStats, type ReconStatsData } from './recon/ReconStats'
import { ReconResultsTable, type ReconRow } from './recon/ReconResultsTable'
import { ReconConfigDrawer } from './recon/ReconConfigDrawer'
import { updateReconResults, updateExceptions, updateProgress, updateSettlements } from '../services/overview-aggregator'
import type { JobSummary, JobResult } from '../shared/reconMap'
import { formatINR, toUiStatus, getStatusLabel } from '../shared/reconMap'
import ManualUploadTiles from './recon/ManualUploadTiles'
import { useReconJobSummary, useReconJobPreviewCounters, useReconJobResults } from '../hooks/useReconJobSummary'
import axios from 'axios'


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

// Helper to filter rows based on tab and search
function filterRows(rows: ReconRow[], tab: 'all' | 'matched' | 'exceptions', query: string) {
  let filteredRows = rows
  
  // Filter by tab
  if (tab === 'matched') {
    filteredRows = rows.filter(r => r.status === 'Matched')
  } else if (tab === 'exceptions') {
    filteredRows = rows.filter(r => r.status !== 'Matched' && r.status !== 'Unknown')
  }
  
  // Filter by search query
  if (query?.trim()) {
    const searchTerm = query.trim().toLowerCase()
    filteredRows = filteredRows.filter(r =>
      r.txnId?.toLowerCase().includes(searchTerm) ||
      r.utr?.toLowerCase().includes(searchTerm) ||
      (r.rrn && r.rrn.toLowerCase().includes(searchTerm))
    )
  }
  
  return filteredRows
}

// Mock reconciliation data
const mockReconData: ReconRow[] = [
  {
    id: '1',
    txnId: 'TXN000001',
    utr: 'UTR000000000001',
    rrn: 'RRN000001',
    pgAmount: 3827.79,
    bankAmount: 3827.79,
    delta: 0,
    pgDate: '2025-09-11',
    bankDate: '2025-09-11',
    status: 'Matched'
  },
  {
    id: '2',
    txnId: 'TXN000002',
    utr: 'UTR000000000002',
    rrn: 'RRN000002',
    pgAmount: 1142.18,
    bankAmount: 1142.18,
    delta: 0,
    pgDate: '2025-09-11',
    bankDate: '2025-09-11',
    status: 'Matched'
  },
  {
    id: '3',
    txnId: 'TXN000003',
    utr: 'UTR000000000003',
    pgAmount: 5000.00,
    bankAmount: 4950.00,
    delta: -50.00,
    pgDate: '2025-09-11',
    bankDate: '2025-09-11',
    status: 'Mismatched'
  },
  {
    id: '4',
    txnId: 'TXN000004',
    utr: 'UTR000000000004',
    pgAmount: 2500.00,
    bankAmount: null,
    delta: null,
    pgDate: '2025-09-11',
    bankDate: null,
    status: 'Pending Bank'
  },
  {
    id: '5',
    txnId: 'TXN000005',
    utr: 'UTR000000000005',
    pgAmount: 7500.00,
    bankAmount: 7500.00,
    delta: 0,
    pgDate: '2025-09-11',
    bankDate: '2025-09-11',
    status: 'Matched'
  }
]

const mockStats: ReconStatsData = {
  matched: {
    count: 95,
    amount: 9500000 // in paise
  },
  unmatched: {
    count: 35,
    amount: 3500000 // in paise
  },
  exceptions: {
    count: 20
  },
  lastRun: {
    at: new Date().toISOString(),
    jobId: `preview-${Date.now().toString().slice(-8)}`
  }
}

export function ManualUploadEnhanced() {
  const [cycleDate, setCycleDate] = useState('11/09/2025')
  const [merchant, setMerchant] = useState('All Merchants')
  const [acquirer, setAcquirer] = useState('All Banks')
  const [pgFiles, setPgFiles] = useState<UploadedFile[]>([])
  const [bankFiles, setBankFiles] = useState<UploadedFile[]>([])
  const [configDrawerOpen, setConfigDrawerOpen] = useState(false)
  const [reconResults, setReconResults] = useState<ReconRow[]>([])
  const [reconStats, setReconStats] = useState<ReconStatsData | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'matched' | 'unmatched' | 'exceptions'>('all')
  
  // Fetch job summary from backend using custom hooks
  const { data: jobSummary, refetch: refetchSummary } = useReconJobSummary(jobId);
  const { data: previewCounters } = useReconJobPreviewCounters(jobId, !jobSummary?.finalized);
  const { data: jobResults } = useReconJobResults(jobId, activeTab);

  // Convert API results to UI format
  const convertToReconRows = (results: any[]): ReconRow[] => {
    return results.map(r => ({
      id: r.id,
      txnId: r.txnId || '',
      utr: r.utr || '',
      rrn: r.rrn,
      pgAmount: r.pgAmountPaise ? Number(r.pgAmountPaise) / 100 : 0,
      bankAmount: r.bankAmountPaise ? Number(r.bankAmountPaise) / 100 : null,
      delta: (r.pgAmountPaise && r.bankAmountPaise) ? 
        (Number(r.pgAmountPaise) - Number(r.bankAmountPaise)) / 100 : null,
      pgDate: r.pgDate,
      bankDate: r.bankDate,
      status: r.status as ReconRow['status'],
      reasonCode: r.reasonCode,
      reasonLabel: r.reasonLabel
    }));
  };
  
  // Update local state when job results change
  useEffect(() => {
    if (jobResults) {
      setReconResults(convertToReconRows(jobResults));
    }
  }, [jobResults]);
  
  // Update stats from job summary and send to Overview API
  useEffect(() => {
    if (jobSummary && jobSummary.breakdown) {
      const stats: ReconStatsData = {
        matched: {
          count: jobSummary.breakdown.matched?.count || 0,
          amount: Number(jobSummary.breakdown.matched?.amountPaise || 0) / 100
        },
        unmatched: {
          count: (jobSummary.breakdown.unmatchedPg?.count || 0) + (jobSummary.breakdown.unmatchedBank?.count || 0),
          amount: (Number(jobSummary.breakdown.unmatchedPg?.amountPaise || 0) + Number(jobSummary.breakdown.unmatchedBank?.amountPaise || 0)) / 100
        },
        exceptions: {
          count: jobSummary.breakdown.exceptions?.count || 0,
          amount: Number(jobSummary.breakdown.exceptions?.amountPaise || 0) / 100
        },
        lastRun: jobId ? {
          at: new Date().toISOString(),
          jobId: jobId,
          status: 'completed'
        } : null
      };
      setReconStats(stats);
      
      // Send results to Overview API
      if (jobId && jobResults) {
        const sendToOverview = async () => {
          try {
            const summary = {
              totalTransactions: jobSummary.totals?.count || 0,
              matchedCount: jobSummary.breakdown.matched?.count || 0,
              unmatchedPgCount: jobSummary.breakdown.unmatchedPg?.count || 0,
              unmatchedBankCount: jobSummary.breakdown.unmatchedBank?.count || 0,
              exceptionsCount: jobSummary.breakdown.exceptions?.count || 0
            };
            
            const response = await axios.post('http://localhost:5105/api/recon-results/manual', {
              jobId,
              results: jobResults,
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
  }, [jobSummary, jobId, jobResults]);
  
  // Trigger automatic reconciliation when both files are uploaded
  useEffect(() => {
    if (pgFiles.length > 0 && bankFiles.length > 0 && !jobId) {
      const startPreviewRecon = async () => {
        setIsLoading(true)
        
        try {
          // Call the new job-based reconciliation API
          const response = await axios.post('http://localhost:5103/recon/run', {
            date: new Date().toISOString().split('T')[0],
            merchantId: 'demo_merchant',
            acquirerId: 'axis_bank',
            dryRun: false,
            test: true  // Use test mode for demo data
          });
          
          if (response.data.success && response.data.jobId) {
            setJobId(response.data.jobId);
          }
        } catch (error) {
          console.error('Failed to start reconciliation:', error);
        } finally {
          setIsLoading(false)
        }
      }
      
      startPreviewRecon()
    } else {
      // Show table even without data for debugging
      console.log('Files cleared, showing empty state')
      setReconResults([])
      setReconStats(null)
      setJobId(null)
      setIsLoading(false)
    }
  }, [pgFiles, bankFiles, cycleDate, merchant, acquirer])

  // Handle PG file upload
  const handlePGUpload = useCallback(async (files: File[]) => {
    const uploadedFiles: UploadedFile[] = await Promise.all(
      files.map(async (file, index) => {
        const id = `pg_${Date.now()}_${index}`
        const md5 = await computeMD5(file)
        const preview = await readFilePreview(file)
        
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
            schemaDetected: 'STANDARD_PG'
          },
          preview
        }
      })
    )
    
    setPgFiles(prev => [...prev, ...uploadedFiles])
  }, [])

  // Handle Bank file upload
  const handleBankUpload = useCallback(async (files: File[]) => {
    const uploadedFiles: UploadedFile[] = await Promise.all(
      files.map(async (file, index) => {
        const id = `bank_${Date.now()}_${index}`
        const md5 = await computeMD5(file)
        const preview = await readFilePreview(file)
        
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
            schemaDetected: 'AXIS_BANK'
          },
          preview
        }
      })
    )
    
    setBankFiles(prev => [...prev, ...uploadedFiles])
  }, [])

  // Upload sample files
  const handleUploadSampleFiles = async () => {
    try {
      // Create sample CSV files
      const pgFileContent = `transaction_id,utr,amount,date,merchant_name,status
TXN000001,UTR000000000001,3827.79,2025-09-11,Amazon,SUCCESS
TXN000002,UTR000000000002,1142.18,2025-09-11,Flipkart,SUCCESS
TXN000003,UTR000000000003,5000.00,2025-09-11,Myntra,SUCCESS
TXN000004,UTR000000000004,2500.00,2025-09-11,Swiggy,SUCCESS
TXN000005,UTR000000000005,7500.00,2025-09-11,Zomato,SUCCESS`

      const bankFileContent = `transaction_id,utr,amount,date,bank_ref,settlement_status
TXN000001,UTR000000000001,3827.79,2025-09-11,AXIS001,SETTLED
TXN000002,UTR000000000002,1142.18,2025-09-11,AXIS002,SETTLED
TXN000003,UTR000000000003,4950.00,2025-09-11,AXIS003,SETTLED
TXN000005,UTR000000000005,7500.00,2025-09-11,AXIS005,SETTLED`

      const pgFileObj = new File([pgFileContent], 'pg_txns_2025-09-11.csv', { type: 'text/csv' })
      const bankFileObj = new File([bankFileContent], 'bank_recon_2025-09-11.csv', { type: 'text/csv' })

      // Upload the files
      await handlePGUpload([pgFileObj])
      await handleBankUpload([bankFileObj])
    } catch (error) {
      console.error('Failed to upload sample files:', error)
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

  // Handle export
  const handleExport = (format: 'csv' | 'excel') => {
    console.log(`Exporting as ${format}...`)
  }

  // Handle row action
  const handleRowAction = (row: ReconRow, action: 'view' | 'edit') => {
    console.log(`${action} row:`, row)
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
                  type="text"
                  value={cycleDate}
                  onChange={(e) => setCycleDate(e.target.value)}
                  className="px-2 py-1 text-sm border border-gray-300 rounded"
                />
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={handleUploadSampleFiles}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap"
            >
              <FileUp className="h-4 w-4" />
              Upload Sample Files
            </button>
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
              cycle: '2025-09-11'
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
              cycle: '2025-09-11'
            }}
            files={bankFiles}
            onDropFiles={handleBankUpload}
            onRemoveFile={handleRemoveBankFile}
            onReplaceAll={bankFiles.length > 0 ? handleReplaceAllBank : undefined}
          />
        </div>
      </div>

      {/* Summary Tiles */}
      {(jobSummary || previewCounters || jobId) && (
        <div className="px-6 py-4">
          <ManualUploadTiles
            summary={jobSummary}
            preview={previewCounters}
            onDrill={(key) => {
              if (key === 'all') setActiveTab('all');
              if (key === 'matched') setActiveTab('matched');
              if (key === 'unmatched') setActiveTab('unmatched');
              if (key === 'exceptions') setActiveTab('exceptions');
            }}
          />
        </div>
      )}

      {/* Results Table - Always visible for debugging */}
      {((pgFiles.length > 0 || bankFiles.length > 0) || true) && (
        <div className="px-6 pb-6">
            <ReconResultsTable
              rows={reconResults}
              totalCount={
                (jobSummary?.totals?.count ?? 
                previewCounters?.totals?.count ?? 
                reconResults.length) || 
                (isLoading ? 35 : 0)
              }
              matchedCount={
                (jobSummary?.breakdown?.matched?.count ?? 
                previewCounters?.matched ?? 
                reconResults.filter(r => r.status === 'MATCHED').length) || 
                (isLoading ? 16 : 0)
              }
              unmatchedCount={
                ((jobSummary?.breakdown?.unmatchedPg?.count ?? 0) + 
                 (jobSummary?.breakdown?.unmatchedBank?.count ?? 0)) ||
                ((previewCounters?.unmatchedPg ?? 0) + 
                 (previewCounters?.unmatchedBank ?? 0)) ||
                reconResults.filter(r => r.status === 'UNMATCHED_PG' || r.status === 'UNMATCHED_BANK').length || 
                (isLoading ? 13 : 0)
              }
              exceptionsCount={
                (jobSummary?.breakdown?.exceptions?.count ?? 
                previewCounters?.exceptions ?? 
                reconResults.filter(r => r.status === 'EXCEPTION').length) || 
                (isLoading ? 6 : 0)
              }
              jobId={jobId || (isLoading ? 'preview-loading' : undefined)}
              isLoading={isLoading}
              activeTab={activeTab}
              onTabChange={(tab) => setActiveTab(tab as any)}
              onRefresh={() => {
                if (pgFiles.length > 0 && bankFiles.length > 0) {
                  // Trigger a refresh of the preview job
                  const newJobId = `preview-${Date.now().toString().slice(-8)}`
                  setJobId(newJobId)
                  setIsLoading(true)
                  setTimeout(() => {
                    setReconResults([...mockReconData]) // Create new array to trigger re-render
                    setReconStats({
                      ...mockStats,
                      lastRun: {
                        at: new Date().toISOString(),
                        jobId: newJobId
                      }
                    })
                    setIsLoading(false)
                  }, 800)
                }
              }}
              onExport={handleExport}
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