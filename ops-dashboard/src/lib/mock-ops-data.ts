// Mock data generator for Ops Dashboard
export const mockOpsData = {
  getOverviewMetrics: () => ({
    matchedPercentage: 87,
    matchedCount: 12453,
    totalTransactions: 14312,
    matchedTrend: { value: 3.2, direction: 'up' as const },
    unmatchedValuePaise: 234500000, // ₹23.45L
    unmatchedCount: 1859,
    unmatchedTrend: { value: 1.5, direction: 'down' as const },
    openExceptions: 43,
    criticalExceptions: 7,
    exceptionTrend: { value: 5.1, direction: 'up' as const },
    settlementValuePaise: 8975600000, // ₹89.76L
    settlementTrend: { value: 12.3, direction: 'up' as const },
  }),

  getSettlementProgress: () => ({
    stages: [
      {
        name: 'Captured',
        status: 'completed' as const,
        count: 14312,
        valuePaise: 10234500000,
        percentage: 35,
      },
      {
        name: 'In Settlement',
        status: 'completed' as const,
        count: 12890,
        valuePaise: 9234500000,
        percentage: 30,
      },
      {
        name: 'Settled to Bank',
        status: 'active' as const,
        count: 10234,
        valuePaise: 8975600000,
        percentage: 25,
      },
      {
        name: 'Unsettled',
        status: 'pending' as const,
        count: 2078,
        valuePaise: 1258900000,
        percentage: 10,
      },
    ],
  }),

  getExceptionSnapshot: (limit: number) => {
    const exceptions = [
      {
        id: 'EXC-001',
        transactionId: 'TXN-2024-001234',
        type: 'refund_mismatch' as const,
        severity: 'critical' as const,
        aging: '3h 24m',
        status: 'investigating' as const,
        assignee: 'Rahul S',
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'EXC-002',
        settlementId: 'SET-2024-005678',
        type: 'fee_discrepancy' as const,
        severity: 'high' as const,
        aging: '5h 12m',
        status: 'new' as const,
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'EXC-003',
        transactionId: 'TXN-2024-002345',
        type: 'missing_txn' as const,
        severity: 'critical' as const,
        aging: '1h 45m',
        status: 'escalated' as const,
        assignee: 'Priya M',
        createdAt: new Date(Date.now() - 1.75 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'EXC-004',
        transactionId: 'TXN-2024-003456',
        type: 'duplicate' as const,
        severity: 'medium' as const,
        aging: '8h 30m',
        status: 'investigating' as const,
        assignee: 'Amit K',
        createdAt: new Date(Date.now() - 8.5 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'EXC-005',
        settlementId: 'SET-2024-006789',
        type: 'date_tolerance' as const,
        severity: 'low' as const,
        aging: '12h 15m',
        status: 'new' as const,
        createdAt: new Date(Date.now() - 12.25 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'EXC-006',
        transactionId: 'TXN-2024-004567',
        type: 'refund_mismatch' as const,
        severity: 'high' as const,
        aging: '2h 10m',
        status: 'investigating' as const,
        assignee: 'Neha P',
        createdAt: new Date(Date.now() - 2.17 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'EXC-007',
        transactionId: 'TXN-2024-005678',
        type: 'fee_discrepancy' as const,
        severity: 'critical' as const,
        aging: '45m',
        status: 'new' as const,
        createdAt: new Date(Date.now() - 0.75 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'EXC-008',
        settlementId: 'SET-2024-007890',
        type: 'missing_txn' as const,
        severity: 'high' as const,
        aging: '6h 50m',
        status: 'resolved' as const,
        assignee: 'Vikram T',
        createdAt: new Date(Date.now() - 6.83 * 60 * 60 * 1000).toISOString(),
      },
    ]
    return exceptions.slice(0, limit)
  },

  getDataSourcesStatus: () => [
    {
      id: 'ds-001',
      name: 'SabPaisa Gateway',
      type: 'pg' as const,
      status: 'connected' as const,
      lastSyncAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    },
    {
      id: 'ds-002',
      name: 'UPI Hub',
      type: 'pg' as const,
      status: 'connected' as const,
      lastSyncAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    },
    {
      id: 'ds-003',
      name: 'ICICI Bank Feed',
      type: 'bank' as const,
      status: 'degraded' as const,
      lastSyncAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      syncLag: 42,
      lastError: 'Connection timeout - retrying',
    },
    {
      id: 'ds-004',
      name: 'HDFC Bank Feed',
      type: 'bank' as const,
      status: 'connected' as const,
      lastSyncAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    },
    {
      id: 'ds-005',
      name: 'SAP ERP',
      type: 'erp' as const,
      status: 'error' as const,
      lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      lastError: 'Authentication failed',
    },
  ],

  getReconJobs: (params?: any) => {
    const jobs = [
      {
        id: 'job-001',
        merchantId: 'merch-001',
        merchantName: 'Flipkart',
        acquirer: 'ICICI Bank',
        cycleDate: '2024-01-09',
        status: 'matching' as const,
        fileCount: 3,
        lastUpdated: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        slaStatus: 'on_track' as const,
        matchedCount: 892,
        unmatchedCount: 45,
        exceptionCount: 12,
      },
      {
        id: 'job-002',
        merchantId: 'merch-002',
        merchantName: 'Amazon',
        acquirer: 'HDFC Bank',
        cycleDate: '2024-01-09',
        status: 'exceptions' as const,
        fileCount: 2,
        lastUpdated: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        slaStatus: 'at_risk' as const,
        matchedCount: 1234,
        unmatchedCount: 89,
        exceptionCount: 23,
      },
      {
        id: 'job-003',
        merchantId: 'merch-003',
        merchantName: 'Myntra',
        acquirer: 'Axis Bank',
        cycleDate: '2024-01-08',
        status: 'resolved' as const,
        fileCount: 4,
        lastUpdated: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        slaStatus: 'on_track' as const,
        matchedCount: 567,
        unmatchedCount: 12,
        exceptionCount: 0,
      },
      {
        id: 'job-004',
        merchantId: 'merch-004',
        merchantName: 'Swiggy',
        acquirer: 'SBI',
        cycleDate: '2024-01-09',
        status: 'awaiting_file' as const,
        fileCount: 0,
        lastUpdated: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        slaStatus: 'breached' as const,
      },
      {
        id: 'job-005',
        merchantId: 'merch-005',
        merchantName: 'Zomato',
        acquirer: 'Kotak Bank',
        cycleDate: '2024-01-09',
        status: 'normalized' as const,
        fileCount: 1,
        lastUpdated: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        slaStatus: 'on_track' as const,
      },
    ]
    
    // Apply filters if provided
    let filtered = jobs
    if (params?.status) {
      filtered = filtered.filter(j => j.status === params.status)
    }
    if (params?.acquirer) {
      filtered = filtered.filter(j => j.acquirer.includes(params.acquirer))
    }
    
    return {
      data: filtered,
      total: filtered.length,
      hasMore: false,
    }
  },

  uploadReconFile: (fileName: string) => ({
    success: true,
    fileId: `file-${Date.now()}`,
    message: `File ${fileName} uploaded successfully`,
  }),

  normalizeReconData: (jobId: string, dryRun: boolean) => {
    if (dryRun) {
      return {
        preview: [
          { field: 'transaction_id', value: 'TXN-2024-001234', status: 'valid' },
          { field: 'amount', value: '10000', status: 'valid' },
          { field: 'date', value: '2024-01-09', status: 'valid' },
          { field: 'status', value: 'SUCCESS', status: 'valid' },
          { field: 'utr', value: 'ICICI2024010912345', status: 'valid' },
        ],
        totalRows: 1234,
        validRows: 1230,
        invalidRows: 4,
      }
    }
    return {
      success: true,
      normalizedRows: 1230,
      failedRows: 4,
    }
  },

  matchReconData: (jobId: string) => ({
    matched: 892,
    unmatched: 45,
    varianceValuePaise: 125000,
    exceptionsCount: 12,
    confidence: 95.2,
  }),

  getTemplates: () => [
    {
      id: 'tmpl-001',
      name: 'ICICI CSV v1',
      acquirer: 'ICICI Bank',
      version: '1.0',
      mappings: {
        'Transaction ID': 'transaction_id',
        'Amount': 'amount',
        'Date': 'date',
        'Status': 'status',
        'UTR': 'utr',
        'Merchant Ref': 'merchant_ref',
      },
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-05T00:00:00Z',
    },
    {
      id: 'tmpl-002',
      name: 'BOB XLS v2',
      acquirer: 'Bank of Baroda',
      version: '2.0',
      mappings: {
        'TXN_ID': 'transaction_id',
        'AMT': 'amount',
        'TXN_DATE': 'date',
        'TXN_STATUS': 'status',
        'BANK_REF': 'utr',
      },
      transforms: {
        'amount': 'multiply:100', // Convert to paise
        'date': 'format:DD/MM/YYYY',
      },
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-06T00:00:00Z',
    },
  ],

  saveTemplate: (template: any) => ({
    success: true,
    templateId: `tmpl-${Date.now()}`,
  }),

  getSettlementDetails: (settlementId: string) => ({
    id: settlementId,
    cycleDate: '2024-01-09',
    merchantId: 'merch-001',
    merchantName: 'Flipkart',
    acquirer: 'ICICI Bank',
    status: 'posted',
    netAmountPaise: 8975600000,
    feePaise: 89756000,
    taxPaise: 16155000,
    gstPaise: 14364000,
    tdsPaise: 1791000,
    adjustmentsPaise: -234500,
    bankUtr: 'ICICI2024010987654',
    postedAt: '2024-01-09T14:30:00Z',
    reconJobId: 'job-001',
  }),

  getSettlementTransactions: (settlementId: string) => ({
    data: [
      {
        id: 'txn-001',
        transactionId: 'TXN-2024-001234',
        orderId: 'ORD-2024-001234',
        amountPaise: 125000,
        feePaise: 1250,
        taxPaise: 225,
        status: 'settled',
      },
      {
        id: 'txn-002',
        transactionId: 'TXN-2024-001235',
        orderId: 'ORD-2024-001235',
        amountPaise: 89000,
        feePaise: 890,
        taxPaise: 160,
        status: 'settled',
      },
    ],
    total: 892,
    hasMore: true,
  }),

  getSettlementVariances: (settlementId: string) => [
    {
      id: 'var-001',
      type: 'amount_mismatch',
      reason: 'Bank reported different amount',
      expectedPaise: 125000,
      actualPaise: 124500,
      deltaPaise: -500,
    },
  ],

  getExceptions: (filters?: any) => ({
    data: mockOpsData.getExceptionSnapshot(20),
    total: 43,
    hasMore: true,
  }),

  getAnalytics: (type: string, params?: any) => {
    const baseData = {
      settlementTrend: [
        { date: '2024-01-01', value: 7890000000 },
        { date: '2024-01-02', value: 8234000000 },
        { date: '2024-01-03', value: 8567000000 },
        { date: '2024-01-04', value: 8901000000 },
        { date: '2024-01-05', value: 9123000000 },
        { date: '2024-01-06', value: 8789000000 },
        { date: '2024-01-07', value: 8456000000 },
        { date: '2024-01-08', value: 8890000000 },
        { date: '2024-01-09', value: 8975600000 },
      ],
      methodMix: [
        { method: 'UPI', value: 45, count: 6432 },
        { method: 'Cards', value: 30, count: 4286 },
        { method: 'Net Banking', value: 20, count: 2857 },
        { method: 'Wallets', value: 5, count: 714 },
      ],
      feePercentage: [
        { date: '2024-01-01', value: 1.2 },
        { date: '2024-01-02', value: 1.1 },
        { date: '2024-01-03', value: 1.15 },
        { date: '2024-01-04', value: 1.18 },
        { date: '2024-01-05', value: 1.12 },
        { date: '2024-01-06', value: 1.14 },
        { date: '2024-01-07', value: 1.16 },
        { date: '2024-01-08', value: 1.13 },
        { date: '2024-01-09', value: 1.1 },
      ],
      exceptionRate: [
        { date: '2024-01-01', value: 0.8 },
        { date: '2024-01-02', value: 0.9 },
        { date: '2024-01-03', value: 1.1 },
        { date: '2024-01-04', value: 1.3 },
        { date: '2024-01-05', value: 1.0 },
        { date: '2024-01-06', value: 0.9 },
        { date: '2024-01-07', value: 1.2 },
        { date: '2024-01-08', value: 1.4 },
        { date: '2024-01-09', value: 1.3 },
      ],
    }
    
    return baseData[type as keyof typeof baseData] || []
  },

  getReportStatus: (reportId: string) => ({
    reportId,
    status: 'completed',
    downloadUrl: '/downloads/report.pdf',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }),
}