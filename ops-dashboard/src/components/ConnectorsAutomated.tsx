import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Wifi, 
  Activity,
  Play,
  Eye,
  RefreshCw,
  Plus,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  Database,
  Globe,
  TrendingUp,
  TrendingDown,
  Download,
  Loader2
} from 'lucide-react';
import { opsApiExtended } from '@/lib/ops-api-extended';
import { ConnectorCard } from './connectors/ConnectorCard';
import { JobsList } from './connectors/JobsList';
import { ReconciliationErrorModal } from './recon/ReconciliationErrorModal';
import { JobResultsPanel } from './connectors/JobResultsPanel';
import { toast } from 'sonner';
import type { Connector, JobRun, ConnectorEvent } from '@/types/connector';

export function ConnectorsAutomated() {
  const queryClient = useQueryClient();
  const [selectedConnector, setSelectedConnector] = useState<string | null>(null);
  const [showJobs, setShowJobs] = useState(false);
  const [liveUpdates, setLiveUpdates] = useState(true);
  const [reconResults, setReconResults] = useState<any>(null);
  const [showResults, setShowResults] = useState(false);
  const [activeTab, setActiveTab] = useState<'matched' | 'unmatchedPG' | 'unmatchedBank' | 'exceptions'>('matched');
  const [cycleStats, setCycleStats] = useState({
    pgIngested: 0,
    bankIngested: 0,
    matched: 0,
    unmatched: 0,
    exceptions: 0
  });
  const [reconciliationError, setReconciliationError] = useState<{ jobId?: string; error?: any } | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isDryRun, setIsDryRun] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showJobResults, setShowJobResults] = useState(false);

  // Fetch connectors
  const { data: connectorsData, isLoading: loadingConnectors } = useQuery({
    queryKey: ['connectors'],
    queryFn: () => opsApiExtended.getConnectorsDemo(),
    refetchInterval: liveUpdates ? 30000 : false
  });
  
  // Ensure connectors is always an array
  const connectors = Array.isArray(connectorsData) ? connectorsData : [];

  // Fetch jobs for selected connector
  const { data: jobs = [], isLoading: loadingJobs } = useQuery({
    queryKey: ['connector-jobs', selectedConnector],
    queryFn: () => selectedConnector ? opsApiExtended.getConnectorJobsDemo(selectedConnector) : [],
    enabled: !!selectedConnector && showJobs,
    refetchInterval: liveUpdates ? 10000 : false
  });

  // Run connector mutation
  const runConnectorMutation = useMutation({
    mutationFn: (connectorId: string) => opsApiExtended.runConnectorDemo(connectorId),
    onSuccess: (data, connectorId) => {
      toast.success('Connector job started');
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      queryClient.invalidateQueries({ queryKey: ['connector-jobs', connectorId] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to start connector job');
    }
  });

  // Setup SSE for live updates
  useEffect(() => {
    if (!liveUpdates) return;

    const eventSource = opsApiExtended.createConnectorEventSourceDemo();
    
    eventSource.addEventListener('job_update', (event: any) => {
      const data: ConnectorEvent = JSON.parse(event.data);
      
      // Update jobs list if watching this connector
      if (selectedConnector === data.connectorId) {
        queryClient.invalidateQueries({ queryKey: ['connector-jobs', data.connectorId] });
      }
      
      // Show toast for important events
      if (data.type === 'job_complete') {
        toast.success(`Recon complete for ${data.connectorId}`, {
          description: `${data.stats?.matched || 0} matched, ${data.stats?.unmatched || 0} unmatched`
        });
      } else if (data.type === 'job_error') {
        toast.error(`Connector error: ${data.error}`);
      }
    });

    return () => {
      eventSource.close();
    };
  }, [liveUpdates, selectedConnector, queryClient]);

  const handleRunNow = async (connectorId: string) => {
    // Run connector
    runConnectorMutation.mutate(connectorId);
    
    // Trigger reconciliation
    try {
      const response = await fetch('http://localhost:5103/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cycleDate: new Date().toISOString().split('T')[0],
          pgSource: 'PG Demo API',
          bankSource: connectorId.includes('axis') ? 'AXIS Bank SFTP' : 'Bank SFTP'
        })
      });
      const data = await response.json();
      if (data.success && data.resultId) {
        // Fetch and show results
        const resultResponse = await fetch(`http://localhost:5103/api/reconcile/${data.resultId}`);
        const resultData = await resultResponse.json();
        setReconResults(resultData);
        setShowResults(true);
        toast.success(`Reconciliation complete: ${data.summary.matchRate} match rate`);
      }
    } catch (error) {
      console.error('Reconciliation failed:', error);
    }
  };

  const handleViewJobs = (connectorId: string) => {
    setSelectedConnector(connectorId);
    setShowJobs(true);
  };

  const handleViewResults = (jobId: string) => {
    // Show results panel instead of navigating
    setSelectedJobId(jobId);
    setShowJobResults(true);
  };
  
  const handleCheckConnector = async (connectorId: string) => {
    // Determine which health check endpoint to use based on connector type
    const connector = connectors.find(c => c.id === connectorId);
    if (!connector) return { status: 'unhealthy', error: 'Connector not found' };
    
    const endpoint = connector.type === 'PG_API' 
      ? 'http://localhost:5103/connectors/pg/health'
      : 'http://localhost:5103/connectors/bank/health';
    
    try {
      const response = await fetch(endpoint);
      const data = await response.json();
      return {
        status: data.status,
        error: data.error,
        hint: data.hint
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        error: 'Failed to check connector',
        hint: 'Check if the reconciliation service is running on port 5103'
      };
    }
  };

  // Current cycle info
  const today = new Date().toISOString().split('T')[0];

  // Update cycle stats when reconciliation results are available
  useEffect(() => {
    if (reconResults) {
      setCycleStats({
        pgIngested: reconResults.totalPGTransactions || 0,
        bankIngested: reconResults.totalBankRecords || 0,
        matched: reconResults.matched?.length || 0,
        unmatched: (reconResults.unmatchedPG?.length || 0) + (reconResults.unmatchedBank?.length || 0),
        exceptions: reconResults.exceptions?.length || 0
      });
    }
  }, [reconResults]);

  // Auto-run reconciliation on mount to populate initial values
  useEffect(() => {
    // In mock mode, set initial demo data
    const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === 'true';
    
    if (USE_MOCK_API) {
      // Set mock initial data - use consistent numbers (800 total)
      const mockData = {
        cycleDate: new Date().toISOString().split('T')[0],
        totalPGTransactions: 800,
        totalBankRecords: 800,
        matched: Array(750).fill({}).map((_, i) => ({
          pgTransaction: {
            transaction_id: `TXN${String(i + 1).padStart(6, '0')}`,
            utr: `UTR${String(i + 1).padStart(8, '0')}`,
            amount: 100000 + Math.floor(Math.random() * 900000)
          },
          confidence: 95 + Math.floor(Math.random() * 5)
        })),
        unmatchedPG: Array(25).fill({}).map((_, i) => ({
          transaction_id: `UNTXN${String(i + 1).padStart(6, '0')}`,
          utr: `UNUTR${String(i + 1).padStart(8, '0')}`,
          amount: 50000 + Math.floor(Math.random() * 450000),
          payment_method: ['UPI', 'CARD', 'NETBANKING'][Math.floor(Math.random() * 3)],
          captured_at: new Date().toISOString(),
          reason: 'No matching bank record found'
        })),
        unmatchedBank: Array(20).fill({}).map((_, i) => ({
          TRANSACTION_ID: `BNKTXN${String(i + 1).padStart(6, '0')}`,
          UTR: `BNKUTR${String(i + 1).padStart(8, '0')}`,
          AMOUNT: 75000 + Math.floor(Math.random() * 425000),
          DATE: new Date().toISOString().split('T')[0],
          reason: 'No matching PG transaction found'
        })),
        exceptions: Array(5).fill({}).map((_, i) => ({
          type: ['DUPLICATE_UTR', 'AMOUNT_MISMATCH', 'INVALID_UTR'][Math.floor(Math.random() * 3)],
          message: 'Exception detected during reconciliation',
          severity: ['CRITICAL', 'HIGH', 'MEDIUM'][Math.floor(Math.random() * 3)],
          details: {},
          resolution: 'Manual review required'
        }))
      };
      
      setReconResults(mockData);
      setCycleStats({
        pgIngested: mockData.totalPGTransactions,
        bankIngested: mockData.totalBankRecords,
        matched: mockData.matched.length,
        unmatched: mockData.unmatchedPG.length + mockData.unmatchedBank.length,
        exceptions: mockData.exceptions.length
      });
      
      // Send the same data to Overview API
      fetch('http://localhost:5105/api/recon-results/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: 'connector-init-' + Date.now(),
          connector: 'axis-bank',
          summary: {
            totalTransactions: mockData.totalPGTransactions,
            matchedCount: mockData.matched.length,
            unmatchedPgCount: mockData.unmatchedPG.length,
            unmatchedBankCount: mockData.unmatchedBank.length,
            exceptionsCount: mockData.exceptions.length
          }
        })
      }).then(res => res.json())
        .then(data => console.log('Initial connector data sent to Overview:', data))
        .catch(err => console.error('Failed to send initial data:', err));
      return;
    }
    
    // Original code for non-mock mode
    const runInitialRecon = async () => {
      const currentDate = new Date().toISOString().split('T')[0];
      try {
        const response = await fetch('http://localhost:5103/api/reconcile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cycleDate: currentDate,
            pgSource: 'api',
            bankSource: 'api'
          })
        });
        const data = await response.json();
        if (data.success && data.resultId) {
          const resultResponse = await fetch(`http://localhost:5103/api/reconcile/${data.resultId}`);
          const resultData = await resultResponse.json();
          setReconResults(resultData);
          setCycleStats({
            pgIngested: resultData.totalPGTransactions || 0,
            bankIngested: resultData.totalBankRecords || 0,
            matched: resultData.matched?.length || 0,
            unmatched: (resultData.unmatchedPG?.length || 0) + (resultData.unmatchedBank?.length || 0),
            exceptions: resultData.exceptions?.length || 0
          });
        }
      } catch (error) {
        console.error('Initial reconciliation failed:', error);
      }
    };
    
    runInitialRecon();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Automated Connectors (Updated)</h3>
          <p className="text-sm text-gray-500">
            Auto-detect & normalize based on Recon Config - With Integrated Results
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setLiveUpdates(!liveUpdates)}
            className={`inline-flex items-center px-3 py-1.5 border rounded-md text-sm font-medium ${
              liveUpdates 
                ? 'border-green-300 text-green-700 bg-green-50' 
                : 'border-gray-300 text-gray-700 bg-white'
            }`}
          >
            {liveUpdates ? (
              <>
                <Activity className="w-3 h-3 mr-1 animate-pulse" />
                Live
              </>
            ) : (
              <>
                <Activity className="w-3 h-3 mr-1" />
                Paused
              </>
            )}
          </button>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['connectors'] })}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh
          </button>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PG Data Column */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Transactions/PG</h4>
          <div className="space-y-3">
            {connectors
              .filter(c => c.type === 'PG_API')
              .map(connector => (
                <ConnectorCard
                  key={connector.id}
                  connector={connector}
                  onRunNow={handleRunNow}
                  onViewJobs={handleViewJobs}
                  onCheck={handleCheckConnector}
                />
              ))}
            {connectors.filter(c => c.type === 'PG_API').length === 0 && (
              <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <Globe className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No PG connectors configured</p>
              </div>
            )}
          </div>
        </div>

        {/* Bank Data Column */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Bank Recon Files</h4>
          <div className="space-y-3">
            {connectors
              .filter(c => c.type === 'BANK_SFTP' || c.type === 'BANK_API')
              .map(connector => (
                <ConnectorCard
                  key={connector.id}
                  connector={connector}
                  onRunNow={handleRunNow}
                  onViewJobs={handleViewJobs}
                  onCheck={handleCheckConnector}
                />
              ))}
            {connectors.filter(c => c.type === 'BANK_SFTP' || c.type === 'BANK_API').length === 0 && (
              <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No bank connectors configured</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Combined Job Status Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-lg font-semibold text-gray-900">
              Current Cycle: {today}
            </h4>
            <p className="text-sm text-gray-500">
              Combined reconciliation status from all connectors
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center text-sm text-gray-600">
              <input
                type="checkbox"
                checked={isDryRun}
                onChange={(e) => setIsDryRun(e.target.checked)}
                className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Dry Run
            </label>
            <button
              onClick={async () => {
                setIsReconciling(true);
                setReconciliationError(null);
                
                const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === 'true';
                
                if (USE_MOCK_API) {
                  // Simulate reconciliation in mock mode
                  setTimeout(() => {
                    const mockData = {
                      cycleDate: today,
                      totalPGTransactions: 800,
                      totalBankRecords: 800,
                      matched: Array(750).fill({}).map((_, i) => ({
                        pgTransaction: {
                          transaction_id: `TXN${String(i + 1).padStart(6, '0')}`,
                          utr: `UTR${String(i + 1).padStart(8, '0')}`,
                          amount: 100000 + Math.floor(Math.random() * 900000)
                        },
                        bankRecord: {
                          AMOUNT: 100000 + Math.floor(Math.random() * 900000)
                        },
                        confidence: 95 + Math.floor(Math.random() * 5)
                      })),
                      unmatchedPG: Array(25).fill({}).map((_, i) => ({
                        transaction_id: `UNTXN${String(i + 1).padStart(6, '0')}`,
                        utr: `UNUTR${String(i + 1).padStart(8, '0')}`,
                        amount: 50000 + Math.floor(Math.random() * 450000),
                        payment_method: ['UPI', 'CARD', 'NETBANKING'][Math.floor(Math.random() * 3)],
                        captured_at: new Date().toISOString(),
                        reason: 'No matching bank record found'
                      })),
                      unmatchedBank: Array(20).fill({}).map((_, i) => ({
                        TRANSACTION_ID: `BNKTXN${String(i + 1).padStart(6, '0')}`,
                        UTR: `BNKUTR${String(i + 1).padStart(8, '0')}`,
                        AMOUNT: 75000 + Math.floor(Math.random() * 425000),
                        DATE: today,
                        reason: 'No matching PG transaction found'
                      })),
                      exceptions: Array(5).fill({}).map((_, i) => ({
                        type: ['DUPLICATE_UTR', 'AMOUNT_MISMATCH', 'INVALID_UTR'][Math.floor(Math.random() * 3)],
                        message: 'Exception detected during reconciliation',
                        severity: ['CRITICAL', 'HIGH', 'MEDIUM'][Math.floor(Math.random() * 3)],
                        details: {},
                        resolution: 'Manual review required',
                        pgTransaction: {
                          transaction_id: `EXCTXN${String(i + 1).padStart(6, '0')}`,
                          amount: 100000 + Math.floor(Math.random() * 900000)
                        }
                      }))
                    };
                    
                    setReconResults(mockData);
                    setCycleStats({
                      pgIngested: mockData.totalPGTransactions,
                      bankIngested: mockData.totalBankRecords,
                      matched: mockData.matched.length,
                      unmatched: mockData.unmatchedPG.length + mockData.unmatchedBank.length,
                      exceptions: mockData.exceptions.length
                    });
                    setShowResults(true);
                    setIsReconciling(false);
                    
                    // Send the same data to Overview API
                    fetch('http://localhost:5105/api/recon-results/connectors', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        jobId: 'connector-recon-' + Date.now(),
                        connector: 'axis-bank',
                        summary: {
                          totalTransactions: mockData.totalPGTransactions,
                          matchedCount: mockData.matched.length,
                          unmatchedPgCount: mockData.unmatchedPG.length,
                          unmatchedBankCount: mockData.unmatchedBank.length,
                          exceptionsCount: mockData.exceptions.length
                        }
                      })
                    }).then(res => res.json())
                      .then(data => console.log('Recon results sent to Overview:', data))
                      .catch(err => console.error('Failed to send results:', err));
                    
                    toast.success(`Reconciliation complete: ${mockData.matched.length} matched`);
                  }, 2000); // Simulate 2 second processing time
                  return;
                }
                
                try {
                  // Use the new job-based API
                  const response = await fetch('http://localhost:5103/recon/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      date: today,
                      merchantId: 'demo_merchant',
                      acquirerId: 'axis_bank',
                      dryRun: isDryRun,
                      limit: 1000
                    })
                  });
                  
                  const data = await response.json();
                  
                  if (!response.ok || !data.success) {
                    // Show error modal with job details
                    setReconciliationError({ 
                      jobId: data.jobId, 
                      error: data.error || { code: 'API_ERROR', message: 'Failed to start reconciliation' }
                    });
                    return;
                  }
                  
                  const { jobId } = data;
                  
                  // Poll for job completion
                  let attempts = 0;
                  const maxAttempts = 30; // 30 seconds max
                  
                  const checkJob = async () => {
                    const jobResponse = await fetch(`http://localhost:5103/recon/jobs/${jobId}`);
                    const jobData = await jobResponse.json();
                    
                    if (jobData.status === 'completed') {
                      // Fetch legacy format results for display
                      const legacyResponse = await fetch('http://localhost:5103/api/reconcile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          cycleDate: today,
                          pgSource: 'PG Demo API',
                          bankSource: 'AXIS Bank SFTP'
                        })
                      });
                      const legacyData = await legacyResponse.json();
                      
                      if (legacyData.success && legacyData.resultId) {
                        const resultResponse = await fetch(`http://localhost:5103/api/reconcile/${legacyData.resultId}`);
                        const resultData = await resultResponse.json();
                        setReconResults(resultData);
                        setShowResults(true);
                        
                        // Update stats from job counters
                        if (jobData.counters) {
                          setCycleStats({
                            pgIngested: jobData.counters.pgFetched,
                            bankIngested: jobData.counters.bankFetched,
                            matched: jobData.counters.matched,
                            unmatched: jobData.counters.unmatchedPg + jobData.counters.unmatchedBank,
                            exceptions: jobData.counters.exceptions
                          });
                          
                          // Send results to Overview API
                          try {
                            const summary = {
                              totalTransactions: jobData.counters.pgFetched || 0,
                              matchedCount: jobData.counters.matched || 0,
                              unmatchedPgCount: jobData.counters.unmatchedPg || 0,
                              unmatchedBankCount: jobData.counters.unmatchedBank || 0,
                              exceptionsCount: jobData.counters.exceptions || 0
                            };
                            
                            const overviewResponse = await fetch('http://localhost:5105/api/recon-results/connectors', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                jobId,
                                results: resultData,
                                summary
                              })
                            });
                            
                            if (overviewResponse.ok) {
                              console.log('Connector results sent to Overview API');
                            }
                          } catch (error) {
                            console.error('Failed to send results to Overview API:', error);
                          }
                        }
                        
                        toast.success(`Reconciliation complete: ${jobData.counters?.matched || 0} matched`);
                      }
                    } else if (jobData.status === 'failed') {
                      // Show error modal with job details
                      setReconciliationError({ jobId, error: jobData.error });
                    } else if (jobData.status === 'running' && attempts < maxAttempts) {
                      // Continue polling
                      attempts++;
                      setTimeout(checkJob, 1000);
                    } else {
                      // Timeout
                      setReconciliationError({ 
                        jobId, 
                        error: { 
                          code: 'TIMEOUT', 
                          message: 'Reconciliation is taking longer than expected',
                          userSafeHint: 'The job is still running. Check the job status later.'
                        }
                      });
                    }
                  };
                  
                  // Start polling
                  await checkJob();
                  
                } catch (error: any) {
                  console.error('Reconciliation error:', error);
                  setReconciliationError({ 
                    error: { 
                      code: 'NETWORK_ERROR', 
                      message: error.message || 'Failed to run reconciliation',
                      userSafeHint: 'Check if the reconciliation service is running on port 5103'
                    }
                  });
                } finally {
                  setIsReconciling(false);
                }
              }}
              disabled={isReconciling}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isReconciling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-1" />
                  Run Reconciliation
                </>
              )}
            </button>
            {cycleStats.matched + cycleStats.unmatched > 0 && (
              <button
                onClick={() => setShowResults(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                View Results
              </button>
            )}
          </div>
        </div>

        {/* Live Stats */}
        <div className="grid grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {cycleStats.pgIngested}
            </div>
            <div className="text-xs text-gray-500">PG Transactions</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {cycleStats.bankIngested}
            </div>
            <div className="text-xs text-gray-500">Bank Records</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {cycleStats.matched}
            </div>
            <div className="text-xs text-gray-500">Matched</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-600">
              {cycleStats.unmatched}
            </div>
            <div className="text-xs text-gray-500">Unmatched</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {cycleStats.exceptions}
            </div>
            <div className="text-xs text-gray-500">Exceptions</div>
          </div>
        </div>
      </div>

      {/* Jobs List (if selected) */}
      {showJobs && selectedConnector && (
        <JobsList
          jobs={jobs}
          onViewResults={handleViewResults}
        />
      )}

      {/* Reconciliation Results */}
      {showResults && reconResults && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-6">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Reconciliation Results</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Cycle: {reconResults.cycleDate} | Match Rate: {reconResults.matched?.length && reconResults.totalPGTransactions 
                    ? ((reconResults.matched.length / reconResults.totalPGTransactions) * 100).toFixed(1) 
                    : '0.0'}%
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportToCSV()}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </button>
                <button
                  onClick={() => setShowResults(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4 mt-4">
              <div className="bg-green-50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Matched</p>
                    <p className="text-xl font-bold text-green-600">{reconResults.matched?.length || 0}</p>
                  </div>
                  <CheckCircle className="w-6 h-6 text-green-500" />
                </div>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Unmatched PG</p>
                    <p className="text-xl font-bold text-amber-600">{reconResults.unmatchedPG?.length || 0}</p>
                  </div>
                  <AlertTriangle className="w-6 h-6 text-amber-500" />
                </div>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Unmatched Bank</p>
                    <p className="text-xl font-bold text-amber-600">{reconResults.unmatchedBank?.length || 0}</p>
                  </div>
                  <AlertTriangle className="w-6 h-6 text-amber-500" />
                </div>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Exceptions</p>
                    <p className="text-xl font-bold text-red-600">{reconResults.exceptions?.length || 0}</p>
                  </div>
                  <XCircle className="w-6 h-6 text-red-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('matched')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'matched'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Matched ({reconResults.matched?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('unmatchedPG')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'unmatchedPG'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Unmatched PG ({reconResults.unmatchedPG?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('unmatchedBank')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'unmatchedBank'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Unmatched Bank ({reconResults.unmatchedBank?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('exceptions')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'exceptions'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Exceptions ({reconResults.exceptions?.length || 0})
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6 max-h-[400px] overflow-y-auto">
            {activeTab === 'matched' && (
              <div>
                {reconResults.matched?.length > 0 ? (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Transaction ID</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">UTR</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {reconResults.matched.slice(0, 10).map((match: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm">{match.pgTransaction?.transaction_id}</td>
                          <td className="px-4 py-2 text-sm">{match.pgTransaction?.utr}</td>
                          <td className="px-4 py-2 text-sm">₹{(match.pgTransaction?.amount / 100).toFixed(2)}</td>
                          <td className="px-4 py-2 text-sm">{match.confidence}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-gray-500 text-center py-8">No matched transactions</p>
                )}
              </div>
            )}

            {activeTab === 'unmatchedPG' && (
              <div>
                {reconResults.unmatchedPG?.length > 0 ? (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Transaction ID</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">UTR</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {reconResults.unmatchedPG.slice(0, 10).map((txn: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm">{txn.transaction_id}</td>
                          <td className="px-4 py-2 text-sm">{txn.utr || '-'}</td>
                          <td className="px-4 py-2 text-sm">₹{(txn.amount / 100).toFixed(2)}</td>
                          <td className="px-4 py-2 text-sm">{txn.payment_method}</td>
                          <td className="px-4 py-2 text-sm">
                            <span className="text-red-600 font-medium">
                              {txn.reason || 'No match found'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-gray-500 text-center py-8">No unmatched PG transactions</p>
                )}
              </div>
            )}

            {activeTab === 'unmatchedBank' && (
              <div>
                {reconResults.unmatchedBank?.length > 0 ? (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Transaction ID</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">UTR</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {reconResults.unmatchedBank.slice(0, 10).map((record: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm">{record.TRANSACTION_ID}</td>
                          <td className="px-4 py-2 text-sm">{record.UTR}</td>
                          <td className="px-4 py-2 text-sm">₹{(record.AMOUNT / 100).toFixed(2)}</td>
                          <td className="px-4 py-2 text-sm">{record.DATE}</td>
                          <td className="px-4 py-2 text-sm">
                            <span className="text-amber-600 font-medium">
                              {record.reason || 'No PG transaction found'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-gray-500 text-center py-8">No unmatched bank records</p>
                )}
              </div>
            )}

            {activeTab === 'exceptions' && (
              <div className="space-y-3">
                {reconResults.exceptions?.length > 0 ? (
                  reconResults.exceptions.slice(0, 10).map((exception: any, idx: number) => (
                    <div key={idx} className={`border rounded-lg p-4 ${
                      exception.severity === 'CRITICAL' ? 'bg-red-50 border-red-300' :
                      exception.severity === 'HIGH' ? 'bg-orange-50 border-orange-300' :
                      'bg-yellow-50 border-yellow-300'
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start flex-1">
                          <AlertTriangle className={`w-4 h-4 mt-0.5 mr-2 ${
                            exception.severity === 'CRITICAL' ? 'text-red-600' :
                            exception.severity === 'HIGH' ? 'text-orange-600' :
                            'text-yellow-600'
                          }`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm">{exception.type?.replace(/_/g, ' ')}</p>
                              <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                                exception.severity === 'CRITICAL' ? 'bg-red-200 text-red-800' :
                                exception.severity === 'HIGH' ? 'bg-orange-200 text-orange-800' :
                                'bg-yellow-200 text-yellow-800'
                              }`}>
                                {exception.severity}
                              </span>
                            </div>
                            <p className="text-sm mt-1 text-gray-700">{exception.message}</p>
                            {exception.details && (
                              <div className="mt-2 text-xs text-gray-600">
                                {exception.details.utr && <p>UTR: {exception.details.utr}</p>}
                                {exception.details.variancePercent && <p>Variance: {exception.details.variancePercent}%</p>}
                                {exception.details.duplicateIds && <p>Duplicates: {exception.details.duplicateIds.join(', ')}</p>}
                              </div>
                            )}
                            {exception.resolution && (
                              <p className="text-xs mt-2 text-blue-600 font-medium">
                                ⚡ {exception.resolution}
                              </p>
                            )}
                          </div>
                        </div>
                        {exception.pgTransaction && (
                          <div className="text-right text-xs text-gray-500 ml-4">
                            <p>TXN: {exception.pgTransaction.transaction_id}</p>
                            <p>₹{(exception.pgTransaction.amount / 100).toFixed(2)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-8">No exceptions</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Error Modal */}
      {reconciliationError && (
        <ReconciliationErrorModal
          jobId={reconciliationError.jobId}
          error={reconciliationError.error}
          onClose={() => setReconciliationError(null)}
          onRetry={() => {
            setReconciliationError(null);
            // Trigger reconciliation again
            document.querySelector<HTMLButtonElement>('button:has(.w-4.h-4.mr-1)')?.click();
          }}
          onViewLogs={(jobId) => {
            // Open logs in new window or drawer
            window.open(`/ops/recon/jobs/${jobId}/logs`, '_blank');
          }}
        />
      )}
      
      {/* Job Results Panel Modal */}
      {showJobResults && selectedJobId && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowJobResults(false)} />
          <div className="absolute right-0 top-0 h-full w-3/4 max-w-5xl bg-white shadow-xl">
            <JobResultsPanel
              jobId={selectedJobId}
              onClose={() => {
                setShowJobResults(false);
                setSelectedJobId(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );

  // Export to CSV function
  function exportToCSV() {
    if (!reconResults) return;

    let csvContent = '';
    const activeData = activeTab === 'matched' ? reconResults.matched :
                       activeTab === 'unmatchedPG' ? reconResults.unmatchedPG :
                       activeTab === 'unmatchedBank' ? reconResults.unmatchedBank :
                       reconResults.exceptions;

    if (!activeData || activeData.length === 0) {
      toast.error('No data to export');
      return;
    }

    // Generate CSV based on active tab
    if (activeTab === 'matched') {
      csvContent = 'Transaction ID,UTR,PG Amount,Bank Amount,Confidence\n';
      activeData.forEach((match: any) => {
        csvContent += `${match.pgTransaction?.transaction_id},${match.pgTransaction?.utr},${match.pgTransaction?.amount / 100},${match.bankRecord?.AMOUNT / 100},${match.confidence}\n`;
      });
    } else if (activeTab === 'unmatchedPG') {
      csvContent = 'Transaction ID,UTR,Amount,Payment Method,Date\n';
      activeData.forEach((txn: any) => {
        csvContent += `${txn.transaction_id},${txn.utr},${txn.amount / 100},${txn.payment_method},${txn.captured_at}\n`;
      });
    } else if (activeTab === 'unmatchedBank') {
      csvContent = 'Transaction ID,UTR,Amount,Date\n';
      activeData.forEach((record: any) => {
        csvContent += `${record.TRANSACTION_ID},${record.UTR},${record.AMOUNT / 100},${record.DATE}\n`;
      });
    } else if (activeTab === 'exceptions') {
      csvContent = 'Type,Message,Details\n';
      activeData.forEach((exception: any) => {
        csvContent += `${exception.type},${exception.message},${JSON.stringify(exception.details || {})}\n`;
      });
    }

    // Create and download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `reconciliation_${activeTab}_${reconResults.cycleDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Export completed');
  }
}