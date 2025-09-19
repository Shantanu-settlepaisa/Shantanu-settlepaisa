import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { 
  ArrowLeft,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle
} from 'lucide-react'
import { opsApi } from '@/lib/ops-api'

interface FieldMapping {
  ourColumn: string
  yourColumn: string
  required: boolean
  dataType: 'string' | 'amount' | 'date' | 'boolean'
}

const INTERNAL_FIELDS: FieldMapping[] = [
  { ourColumn: 'transaction_id', yourColumn: '', required: true, dataType: 'string' },
  { ourColumn: 'payee_amount', yourColumn: '', required: true, dataType: 'amount' },
  { ourColumn: 'paid_amount', yourColumn: '', required: true, dataType: 'amount' },
  { ourColumn: 'transaction_date_time', yourColumn: '', required: true, dataType: 'date' },
  { ourColumn: 'payment_date_time', yourColumn: '', required: false, dataType: 'date' },
  { ourColumn: 'bank_name', yourColumn: '', required: false, dataType: 'string' },
  { ourColumn: 'is_on_us', yourColumn: '', required: false, dataType: 'boolean' },
  { ourColumn: 'utr', yourColumn: '', required: true, dataType: 'string' },
  { ourColumn: 'rrn', yourColumn: '', required: false, dataType: 'string' },
  { ourColumn: 'approval_code', yourColumn: '', required: false, dataType: 'string' },
  { ourColumn: 'merchant_ref', yourColumn: '', required: false, dataType: 'string' },
  { ourColumn: 'fee_amount', yourColumn: '', required: false, dataType: 'amount' },
  { ourColumn: 'tax_amount', yourColumn: '', required: false, dataType: 'amount' },
  { ourColumn: 'settlement_status', yourColumn: '', required: false, dataType: 'string' },
  { ourColumn: 'remarks', yourColumn: '', required: false, dataType: 'string' }
]

export default function ReconConfig() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const acquirerCode = searchParams.get('acquirer') || 'AXIS'
  
  const [mappings, setMappings] = useState<FieldMapping[]>(INTERNAL_FIELDS)
  const [isDirty, setIsDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [headerSuggestions, setHeaderSuggestions] = useState<string[]>([])

  // Fetch existing template
  const { data: template, isLoading } = useQuery({
    queryKey: ['mapping-template', acquirerCode],
    queryFn: () => opsApi.getMappingTemplate(acquirerCode),
    refetchOnWindowFocus: false
  })

  // Fetch recent file headers for suggestions
  const { data: recentHeaders } = useQuery({
    queryKey: ['recent-headers', acquirerCode],
    queryFn: () => opsApi.getRecentFileHeaders(acquirerCode),
    refetchOnWindowFocus: false
  })

  // Load template data
  useEffect(() => {
    if (template) {
      const updatedMappings = INTERNAL_FIELDS.map(field => ({
        ...field,
        yourColumn: template.columns[field.ourColumn] || ''
      }))
      setMappings(updatedMappings)
      setIsDirty(false)
    }
  }, [template])

  // Set header suggestions
  useEffect(() => {
    if (recentHeaders && recentHeaders.length > 0) {
      // Flatten all headers from recent files
      const allHeaders = recentHeaders.flatMap((file: any) => file.headers)
      const uniqueHeaders = [...new Set(allHeaders)]
      setHeaderSuggestions(uniqueHeaders)
    }
  }, [recentHeaders])

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const columns: Record<string, string> = {}
      mappings.forEach(m => {
        if (m.yourColumn) {
          columns[m.ourColumn] = m.yourColumn
        }
      })

      return opsApi.saveMappingTemplate({
        acquirerCode,
        name: `${acquirerCode} BANK`,
        columns
      })
    },
    onSuccess: () => {
      setSaveStatus('saved')
      setIsDirty(false)
      queryClient.invalidateQueries({ queryKey: ['mapping-template', acquirerCode] })
      queryClient.invalidateQueries({ queryKey: ['mapping-templates'] })
      
      setTimeout(() => {
        setSaveStatus('idle')
      }, 3000)
    },
    onError: () => {
      setSaveStatus('error')
      setTimeout(() => {
        setSaveStatus('idle')
      }, 3000)
    }
  })

  // Handle field change
  const handleFieldChange = (index: number, value: string) => {
    const updated = [...mappings]
    updated[index].yourColumn = value
    setMappings(updated)
    setIsDirty(true)
  }

  // Reset to saved state
  const handleReset = () => {
    if (template) {
      const updatedMappings = INTERNAL_FIELDS.map(field => ({
        ...field,
        yourColumn: template.columns[field.ourColumn] || ''
      }))
      setMappings(updatedMappings)
      setIsDirty(false)
    } else {
      setMappings(INTERNAL_FIELDS)
      setIsDirty(false)
    }
  }

  // Save template
  const handleSave = () => {
    setSaveStatus('saving')
    saveMutation.mutate()
  }

  // Get acquirer display name
  const getAcquirerName = () => {
    const acquirers: Record<string, string> = {
      'AXIS': 'AXIS BANK',
      'HDFC': 'HDFC BANK',
      'ICICI': 'ICICI BANK',
      'SBI': 'STATE BANK OF INDIA',
      'BOB': 'BANK OF BARODA'
    }
    return acquirers[acquirerCode] || acquirerCode
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading configuration...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/ops/recon')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Recon config</h1>
              <p className="text-sm text-gray-500 mt-0.5">Map bank file columns to internal fields</p>
            </div>
          </div>
          
          {/* Save Status */}
          {saveStatus === 'saved' && (
            <div className="flex items-center text-green-600">
              <CheckCircle className="w-4 h-4 mr-1.5" />
              <span className="text-sm font-medium">Configuration saved</span>
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="flex items-center text-red-600">
              <AlertCircle className="w-4 h-4 mr-1.5" />
              <span className="text-sm font-medium">Failed to save</span>
            </div>
          )}
        </div>
      </div>

      {/* Config Name */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-xs font-medium text-gray-500">Config Name</label>
            <p className="mt-1 text-lg font-medium text-gray-900">{getAcquirerName()}</p>
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={acquirerCode}
              onChange={(e) => navigate(`/ops/recon/config?acquirer=${e.target.value}`)}
              className="text-sm border-gray-300 rounded-md"
            >
              <option value="AXIS">AXIS BANK</option>
              <option value="HDFC">HDFC BANK</option>
              <option value="ICICI">ICICI BANK</option>
              <option value="SBI">STATE BANK OF INDIA</option>
              <option value="BOB">BANK OF BARODA</option>
            </select>
          </div>
        </div>
      </div>

      {/* Mapping Table */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Our Column Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Your Column Name
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Required
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {mappings.map((mapping, index) => (
                  <tr key={mapping.ourColumn} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">
                        {mapping.ourColumn.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="text"
                        value={mapping.yourColumn}
                        onChange={(e) => handleFieldChange(index, e.target.value)}
                        placeholder="Enter column name"
                        list={`suggestions-${index}`}
                        className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      />
                      <datalist id={`suggestions-${index}`}>
                        {headerSuggestions.map((header) => (
                          <option key={header} value={header} />
                        ))}
                      </datalist>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {mapping.required ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Required
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Optional
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {mapping.dataType}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Help Text */}
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-900">
              <AlertCircle className="w-4 h-4 inline mr-1.5" />
              <strong>Tips:</strong> Column names are case-sensitive. Start typing to see suggestions from recently uploaded files.
              Amount fields should be in INR (will be converted to paise). Date fields should be in standard formats.
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleReset}
            disabled={!isDirty}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || saveStatus === 'saving'}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveStatus === 'saving' ? (
              <>
                <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-1.5" />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}