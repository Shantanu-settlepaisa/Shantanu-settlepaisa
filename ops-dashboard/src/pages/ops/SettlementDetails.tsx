import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatPaiseToINR, formatDateTime } from '@/lib/utils'
import { ArrowLeft, CheckCircle, Clock, AlertCircle, DollarSign, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default function SettlementDetails() {
  const { batchId } = useParams<{ batchId: string }>()
  const navigate = useNavigate()

  const { data: settlement, isLoading } = useQuery({
    queryKey: ['settlement', batchId],
    queryFn: async () => {
      const response = await fetch(`http://localhost:5108/api/settlements/${batchId}`)
      if (!response.ok) {
        if (response.status === 404) throw new Error('Settlement batch not found')
        throw new Error('Failed to fetch settlement details')
      }
      return response.json()
    },
    enabled: !!batchId,
  })

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
      PENDING_APPROVAL: { label: 'Pending Approval', variant: 'outline' },
      APPROVED: { label: 'Approved', variant: 'default' },
      TRANSFERRED: { label: 'Transferred', variant: 'default' },
      CREDITED: { label: 'Credited', variant: 'default' },
      FAILED: { label: 'Failed', variant: 'destructive' },
      ON_HOLD: { label: 'On Hold', variant: 'outline' },
      REJECTED: { label: 'Rejected', variant: 'destructive' },
    }
    const config = statusMap[status] || { label: status, variant: 'secondary' }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const getTransferStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
      PENDING: { label: 'Pending', variant: 'outline' },
      PROCESSING: { label: 'Processing', variant: 'secondary' },
      COMPLETED: { label: 'Completed', variant: 'default' },
      FAILED: { label: 'Failed', variant: 'destructive' },
    }
    const config = statusMap[status] || { label: status, variant: 'secondary' }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading settlement details...</p>
        </div>
      </div>
    )
  }

  if (!settlement) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Settlement not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/ops/settlements')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settlement Batch Details</h1>
            <p className="text-sm text-gray-500 mt-1">ID: {settlement.id}</p>
          </div>
        </div>
        <div>
          {getStatusBadge(settlement.status)}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Cycle Date</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{settlement.cycle_date}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{settlement.total_transactions}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Gross Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPaiseToINR(settlement.gross_amount_paise)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Net Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatPaiseToINR(settlement.net_amount_paise)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Financial Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Financial Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-500">Gross Amount</p>
              <p className="text-lg font-semibold mt-1">{formatPaiseToINR(settlement.gross_amount_paise)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Commission</p>
              <p className="text-lg font-semibold mt-1 text-red-600">-{formatPaiseToINR(settlement.total_commission_paise)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">GST on Commission</p>
              <p className="text-lg font-semibold mt-1 text-red-600">-{formatPaiseToINR(settlement.total_gst_paise)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Reserve/TDS</p>
              <p className="text-lg font-semibold mt-1 text-red-600">
                {settlement.total_reserve_paise ? `-${formatPaiseToINR(settlement.total_reserve_paise)}` : '₹0.00'}
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <p className="text-lg font-semibold">Net Settlement Amount</p>
              <p className="text-2xl font-bold text-green-600">{formatPaiseToINR(settlement.net_amount_paise)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bank Transfer Details */}
      {settlement.bank_transfer_id && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Bank Transfer Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-500">Transfer Status</p>
                <div className="mt-1">{getTransferStatusBadge(settlement.transfer_status)}</div>
              </div>
              {settlement.utr_number && (
                <div>
                  <p className="text-sm text-gray-500">UTR Number</p>
                  <p className="text-lg font-mono font-semibold mt-1">{settlement.utr_number}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500">Transfer Mode</p>
                <p className="text-lg font-semibold mt-1">{settlement.transfer_mode || 'NEFT'}</p>
              </div>
              {settlement.bank_account_number && (
                <div>
                  <p className="text-sm text-gray-500">Bank Account</p>
                  <p className="text-lg font-mono mt-1">{settlement.bank_account_number}</p>
                </div>
              )}
              {settlement.bank_ifsc_code && (
                <div>
                  <p className="text-sm text-gray-500">IFSC Code</p>
                  <p className="text-lg font-mono mt-1">{settlement.bank_ifsc_code}</p>
                </div>
              )}
              {settlement.bank_name && (
                <div>
                  <p className="text-sm text-gray-500">Bank Name</p>
                  <p className="text-lg mt-1">{settlement.bank_name}</p>
                </div>
              )}
              {settlement.verification_status && (
                <div>
                  <p className="text-sm text-gray-500">Verification Status</p>
                  <p className="text-lg font-semibold mt-1">{settlement.verification_status}</p>
                </div>
              )}
              {settlement.transfer_completed_at && (
                <div>
                  <p className="text-sm text-gray-500">Completed At</p>
                  <p className="text-sm mt-1">{formatDateTime(settlement.transfer_completed_at)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Merchant Bank Config */}
      {!settlement.bank_transfer_id && settlement.bank_account_number && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Merchant Bank Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-500">Account Number</p>
                <p className="text-lg font-mono mt-1">{settlement.bank_account_number}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Account Holder</p>
                <p className="text-lg mt-1">{settlement.bank_account_name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">IFSC Code</p>
                <p className="text-lg font-mono mt-1">{settlement.bank_ifsc_code}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Bank Name</p>
                <p className="text-lg mt-1">{settlement.bank_name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Branch</p>
                <p className="text-lg mt-1">{settlement.bank_branch || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Preferred Mode</p>
                <p className="text-lg mt-1">{settlement.preferred_transfer_mode || 'NEFT'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction Items */}
      {settlement.items && settlement.items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Transaction Breakdown ({settlement.items.length} transactions)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Payment Mode</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Reserve</TableHead>
                  <TableHead className="text-right">Net Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlement.items.map((item: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-sm">{item.transaction_id || 'N/A'}</TableCell>
                    <TableCell>{item.payment_mode || 'N/A'}</TableCell>
                    <TableCell className="text-right">{formatPaiseToINR(item.amount_paise)}</TableCell>
                    <TableCell className="text-right text-red-600">{formatPaiseToINR(item.commission_paise)}</TableCell>
                    <TableCell className="text-right text-red-600">{formatPaiseToINR(item.gst_paise)}</TableCell>
                    <TableCell className="text-right text-red-600">
                      {item.reserve_paise ? formatPaiseToINR(item.reserve_paise) : '₹0.00'}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatPaiseToINR(item.net_paise)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-600 mt-2"></div>
              <div>
                <p className="text-sm font-medium">Created</p>
                <p className="text-sm text-gray-600">{formatDateTime(settlement.created_at)}</p>
              </div>
            </div>
            {settlement.approved_at && (
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-green-600 mt-2"></div>
                <div>
                  <p className="text-sm font-medium">Approved</p>
                  <p className="text-sm text-gray-600">{formatDateTime(settlement.approved_at)}</p>
                </div>
              </div>
            )}
            {settlement.transfer_initiated_at && (
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-purple-600 mt-2"></div>
                <div>
                  <p className="text-sm font-medium">Transfer Initiated</p>
                  <p className="text-sm text-gray-600">{formatDateTime(settlement.transfer_initiated_at)}</p>
                </div>
              </div>
            )}
            {settlement.transfer_completed_at && (
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-green-600 mt-2"></div>
                <div>
                  <p className="text-sm font-medium">Transfer Completed</p>
                  <p className="text-sm text-gray-600">{formatDateTime(settlement.transfer_completed_at)}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}