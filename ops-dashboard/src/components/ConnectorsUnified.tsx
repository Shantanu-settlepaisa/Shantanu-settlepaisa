import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { 
  RefreshCw, 
  Activity, 
  FileText, 
  Server,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Database,
  Link2,
  Settings,
  Download,
  ChevronRight,
  Wifi,
  WifiOff
} from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { format } from 'date-fns'

interface Connector {
  id: string
  name: string
  type: 'SFTP' | 'API' | 'WEBHOOK'
  source: 'PG' | 'BANK'
  status: 'active' | 'inactive' | 'error'
  lastSync: string | null
  nextSync: string | null
  config: {
    host?: string
    port?: number
    endpoint?: string
    schedule?: string
  }
  stats: {
    totalSyncs: number
    successfulSyncs: number
    failedSyncs: number
    lastError?: string
  }
}

interface JobSummary {
  jobId: string
  connectorId: string
  connectorName: string
  status: 'running' | 'completed' | 'failed'
  startTime: string
  endTime?: string
  progress?: number
  summary?: {
    filesProcessed: number
    transactionsProcessed: number
    matched: number
    unmatched: number
    exceptions: number
    topReason?: {
      code: string
      count: number
    }
  }
  error?: string
}

export default function ConnectorsUnified() {
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [activeJobs, setActiveJobs] = useState<JobSummary[]>([])
  const [recentJobs, setRecentJobs] = useState<JobSummary[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  // Mock data generation
  useEffect(() => {
    // Generate mock connectors
    const mockConnectors: Connector[] = [
      {
        id: 'conn-1',
        name: 'Razorpay SFTP',
        type: 'SFTP',
        source: 'PG',
        status: 'active',
        lastSync: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        nextSync: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        config: {
          host: 'sftp.razorpay.com',
          port: 22,
          schedule: '0 */6 * * *'
        },
        stats: {
          totalSyncs: 156,
          successfulSyncs: 152,
          failedSyncs: 4,
        }
      },
      {
        id: 'conn-2',
        name: 'Axis Bank API',
        type: 'API',
        source: 'BANK',
        status: 'active',
        lastSync: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        nextSync: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        config: {
          endpoint: 'https://api.axisbank.com/recon/v2',
          schedule: '0 * * * *'
        },
        stats: {
          totalSyncs: 732,
          successfulSyncs: 728,
          failedSyncs: 4,
        }
      },
      {
        id: 'conn-3',
        name: 'PayU Webhook',
        type: 'WEBHOOK',
        source: 'PG',
        status: 'error',
        lastSync: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        nextSync: null,
        config: {
          endpoint: 'https://settlePaisa.com/webhooks/payu'
        },
        stats: {
          totalSyncs: 89,
          successfulSyncs: 85,
          failedSyncs: 4,
          lastError: 'Connection timeout after 30000ms'
        }
      },
      {
        id: 'conn-4',
        name: 'HDFC Bank SFTP',
        type: 'SFTP',
        source: 'BANK',
        status: 'inactive',
        lastSync: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        nextSync: null,
        config: {
          host: 'secure.hdfcbank.com',
          port: 22,
          schedule: '0 0 * * *'
        },
        stats: {
          totalSyncs: 45,
          successfulSyncs: 43,
          failedSyncs: 2,
        }
      }
    ]

    // Generate mock recent jobs
    const mockRecentJobs: JobSummary[] = [
      {
        jobId: 'job-001',
        connectorId: 'conn-1',
        connectorName: 'Razorpay SFTP',
        status: 'completed',
        startTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
        summary: {
          filesProcessed: 12,
          transactionsProcessed: 4567,
          matched: 4502,
          unmatched: 45,
          exceptions: 20,
          topReason: {
            code: 'AMOUNT_MISMATCH',
            count: 15
          }
        }
      },
      {
        jobId: 'job-002',
        connectorId: 'conn-2',
        connectorName: 'Axis Bank API',
        status: 'completed',
        startTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        summary: {
          filesProcessed: 1,
          transactionsProcessed: 892,
          matched: 878,
          unmatched: 10,
          exceptions: 4,
          topReason: {
            code: 'DUPLICATE_UTR',
            count: 6
          }
        }
      }
    ]

    setConnectors(mockConnectors)
    setRecentJobs(mockRecentJobs)
    setLoading(false)
  }, [])

  const triggerSync = async (connectorId: string) => {
    const connector = connectors.find(c => c.id === connectorId)
    if (!connector) return

    // Create new job
    const newJob: JobSummary = {
      jobId: `job-${Date.now()}`,
      connectorId,
      connectorName: connector.name,
      status: 'running',
      startTime: new Date().toISOString(),
      progress: 0
    }

    setActiveJobs([...activeJobs, newJob])
    toast({
      title: 'Sync Started',
      description: `Started sync for ${connector.name}`,
    })

    // Simulate job progress
    let progress = 0
    const interval = setInterval(() => {
      progress += 10
      setActiveJobs(jobs => 
        jobs.map(job => 
          job.jobId === newJob.jobId 
            ? { ...job, progress }
            : job
        )
      )

      if (progress >= 100) {
        clearInterval(interval)
        // Move to completed
        setTimeout(() => {
          const completedJob: JobSummary = {
            ...newJob,
            status: 'completed',
            endTime: new Date().toISOString(),
            progress: 100,
            summary: {
              filesProcessed: Math.floor(Math.random() * 10) + 1,
              transactionsProcessed: Math.floor(Math.random() * 1000) + 500,
              matched: Math.floor(Math.random() * 900) + 450,
              unmatched: Math.floor(Math.random() * 50) + 10,
              exceptions: Math.floor(Math.random() * 20) + 5,
              topReason: {
                code: ['AMOUNT_MISMATCH', 'DUPLICATE_UTR', 'UTR_MISMATCH'][Math.floor(Math.random() * 3)],
                count: Math.floor(Math.random() * 20) + 5
              }
            }
          }

          setActiveJobs(jobs => jobs.filter(j => j.jobId !== newJob.jobId))
          setRecentJobs(jobs => [completedJob, ...jobs].slice(0, 10))
          
          // Update connector last sync
          setConnectors(conns => 
            conns.map(c => 
              c.id === connectorId 
                ? { ...c, lastSync: new Date().toISOString() }
                : c
            )
          )

          toast({
            title: 'Sync Completed',
            description: `${connector.name}: Processed ${completedJob.summary?.transactionsProcessed} transactions`,
          })
        }, 2000)
      }
    }, 500)
  }

  const toggleConnector = (connectorId: string, enabled: boolean) => {
    setConnectors(conns => 
      conns.map(c => 
        c.id === connectorId 
          ? { ...c, status: enabled ? 'active' : 'inactive' }
          : c
      )
    )
    
    const connector = connectors.find(c => c.id === connectorId)
    toast({
      title: enabled ? 'Connector Enabled' : 'Connector Disabled',
      description: `${connector?.name} is now ${enabled ? 'active' : 'inactive'}`,
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Wifi className="h-4 w-4 text-green-500" />
      case 'inactive':
        return <WifiOff className="h-4 w-4 text-gray-400" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getJobStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>
      case 'running':
        return <Badge className="bg-blue-100 text-blue-800">Running</Badge>
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Recon Config CTA */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Automated Connectors</h2>
          <p className="text-gray-600">Manage automated sync connections for reconciliation</p>
        </div>
        <Button variant="outline">
          <Settings className="mr-2 h-4 w-4" />
          Recon Config
        </Button>
      </div>

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500 animate-pulse" />
              Active Jobs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeJobs.map(job => (
              <div key={job.jobId} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{job.connectorName}</span>
                  <span className="text-sm text-gray-500">
                    Started {format(new Date(job.startTime), 'HH:mm:ss')}
                  </span>
                </div>
                <Progress value={job.progress} className="h-2" />
                <div className="text-xs text-gray-500">
                  Processing... {job.progress}%
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Connectors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {connectors.map(connector => (
          <Card key={connector.id} className={connector.status === 'error' ? 'border-red-200' : ''}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {getStatusIcon(connector.status)}
                    {connector.name}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Badge variant="outline">{connector.type}</Badge>
                    <Badge variant="outline">{connector.source}</Badge>
                  </div>
                </div>
                <Switch
                  checked={connector.status === 'active'}
                  onCheckedChange={(checked) => toggleConnector(connector.id, checked)}
                  disabled={connector.status === 'error'}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Connection Details */}
              <div className="text-sm space-y-1">
                {connector.config.host && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Server className="h-3 w-3" />
                    {connector.config.host}:{connector.config.port}
                  </div>
                )}
                {connector.config.endpoint && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Link2 className="h-3 w-3" />
                    {connector.config.endpoint}
                  </div>
                )}
                {connector.config.schedule && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="h-3 w-3" />
                    Schedule: {connector.config.schedule}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {connector.stats.successfulSyncs}
                  </div>
                  <div className="text-xs text-gray-500">Successful</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">
                    {connector.stats.failedSyncs}
                  </div>
                  <div className="text-xs text-gray-500">Failed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {((connector.stats.successfulSyncs / connector.stats.totalSyncs) * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500">Success Rate</div>
                </div>
              </div>

              {/* Last Sync Info */}
              <div className="pt-2 border-t">
                {connector.lastSync && (
                  <div className="text-sm text-gray-600">
                    Last sync: {format(new Date(connector.lastSync), 'MMM dd, HH:mm')}
                  </div>
                )}
                {connector.nextSync && connector.status === 'active' && (
                  <div className="text-sm text-gray-600">
                    Next sync: {format(new Date(connector.nextSync), 'MMM dd, HH:mm')}
                  </div>
                )}
                {connector.stats.lastError && (
                  <div className="text-sm text-red-600 mt-1">
                    Error: {connector.stats.lastError}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  onClick={() => triggerSync(connector.id)}
                  disabled={connector.status !== 'active'}
                  className="flex-1"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sync Now
                </Button>
                <Button size="sm" variant="outline">
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Jobs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentJobs.map(job => (
              <div key={job.jobId} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <div>
                      <div className="font-medium">{job.connectorName}</div>
                      <div className="text-sm text-gray-500">
                        {format(new Date(job.startTime), 'MMM dd, HH:mm:ss')}
                        {job.endTime && ` - ${format(new Date(job.endTime), 'HH:mm:ss')}`}
                      </div>
                    </div>
                  </div>
                </div>

                {job.summary && (
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-gray-500">Files:</span>{' '}
                      <span className="font-medium">{job.summary.filesProcessed}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Transactions:</span>{' '}
                      <span className="font-medium">{job.summary.transactionsProcessed}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Matched:</span>{' '}
                      <span className="font-medium text-green-600">{job.summary.matched}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Unmatched:</span>{' '}
                      <span className="font-medium text-amber-600">{job.summary.unmatched}</span>
                    </div>
                    {job.summary.topReason && (
                      <div>
                        <Badge variant="outline">
                          {job.summary.topReason.code}: {job.summary.topReason.count}
                        </Badge>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {getJobStatusBadge(job.status)}
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => {
                      // Navigate to filtered recon items
                      window.location.href = `/ops/recon/items?jobId=${job.jobId}`
                    }}
                  >
                    View Items
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}