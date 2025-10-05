import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { 
  Calendar, 
  Download, 
  Clock, 
  Filter, 
  FileText, 
  Mail, 
  TrendingUp,
  DollarSign,
  CreditCard,
  AlertTriangle,
  PieChart,
  BarChart3,
  FileSpreadsheet,
  Loader2,
  CheckCircle,
  Send
} from 'lucide-react'
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

type ReportType = 'TRANSACTION' | 'SETTLEMENT' | 'DISPUTE' | 'TAX' | 'INVOICE'

interface ReportData {
  id?: string
  report_id?: string
  type?: ReportType
  report_type?: string
  name?: string
  report_name?: string
  description?: string
  report_description?: string
  generatedAt?: string
  generated_at?: string
  size?: string
  status: 'ready' | 'generating' | 'scheduled' | 'failed' | 'READY' | 'GENERATING'
  downloadUrl?: string
  format?: string
  row_count?: number
}

export default function MerchantReports() {
  const [activeTab, setActiveTab] = useState<ReportType>('TRANSACTION')
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  })
  const [selectedFormat, setSelectedFormat] = useState<'CSV' | 'XLSX' | 'PDF'>('CSV')
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)
  const [emailRecipients, setEmailRecipients] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedFrequency, setSelectedFrequency] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY')
  const [selectedTime, setSelectedTime] = useState('09:00')

  // Fetch available reports from real API
  const { data: reports, isLoading, refetch } = useQuery({
    queryKey: ['merchant-reports', activeTab],
    queryFn: async () => {
      const res = await fetch(`http://localhost:8080/v1/merchant/reports?merchant_id=MERCH001&report_type=${activeTab}`);
      const data = await res.json();
      return data.reports || [];
    },
    refetchInterval: 30000
  });

  // Mock data kept for reference (not used)
  const _getMockReports = (): Record<ReportType, ReportData[]> => {
    return {
        TRANSACTION: [
          {
            id: 'tr-001',
            type: 'TRANSACTION',
            name: 'Daily Transaction Report',
            description: 'All transactions for 14 Sep 2025',
            generatedAt: '2025-09-14T15:00:00Z',
            size: '2.4 MB',
            status: 'ready',
            downloadUrl: '#'
          },
          {
            id: 'tr-002',
            type: 'TRANSACTION',
            name: 'Weekly Transaction Summary',
            description: 'Week 37 (8-14 Sep 2025)',
            generatedAt: '2025-09-14T00:00:00Z',
            size: '5.8 MB',
            status: 'ready',
            downloadUrl: '#'
          },
          {
            id: 'tr-003',
            type: 'TRANSACTION',
            name: 'Failed Transactions Report',
            description: 'Failed and declined transactions',
            generatedAt: '2025-09-14T12:00:00Z',
            size: '856 KB',
            status: 'ready',
            downloadUrl: '#'
          }
        ],
        SETTLEMENT: [
          {
            id: 'st-001',
            type: 'SETTLEMENT',
            name: 'Settlement Report - Sep 2025',
            description: 'Monthly settlement summary',
            generatedAt: '2025-09-14T10:00:00Z',
            size: '1.2 MB',
            status: 'ready',
            downloadUrl: '#'
          },
          {
            id: 'st-002',
            type: 'SETTLEMENT',
            name: 'Instant Settlement Report',
            description: 'All instant settlements this month',
            generatedAt: '2025-09-14T08:00:00Z',
            size: '450 KB',
            status: 'ready',
            downloadUrl: '#'
          },
          {
            id: 'st-003',
            type: 'SETTLEMENT',
            name: 'Settlement Reconciliation',
            description: 'Detailed reconciliation report',
            status: 'generating'
          }
        ],
        DISPUTE: [
          {
            id: 'dp-001',
            type: 'DISPUTE',
            name: 'Chargeback Report',
            description: 'All chargebacks and disputes',
            generatedAt: '2025-09-14T09:00:00Z',
            size: '320 KB',
            status: 'ready',
            downloadUrl: '#'
          },
          {
            id: 'dp-002',
            type: 'DISPUTE',
            name: 'Won Disputes Summary',
            description: 'Successfully defended disputes',
            generatedAt: '2025-09-13T18:00:00Z',
            size: '180 KB',
            status: 'ready',
            downloadUrl: '#'
          }
        ],
        TAX: [
          {
            id: 'tx-001',
            type: 'TAX',
            name: 'GST Report - Aug 2025',
            description: 'GSTR-1 compatible format',
            generatedAt: '2025-09-01T00:00:00Z',
            size: '890 KB',
            status: 'ready',
            downloadUrl: '#'
          },
          {
            id: 'tx-002',
            type: 'TAX',
            name: 'TDS Certificate Q2 2025',
            description: 'Quarterly TDS certificate',
            generatedAt: '2025-07-01T00:00:00Z',
            size: '125 KB',
            status: 'ready',
            downloadUrl: '#'
          }
        ],
        INVOICE: [
          {
            id: 'in-001',
            type: 'INVOICE',
            name: 'Invoice - Sep 2025',
            description: 'Monthly service invoice',
            generatedAt: '2025-09-01T00:00:00Z',
            size: '95 KB',
            status: 'ready',
            downloadUrl: '#'
          },
          {
            id: 'in-002',
            type: 'INVOICE',
            name: 'Credit Note - Aug 2025',
            description: 'Refund and adjustment note',
            generatedAt: '2025-08-31T00:00:00Z',
            size: '78 KB',
            status: 'ready',
            downloadUrl: '#'
          }
        ]
      };
  };

  // Fetch stats from real API
  const { data: stats } = useQuery({
    queryKey: ['merchant-reports-stats'],
    queryFn: async () => {
      const res = await fetch('http://localhost:8080/v1/merchant/reports/stats?merchant_id=MERCH001');
      const data = await res.json();
      return data;
    },
    refetchInterval: 30000
  });

  // Scheduled reports from real API
  const { data: scheduledReports } = useQuery({
    queryKey: ['merchant-scheduled-reports'],
    queryFn: async () => {
      const res = await fetch('http://localhost:8080/v1/merchant/reports/scheduled?merchant_id=MERCH001');
      const data = await res.json();
      return data.scheduledReports || [];
    },
    refetchInterval: 60000
  });

  // Mock data (not used)
  const _scheduledMock = [
        {
          id: 'sch-001',
          reportType: 'Daily Transaction Report',
          schedule: 'Daily at 9:00 AM',
          format: 'CSV',
          delivery: 'Email',
          recipients: 'finance@merchant.com',
          lastRun: '2025-09-14T09:00:00Z',
          nextRun: '2025-09-15T09:00:00Z',
          status: 'active'
        },
        {
          id: 'sch-002',
          reportType: 'Weekly Settlement Summary',
          schedule: 'Every Monday at 10:00 AM',
          format: 'XLSX',
          delivery: 'Email + SFTP',
          recipients: 'accounts@merchant.com',
          lastRun: '2025-09-09T10:00:00Z',
          nextRun: '2025-09-16T10:00:00Z',
          status: 'active'
        },
        {
          id: 'sch-003',
          reportType: 'Monthly GST Report',
          schedule: '1st of every month',
          format: 'PDF',
          delivery: 'Email',
          recipients: 'tax@merchant.com',
          lastRun: '2025-09-01T00:00:00Z',
          nextRun: '2025-10-01T00:00:00Z',
          status: 'active'
        }
      ];

  const generateReport = async () => {
    setIsGenerating(true);
    
    try {
      const res = await fetch('http://localhost:8080/v1/merchant/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: 'MERCH001',
          report_type: activeTab,
          date_from: dateRange.from,
          date_to: dateRange.to,
          format: selectedFormat
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        // Download the report immediately
        window.location.href = `http://localhost:8080${data.download_url}?merchant_id=MERCH001`;
        toast.success(`Report generated with ${data.row_count} rows`);
        refetch();
      } else {
        toast.error('Failed to generate report');
      }
    } catch (error) {
      console.error('Generate report error:', error);
      toast.error('Failed to generate report');
    } finally {
      setIsGenerating(false);
    }
  }

  const generateReportContent = () => {
    // Generate sample data based on report type
    const headers = getReportHeaders()
    const rows = getReportRows()
    
    if (selectedFormat === 'CSV') {
      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    }
    
    // For XLSX/PDF, return structured data
    return { headers, rows }
  }

  const getReportHeaders = () => {
    const headerMap: Record<ReportType, string[]> = {
      TRANSACTION: ['Transaction ID', 'Date', 'Amount', 'Status', 'Payment Method', 'Customer', 'Settlement ID'],
      SETTLEMENT: ['Settlement ID', 'Date', 'Gross Amount', 'Fees', 'Tax', 'Net Amount', 'UTR', 'Status'],
      DISPUTE: ['Dispute ID', 'Transaction ID', 'Amount', 'Reason', 'Status', 'Created Date', 'Resolution'],
      TAX: ['Invoice No', 'Date', 'Taxable Amount', 'CGST', 'SGST', 'IGST', 'Total Tax', 'Total Amount'],
      INVOICE: ['Invoice No', 'Date', 'Description', 'Quantity', 'Rate', 'Amount', 'Tax', 'Total']
    }
    return headerMap[activeTab]
  }

  const getReportRows = () => {
    // Generate sample rows based on report type
    const rows = []
    for (let i = 0; i < 10; i++) {
      switch (activeTab) {
        case 'TRANSACTION':
          rows.push([
            `TXN${1000 + i}`,
            new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            `${(Math.random() * 10000).toFixed(2)}`,
            'Success',
            'UPI',
            `Customer${i}`,
            `SETTLE${100 + Math.floor(i / 3)}`
          ])
          break
        case 'SETTLEMENT':
          rows.push([
            `SETTLE${100 + i}`,
            new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            `${(Math.random() * 100000).toFixed(2)}`,
            `${(Math.random() * 1000).toFixed(2)}`,
            `${(Math.random() * 200).toFixed(2)}`,
            `${(Math.random() * 98000).toFixed(2)}`,
            `UTR${100000 + i}`,
            'Completed'
          ])
          break
        // Add other report types...
        default:
          rows.push([`Data${i}`, '...'])
      }
    }
    return rows
  }

  const downloadReport = (content: any, format: 'CSV' | 'XLSX' | 'PDF') => {
    let blob: Blob
    let filename: string
    
    if (format === 'CSV') {
      blob = new Blob([content], { type: 'text/csv' })
      filename = `${activeTab.toLowerCase()}_report_${dateRange.from}_to_${dateRange.to}.csv`
    } else if (format === 'XLSX') {
      // For XLSX, we'd normally use a library like xlsx
      // For now, download as CSV with .xlsx extension
      const csvContent = [content.headers.join(','), ...content.rows.map((r: any[]) => r.join(','))].join('\n')
      blob = new Blob([csvContent], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      filename = `${activeTab.toLowerCase()}_report_${dateRange.from}_to_${dateRange.to}.xlsx`
    } else {
      // For PDF, we'd normally use a library like jsPDF
      // For now, create a simple HTML representation
      const htmlContent = `
        <html>
          <head><title>Report</title></head>
          <body>
            <h1>${activeTab} Report</h1>
            <p>Date Range: ${dateRange.from} to ${dateRange.to}</p>
            <table border="1">
              <tr>${content.headers.map((h: string) => `<th>${h}</th>`).join('')}</tr>
              ${content.rows.map((row: any[]) => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
            </table>
          </body>
        </html>
      `
      blob = new Blob([htmlContent], { type: 'text/html' })
      filename = `${activeTab.toLowerCase()}_report_${dateRange.from}_to_${dateRange.to}.html`
    }
    
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const scheduleReport = async () => {
    if (!emailRecipients.trim()) {
      toast.error('Please enter at least one email recipient');
      return;
    }

    try {
      const res = await fetch('http://localhost:8080/v1/merchant/reports/scheduled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: 'MERCH001',
          report_type: activeTab,
          frequency: selectedFrequency,
          time: selectedTime,
          format: selectedFormat,
          email_recipients: emailRecipients.split(',').map(e => e.trim())
        })
      });

      const data = await res.json();

      if (data.success) {
        toast.success(`Report scheduled successfully! Next run: ${new Date(data.next_run_at).toLocaleString('en-IN')}`);
        // Refetch scheduled reports to update the table
        const scheduledQuery = document.querySelector('[data-query="merchant-scheduled-reports"]');
        if (scheduledQuery) {
          window.location.reload(); // Simple reload to refresh scheduled reports list
        }
      } else {
        toast.error('Failed to schedule report');
      }
    } catch (error) {
      console.error('Schedule report error:', error);
      toast.error('Failed to schedule report');
    }
    
    setShowScheduleDialog(false);
    setEmailRecipients('');
  }

  const getReportIcon = (type: ReportType) => {
    const icons = {
      TRANSACTION: CreditCard,
      SETTLEMENT: DollarSign,
      DISPUTE: AlertTriangle,
      TAX: FileText,
      INVOICE: FileSpreadsheet
    }
    return icons[type]
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Generate and download your business reports</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowScheduleDialog(true)}>
            <Clock className="w-4 h-4 mr-2" />
            Schedule Report
          </Button>
        </div>
      </div>

      {/* Quick Stats - Real Data from API */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Reports Generated</p>
                <p className="text-2xl font-bold">{stats?.reportsGenerated || 0}</p>
                <p className="text-xs text-green-600 mt-1">This month</p>
              </div>
              <FileText className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Scheduled Reports</p>
                <p className="text-2xl font-bold">{stats?.scheduledReports || 0}</p>
                <p className="text-xs text-gray-500 mt-1">Active</p>
              </div>
              <Clock className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Last Generated</p>
                <p className="text-lg font-bold">
                  {stats?.lastGenerated ? new Date(stats.lastGenerated.generated_at).toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'}) : 'N/A'}
                </p>
                <p className="text-xs text-gray-500 mt-1">{stats?.lastGenerated?.report_name || 'No reports yet'}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Email Recipients</p>
                <p className="text-2xl font-bold">{stats?.emailRecipients || 0}</p>
                <p className="text-xs text-gray-500 mt-1">Configured</p>
              </div>
              <Mail className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReportType)}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="TRANSACTION" className="flex items-center gap-1">
            <CreditCard className="w-4 h-4" />
            Transactions
          </TabsTrigger>
          <TabsTrigger value="SETTLEMENT" className="flex items-center gap-1">
            <DollarSign className="w-4 h-4" />
            Settlements
          </TabsTrigger>
          <TabsTrigger value="DISPUTE" className="flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            Disputes
          </TabsTrigger>
          <TabsTrigger value="TAX" className="flex items-center gap-1">
            <FileText className="w-4 h-4" />
            Tax
          </TabsTrigger>
          <TabsTrigger value="INVOICE" className="flex items-center gap-1">
            <FileSpreadsheet className="w-4 h-4" />
            Invoices
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          {/* Report Generation */}
          <Card>
            <CardHeader>
              <CardTitle>Generate New Report</CardTitle>
              <CardDescription>Configure and generate a new {activeTab.toLowerCase()} report</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>From Date</Label>
                  <Input 
                    type="date" 
                    value={dateRange.from}
                    onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                  />
                </div>
                <div>
                  <Label>To Date</Label>
                  <Input 
                    type="date" 
                    value={dateRange.to}
                    onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Format</Label>
                  <Select value={selectedFormat} onValueChange={(v: any) => setSelectedFormat(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CSV">CSV</SelectItem>
                      <SelectItem value="XLSX">Excel (XLSX)</SelectItem>
                      <SelectItem value="PDF">PDF</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button 
                    className="w-full" 
                    onClick={generateReport}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Generate Report
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Available Reports */}
          <Card>
            <CardHeader>
              <CardTitle>Available Reports</CardTitle>
              <CardDescription>Previously generated reports ready for download</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {isLoading ? (
                  <div className="text-center py-8 text-gray-500">
                    Loading reports...
                  </div>
                ) : reports?.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No reports available
                  </div>
                ) : (
                  reports?.map((report) => {
                    const reportType = (report.report_type || report.type) as ReportType
                    const Icon = getReportIcon(reportType)
                    const reportName = report.report_name || report.name || ''
                    const reportDesc = report.report_description || report.description || ''
                    const reportId = report.report_id || report.id || ''
                    const reportStatus = (report.status || 'ready').toLowerCase()
                    const generatedAt = report.generated_at || report.generatedAt
                    
                    return (
                      <div key={reportId} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                            <Icon className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium">{reportName}</p>
                            <p className="text-sm text-gray-500">{reportDesc}</p>
                            {generatedAt && (
                              <p className="text-xs text-gray-400 mt-1">
                                Generated {new Date(generatedAt).toLocaleString('en-IN')}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {report.size && (
                            <span className="text-sm text-gray-500">{report.size}</span>
                          )}
                          <Badge className={
                            reportStatus === 'ready' ? 'bg-green-100 text-green-800' :
                            reportStatus === 'generating' ? 'bg-yellow-100 text-yellow-800' :
                            reportStatus === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                            'bg-red-100 text-red-800'
                          }>
                            {reportStatus === 'generating' && (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            )}
                            {reportStatus}
                          </Badge>
                          {reportStatus === 'ready' && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                // Download the report using real API
                                window.location.href = `http://localhost:8080/v1/merchant/reports/${reportId}/download?merchant_id=MERCH001`;
                                toast.success(`Downloading ${reportName}`);
                              }}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Scheduled Reports */}
      <Card>
        <CardHeader>
          <CardTitle>Scheduled Reports</CardTitle>
          <CardDescription>Automatically generated and delivered reports</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report Type</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Recipients</TableHead>
                <TableHead>Next Run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scheduledReports?.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell className="font-medium">{schedule.reportType}</TableCell>
                  <TableCell>{schedule.schedule}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{schedule.format}</Badge>
                  </TableCell>
                  <TableCell>{schedule.delivery}</TableCell>
                  <TableCell className="max-w-[150px] truncate">{schedule.recipients}</TableCell>
                  <TableCell>
                    {new Date(schedule.nextRun).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-green-100 text-green-800">
                      {schedule.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost">Edit</Button>
                      <Button size="sm" variant="ghost">Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Report</DialogTitle>
            <DialogDescription>
              Set up automatic report generation and delivery
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Report Type</Label>
              <Select defaultValue={activeTab}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRANSACTION">Transaction Report</SelectItem>
                  <SelectItem value="SETTLEMENT">Settlement Report</SelectItem>
                  <SelectItem value="DISPUTE">Dispute Report</SelectItem>
                  <SelectItem value="TAX">Tax Report</SelectItem>
                  <SelectItem value="INVOICE">Invoice Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Frequency</Label>
              <Select value={selectedFrequency} onValueChange={(v: any) => setSelectedFrequency(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAILY">Daily</SelectItem>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Time (IST)</Label>
              <Input type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} />
            </div>
            
            <div>
              <Label>Format</Label>
              <Select defaultValue="CSV">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CSV">CSV</SelectItem>
                  <SelectItem value="XLSX">Excel (XLSX)</SelectItem>
                  <SelectItem value="PDF">PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Email Recipients</Label>
              <Input 
                placeholder="email1@example.com, email2@example.com"
                value={emailRecipients}
                onChange={(e) => setEmailRecipients(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">Separate multiple emails with commas</p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox id="sftp" />
              <label htmlFor="sftp" className="text-sm font-medium">
                Also deliver via SFTP
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={scheduleReport}>
              <Clock className="w-4 h-4 mr-2" />
              Schedule Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}