// UC-DISPUTES-0001: Merchant Disputes List Page
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Search, Download, Filter, AlertTriangle, Clock, 
  CheckCircle, XCircle, ChevronRight, ExternalLink,
  FileText, Shield
} from 'lucide-react'
import { merchantDisputesService } from '@/services/merchant-disputes-service'
import type { DisputeStatus, DisputeListFilters } from '@/types/merchant-disputes'
import { getStatusColor, formatDueDate, calculateDaysUntilDue } from '@/types/merchant-disputes'
import { format } from 'date-fns'
import { toast } from 'sonner'

export default function DisputesList() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<DisputeListFilters>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<DisputeStatus[]>([])

  // Fetch disputes
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['merchant-disputes', filters],
    queryFn: () => merchantDisputesService.getDisputes(filters),
    refetchInterval: 30000 // Refresh every 30 seconds
  })

  // Handle search
  const handleSearch = () => {
    setFilters(prev => ({ ...prev, searchQuery, cursor: undefined }))
  }

  // Handle status filter
  const handleStatusFilter = (status: string) => {
    if (status === 'all') {
      setSelectedStatuses([])
      setFilters(prev => ({ ...prev, status: undefined, cursor: undefined }))
    } else {
      const newStatuses = selectedStatuses.includes(status as DisputeStatus)
        ? selectedStatuses.filter(s => s !== status)
        : [...selectedStatuses, status as DisputeStatus]
      
      setSelectedStatuses(newStatuses)
      setFilters(prev => ({ 
        ...prev, 
        status: newStatuses.length > 0 ? newStatuses : undefined,
        cursor: undefined 
      }))
    }
  }

  // Export to CSV
  const handleExport = async () => {
    try {
      const csv = await merchantDisputesService.exportDisputes(filters)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `disputes_${format(new Date(), 'yyyy-MM-dd')}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Disputes exported successfully')
    } catch (error) {
      toast.error('Failed to export disputes')
    }
  }

  // Format currency
  const formatCurrency = (paise: bigint) => {
    const rupees = Number(paise) / 100
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(rupees)
  }

  // Check for urgent cases
  const urgentCases = data?.disputes.filter(d => {
    const days = calculateDaysUntilDue(d.evidenceDueAt)
    return days !== null && days <= 2 && d.status === 'EVIDENCE_REQUIRED'
  })

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Disputes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage chargebacks and upload evidence
          </p>
        </div>
        <Button onClick={handleExport} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Urgent Banner */}
      {urgentCases && urgentCases.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">
                {urgentCases.length} dispute{urgentCases.length > 1 ? 's' : ''} require{urgentCases.length === 1 ? 's' : ''} evidence within 48 hours
              </p>
              <p className="text-xs text-red-700 mt-1">
                Submit evidence to avoid automatic loss
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by Case Ref, Txn ID, RRN, or UTR"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch}>Search</Button>
          </div>

          {/* Status Filter */}
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={selectedStatuses.length === 0 ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => handleStatusFilter('all')}
            >
              All
            </Badge>
            <Badge
              variant={selectedStatuses.includes('OPEN') ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => handleStatusFilter('OPEN')}
            >
              Open
            </Badge>
            <Badge
              variant={selectedStatuses.includes('EVIDENCE_REQUIRED') ? 'destructive' : 'outline'}
              className="cursor-pointer"
              onClick={() => handleStatusFilter('EVIDENCE_REQUIRED')}
            >
              Evidence Required
            </Badge>
            <Badge
              variant={selectedStatuses.includes('SUBMITTED') ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => handleStatusFilter('SUBMITTED')}
            >
              Submitted
            </Badge>
            <Badge
              variant={selectedStatuses.includes('PENDING_BANK') ? 'secondary' : 'outline'}
              className="cursor-pointer"
              onClick={() => handleStatusFilter('PENDING_BANK')}
            >
              Pending Bank
            </Badge>
            <Badge
              variant={selectedStatuses.includes('WON') ? 'default' : 'outline'}
              className="cursor-pointer bg-green-100 text-green-800"
              onClick={() => handleStatusFilter('WON')}
            >
              Won
            </Badge>
            <Badge
              variant={selectedStatuses.includes('LOST') ? 'destructive' : 'outline'}
              className="cursor-pointer"
              onClick={() => handleStatusFilter('LOST')}
            >
              Lost
            </Badge>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">From Date</label>
              <Input
                type="date"
                onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">To Date</label>
              <Input
                type="date"
                onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Disputes Table */}
      <Card>
        <CardHeader>
          <CardTitle>Disputes</CardTitle>
          <CardDescription>
            {data?.total || 0} total disputes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : data?.disputes.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No disputes found</h3>
              <p className="text-sm text-gray-500">
                Your disputes will appear here when raised by banks
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => window.open('/help/disputes', '_blank')}
              >
                <FileText className="h-4 w-4 mr-2" />
                View Documentation
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Case Ref</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Txn ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Evidence Due</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Update</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data?.disputes.map(dispute => {
                    const daysUntilDue = calculateDaysUntilDue(dispute.evidenceDueAt)
                    const isUrgent = daysUntilDue !== null && daysUntilDue <= 2 && dispute.status === 'EVIDENCE_REQUIRED'
                    
                    return (
                      <tr key={dispute.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{dispute.caseRef}</div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                            onClick={() => toast.info(`Transaction: ${dispute.txnId}`)}
                          >
                            {dispute.txnId}
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{dispute.reasonCode}</div>
                            <div className="text-xs text-gray-500">{dispute.reasonDesc}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatCurrency(dispute.disputedAmountPaise)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={getStatusColor(dispute.status)}>
                            {dispute.status.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {dispute.evidenceDueAt ? (
                            <div className={isUrgent ? 'text-red-600 font-medium' : ''}>
                              <div className="text-sm">{formatDueDate(dispute.evidenceDueAt)}</div>
                              <div className="text-xs text-gray-500">
                                {format(new Date(dispute.evidenceDueAt), 'dd MMM yyyy')}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-500">
                            {format(new Date(dispute.lastUpdateAt), 'dd MMM yyyy')}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/merchant/disputes/${dispute.id}`)}
                            >
                              View
                            </Button>
                            {dispute.canUploadEvidence && (
                              <Button
                                size="sm"
                                variant={isUrgent ? 'destructive' : 'default'}
                                onClick={() => navigate(`/merchant/disputes/${dispute.id}#evidence`)}
                              >
                                Upload
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {data && data.hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={() => setFilters(prev => ({ ...prev, cursor: data.cursor }))}
              >
                Load More
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}