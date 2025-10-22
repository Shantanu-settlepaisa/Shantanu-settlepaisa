import { useState, useCallback } from 'react';
import { X, Upload, Download, CheckCircle, AlertCircle, FileText } from 'lucide-react';

interface ChargebackUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UploadResult {
  total: number;
  success: number;
  failed: number;
  successRecords: any[];
  failedRecords: any[];
}

export function ChargebackUploadModal({ isOpen, onClose }: ChargebackUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        setError('Please select a CSV file');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      if (!droppedFile.name.endsWith('.csv')) {
        setError('Please select a CSV file');
        return;
      }
      setFile(droppedFile);
      setError(null);
      setResult(null);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const apiUrl = import.meta.env.VITE_REFUND_API_URL || 'http://localhost:5111';
      const response = await fetch(`${apiUrl}/api/chargebacks/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const data = await response.json();
      setResult(data);

      if (data.success === data.total) {
        // Auto-close after 2 seconds if all successful
        setTimeout(() => {
          onClose();
          resetState();
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed');
      console.error('Chargeback upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const downloadTemplate = () => {
    const csvContent = 'transaction_id,merchant_id,chargeback_amount,reason_code,status\nTXN123,MERCH001,200000,FRAUD,LOST\nTXN456,MERCH001,150000,AUTHORIZATION_ISSUE,OPEN';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'chargeback-template.csv';
    link.click();
    window.URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Upload Chargebacks</h2>
            <p className="text-sm text-gray-500 mt-1">Upload CSV file with chargeback data</p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Download Template */}
          <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-900">Need a template?</p>
                <p className="text-xs text-blue-700">Download sample CSV with correct format</p>
              </div>
            </div>
            <button
              onClick={downloadTemplate}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center gap-1"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>

          {/* CSV Format Info */}
          <div className="p-3 bg-gray-50 border border-gray-200 rounded text-sm">
            <p className="font-medium text-gray-900 mb-2">Required CSV Format:</p>
            <ul className="space-y-1 text-gray-600">
              <li><code className="bg-white px-1 py-0.5 rounded">transaction_id</code> - Transaction ID</li>
              <li><code className="bg-white px-1 py-0.5 rounded">merchant_id</code> - Merchant ID</li>
              <li><code className="bg-white px-1 py-0.5 rounded">chargeback_amount</code> - Amount in PAISE</li>
              <li><code className="bg-white px-1 py-0.5 rounded">reason_code</code> - Reason (FRAUD, AUTH_FAIL, etc.)</li>
              <li><code className="bg-white px-1 py-0.5 rounded">status</code> - LOST, OPEN, or WON</li>
            </ul>
          </div>

          {/* File Upload Area */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors"
          >
            {file ? (
              <div className="space-y-2">
                <FileText className="w-12 h-12 text-green-500 mx-auto" />
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                <button
                  onClick={() => setFile(null)}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                <p className="text-sm text-gray-600">Drag & drop CSV file here or</p>
                <label className="inline-block px-4 py-2 bg-blue-600 text-white rounded cursor-pointer hover:bg-blue-700">
                  Browse Files
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Upload Result */}
          {result && (
            <div className="space-y-3">
              <div className={`flex items-center gap-2 p-3 rounded ${
                result.failed === 0
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-yellow-50 border border-yellow-200'
              }`}>
                <CheckCircle className={`w-5 h-5 ${result.failed === 0 ? 'text-green-600' : 'text-yellow-600'}`} />
                <div>
                  <p className="text-sm font-medium">
                    {result.failed === 0 ? 'Upload Successful!' : 'Upload Completed with Errors'}
                  </p>
                  <p className="text-xs">
                    {result.success} successful, {result.failed} failed out of {result.total} records
                  </p>
                </div>
              </div>

              {/* Failed Records */}
              {result.failed > 0 && result.failedRecords.length > 0 && (
                <div className="border border-red-200 rounded">
                  <div className="px-3 py-2 bg-red-50 border-b border-red-200">
                    <p className="text-sm font-medium text-red-900">Failed Records</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-1 text-left">Transaction ID</th>
                          <th className="px-2 py-1 text-left">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.failedRecords.map((record, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="px-2 py-1">{record.transaction_id || '-'}</td>
                            <td className="px-2 py-1 text-red-600">{record.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100"
            disabled={uploading}
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload Chargebacks
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
