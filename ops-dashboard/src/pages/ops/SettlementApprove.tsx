import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatPaiseToINR, formatDateTime } from '@/lib/utils'
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Pause,
  Download,
  AlertCircle,
  Info,
  Building,
  CreditCard,
  FileText,
} from 'lucide-react'

interface SettlementBatchDetails {
  id: string
  merchant_id: string
  merchant_name?: string
  cycle_date: string
  total_transactions: number
  gross_amount_paise: number
  total_commission_paise: number
  total_gst_paise: number
  total_reserve_paise?: number
  net_amount_paise: number
  status: string
  created_at: string
  approved_at?: string
  bank_account_number?: string
  bank_ifsc_code?: string
  bank_account_name?: string
  bank_name?: string
  preferred_transfer_mode?: string
  items?: Array<{
    transaction_id: string
    amount_paise: number
    commission_paise: number
    gst_paise: number
    net_paise: number
    payment_mode?: string
  }>
}

export default function SettlementApprove() {
  const { batchId } = useParams<{ batchId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [approvalNotes, setApprovalNotes] = useState('')

  const { data: batch, isLoading } = useQuery<SettlementBatchDetails>({
    queryKey: ['settlement-details', batchId],
    queryFn: async () => {
      const API_BASE_URL = import.meta.env.VITE_OVERVIEW_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:5108'
      const response = await fetch(`${API_BASE_URL}/api/settlements/${batchId}`)
      if (!response.ok) throw new Error('Failed to fetch settlement details')
      const data = await response.json()
      return data.batch || data // Handle both { batch } and direct batch responses
    },
    enabled: !!batchId,
  })

  const approveMutation = useMutation({
    mutationFn: async (decision: 'approved' | 'rejected' | 'on_hold') => {
      const API_BASE_URL = import.meta.env.VITE_OVERVIEW_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:5108'
      const response = await fetch(`${API_BASE_URL}/api/settlements/${batchId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          notes: approvalNotes,
          approver_id: 'OPS_USER_001', // TODO: Get from auth context
          approver_name: 'Ops User', // TODO: Get from auth context
          approver_role: 'ops_manager',
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to process approval')
      }
      return response.json()
    },
    onSuccess: (_, decision) => {
      queryClient.invalidateQueries({ queryKey: ['settlements'] })
      queryClient.invalidateQueries({ queryKey: ['settlement-details', batchId] })

      const message = decision === 'approved'
        ? 'Settlement approved successfully!'
        : decision === 'rejected'
        ? 'Settlement rejected'
        : 'Settlement put on hold'

      alert(message)
      navigate('/ops/settlements')
    },
    onError: (error) => {
      alert(`Error: ${error.message}`)
    },
  })

  const handleApprove = () => {
    if (window.confirm('Are you sure you want to approve this settlement? This will queue it for bank transfer.')) {
      approveMutation.mutate('approved')
    }
  }

  const handleReject = () => {
    if (!approvalNotes.trim()) {
      alert('Please provide a reason for rejection in the notes')
      return
    }
    if (window.confirm('Are you sure you want to reject this settlement?')) {
      approveMutation.mutate('rejected')
    }
  }

  const handleHold = () => {
    if (!approvalNotes.trim()) {
      alert('Please provide a reason for putting on hold in the notes')
      return
    }
    if (window.confirm('Are you sure you want to put this settlement on hold?')) {
      approveMutation.mutate('on_hold')
    }
  }

  const handleDownloadCSV = () => {
    if (!batch || !batch.items) return

    const headers = ['Transaction ID', 'Amount', 'Commission', 'GST', 'Net Amount', 'Payment Mode']
    const rows = batch.items.map(item => [
      item.transaction_id,
      (item.amount_paise / 100).toFixed(2),
      (item.commission_paise / 100).toFixed(2),
      (item.gst_paise / 100).toFixed(2),
      (item.net_paise / 100).toFixed(2),
      item.payment_mode || 'N/A',
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `settlement_${batchId}_transactions.csv`
    a.click()
    window.URL.revokeObjectURL(url)
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

  if (!batch) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Settlement batch not found</p>
        </div>
      </div>
    )
  }

  const canApprove = batch.status === 'PENDING_APPROVAL'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={() => navigate('/ops/settlements')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Settlements
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Settlement Approval</h1>
          <p className="text-sm text-gray-500">Review and approve settlement batch</p>
        </div>
        <Badge variant={canApprove ? 'outline' : 'secondary'}>
          {batch.status.replace(/_/g, ' ')}
        </Badge>
      </div>

      {/* Alert if already processed */}
      {!canApprove && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900">
              This settlement has already been processed
            </p>
            <p className="text-sm text-blue-700 mt-1">
              Status: {batch.status.replace(/_/g, ' ')}
              {batch.approved_at && ` • Approved at: ${formatDateTime(batch.approved_at)}`}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Batch Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Batch Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Batch ID</p>
                  <p className="text-sm text-gray-900 font-mono">{batch.id}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Merchant</p>
                  <p className="text-sm text-gray-900 font-medium">
                    {batch.merchant_name || batch.merchant_id}
                  </p>
                  <p className="text-xs text-gray-500">{batch.merchant_id}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Cycle Date</p>
                  <p className="text-sm text-gray-900">{batch.cycle_date}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Created At</p>
                  <p className="text-sm text-gray-900">{formatDateTime(batch.created_at)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Financial Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Financial Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-sm text-gray-600">Transactions</span>
                  <span className="font-medium">{batch.total_transactions}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-sm text-gray-600">Gross Amount</span>
                  <span className="font-medium">{formatPaiseToINR(batch.gross_amount_paise)}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-sm text-gray-600">Commission</span>
                  <span className="text-red-600">- {formatPaiseToINR(batch.total_commission_paise)}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-sm text-gray-600">GST (18%)</span>
                  <span className="text-red-600">- {formatPaiseToINR(batch.total_gst_paise)}</span>
                </div>
                {batch.total_reserve_paise && batch.total_reserve_paise > 0 && (
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm text-gray-600">Rolling Reserve</span>
                    <span className="text-red-600">- {formatPaiseToINR(batch.total_reserve_paise)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 text-lg">
                  <span className="font-semibold">Net Payout</span>
                  <span className="font-bold text-green-600">{formatPaiseToINR(batch.net_amount_paise)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bank Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Bank Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              {batch.bank_account_number ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Beneficiary Name</p>
                    <p className="text-sm text-gray-900">{batch.bank_account_name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Account Number</p>
                    <p className="text-sm text-gray-900 font-mono">{batch.bank_account_number}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">IFSC Code</p>
                    <p className="text-sm text-gray-900 font-mono">{batch.bank_ifsc_code}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Bank Name</p>
                    <p className="text-sm text-gray-900">{batch.bank_name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Transfer Mode</p>
                    <p className="text-sm text-gray-900">{batch.preferred_transfer_mode || 'NEFT'}</p>
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-900">Bank details not configured</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      Please configure merchant bank details before approving
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Transactions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Transactions ({batch.items?.length || 0})</CardTitle>
                <Button variant="outline" size="sm" onClick={handleDownloadCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  Download CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {batch.items && batch.items.length > 0 ? (
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Transaction ID</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Commission</TableHead>
                        <TableHead className="text-right">GST</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batch.items.map((item) => (
                        <TableRow key={item.transaction_id}>
                          <TableCell className="font-mono text-xs">{item.transaction_id}</TableCell>
                          <TableCell className="text-right">{formatPaiseToINR(item.amount_paise)}</TableCell>
                          <TableCell className="text-right text-red-600">
                            {formatPaiseToINR(item.commission_paise)}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {formatPaiseToINR(item.gst_paise)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatPaiseToINR(item.net_paise)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-center text-gray-500 py-4">No transaction details available</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - 1/3 width */}
        <div className="space-y-6">
          {/* Approval Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Approval Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="notes">Notes / Comments</Label>
                <Textarea
                  id="notes"
                  placeholder="Enter approval notes, rejection reason, or comments..."
                  className="mt-2 min-h-32"
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  disabled={!canApprove}
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          {canApprove && (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full"
                  onClick={handleApprove}
                  disabled={approveMutation.isPending || !batch.bank_account_number}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve & Queue for Payout
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleHold}
                  disabled={approveMutation.isPending}
                >
                  <Pause className="h-4 w-4 mr-2" />
                  Put on Hold
                </Button>

                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={handleReject}
                  disabled={approveMutation.isPending}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject Settlement
                </Button>

                {!batch.bank_account_number && (
                  <p className="text-xs text-red-600 mt-2">
                    * Bank details required to approve
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
