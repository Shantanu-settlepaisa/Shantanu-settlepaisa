import { useState } from 'react'
import { Calendar, Download, Clock, Filter, FileText, Mail, Cloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useQuery, useMutation } from '@tanstack/react-query'
import { opsApiExtended as opsApi } from '@/lib/ops-api-extended'
import { reportExportService } from '@/services/report-export'
import { reportScheduler } from '@/services/report-scheduler'
import type { ReportType, ReportFormat, ReportFilters, ReportSchedule } from '@/types/reports'

export default function Reports() {
  const [activeTab, setActiveTab] = useState<ReportType>('SETTLEMENT_SUMMARY')
  const [filters, setFilters] = useState<ReportFilters>({
    cycleDate: new Date().toISOString().split('T')[0]
  })
  const [exportFormat, setExportFormat] = useState<ReportFormat>('CSV')
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({
    cadenceCron: '0 19 * * *',
    timezone: 'Asia/Kolkata',
    format: 'CSV' as ReportFormat,
    delivery: 'EMAIL' as 'EMAIL' | 'S3' | 'BOTH',
    recipients: [''],
    s3Prefix: ''
  })

  // Fetch report data
  const { data: reportData, isLoading, refetch } = useQuery({
    queryKey: ['report', activeTab, filters],
    queryFn: async () => {
      switch (activeTab) {
        case 'SETTLEMENT_SUMMARY':
          return opsApi.getSettlementSummary(filters)
        case 'BANK_MIS':
          return opsApi.getBankMIS(filters)
        case 'RECON_OUTCOME':
          return opsApi.getReconOutcome(filters)
        case 'TAX':
          return opsApi.getTaxReport(filters)
        default:
          return { data: [], rowCount: 0 }
      }
    },
    enabled: true
  })

  // Fetch schedules
  const { data: schedules } = useQuery({
    queryKey: ['schedules'],
    queryFn: async () => {
      return reportScheduler.getSchedules()
    }
  })

  // Export mutation - direct download
  const exportMutation = useMutation({
    mutationFn: async () => {
      // Use direct download instead of API
      await reportExportService.downloadReportDirect(
        activeTab,
        filters,
        exportFormat
      )
      return { success: true }
    },
    onSuccess: () => {
      toast.success('Report downloaded successfully')
      setShowExportDialog(false)
    },
    onError: (error) => {
      toast.error('Failed to download report')
      console.error('Export error:', error)
    }
  })

  // Schedule mutation
  const scheduleMutation = useMutation({
    mutationFn: async () => {
      return reportScheduler.createSchedule({
        type: activeTab,
        filters,
        ...scheduleForm,
        recipients: scheduleForm.recipients.filter(r => r.length > 0),
        createdBy: 'current_user'
      })
    },
    onSuccess: () => {
      toast.success('Schedule created successfully')
      setShowScheduleDialog(false)
    },
    onError: (error) => {
      toast.error('Failed to create schedule')
      console.error('Schedule error:', error)
    }
  })

  // Update filters
  const updateFilter = (key: keyof ReportFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  // Get column headers based on report type
  const getColumns = () => {
    switch (activeTab) {
      case 'SETTLEMENT_SUMMARY':
        return ['Cycle Date', 'Acquirer', 'Merchant', 'Gross Amount', 'Fees', 'GST', 'TDS', 'Net Amount', 'Txn Count']
      case 'BANK_MIS':
        return ['Txn ID', 'UTR', 'PG Amount', 'Bank Amount', 'Delta', 'PG Date', 'Bank Date', 'Status', 'Acquirer', 'Merchant']
      case 'RECON_OUTCOME':
        return ['Txn ID', 'PG Ref', 'Bank Ref', 'Amount', 'Status', 'Exception Type', 'Merchant', 'Acquirer', 'Payment Method']
      case 'TAX':
        return ['Cycle Date', 'Merchant', 'Gross Amount', 'Commission', 'GST Rate', 'GST Amount', 'TDS Rate', 'TDS Amount', 'Invoice']
      default:
        return []
    }
  }

  // Format cell value
  const formatCellValue = (value: any, column: string) => {
    if (value === null || value === undefined) return '-'
    
    // Format amounts
    if (column.toLowerCase().includes('amount') || column.toLowerCase().includes('fees') || 
        column.toLowerCase().includes('gst') || column.toLowerCase().includes('tds') ||
        column.toLowerCase().includes('commission') || column.toLowerCase().includes('delta')) {
      return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    
    // Format percentages
    if (column.toLowerCase().includes('rate')) {
      return `${value}%`
    }
    
    // Format status
    if (column === 'Status') {
      const statusColors: Record<string, string> = {
        'MATCHED': 'bg-green-100 text-green-800',
        'UNMATCHED': 'bg-yellow-100 text-yellow-800',
        'EXCEPTION': 'bg-red-100 text-red-800'
      }
      return <Badge className={statusColors[value] || ''}>{value}</Badge>
    }
    
    return value
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Finance Reports & MIS</h1>
          <p className="text-muted-foreground mt-1">Generate and export settlement reports with audit trails</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowScheduleDialog(true)}>
            <Clock className="h-4 w-4 mr-2" />
            Schedule Report
          </Button>
          <Button onClick={() => setShowExportDialog(true)}>
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Filters Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Report Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="cycleDate">Cycle Date</Label>
              <Input
                id="cycleDate"
                type="date"
                value={filters.cycleDate || ''}
                onChange={(e) => updateFilter('cycleDate', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fromDate">From Date</Label>
              <Input
                id="fromDate"
                type="date"
                value={filters.fromDate || ''}
                onChange={(e) => updateFilter('fromDate', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="toDate">To Date</Label>
              <Input
                id="toDate"
                type="date"
                value={filters.toDate || ''}
                onChange={(e) => updateFilter('toDate', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="acquirer">Acquirer</Label>
              <Select value={filters.acquirer || 'all'} onValueChange={(value) => updateFilter('acquirer', value === 'all' ? '' : value)}>
                <SelectTrigger id="acquirer">
                  <SelectValue placeholder="All Acquirers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Acquirers</SelectItem>
                  <SelectItem value="AXIS">AXIS</SelectItem>
                  <SelectItem value="HDFC">HDFC</SelectItem>
                  <SelectItem value="ICICI">ICICI</SelectItem>
                  <SelectItem value="BOB">BOB</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" onClick={() => refetch()}>
              Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ReportType)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="SETTLEMENT_SUMMARY">Settlement Summary</TabsTrigger>
          <TabsTrigger value="BANK_MIS">Bank MIS</TabsTrigger>
          <TabsTrigger value="RECON_OUTCOME">Recon Outcome</TabsTrigger>
          <TabsTrigger value="TAX">Tax Report</TabsTrigger>
        </TabsList>

        {/* Report Content */}
        <TabsContent value={activeTab} className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{activeTab.replace(/_/g, ' ')}</CardTitle>
              <CardDescription>
                {reportData?.rowCount || 0} records found
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {getColumns().map(column => (
                        <TableHead key={column}>{column}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={getColumns().length} className="text-center py-8">
                          Loading report data...
                        </TableCell>
                      </TableRow>
                    ) : reportData?.data?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={getColumns().length} className="text-center py-8">
                          No data available for selected filters
                        </TableCell>
                      </TableRow>
                    ) : (
                      reportData?.data?.slice(0, 10).map((row: any, idx: number) => (
                        <TableRow key={idx}>
                          {activeTab === 'SETTLEMENT_SUMMARY' && (
                            <>
                              <TableCell>{row.cycleDate}</TableCell>
                              <TableCell>{row.acquirer}</TableCell>
                              <TableCell>{row.merchantName}</TableCell>
                              <TableCell>{formatCellValue(row.grossAmountRupees, 'Gross Amount')}</TableCell>
                              <TableCell>{formatCellValue(row.feesRupees, 'Fees')}</TableCell>
                              <TableCell>{formatCellValue(row.gstRupees, 'GST')}</TableCell>
                              <TableCell>{formatCellValue(row.tdsRupees, 'TDS')}</TableCell>
                              <TableCell>{formatCellValue(row.netAmountRupees, 'Net Amount')}</TableCell>
                              <TableCell>{row.transactionCount}</TableCell>
                            </>
                          )}
                          {activeTab === 'BANK_MIS' && (
                            <>
                              <TableCell className="font-mono text-xs">{row.txnId}</TableCell>
                              <TableCell className="font-mono text-xs">{row.utr}</TableCell>
                              <TableCell>{formatCellValue(row.pgAmountRupees, 'PG Amount')}</TableCell>
                              <TableCell>{formatCellValue(row.bankAmountRupees, 'Bank Amount')}</TableCell>
                              <TableCell>{formatCellValue(row.deltaRupees, 'Delta')}</TableCell>
                              <TableCell>{row.pgDate}</TableCell>
                              <TableCell>{row.bankDate}</TableCell>
                              <TableCell>{formatCellValue(row.reconStatus, 'Status')}</TableCell>
                              <TableCell>{row.acquirer}</TableCell>
                              <TableCell>{row.merchantName}</TableCell>
                            </>
                          )}
                          {activeTab === 'RECON_OUTCOME' && (
                            <>
                              <TableCell className="font-mono text-xs">{row.txnId}</TableCell>
                              <TableCell className="font-mono text-xs">{row.pgRefId}</TableCell>
                              <TableCell className="font-mono text-xs">{row.bankRefId || '-'}</TableCell>
                              <TableCell>{formatCellValue(row.amountRupees, 'Amount')}</TableCell>
                              <TableCell>{formatCellValue(row.status, 'Status')}</TableCell>
                              <TableCell>{row.exceptionType || '-'}</TableCell>
                              <TableCell>{row.merchantName}</TableCell>
                              <TableCell>{row.acquirer}</TableCell>
                              <TableCell>{row.paymentMethod}</TableCell>
                            </>
                          )}
                          {activeTab === 'TAX' && (
                            <>
                              <TableCell>{row.cycleDate}</TableCell>
                              <TableCell>{row.merchantName}</TableCell>
                              <TableCell>{formatCellValue(row.grossAmountRupees, 'Gross Amount')}</TableCell>
                              <TableCell>{formatCellValue(row.commissionRupees, 'Commission')}</TableCell>
                              <TableCell>{formatCellValue(row.gstRatePct, 'GST Rate')}</TableCell>
                              <TableCell>{formatCellValue(row.gstAmountRupees, 'GST Amount')}</TableCell>
                              <TableCell>{formatCellValue(row.tdsRatePct, 'TDS Rate')}</TableCell>
                              <TableCell>{formatCellValue(row.tdsAmountRupees, 'TDS Amount')}</TableCell>
                              <TableCell className="font-mono text-xs">{row.invoiceNumber}</TableCell>
                            </>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {reportData?.data?.length > 10 && (
                <div className="mt-4 text-center text-sm text-muted-foreground">
                  Showing 10 of {reportData.rowCount} records. Export to view all.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Active Schedules */}
      {schedules && schedules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Active Schedules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {schedules.filter(s => s.isEnabled).map(schedule => (
                <div key={schedule.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{schedule.type.replace(/_/g, ' ')}</p>
                      <p className="text-sm text-muted-foreground">
                        {schedule.cadenceCron} • {schedule.format} • {schedule.delivery}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {schedule.lastRunStatus && (
                      <Badge variant={schedule.lastRunStatus === 'SUCCESS' ? 'default' : 'destructive'}>
                        {schedule.lastRunStatus}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reportScheduler.runScheduleNow(schedule.id)}
                    >
                      Run Now
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Report</DialogTitle>
            <DialogDescription>
              Choose export format and download the report
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Report Type</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {activeTab.replace(/_/g, ' ')}
              </p>
            </div>
            <div>
              <Label>Export Format</Label>
              <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ReportFormat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CSV">CSV</SelectItem>
                  <SelectItem value="XLSX">Excel (XLSX)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>• Report will include SHA256 signature for verification</p>
              <p>• Signed URL valid for 24 hours</p>
              <p>• Audit trail will be recorded</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
              {exportMutation.isPending ? 'Exporting...' : 'Export Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Schedule Report</DialogTitle>
            <DialogDescription>
              Set up automated report generation and delivery
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Report Type</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {activeTab.replace(/_/g, ' ')}
              </p>
            </div>
            <div>
              <Label>Schedule (Cron Expression)</Label>
              <Select 
                value={scheduleForm.cadenceCron} 
                onValueChange={(v) => setScheduleForm(prev => ({ ...prev, cadenceCron: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0 19 * * *">Daily at 7 PM IST</SelectItem>
                  <SelectItem value="0 9 * * 1">Weekly on Monday at 9 AM IST</SelectItem>
                  <SelectItem value="0 10 1 * *">Monthly on 1st at 10 AM IST</SelectItem>
                  <SelectItem value="0 18 * * 1-5">Weekdays at 6 PM IST</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Format</Label>
              <Select 
                value={scheduleForm.format} 
                onValueChange={(v) => setScheduleForm(prev => ({ ...prev, format: v as ReportFormat }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CSV">CSV</SelectItem>
                  <SelectItem value="XLSX">Excel (XLSX)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Delivery Method</Label>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={scheduleForm.delivery === 'EMAIL' || scheduleForm.delivery === 'BOTH'}
                    onCheckedChange={(checked) => {
                      if (checked && scheduleForm.delivery === 'S3') {
                        setScheduleForm(prev => ({ ...prev, delivery: 'BOTH' }))
                      } else if (!checked && scheduleForm.delivery === 'BOTH') {
                        setScheduleForm(prev => ({ ...prev, delivery: 'S3' }))
                      } else if (checked) {
                        setScheduleForm(prev => ({ ...prev, delivery: 'EMAIL' }))
                      }
                    }}
                  />
                  <Label className="flex items-center gap-1 cursor-pointer">
                    <Mail className="h-4 w-4" />
                    Email
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={scheduleForm.delivery === 'S3' || scheduleForm.delivery === 'BOTH'}
                    onCheckedChange={(checked) => {
                      if (checked && scheduleForm.delivery === 'EMAIL') {
                        setScheduleForm(prev => ({ ...prev, delivery: 'BOTH' }))
                      } else if (!checked && scheduleForm.delivery === 'BOTH') {
                        setScheduleForm(prev => ({ ...prev, delivery: 'EMAIL' }))
                      } else if (checked) {
                        setScheduleForm(prev => ({ ...prev, delivery: 'S3' }))
                      }
                    }}
                  />
                  <Label className="flex items-center gap-1 cursor-pointer">
                    <Cloud className="h-4 w-4" />
                    S3
                  </Label>
                </div>
              </div>
            </div>
            {(scheduleForm.delivery === 'EMAIL' || scheduleForm.delivery === 'BOTH') && (
              <div>
                <Label>Email Recipients</Label>
                <div className="space-y-2 mt-2">
                  {scheduleForm.recipients.map((email, idx) => (
                    <Input
                      key={idx}
                      type="email"
                      placeholder="email@example.com"
                      value={email}
                      onChange={(e) => {
                        const newRecipients = [...scheduleForm.recipients]
                        newRecipients[idx] = e.target.value
                        setScheduleForm(prev => ({ ...prev, recipients: newRecipients }))
                      }}
                    />
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setScheduleForm(prev => ({ 
                      ...prev, 
                      recipients: [...prev.recipients, ''] 
                    }))}
                  >
                    Add Recipient
                  </Button>
                </div>
              </div>
            )}
            {(scheduleForm.delivery === 'S3' || scheduleForm.delivery === 'BOTH') && (
              <div>
                <Label>S3 Prefix</Label>
                <Input
                  placeholder="reports/daily/"
                  value={scheduleForm.s3Prefix}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, s3Prefix: e.target.value }))}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => scheduleMutation.mutate()} disabled={scheduleMutation.isPending}>
              {scheduleMutation.isPending ? 'Creating...' : 'Create Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}