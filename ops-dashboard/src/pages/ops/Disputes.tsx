import React, { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { 
  AlertCircle, Clock, TrendingUp, DollarSign, Search, Filter, Upload, 
  FileText, Download, User, Calendar, AlertTriangle, CheckCircle, 
  XCircle, ArrowRight, RefreshCw, Eye, Send
} from 'lucide-react'
import { opsApiExtended as opsApi } from '@/lib/ops-api-extended'
import type { 
  Chargeback, ChargebackStatus, ChargebackKPIResponse, 
  ChargebackDetailResponse, ChargebackSummary 
} from '@/types/chargebacks'
import { format, subDays } from 'date-fns'
import { toast } from 'sonner'
import { useDisputesKpis, useOutcomeSummary, useSlaBuckets, OutcomeWindow } from '@/hooks/useDisputesKpis'
import { ActiveCasesTile } from '@/components/chargebacks/ActiveCasesTile'
import { OutcomeTile } from '@/components/chargebacks/OutcomeTile'
import { FinancialImpactTile } from '@/components/chargebacks/FinancialImpactTile'
import { SlaStrip } from '@/components/chargebacks/SlaStrip'
import { TimeRangePicker, TimeRange, getTimeRangeBounds } from '@/components/TimeRangePicker'

// Status badge component
const StatusBadge: React.FC<{ status: ChargebackStatus | string }> = ({ status }) => {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', icon?: any }> = {
    'OPEN': { variant: 'secondary', icon: AlertCircle },
    'EVIDENCE_REQUIRED': { variant: 'destructive', icon: AlertTriangle },
    'REPRESENTMENT_SUBMITTED': { variant: 'default', icon: Send },
    'PENDING_BANK': { variant: 'outline', icon: Clock },
    'WON': { variant: 'default', icon: CheckCircle },
    'RECOVERED': { variant: 'default', icon: CheckCircle }, // V2 DB status
    'LOST': { variant: 'destructive', icon: XCircle },
    'WRITEOFF': { variant: 'destructive', icon: XCircle }, // V2 DB status
    'CANCELLED': { variant: 'secondary', icon: XCircle }
  }
  
  const config = variants[status] || { variant: 'outline' as const, icon: AlertCircle }
  const Icon = config.icon
  
  return (
    <Badge variant={config.variant} className="flex items-center gap-1">
      {Icon && <Icon className="h-3 w-3" />}
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

// Status badge component remains unchanged

// Chargeback Detail Drawer
const ChargebackDetail: React.FC<{ 
  chargebackId: string
  onClose: () => void 
}> = ({ chargebackId, onClose }) => {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('summary')
  const [statusUpdateOpen, setStatusUpdateOpen] = useState(false)
  const [newStatus, setNewStatus] = useState<ChargebackStatus | ''>('')
  const [statusReason, setStatusReason] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const { data: detail, isLoading } = useQuery({
    queryKey: ['chargeback-detail', chargebackId],
    queryFn: () => opsApi.getChargebackById(chargebackId)
  })
  
  const updateStatusMutation = useMutation({
    mutationFn: (params: { status: ChargebackStatus; reason?: string }) => 
      opsApi.updateChargebackStatus(chargebackId, {
        status: params.status,
        reason: params.reason,
        actorEmail: 'ops@settlepaisa.com',
        idempotencyKey: `status-${chargebackId}-${Date.now()}`
      }),
    onSuccess: () => {
      toast.success('Status updated successfully')
      queryClient.invalidateQueries({ queryKey: ['chargebacks'] })
      queryClient.invalidateQueries({ queryKey: ['chargeback-detail', chargebackId] })
      setStatusUpdateOpen(false)
      setNewStatus('')
      setStatusReason('')
    },
    onError: () => {
      toast.error('Failed to update status')
    }
  })
  
  const uploadEvidenceMutation = useMutation({
    mutationFn: (files: FileList) => 
      opsApi.uploadChargebackEvidence(
        chargebackId,
        Array.from(files),
        'ops@settlepaisa.com'
      ),
    onSuccess: () => {
      toast.success('Evidence uploaded successfully')
      queryClient.invalidateQueries({ queryKey: ['chargeback-detail', chargebackId] })
    },
    onError: () => {
      toast.error('Failed to upload evidence')
    }
  })
  
  const submitRepresentmentMutation = useMutation({
    mutationFn: () => 
      opsApi.submitChargebackRepresentment(chargebackId, {
        representmentNotes: 'Evidence submitted for review',
        submittedBy: 'ops@settlepaisa.com',
        idempotencyKey: `represent-${chargebackId}-${Date.now()}`
      }),
    onSuccess: () => {
      toast.success('Representment submitted successfully')
      queryClient.invalidateQueries({ queryKey: ['chargebacks'] })
      queryClient.invalidateQueries({ queryKey: ['chargeback-detail', chargebackId] })
    },
    onError: () => {
      toast.error('Failed to submit representment')
    }
  })
  
  if (isLoading) {
    return (
      <div className="fixed right-0 top-0 h-full w-96 bg-background border-l shadow-lg p-6">
        <div className="flex items-center justify-center h-full">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </div>
    )
  }
  
  if (!detail) return null
  
  const chargeback = detail.chargeback
  const formatCurrency = (paise: bigint) => {
    const rupees = Number(paise) / 100
    return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  
  const daysUntilDue = chargeback.evidenceDueAt 
    ? Math.floor((new Date(chargeback.evidenceDueAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null
  
  return (
    <div className="fixed right-0 top-0 h-full w-[600px] bg-background border-l shadow-lg overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-background border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{chargeback.caseRef}</h2>
            <p className="text-sm text-muted-foreground">{chargeback.merchantName}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>×</Button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <StatusBadge status={chargeback.status} />
          {daysUntilDue !== null && daysUntilDue >= 0 && (
            <Badge variant={daysUntilDue <= 3 ? 'destructive' : 'secondary'}>
              Due in {daysUntilDue} days
            </Badge>
          )}
          {daysUntilDue !== null && daysUntilDue < 0 && (
            <Badge variant="destructive">Overdue by {Math.abs(daysUntilDue)} days</Badge>
          )}
        </div>
      </div>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="p-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
        </TabsList>
        
        <TabsContent value="summary" className="space-y-4">
          {/* Dispute Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Dispute Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Reason Code</p>
                  <p className="font-medium">{chargeback.reasonCode}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Category</p>
                  <p className="font-medium">{chargeback.category}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Disputed Amount</p>
                  <p className="font-medium">{formatCurrency(chargeback.disputedAmountPaise)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Network</p>
                  <p className="font-medium">{chargeback.network}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Reason Description</p>
                  <p className="font-medium">{chargeback.reasonDesc}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Transaction Details */}
          {detail.transaction && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Transaction Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Transaction ID</p>
                    <p className="font-medium">{detail.transaction.txnId}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Payment Date</p>
                    <p className="font-medium">
                      {format(new Date(detail.transaction.paymentDate), 'PPp')}
                    </p>
                  </div>
                  {chargeback.rrn && (
                    <div>
                      <p className="text-muted-foreground">RRN</p>
                      <p className="font-medium">{chargeback.rrn}</p>
                    </div>
                  )}
                  {chargeback.utr && (
                    <div>
                      <p className="text-muted-foreground">UTR</p>
                      <p className="font-medium">{chargeback.utr}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground">Original Amount</p>
                    <p className="font-medium">
                      {formatCurrency(detail.transaction.originalAmountPaise)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Payment Method</p>
                    <p className="font-medium">{detail.transaction.paymentMethod}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => setStatusUpdateOpen(true)}
              >
                Update Status
              </Button>
              {chargeback.status === 'EVIDENCE_REQUIRED' && (
                <Button 
                  className="w-full"
                  onClick={() => submitRepresentmentMutation.mutate()}
                  disabled={submitRepresentmentMutation.isPending}
                >
                  Submit Representment
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="evidence" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Evidence Files</CardTitle>
              <CardDescription>Upload supporting documents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {detail.evidence.map(file => (
                  <div key={file.id} className="flex items-center justify-between p-2 border rounded">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{file.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {(file.sizeBytes / 1024).toFixed(1)} KB • {format(new Date(file.uploadedAt), 'PP')}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {detail.evidence.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No evidence uploaded yet
                  </p>
                )}
              </div>
              
              <div className="border-t pt-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      uploadEvidenceMutation.mutate(e.target.files)
                    }
                  }}
                />
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadEvidenceMutation.isPending}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Evidence
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Event Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {detail.timeline.map((event, index) => (
                  <div key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 bg-primary rounded-full" />
                      {index < detail.timeline.length - 1 && (
                        <div className="w-0.5 h-full bg-border" />
                      )}
                    </div>
                    <div className="flex-1 pb-3">
                      <p className="text-sm font-medium">{event.action.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(event.ts), 'PPp')} • {event.actorEmail}
                      </p>
                      {event.payload && (
                        <div className="mt-1 p-2 bg-muted rounded text-xs">
                          {JSON.stringify(event.payload, null, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="ledger" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Ledger Allocations</CardTitle>
              <CardDescription>Settlement impact and journal entries</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.allocations.map(allocation => (
                <div key={allocation.id} className="p-3 border rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant={
                      allocation.type === 'RESERVE_HOLD' ? 'secondary' :
                      allocation.type === 'RESERVE_RELEASE' ? 'default' :
                      'destructive'
                    }>
                      {allocation.type.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-sm font-medium">
                      {formatCurrency(allocation.amountPaise)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Journal: {allocation.journalEntryId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(allocation.createdAt), 'PPp')}
                  </p>
                </div>
              ))}
              
              {detail.settlementImpact && (
                <div className="mt-4 p-3 bg-muted rounded">
                  <p className="text-sm font-medium mb-2">Settlement Impact</p>
                  {detail.settlementImpact.reserveHoldPaise && (
                    <p className="text-xs">
                      Reserve Hold: {formatCurrency(detail.settlementImpact.reserveHoldPaise)}
                    </p>
                  )}
                  {detail.settlementImpact.adjustmentPaise && (
                    <p className="text-xs">
                      Adjustment: {formatCurrency(detail.settlementImpact.adjustmentPaise)}
                    </p>
                  )}
                  {detail.settlementImpact.settlementBatchId && (
                    <p className="text-xs">
                      Batch: {detail.settlementImpact.settlementBatchId}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Status Update Dialog */}
      <Dialog open={statusUpdateOpen} onOpenChange={setStatusUpdateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Chargeback Status</DialogTitle>
            <DialogDescription>
              Change the status of this chargeback case
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>New Status</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as ChargebackStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EVIDENCE_REQUIRED">Evidence Required</SelectItem>
                  <SelectItem value="REPRESENTMENT_SUBMITTED">Representment Submitted</SelectItem>
                  <SelectItem value="PENDING_BANK">Pending Bank</SelectItem>
                  <SelectItem value="WON">Won</SelectItem>
                  <SelectItem value="LOST">Lost</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason (Optional)</Label>
              <Textarea 
                value={statusReason} 
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Enter reason for status change"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusUpdateOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (newStatus) {
                  updateStatusMutation.mutate({ 
                    status: newStatus, 
                    reason: statusReason || undefined 
                  })
                }
              }}
              disabled={!newStatus || updateStatusMutation.isPending}
            >
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Main Disputes Page
export default function Disputes() {
  const [selectedTab, setSelectedTab] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedChargeback, setSelectedChargeback] = useState<string | null>(null)
  const [filterAcquirer, setFilterAcquirer] = useState<string>('all')
  const [outcomeWindow, setOutcomeWindow] = useState<OutcomeWindow>('7d')
  const [slaBucketFilter, setSlaBucketFilter] = useState<'overdue' | 'today' | 'twoToThree' | null>(null)
  
  // Date range state (last 7 days by default)
  const [timeRange, setTimeRange] = useState<TimeRange>('last7d')
  
  // Date range for KPIs
  const bounds = getTimeRangeBounds(timeRange)
  const filters = {
    from: bounds.start.toISOString().split('T')[0],
    to: bounds.end.toISOString().split('T')[0],
    merchantId: undefined,
    acquirerId: filterAcquirer === 'all' ? undefined : filterAcquirer
  }
  
  // Get new KPIs
  const { data: disputesKpis, isLoading: kpisLoading } = useDisputesKpis(filters)
  const { data: outcomeSummary, isLoading: outcomeLoading } = useOutcomeSummary(
    outcomeWindow, 
    { merchantId: filters.merchantId, acquirerId: filters.acquirerId }
  )
  const { data: slaBuckets, isLoading: slaLoading } = useSlaBuckets(filters)
  
  // Get chargebacks based on tab
  const statusMap: Record<string, ChargebackStatus[] | undefined> = {
    'all': undefined,
    'open': ['OPEN'],
    'evidence': ['EVIDENCE_REQUIRED'],
    'pending': ['REPRESENTMENT_SUBMITTED', 'PENDING_BANK'],
    'won': ['RECOVERED'],
    'lost': ['WRITEOFF'],
    'cancelled': ['CANCELLED']
  }
  
  const { data: chargebacksData, isLoading } = useQuery({
    queryKey: ['chargebacks', selectedTab, searchQuery, filterAcquirer, slaBucketFilter, filters.from, filters.to],
    queryFn: () => opsApi.getChargebacks({
      status: statusMap[selectedTab],
      searchQuery: searchQuery || undefined,
      acquirer: filterAcquirer === 'all' ? undefined : filterAcquirer,
      slaBucket: slaBucketFilter || undefined,
      dateFrom: filters.from,
      dateTo: filters.to,
      limit: 50
    })
  })
  
  const chargebacks: ChargebackSummary[] = chargebacksData?.chargebacks || []
  
  const formatCurrency = (paise: bigint) => {
    const rupees = Number(paise) / 100
    return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }
  
  const handleExportCSV = () => {
    if (!chargebacks || chargebacks.length === 0) {
      toast.error('No data to export')
      return
    }
    
    const headers = [
      'Network Case ID',
      'Merchant',
      'Acquirer',
      'Transaction Ref',
      'Amount',
      'Status',
      'Reason',
      'Received Date',
      'Evidence Due',
      'Resolved Date'
    ]
    
    const rows = chargebacks.map(cb => [
      cb.networkCaseId || '',
      cb.merchantName || '',
      cb.acquirer || '',
      cb.txnRef || '',
      (Number(cb.chargebackPaise || 0) / 100).toFixed(2),
      cb.status || '',
      cb.reasonDescription || '',
      cb.receivedAt ? format(new Date(cb.receivedAt), 'yyyy-MM-dd') : '',
      cb.evidenceDueAt ? format(new Date(cb.evidenceDueAt), 'yyyy-MM-dd') : '',
      cb.closedAt ? format(new Date(cb.closedAt), 'yyyy-MM-dd') : ''
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `chargebacks_${format(new Date(), 'yyyy-MM-dd')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    
    toast.success(`Exported ${chargebacks.length} chargebacks to CSV`)
  }
  
  const handleImportCSV = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv'
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0]
      if (!file) return
      
      const reader = new FileReader()
      reader.onload = async (event) => {
        try {
          const csv = event.target?.result as string
          const lines = csv.split('\n')
          const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
          
          toast.success(`CSV uploaded: ${lines.length - 1} rows found. Import functionality coming soon.`)
        } catch (error) {
          toast.error('Failed to parse CSV file')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Disputes & Chargebacks</h1>
          <p className="text-muted-foreground">
            Manage chargeback cases, upload evidence, and track decisions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TimeRangePicker
            value={timeRange}
            onChange={setTimeRange}
          />
          <Button variant="outline" onClick={handleImportCSV}>
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>
      
      {/* New KPI Row - Exactly 3 tiles */}
      <div className="w-full" data-testid="kpi-row">
        <div className="grid gap-4 xl:grid-cols-3 md:grid-cols-2 grid-cols-1">
          <ActiveCasesTile
            openCount={disputesKpis?.openCount || 0}
            evidenceRequiredCount={disputesKpis?.evidenceRequiredCount || 0}
            onOpenClick={() => {
              setSelectedTab('open')
              setSlaBucketFilter(null)
            }}
            onEvidenceClick={() => {
              setSelectedTab('evidence')
              setSlaBucketFilter(null)
            }}
            isLoading={kpisLoading}
          />
          
          <OutcomeTile
            wonCount={outcomeSummary?.wonCount || 0}
            lostCount={outcomeSummary?.lostCount || 0}
            winRate={outcomeSummary?.winRatePct || 0}
            avgResolutionDays={outcomeSummary?.avgResolutionDays || 0}
            onWonClick={() => {
              setSelectedTab('won')
              setSlaBucketFilter(null)
            }}
            onLostClick={() => {
              setSelectedTab('lost')
              setSlaBucketFilter(null)
            }}
            onWindowChange={setOutcomeWindow}
            isLoading={outcomeLoading}
          />
          
          <FinancialImpactTile
            disputedPaise={disputesKpis?.disputedPaise || '0'}
            recoveredPaise={disputesKpis?.recoveredPaise || '0'}
            writtenOffPaise={disputesKpis?.writtenOffPaise || '0'}
            onClickDisputed={() => {
              setSelectedTab('all')
              setSlaBucketFilter(null)
            }}
            onClickRecovered={() => {
              setSelectedTab('won')
              setSlaBucketFilter(null)
            }}
            onClickWrittenOff={() => {
              setSelectedTab('lost')
              setSlaBucketFilter(null)
            }}
            onClickNet={() => {
              setSelectedTab('all')
              setSlaBucketFilter(null)
            }}
            isLoading={kpisLoading}
          />
        </div>
      </div>
      
      {/* SLA Strip */}
      <SlaStrip
        buckets={slaBuckets || { overdue: { count: 0, amountPaise: '0' }, today: { count: 0, amountPaise: '0' }, twoToThree: { count: 0, amountPaise: '0' } }}
        onClickBucket={(bucket) => {
          setSlaBucketFilter(bucket)
          setSelectedTab('open') // SLA only applies to open cases
        }}
        isLoading={slaLoading}
      />
      
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by case ref, transaction ID, RRN, UTR..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={filterAcquirer} onValueChange={setFilterAcquirer}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Acquirers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Acquirers</SelectItem>
            <SelectItem value="AXIS">AXIS</SelectItem>
            <SelectItem value="BOB">BOB</SelectItem>
            <SelectItem value="HDFC">HDFC</SelectItem>
            <SelectItem value="ICICI">ICICI</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="evidence">Evidence Required</TabsTrigger>
          <TabsTrigger value="pending">Pending Bank</TabsTrigger>
          <TabsTrigger value="won">Won</TabsTrigger>
          <TabsTrigger value="lost">Lost</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
        
        <TabsContent value={selectedTab} className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left p-4 font-medium">Case Ref</th>
                      <th className="text-left p-4 font-medium">Merchant</th>
                      <th className="text-left p-4 font-medium">Txn ID</th>
                      <th className="text-left p-4 font-medium">Reason</th>
                      <th className="text-left p-4 font-medium">Amount</th>
                      <th className="text-left p-4 font-medium">Status</th>
                      <th className="text-left p-4 font-medium">Evidence Due</th>
                      <th className="text-left p-4 font-medium">Owner</th>
                      <th className="text-left p-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={9} className="text-center p-8">
                          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                          <p className="text-muted-foreground">Loading chargebacks...</p>
                        </td>
                      </tr>
                    ) : chargebacks.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center p-8">
                          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-muted-foreground">No chargebacks found</p>
                        </td>
                      </tr>
                    ) : (
                      chargebacks.map((chargeback) => (
                        <tr 
                          key={chargeback.id} 
                          className="border-b hover:bg-muted/50 cursor-pointer"
                          onClick={() => setSelectedChargeback(chargeback.id)}
                        >
                          <td className="p-4">
                            <p className="font-medium text-sm">{chargeback.caseRef}</p>
                          </td>
                          <td className="p-4">
                            <p className="text-sm">{chargeback.merchantName}</p>
                          </td>
                          <td className="p-4">
                            <p className="text-sm font-mono">{chargeback.txnId}</p>
                          </td>
                          <td className="p-4">
                            <p className="text-sm">{chargeback.reasonCode}</p>
                          </td>
                          <td className="p-4">
                            <p className="text-sm font-medium">
                              {formatCurrency(chargeback.disputedAmountPaise)}
                            </p>
                          </td>
                          <td className="p-4">
                            <StatusBadge status={chargeback.status} />
                          </td>
                          <td className="p-4">
                            {chargeback.evidenceDueAt && (
                              <div className="text-sm">
                                <p>{format(new Date(chargeback.evidenceDueAt), 'PP')}</p>
                                {chargeback.daysUntilDue !== undefined && (
                                  <p className={`text-xs ${
                                    chargeback.isOverdue ? 'text-red-600' : 
                                    chargeback.daysUntilDue <= 3 ? 'text-orange-600' : 
                                    'text-muted-foreground'
                                  }`}>
                                    {chargeback.isOverdue 
                                      ? `Overdue by ${Math.abs(chargeback.daysUntilDue)} days`
                                      : `${chargeback.daysUntilDue} days left`
                                    }
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                            {chargeback.ownerEmail && (
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 text-muted-foreground" />
                                <p className="text-sm">{chargeback.ownerEmail.split('@')[0]}</p>
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedChargeback(chargeback.id)
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Detail Drawer */}
      {selectedChargeback && (
        <ChargebackDetail 
          chargebackId={selectedChargeback}
          onClose={() => setSelectedChargeback(null)}
        />
      )}
    </div>
  )
}