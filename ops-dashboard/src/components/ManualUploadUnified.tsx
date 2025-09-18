import { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  FileUp,
  X,
  CheckCircle,
  AlertCircle,
  Play,
  Download,
  ChevronDown,
  Settings,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { formatIndianCurrency } from '@/lib/utils';
import { Link } from 'react-router-dom';

// Reason chip component
function ReasonChip({ reasonCode, reasonDetail }: { reasonCode: string; reasonDetail?: string }) {
  const REASON_COLORS = {
    BANK_FILE_MISSING: 'bg-red-100 text-red-800 border-red-200',
    PG_TXN_MISSING_IN_BANK: 'bg-orange-100 text-orange-800 border-orange-200',
    BANK_TXN_MISSING_IN_PG: 'bg-orange-100 text-orange-800 border-orange-200',
    UTR_MISSING_OR_INVALID: 'bg-red-100 text-red-800 border-red-200',
    DATE_OUT_OF_WINDOW: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    AMOUNT_MISMATCH: 'bg-amber-100 text-amber-800 border-amber-200',
    STATUS_MISMATCH: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    DUPLICATE_BANK_ENTRY: 'bg-purple-100 text-purple-800 border-purple-200',
    DUPLICATE_PG_ENTRY: 'bg-purple-100 text-purple-800 border-purple-200',
    CURRENCY_MISMATCH: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    SCHEME_OR_MID_MISMATCH: 'bg-blue-100 text-blue-800 border-blue-200',
    FEES_VARIANCE: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    PARTIAL_CAPTURE_OR_REFUND_PENDING: 'bg-teal-100 text-teal-800 border-teal-200',
    SPLIT_SETTLEMENT_UNALLOCATED: 'bg-gray-100 text-gray-800 border-gray-200'
  };

  const REASON_LABELS = {
    BANK_FILE_MISSING: 'Bank File Missing',
    PG_TXN_MISSING_IN_BANK: 'Missing in Bank',
    BANK_TXN_MISSING_IN_PG: 'Missing in PG',
    UTR_MISSING_OR_INVALID: 'Invalid UTR',
    DATE_OUT_OF_WINDOW: 'Date Mismatch',
    AMOUNT_MISMATCH: 'Amount Mismatch',
    STATUS_MISMATCH: 'Status Mismatch',
    DUPLICATE_BANK_ENTRY: 'Duplicate Bank',
    DUPLICATE_PG_ENTRY: 'Duplicate PG',
    CURRENCY_MISMATCH: 'Currency Issue',
    SCHEME_OR_MID_MISMATCH: 'MID Mismatch',
    FEES_VARIANCE: 'Fee Variance',
    PARTIAL_CAPTURE_OR_REFUND_PENDING: 'Partial/Refund',
    SPLIT_SETTLEMENT_UNALLOCATED: 'Split Settlement'
  };

  const colorClass = REASON_COLORS[reasonCode] || 'bg-gray-100 text-gray-800 border-gray-200';
  const label = REASON_LABELS[reasonCode] || reasonCode;

  return (
    <div className="relative group">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>
        {label}
      </span>
      {reasonDetail && (
        <div className="absolute z-10 invisible group-hover:visible bg-gray-800 text-white text-xs rounded-lg p-2 mt-1 max-w-xs">
          {reasonDetail}
          <div className="absolute -top-1 left-4 w-2 h-2 bg-gray-800 transform rotate-45"></div>
        </div>
      )}
    </div>
  );
}

export function ManualUploadUnified() {
  const [pgFiles, setPgFiles] = useState<File[]>([]);
  const [bankFiles, setBankFiles] = useState<File[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('auto-detect');
  const [reconResults, setReconResults] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'matched' | 'unmatched' | 'exceptions'>('matched');
  const [exportFormat, setExportFormat] = useState<'csv' | 'excel'>('csv');

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      pgFiles.forEach(file => formData.append('pgFiles', file));
      bankFiles.forEach(file => formData.append('bankFiles', file));
      formData.append('cycleDate', new Date().toISOString().split('T')[0]);
      formData.append('template', selectedTemplate);

      const response = await fetch('http://localhost:5103/ops/recon/manual/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Upload failed');
      return response.json();
    },
    onSuccess: async (data) => {
      toast.success('Reconciliation completed', {
        description: `Match rate: ${data.summary.matchRate}%`
      });
      
      // Fetch detailed results
      const response = await fetch(`http://localhost:5103/api/reconcile/${data.resultId}`);
      const results = await response.json();
      setReconResults(results);
    },
    onError: (error: any) => {
      toast.error('Reconciliation failed', {
        description: error.message
      });
    }
  });

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent, type: 'pg' | 'bank') => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    
    if (type === 'pg') {
      setPgFiles(prev => [...prev, ...files]);
    } else {
      setBankFiles(prev => [...prev, ...files]);
    }
  }, []);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'pg' | 'bank') => {
    const files = Array.from(e.target.files || []);
    
    if (type === 'pg') {
      setPgFiles(prev => [...prev, ...files]);
    } else {
      setBankFiles(prev => [...prev, ...files]);
    }
  };

  // Remove file
  const removeFile = (index: number, type: 'pg' | 'bank') => {
    if (type === 'pg') {
      setPgFiles(prev => prev.filter((_, i) => i !== index));
    } else {
      setBankFiles(prev => prev.filter((_, i) => i !== index));
    }
  };

  // Export results
  const handleExport = async () => {
    if (!reconResults) return;

    const data = activeTab === 'matched' ? reconResults.matched :
                 activeTab === 'unmatched' ? reconResults.unmatched :
                 reconResults.exceptions;

    // Create CSV content
    let csvContent = '';
    if (activeTab === 'matched') {
      csvContent = 'Transaction ID,UTR,Amount,Confidence,Match Tier\n';
      data.forEach((item: any) => {
        csvContent += `${item.pgTransaction.transaction_id},${item.pgTransaction.utr},${item.pgTransaction.amount/100},${item.confidence},${item.matchTier}\n`;
      });
    } else {
      csvContent = 'Type,Transaction ID,UTR,Amount,Reason,Detail\n';
      data.forEach((item: any) => {
        const txn = item.transaction || item.pgTransaction || item.bankRecord;
        csvContent += `${item.type},${txn.transaction_id || txn.TRANSACTION_ID},${txn.utr || txn.UTR},${(item.amount || 0)/100},${item.reasonCode},${item.reasonDetail}\n`;
      });
    }

    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reconciliation_${activeTab}_${new Date().toISOString().split('T')[0]}.${exportFormat}`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success('Export completed');
  };

  const canRunReconciliation = pgFiles.length > 0 && bankFiles.length > 0;

  return (
    <div className="space-y-6">
      {/* Header with Recon Config CTA */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Manual Upload</h2>
          <p className="text-sm text-gray-500 mt-1">
            Bank file format is auto-detected and normalized via your saved mappings
          </p>
        </div>
        <Link
          to="/ops/recon/config"
          className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
        >
          <Settings className="w-4 h-4 mr-2" />
          Recon Config
        </Link>
      </div>

      {/* Upload Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PG Transactions Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">PG Transactions</h3>
            
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors"
              onDrop={(e) => handleDrop(e, 'pg')}
              onDragOver={(e) => e.preventDefault()}
            >
              <FileUp className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600 mb-2">
                Drag and drop files here, or click to browse
              </p>
              <input
                type="file"
                multiple
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleFileSelect(e, 'pg')}
                className="hidden"
                id="pg-file-input"
              />
              <label
                htmlFor="pg-file-input"
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
              >
                Choose Files
              </label>
            </div>

            {/* Selected Files */}
            {pgFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                {pgFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex items-center">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                      <span className="text-sm text-gray-700">{file.name}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <button
                      onClick={() => removeFile(index, 'pg')}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bank File Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Bank File</h3>
            
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors"
              onDrop={(e) => handleDrop(e, 'bank')}
              onDragOver={(e) => e.preventDefault()}
            >
              <FileUp className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600 mb-2">
                Drag and drop files here, or click to browse
              </p>
              <input
                type="file"
                multiple
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleFileSelect(e, 'bank')}
                className="hidden"
                id="bank-file-input"
              />
              <label
                htmlFor="bank-file-input"
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
              >
                Choose Files
              </label>
            </div>

            {/* Selected Files */}
            {bankFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                {bankFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex items-center">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                      <span className="text-sm text-gray-700">{file.name}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <button
                      onClick={() => removeFile(index, 'bank')}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Template Selection & Run Button */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mapping Template
              </label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="auto-detect">Auto-detect</option>
                <option value="axis-standard">AXIS Standard</option>
                <option value="hdfc-standard">HDFC Standard</option>
                <option value="icici-standard">ICICI Standard</option>
                <option value="custom">Custom Template</option>
              </select>
            </div>
            <div className="text-sm text-gray-500">
              <Info className="w-4 h-4 inline mr-1" />
              Template will be used to normalize bank file columns
            </div>
          </div>
          
          <button
            onClick={() => uploadMutation.mutate()}
            disabled={!canRunReconciliation || uploadMutation.isPending}
            className={`inline-flex items-center px-6 py-3 text-base font-medium rounded-md text-white ${
              canRunReconciliation && !uploadMutation.isPending
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            <Play className="w-5 h-5 mr-2" />
            {uploadMutation.isPending ? 'Processing...' : 'Run Reconciliation'}
          </button>
        </div>
      </div>

      {/* Results Section */}
      {reconResults && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {/* Summary Bar */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-8">
                <div>
                  <p className="text-sm text-gray-500">Total</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {reconResults.stats?.total || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Matched</p>
                  <p className="text-2xl font-bold text-green-600">
                    {reconResults.stats?.matched || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Unmatched</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {reconResults.stats?.unmatched || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Exceptions</p>
                  <p className="text-2xl font-bold text-red-600">
                    {reconResults.stats?.exceptions || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Match Rate</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {reconResults.stats?.matchRate || 0}%
                  </p>
                </div>
              </div>
              
              {/* Export Dropdown */}
              <div className="relative group">
                <button
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                  <ChevronDown className="w-4 h-4 ml-2" />
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <button
                    onClick={() => { setExportFormat('csv'); handleExport(); }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Export as CSV
                  </button>
                  <button
                    onClick={() => { setExportFormat('excel'); handleExport(); }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Export as Excel
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('matched')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'matched'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Matched ({reconResults.matched?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('unmatched')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'unmatched'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Unmatched ({reconResults.unmatched?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('exceptions')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'exceptions'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Exceptions ({reconResults.exceptions?.length || 0})
              </button>
            </nav>
          </div>

          {/* Table Content */}
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Transaction ID
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      UTR
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Amount
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Method
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Captured At
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Bank Posted
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {activeTab === 'matched' ? 'Confidence' : 'Reason'}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {activeTab === 'matched' && reconResults.matched?.map((item: any, idx: number) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-sm">{item.pgTransaction?.transaction_id}</td>
                      <td className="px-4 py-2 text-sm">{item.pgTransaction?.utr}</td>
                      <td className="px-4 py-2 text-sm">
                        {formatIndianCurrency(item.pgTransaction?.amount || 0)}
                      </td>
                      <td className="px-4 py-2 text-sm">{item.pgTransaction?.payment_method}</td>
                      <td className="px-4 py-2 text-sm">
                        {new Date(item.pgTransaction?.captured_at).toLocaleDateString('en-IN')}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {item.bankRecord?.DATE}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <span className="text-green-600 font-medium">{item.confidence}%</span>
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Matched
                        </span>
                      </td>
                    </tr>
                  ))}
                  
                  {activeTab === 'unmatched' && reconResults.unmatched?.map((item: any, idx: number) => {
                    const txn = item.transaction || item.pgTransaction || item.bankRecord;
                    return (
                      <tr key={idx}>
                        <td className="px-4 py-2 text-sm">
                          {txn?.transaction_id || txn?.TRANSACTION_ID}
                        </td>
                        <td className="px-4 py-2 text-sm">{txn?.utr || txn?.UTR || '-'}</td>
                        <td className="px-4 py-2 text-sm">
                          {formatIndianCurrency(item.amount || 0)}
                        </td>
                        <td className="px-4 py-2 text-sm">{txn?.payment_method || '-'}</td>
                        <td className="px-4 py-2 text-sm">
                          {txn?.captured_at ? new Date(txn.captured_at).toLocaleDateString('en-IN') : '-'}
                        </td>
                        <td className="px-4 py-2 text-sm">{txn?.DATE || '-'}</td>
                        <td className="px-4 py-2 text-sm">
                          <ReasonChip 
                            reasonCode={item.reasonCode} 
                            reasonDetail={item.reasonDetail}
                          />
                        </td>
                        <td className="px-4 py-2 text-sm">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            Unmatched
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  
                  {activeTab === 'exceptions' && reconResults.exceptions?.map((item: any, idx: number) => {
                    const txn = item.pgTransaction || item.bankRecord;
                    return (
                      <tr key={idx}>
                        <td className="px-4 py-2 text-sm">
                          {txn?.transaction_id || txn?.TRANSACTION_ID}
                        </td>
                        <td className="px-4 py-2 text-sm">{txn?.utr || txn?.UTR || '-'}</td>
                        <td className="px-4 py-2 text-sm">
                          {formatIndianCurrency(txn?.amount || txn?.AMOUNT || 0)}
                        </td>
                        <td className="px-4 py-2 text-sm">{txn?.payment_method || '-'}</td>
                        <td className="px-4 py-2 text-sm">
                          {txn?.captured_at ? new Date(txn.captured_at).toLocaleDateString('en-IN') : '-'}
                        </td>
                        <td className="px-4 py-2 text-sm">{txn?.DATE || '-'}</td>
                        <td className="px-4 py-2 text-sm">
                          <ReasonChip 
                            reasonCode={item.reasonCode} 
                            reasonDetail={item.reasonDetail}
                          />
                        </td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.severity === 'CRITICAL' 
                              ? 'bg-red-100 text-red-800'
                              : item.severity === 'HIGH'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            Exception
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}