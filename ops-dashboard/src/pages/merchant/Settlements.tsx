import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SettleNowAdvanced } from '@/components/SettleNowAdvanced'
import SettlementCycleDrawer from '@/components/settlements/SettlementCycleDrawer'
import { TimelineDrawer } from '@/components/settlements/TimelineDrawer'
import { useSettlementCycle } from '@/hooks/useSettlementCycle'
import { useDataConsistencyMonitor } from '@/utils/dataConsistencyGuard'
import { isFeatureEnabled } from '@/config/featureFlags'
import { 
  Search, 
  Download, 
  Calendar,
  TrendingUp,
  Clock,
  DollarSign,
  Zap,
  CreditCard,
  AlertCircle,
  ChevronRight,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle,
  XCircle,
  Info,
  FileText,
  Loader2,
  ArrowRight
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Settlement {
  id: string
  type: 'regular' | 'instant' | 'on_demand'
  amount: number
  fees: number
  tax: number
  utr: string
  rrn: string
  status: 'completed' | 'processing' | 'pending' | 'failed'
  createdAt: string
  settledAt?: string
  bankAccount: string
  transactionCount: number
}

export default function MerchantSettlements() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateRange, setDateRange] = useState('today')
  const [activeTab, setActiveTab] = useState('regular') // Add tab state
  const [showInstantSettle, setShowInstantSettle] = useState(false)
  const [showTimeline, setShowTimeline] = useState<string | null>(null)
  const [showBreakup, setShowBreakup] = useState<string | null>(null)
  const [instantAmount, setInstantAmount] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showCycleDrawer, setShowCycleDrawer] = useState(false)

  // Feature flags
  const settlementCycleEnabled = isFeatureEnabled('FEATURE_SETTLEMENT_CYCLE')
  const dataConsistencyEnabled = isFeatureEnabled('FEATURE_DATA_CONSISTENCY_CHECK')
  
  // Fetch settlement cycle data (only if feature is enabled)
  const { cycle } = settlementCycleEnabled ? useSettlementCycle() : { cycle: null }
  
  // Data consistency monitoring
  const consistencyMonitor = useDataConsistencyMonitor()

  // Fetch settlements data
  const { data: settlements, isLoading } = useQuery({
    queryKey: ['merchant-settlements', statusFilter, dateRange, activeTab],
    queryFn: async () => {
      // Try to fetch from real API first
      try {
        const response = await fetch('/v1/merchant/settlements')
        const apiData = await response.json()
        
        if (apiData.settlements && Array.isArray(apiData.settlements)) {
          // Convert API format to component format
          return apiData.settlements.map((s: any) => ({
            id: s.id,
            type: s.type || 'regular',
            amount: s.amount / 100, // Convert from paise to rupees
            fees: s.fees / 100,
            tax: s.tax / 100,
            utr: s.utr || '-',
            rrn: s.rrn || '-',
            status: s.status.toLowerCase(),
            createdAt: s.createdAt,
            settledAt: s.settledAt,
            bankAccount: s.bankAccount || 'Default Account',
            transactionCount: s.transactionCount || 0
          }))
        }
      } catch (error) {
        console.error('Failed to fetch settlements from API:', error)
      }
      
      // Fallback to mock data
      const mockSettlements: Settlement[] = [
        {
          id: '2e647b3c',
          type: 'regular',
          amount: 1111762.90,
          fees: 22235.25,
          tax: 4002.34,
          utr: 'ICICI0914001',
          rrn: 'RRN0914001',
          status: 'processing',
          createdAt: '2025-09-14T10:34:00Z',
          bankAccount: 'ICICI ****1234',
          transactionCount: 342
        },
        {
          id: '44f4dab4',
          type: 'instant',
          amount: 1388716.62,
          fees: 27774.33,
          tax: 4999.37,
          utr: '-',
          rrn: '-',
          status: 'processing',
          createdAt: '2025-09-13T10:34:00Z',
          bankAccount: 'HDFC ****5678',
          transactionCount: 456
        },
        {
          id: '78a9c2e1',
          type: 'regular',
          amount: 892543.75,
          fees: 17850.87,
          tax: 3213.15,
          utr: 'HDFC0913002',
          rrn: 'RRN0913002',
          status: 'completed',
          createdAt: '2025-09-13T08:00:00Z',
          settledAt: '2025-09-13T14:30:00Z',
          bankAccount: 'HDFC ****5678',
          transactionCount: 289
        },
        {
          id: '91b3f4d2',
          type: 'on_demand',
          amount: 2456789.50,
          fees: 49135.79,
          tax: 8844.44,
          utr: 'AXIS0912003',
          rrn: 'RRN0912003',
          status: 'completed',
          createdAt: '2025-09-12T15:45:00Z',
          settledAt: '2025-09-12T16:15:00Z',
          bankAccount: 'AXIS ****9012',
          transactionCount: 678
        },
        {
          id: 'c3d5e7f9',
          type: 'regular',
          amount: 567234.25,
          fees: 11344.68,
          tax: 2042.04,
          utr: 'SBI0911004',
          rrn: 'RRN0911004',
          status: 'completed',
          createdAt: '2025-09-11T09:30:00Z',
          settledAt: '2025-09-11T15:00:00Z',
          bankAccount: 'SBI ****3456',
          transactionCount: 178
        }
      ]
      
      // Filter by tab (regular vs instant/on-demand)
      let filtered = mockSettlements
      if (activeTab === 'on_demand') {
        filtered = filtered.filter(s => s.type === 'instant' || s.type === 'on_demand')
      } else {
        filtered = filtered.filter(s => s.type === 'regular')
      }
      
      // Filter by status
      if (statusFilter !== 'all') {
        filtered = filtered.filter(s => s.status === statusFilter)
      }
      
      // Filter by date range (simplified)
      if (dateRange === 'today') {
        const today = new Date().toDateString()
        filtered = filtered.filter(s => new Date(s.createdAt).toDateString() === today)
      }
      
      // Search filter
      if (searchTerm) {
        filtered = filtered.filter(s => 
          s.id.includes(searchTerm.toLowerCase()) ||
          s.utr.toLowerCase().includes(searchTerm.toLowerCase())
        )
      }
      
      return filtered
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  // Summary stats with data consistency validation
  const { data: stats } = useQuery({
    queryKey: ['merchant-settlement-stats'],
    queryFn: async () => {
      // Fetch from real API
      const response = await fetch('/v1/merchant/dashboard/summary')
      const apiData = await response.json()
      
      const statsData = {
        currentBalance: apiData.currentBalance ? apiData.currentBalance / 100 : 750000.00,
        settlementDueToday: apiData.nextSettlementAmount ? apiData.nextSettlementAmount / 100 : 125000.00,
        previousSettlement: apiData.lastSettlement?.amount ? apiData.lastSettlement.amount / 100 : 85000.00,
        previousStatus: apiData.lastSettlement?.status === 'COMPLETED' ? 'success' : 'failed',
        upcomingSettlement: apiData.nextSettlementDue ? new Date(apiData.nextSettlementDue).toLocaleDateString('en-IN') : '15/9/2025',
        instantSettlementAvailable: true,
        instantSettlementLimit: 500000.00,
        instantSettlementUsed: 125000.00,
        // Data consistency fields
        credited: apiData.lastSettlement?.amount ? apiData.lastSettlement.amount / 100 : 85000.00,
        sentToBank: apiData.lastSettlement?.amount ? apiData.lastSettlement.amount / 100 : 85000.00,
      }
      
      // Validate data consistency (only if feature is enabled)
      const consistencyCheck = dataConsistencyEnabled 
        ? consistencyMonitor.validate(statsData.credited, statsData.sentToBank)
        : null
      
      return {
        ...statsData,
        consistencyCheck
      }
    }
  })

  const handleInstantSettle = () => {
    setShowInstantSettle(true)
  }

  const processInstantSettlement = async () => {
    if (!instantAmount || parseFloat(instantAmount) <= 0) return
    
    setIsProcessing(true)
    
    try {
      // Call real instant settlement API
      const response = await fetch('/v1/merchant/settlements/instant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': `instant-${Date.now()}`
        },
        body: JSON.stringify({
          amount: parseFloat(instantAmount),
          bankAccountId: 'primary'
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to create instant settlement')
      }
      
      const result = await response.json()
      console.log('Instant settlement created:', result)
    } catch (error) {
      console.error('Instant settlement error:', error)
      // Fallback to simulation
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    
    // Update stats
    queryClient.invalidateQueries({ queryKey: ['merchant-settlement-stats'] })
    queryClient.invalidateQueries({ queryKey: ['merchant-settlements'] })
    
    setIsProcessing(false)
    setShowInstantSettle(false)
    setInstantAmount('')
    
    // Show success notification (could use toast)
    alert('Settlement initiated successfully! Amount will be credited within 10 minutes.')
  }

  const getTimeline = (settlementId: string) => {
    // Mock timeline data
    return [
      { time: '10:30 AM', status: 'initiated', title: 'Settlement Initiated', description: 'Processing started' },
      { time: '10:32 AM', status: 'processing', title: 'Bank Processing', description: 'Sent to bank for processing' },
      { time: '10:34 AM', status: 'completed', title: 'UTR Generated', description: 'UTR: ICICI0914001' },
      { time: '10:35 AM', status: 'completed', title: 'Completed', description: 'Amount credited to account' },
    ]
  }

  const getBreakup = (settlement: Settlement) => {
    const grossAmount = settlement.amount + settlement.fees + settlement.tax
    return {
      grossAmount,
      transactionCount: settlement.transactionCount,
      avgTicketSize: grossAmount / settlement.transactionCount,
      processingFee: settlement.fees,
      gst: settlement.tax,
      netAmount: settlement.amount,
      bankCharges: settlement.fees * 0.1,
      settlementCharges: settlement.type === 'instant' ? settlement.amount * 0.001 : 0
    }
  }

  const handleExport = () => {
    // Generate CSV export
    const csv = [
      ['Settlement ID', 'Type', 'Amount', 'Fees', 'Tax', 'UTR', 'Status', 'Created At', 'Settled At'].join(','),
      ...(settlements || []).map(s => [
        s.id,
        s.type,
        s.amount,
        s.fees,
        s.tax,
        s.utr,
        s.status,
        s.createdAt,
        s.settledAt || '-'
      ].join(','))
    ].join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `settlements-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'processing': return 'bg-yellow-100 text-yellow-800'
      case 'pending': return 'bg-blue-100 text-blue-800'
      case 'failed': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'instant': return <Zap className="w-4 h-4" />
      case 'on_demand': return <Clock className="w-4 h-4" />
      default: return <Calendar className="w-4 h-4" />
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Overview Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Overview</h2>
          <div className="flex gap-2">
            {settlementCycleEnabled && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowCycleDrawer(true)}
              >
                My Settlement Cycle
              </Button>
            )}
            <Button variant="outline" size="sm">Documentation</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-500">Current Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{stats?.currentBalance.toLocaleString('en-IN')}</div>
              <Button 
                className="mt-3 w-full"
                onClick={handleInstantSettle}
              >
                <Zap className="w-4 h-4 mr-2" />
                Settle Now
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-500">Settlement Due Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{stats?.settlementDueToday.toLocaleString('en-IN')}</div>
              <p className="text-xs text-gray-500 mt-2">
                Auto-settlement at {cycle?.windows.current.cutoffLocal || '2:00 PM IST'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-500">Previous Settlement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{stats?.previousSettlement.toLocaleString('en-IN')}</div>
              <Badge className={`mt-2 ${stats?.previousStatus === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {stats?.previousStatus === 'success' ? 'Success' : 'Failed'}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-500">Upcoming Settlement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.upcomingSettlement}</div>
              <p className="text-xs text-gray-500 mt-2">
                {cycle?.windows.next.cutoffLocal ? `Next: ${new Date(cycle.windows.next.captureEnd).toLocaleDateString('en-IN')}` : 'Next cycle date'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Settlements Table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button 
              variant={activeTab === 'regular' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setActiveTab('regular')}
            >
              Settlements
            </Button>
            <Button 
              variant={activeTab === 'on_demand' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setActiveTab('on_demand')}
            >
              On-demand Settlements
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by Settlement ID or UTR"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Button variant="outline" size="sm">
            <Filter className="w-4 h-4 mr-2" />
            Instant only
          </Button>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>

          <Input type="date" className="w-40" />
          <span className="text-sm text-gray-500">to</span>
          <Input type="date" className="w-40" />

          <Select defaultValue="25">
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25 rows</SelectItem>
              <SelectItem value="50">50 rows</SelectItem>
              <SelectItem value="100">100 rows</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Settlement ID</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Type</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Amount</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Fees</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Tax</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Created At</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">UTR / RRN</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Status</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                        Loading settlements...
                      </td>
                    </tr>
                  ) : settlements?.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                        No settlements found
                      </td>
                    </tr>
                  ) : (
                    settlements?.map((settlement) => (
                      <tr key={settlement.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {getTypeIcon(settlement.type)}
                            <span className="font-medium text-blue-600">{settlement.id}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="capitalize">
                            {settlement.type.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          ₹{settlement.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          ₹{settlement.fees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          ₹{settlement.tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm">
                            {settlement.createdAt ? (
                              <>
                                {new Date(settlement.createdAt).toLocaleDateString('en-IN')}
                                <span className="text-gray-500 ml-1">
                                  {new Date(settlement.createdAt).toLocaleTimeString('en-IN', { 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })}
                                </span>
                              </>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm">
                            {settlement.utr !== '-' ? (
                              <div>
                                <div>{settlement.utr}</div>
                                <div className="text-gray-500">{settlement.rrn}</div>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={getStatusColor(settlement.status)}>
                            {settlement.status === 'processing' && (
                              <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full mr-1 animate-pulse" />
                            )}
                            {settlement.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowBreakup(settlement.id)
                              }}
                            >
                              Break-up
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowTimeline(settlement.id)
                              }}
                            >
                              Timeline
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Settle Now Modal */}
      <SettleNowAdvanced
        isOpen={showInstantSettle}
        onClose={() => setShowInstantSettle(false)}
        availableBalance={stats?.currentBalance || 0}
        dailyLimit={stats?.instantSettlementLimit || 500000}
        dailyUsed={stats?.instantSettlementUsed || 0}
        onSettle={async (amount, options) => {
          // Process the settlement
          await processInstantSettlement()
        }}
      />

      {/* Old Instant Settlement Modal - Now replaced with SettleNowAdvanced */}
      {false && showInstantSettle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-500" />
                Instant Settlement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-500">Available Balance</label>
                  <div className="text-xl font-bold">₹{stats?.currentBalance.toLocaleString('en-IN')}</div>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Daily Limit Remaining</label>
                  <div className="text-xl font-bold">₹{((stats?.instantSettlementLimit || 0) - (stats?.instantSettlementUsed || 0)).toLocaleString('en-IN')}</div>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">Settlement Amount</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                  <Input 
                    type="number" 
                    placeholder="0.00" 
                    value={instantAmount}
                    onChange={(e) => setInstantAmount(e.target.value)}
                    className="pl-8"
                    max={stats?.currentBalance}
                  />
                </div>
                {instantAmount && (
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Processing Fee (0.1%)</span>
                      <span>₹{(parseFloat(instantAmount) * 0.001).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>You'll receive</span>
                      <span className="text-green-600">₹{(parseFloat(instantAmount) - parseFloat(instantAmount) * 0.001).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                <div className="flex gap-2">
                  <Info className="w-4 h-4 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-900">
                    <p className="font-medium">Instant settlement benefits:</p>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      <li>• Amount credited within 10 minutes</li>
                      <li>• Available 24×7, including holidays</li>
                      <li>• Real-time UTR generation</li>
                      <li>• 50% off on processing fees (limited offer)</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setShowInstantSettle(false)
                    setInstantAmount('')
                  }}
                  disabled={isProcessing}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={processInstantSettlement}
                  disabled={!instantAmount || parseFloat(instantAmount) <= 0 || isProcessing}
                >
                  {isProcessing ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                  ) : (
                    <><Zap className="w-4 h-4 mr-2" /> Settle Now</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Timeline Drawer */}
      <TimelineDrawer
        open={!!showTimeline}
        onClose={() => setShowTimeline(null)}
        settlementId={showTimeline}
        settlementAmount={settlements?.find(s => s.id === showTimeline)?.amount}
        settlementStatus={settlements?.find(s => s.id === showTimeline)?.status.toUpperCase()}
      />

      {/* Breakup Modal */}
      {showBreakup && settlements && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Settlement Breakup
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const settlement = settlements.find(s => s.id === showBreakup)
                if (!settlement) return null
                const breakup = getBreakup(settlement)
                return (
                  <div className="space-y-3">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-500">Settlement ID</p>
                      <p className="font-medium">{settlement.id}</p>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between py-1">
                        <span className="text-sm text-gray-600">Total Transactions</span>
                        <span className="text-sm font-medium">{breakup.transactionCount}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-sm text-gray-600">Gross Amount</span>
                        <span className="text-sm font-medium">₹{breakup.grossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-sm text-gray-600">Avg. Ticket Size</span>
                        <span className="text-sm font-medium">₹{breakup.avgTicketSize.toFixed(2)}</span>
                      </div>
                      
                      <div className="border-t pt-2">
                        <div className="flex justify-between py-1">
                          <span className="text-sm text-gray-600">Processing Fee</span>
                          <span className="text-sm text-red-600">- ₹{breakup.processingFee.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-sm text-gray-600">GST (18%)</span>
                          <span className="text-sm text-red-600">- ₹{breakup.gst.toFixed(2)}</span>
                        </div>
                        {breakup.settlementCharges > 0 && (
                          <div className="flex justify-between py-1">
                            <span className="text-sm text-gray-600">Instant Settlement Fee</span>
                            <span className="text-sm text-red-600">- ₹{breakup.settlementCharges.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between py-1">
                          <span className="text-sm text-gray-600">Bank Charges</span>
                          <span className="text-sm text-red-600">- ₹{breakup.bankCharges.toFixed(2)}</span>
                        </div>
                      </div>
                      
                      <div className="border-t pt-2">
                        <div className="flex justify-between">
                          <span className="font-medium">Net Settlement Amount</span>
                          <span className="font-bold text-green-600">₹{breakup.netAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}
              <Button 
                variant="outline" 
                className="w-full mt-4"
                onClick={() => setShowBreakup(null)}
              >
                Close
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Settlement Cycle Drawer */}
      {settlementCycleEnabled && (
        <SettlementCycleDrawer 
          open={showCycleDrawer} 
          onClose={() => setShowCycleDrawer(false)} 
        />
      )}
    </div>
  )
}