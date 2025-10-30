import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatPaiseToINR, formatDateTime } from '@/lib/utils'
import { RefreshCw, AlertCircle, CheckCircle, Clock, DollarSign, Eye } from 'lucide-react'
import { useState } from 'react'

interface SettlementBatch {
  id: string
  merchant_id: string
  merchant_name?: string
  cycle_date: string
  total_transactions: number
  gross_amount_paise: number
  total_commission_paise: number
  total_gst_paise: number
  net_amount_paise: number
  status: string
  created_at: string
  approved_at?: string
  bank_reference_number?: string
}

export default function Settlements() {
  const navigate = useNavigate()
  const [refreshKey, setRefreshKey] = useState(0)

  const { data: batches, isLoading, refetch } = useQuery<SettlementBatch[]>({
    queryKey: ['settlements', refreshKey],
    queryFn: async () => {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5108'
      const response = await fetch(`${API_BASE_URL}/api/settlements`)
      if (!response.ok) throw new Error('Failed to fetch settlements')
      return response.json()
    },
  })

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1)
    refetch()
  }

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
      PENDING_APPROVAL: { label: 'Pending Approval', variant: 'outline' },
      APPROVED: { label: 'Approved', variant: 'default' },
      QUEUED: { label: 'Queued', variant: 'secondary' },
      PROCESSING: { label: 'Processing', variant: 'secondary' },
      TRANSFERRED: { label: 'Transferred', variant: 'default' },
      CREDITED: { label: 'Credited', variant: 'default' },
      FAILED: { label: 'Failed', variant: 'destructive' },
      ON_HOLD: { label: 'On Hold', variant: 'outline' },
    }
    const config = statusMap[status] || { label: status, variant: 'secondary' }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return <AlertCircle className="h-5 w-5 text-yellow-600" />
      case 'APPROVED':
      case 'QUEUED':
        return <Clock className="h-5 w-5 text-blue-600" />
      case 'TRANSFERRED':
      case 'CREDITED':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'FAILED':
        return <AlertCircle className="h-5 w-5 text-red-600" />
      default:
        return <Clock className="h-5 w-5 text-gray-400" />
    }
  }

  const groupedBatches = {
    pending: batches?.filter(b => b.status === 'PENDING_APPROVAL') || [],
    approved: batches?.filter(b => ['APPROVED', 'QUEUED', 'PROCESSING'].includes(b.status)) || [],
    transferred: batches?.filter(b => b.status === 'TRANSFERRED') || [],
    credited: batches?.filter(b => b.status === 'CREDITED') || [],
    failed: batches?.filter(b => ['FAILED', 'ON_HOLD'].includes(b.status)) || [],
  }

  const renderBatchesTable = (batchList: SettlementBatch[]) => {
    if (batchList.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          No settlements in this category
        </div>
      )
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Merchant</TableHead>
            <TableHead>Cycle Date</TableHead>
            <TableHead className="text-right">Transactions</TableHead>
            <TableHead className="text-right">Net Amount</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batchList.map((batch) => (
            <TableRow key={batch.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {getStatusIcon(batch.status)}
                  {getStatusBadge(batch.status)}
                </div>
              </TableCell>
              <TableCell>
                <div>
                  <div className="font-medium">{batch.merchant_name || batch.merchant_id}</div>
                  <div className="text-xs text-gray-500">{batch.merchant_id}</div>
                </div>
              </TableCell>
              <TableCell>{batch.cycle_date}</TableCell>
              <TableCell className="text-right">{batch.total_transactions}</TableCell>
              <TableCell className="text-right font-semibold">
                {formatPaiseToINR(batch.net_amount_paise)}
              </TableCell>
              <TableCell className="text-sm text-gray-600">
                {formatDateTime(batch.created_at)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/ops/settlements/${batch.id}`)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  {batch.status === 'PENDING_APPROVAL' && (
                    <Button
                      size="sm"
                      onClick={() => navigate(`/ops/settlements/${batch.id}/approve`)}
                    >
                      Approve
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading settlements...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settlements</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage settlement batches and approvals
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Pending Approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{groupedBatches.pending.length}</div>
              <AlertCircle className="h-8 w-8 text-yellow-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {formatPaiseToINR(
                groupedBatches.pending.reduce((sum, b) => sum + Number(b.net_amount_paise), 0)
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Approved & Processing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{groupedBatches.approved.length}</div>
              <Clock className="h-8 w-8 text-blue-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {formatPaiseToINR(
                groupedBatches.approved.reduce((sum, b) => sum + Number(b.net_amount_paise), 0)
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Transferred
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{groupedBatches.transferred.length}</div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {formatPaiseToINR(
                groupedBatches.transferred.reduce((sum, b) => sum + Number(b.net_amount_paise), 0)
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Credited
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{groupedBatches.credited.length}</div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {formatPaiseToINR(
                groupedBatches.credited.reduce((sum, b) => sum + Number(b.net_amount_paise), 0)
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Failed/On Hold
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{groupedBatches.failed.length}</div>
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {formatPaiseToINR(
                groupedBatches.failed.reduce((sum, b) => sum + Number(b.net_amount_paise), 0)
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different status groups */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="pending">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="pending">
                Pending ({groupedBatches.pending.length})
              </TabsTrigger>
              <TabsTrigger value="approved">
                Approved ({groupedBatches.approved.length})
              </TabsTrigger>
              <TabsTrigger value="transferred">
                Transferred ({groupedBatches.transferred.length})
              </TabsTrigger>
              <TabsTrigger value="credited">
                Credited ({groupedBatches.credited.length})
              </TabsTrigger>
              <TabsTrigger value="failed">
                Failed ({groupedBatches.failed.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-4">
              {renderBatchesTable(groupedBatches.pending)}
            </TabsContent>

            <TabsContent value="approved" className="mt-4">
              {renderBatchesTable(groupedBatches.approved)}
            </TabsContent>

            <TabsContent value="transferred" className="mt-4">
              {renderBatchesTable(groupedBatches.transferred)}
            </TabsContent>

            <TabsContent value="credited" className="mt-4">
              {renderBatchesTable(groupedBatches.credited)}
            </TabsContent>

            <TabsContent value="failed" className="mt-4">
              {renderBatchesTable(groupedBatches.failed)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
