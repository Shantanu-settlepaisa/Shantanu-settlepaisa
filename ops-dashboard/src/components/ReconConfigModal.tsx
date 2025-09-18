import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  X,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Settings2,
  Database,
  FileText
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

interface ReconConfigModalProps {
  isOpen: boolean
  onClose: () => void
  acquirerCode?: string
  onSave?: () => void
}

export function ReconConfigModal({ 
  isOpen, 
  onClose, 
  acquirerCode = 'AXIS',
  onSave 
}: ReconConfigModalProps) {
  const queryClient = useQueryClient()
  const [mappings, setMappings] = useState<FieldMapping[]>(INTERNAL_FIELDS)
  const [isDirty, setIsDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [headerSuggestions, setHeaderSuggestions] = useState<string[]>([])
  const [selectedAcquirer, setSelectedAcquirer] = useState(acquirerCode)

  // Fetch existing template
  const { data: template, isLoading } = useQuery({
    queryKey: ['mapping-template', selectedAcquirer],
    queryFn: () => opsApi.getMappingTemplate(selectedAcquirer),
    refetchOnWindowFocus: false,
    enabled: isOpen
  })

  // Fetch recent file headers for suggestions
  const { data: recentHeaders } = useQuery({
    queryKey: ['recent-headers', selectedAcquirer],
    queryFn: () => opsApi.getRecentFileHeaders(selectedAcquirer),
    refetchOnWindowFocus: false,
    enabled: isOpen
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
        acquirerCode: selectedAcquirer,
        name: `${selectedAcquirer} BANK`,
        columns
      })
    },
    onSuccess: () => {
      setSaveStatus('saved')
      setIsDirty(false)
      queryClient.invalidateQueries({ queryKey: ['mapping-template', selectedAcquirer] })
      queryClient.invalidateQueries({ queryKey: ['mapping-templates'] })
      
      setTimeout(() => {
        setSaveStatus('idle')
        if (onSave) onSave()
      }, 2000)
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
    return acquirers[selectedAcquirer] || selectedAcquirer
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-gray-900 bg-opacity-50" onClick={onClose} />
      
      {/* Modal - Full height, responsive width */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-screen-2xl w-full mx-4 h-[90vh] flex flex-col">
        
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 rounded-t-xl">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Settings2 className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Reconciliation Configuration</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Map bank file columns to internal fields</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
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
                
                {/* Close button */}
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>
          </div>
          
          {/* Acquirer Selection Bar */}
          <div className="px-6 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <label className="text-sm font-medium text-gray-700">Acquirer:</label>
                <select
                  value={selectedAcquirer}
                  onChange={(e) => {
                    setSelectedAcquirer(e.target.value)
                    setIsDirty(false)
                  }}
                  className="text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="AXIS">AXIS BANK</option>
                  <option value="HDFC">HDFC BANK</option>
                  <option value="ICICI">ICICI BANK</option>
                  <option value="SBI">STATE BANK OF INDIA</option>
                  <option value="BOB">BANK OF BARODA</option>
                </select>
                <span className="text-sm text-gray-500">
                  Configuration for: <strong>{getAcquirerName()}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading configuration...</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Required Fields */}
              <div>
                <div className="mb-4">
                  <h3 className="text-lg font-medium text-gray-900 flex items-center">
                    <Database className="w-5 h-5 mr-2 text-red-500" />
                    Required Fields
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">These fields must be mapped for reconciliation to work</p>
                </div>
                <div className="space-y-3">
                  {mappings.filter(m => m.required).map((mapping, originalIndex) => {
                    const index = mappings.indexOf(mapping)
                    return (
                      <div key={mapping.ourColumn} className="bg-white p-4 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {mapping.ourColumn.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </label>
                            <input
                              type="text"
                              value={mapping.yourColumn}
                              onChange={(e) => handleFieldChange(index, e.target.value)}
                              placeholder="Enter column name from your file"
                              list={`suggestions-${index}`}
                              className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            />
                            <datalist id={`suggestions-${index}`}>
                              {headerSuggestions.map((header) => (
                                <option key={header} value={header} />
                              ))}
                            </datalist>
                          </div>
                          <div className="ml-3 flex flex-col items-end space-y-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Required
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {mapping.dataType}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Optional Fields */}
              <div>
                <div className="mb-4">
                  <h3 className="text-lg font-medium text-gray-900 flex items-center">
                    <FileText className="w-5 h-5 mr-2 text-gray-500" />
                    Optional Fields
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">Additional fields that can enhance reconciliation accuracy</p>
                </div>
                <div className="space-y-3">
                  {mappings.filter(m => !m.required).map((mapping, originalIndex) => {
                    const index = mappings.indexOf(mapping)
                    return (
                      <div key={mapping.ourColumn} className="bg-white p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {mapping.ourColumn.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </label>
                            <input
                              type="text"
                              value={mapping.yourColumn}
                              onChange={(e) => handleFieldChange(index, e.target.value)}
                              placeholder="Enter column name from your file"
                              list={`suggestions-${index}`}
                              className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            />
                            <datalist id={`suggestions-${index}`}>
                              {headerSuggestions.map((header) => (
                                <option key={header} value={header} />
                              ))}
                            </datalist>
                          </div>
                          <div className="ml-3 flex flex-col items-end space-y-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Optional
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {mapping.dataType}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Help Section */}
          {!isLoading && (
            <div className="mt-8 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-900">
                <AlertCircle className="w-4 h-4 inline mr-1.5" />
                <strong>Tips:</strong> Column names are case-sensitive. Start typing to see suggestions from recently uploaded files.
                Amount fields should be in INR (will be converted to paise). Date fields should be in standard formats.
              </p>
            </div>
          )}
        </div>

        {/* Sticky Footer with Actions */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 rounded-b-xl">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">
              {isDirty && (
                <span className="flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1 text-amber-500" />
                  You have unsaved changes
                </span>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleReset}
                disabled={!isDirty}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className="w-4 h-4 mr-1.5" />
                Reset Changes
              </button>
              <button
                onClick={handleSave}
                disabled={!isDirty || saveStatus === 'saving'}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saveStatus === 'saving' ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                    Saving Configuration...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1.5" />
                    Save Configuration
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}