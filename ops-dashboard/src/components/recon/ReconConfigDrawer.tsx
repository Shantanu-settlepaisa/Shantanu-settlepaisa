import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  X,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Plus,
  Trash2,
  Eye,
  Edit2,
  List,
  FileText,
  Database,
  ChevronRight
} from 'lucide-react'
import axios from 'axios'

// Types
interface BankMapping {
  id: string
  config_name: string
  bank_name: string
  file_type: string
  delimiter: string | null
  v1_column_mappings: Record<string, string>
  special_fields: Record<string, string> | null
  is_active: boolean
  source: string
  created_at: string
  updated_at: string
}

interface V1Field {
  name: string
  label: string
  required: boolean
  dataType: 'string' | 'amount' | 'date'
  v2Equivalent: string
  description: string
}

// V1 Standard Bank Fields (these map to V2 via v1-column-mapper.js)
const V1_BANK_FIELDS: V1Field[] = [
  { 
    name: 'transaction_id', 
    label: 'Transaction ID',
    required: true, 
    dataType: 'string',
    v2Equivalent: 'utr',
    description: 'Unique transaction reference (maps to V2: utr)'
  },
  { 
    name: 'paid_amount', 
    label: 'Paid Amount',
    required: true, 
    dataType: 'amount',
    v2Equivalent: 'amount_paise',
    description: 'Gross amount in rupees (maps to V2: amount_paise × 100)'
  },
  { 
    name: 'payee_amount', 
    label: 'Payee Amount',
    required: true, 
    dataType: 'amount',
    v2Equivalent: 'amount_paise',
    description: 'Net amount in rupees (maps to V2: amount_paise × 100)'
  },
  { 
    name: 'transaction_date_time', 
    label: 'Transaction Date Time',
    required: true, 
    dataType: 'date',
    v2Equivalent: 'transaction_date',
    description: 'Transaction date/time (maps to V2: transaction_date ISO format)'
  },
  { 
    name: 'payment_date_time', 
    label: 'Payment Date Time',
    required: false, 
    dataType: 'date',
    v2Equivalent: 'transaction_date',
    description: 'Settlement date/time (maps to V2: transaction_date ISO format)'
  }
]

interface ReconConfigDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export function ReconConfigDrawer({ isOpen, onClose }: ReconConfigDrawerProps) {
  const queryClient = useQueryClient()
  
  // State
  const [view, setView] = useState<'list' | 'detail' | 'add'>('list')
  const [selectedBank, setSelectedBank] = useState<BankMapping | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedMappings, setEditedMappings] = useState<Record<string, string>>({})
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  
  // New bank form state
  const [newBankForm, setNewBankForm] = useState({
    config_name: '',
    bank_name: '',
    file_type: 'xlsx',
    delimiter: '',
    mappings: {} as Record<string, string>
  })

  // Fetch all bank mappings
  const { data: bankMappingsResponse, isLoading } = useQuery({
    queryKey: ['bank-mappings'],
    queryFn: async () => {
      const response = await axios.get('http://localhost:5103/bank-mappings')
      return response.data
    },
    enabled: isOpen
  })

  const bankMappings: BankMapping[] = bankMappingsResponse?.mappings || []

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { bankName: string; mappings: Record<string, string> }) => {
      const response = await axios.put(
        `http://localhost:5103/bank-mappings/${encodeURIComponent(data.bankName)}`,
        {
          v1_column_mappings: data.mappings
        }
      )
      return response.data
    },
    onSuccess: () => {
      setSaveStatus('saved')
      setIsEditing(false)
      queryClient.invalidateQueries({ queryKey: ['bank-mappings'] })
      setTimeout(() => setSaveStatus('idle'), 2000)
    },
    onError: () => {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof newBankForm) => {
      const response = await axios.post('http://localhost:5103/bank-mappings', {
        config_name: data.config_name.toUpperCase(),
        bank_name: data.bank_name,
        file_type: data.file_type,
        delimiter: data.delimiter || null,
        v1_column_mappings: data.mappings
      })
      return response.data
    },
    onSuccess: () => {
      setSaveStatus('saved')
      queryClient.invalidateQueries({ queryKey: ['bank-mappings'] })
      setTimeout(() => {
        setSaveStatus('idle')
        setView('list')
        setNewBankForm({
          config_name: '',
          bank_name: '',
          file_type: 'xlsx',
          delimiter: '',
          mappings: {}
        })
      }, 1500)
    },
    onError: () => {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (bankName: string) => {
      const response = await axios.delete(
        `http://localhost:5103/bank-mappings/${encodeURIComponent(bankName)}`
      )
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-mappings'] })
      setView('list')
      setSelectedBank(null)
    }
  })

  // Handlers
  const handleBankSelect = (bank: BankMapping) => {
    setSelectedBank(bank)
    setEditedMappings(bank.v1_column_mappings || {})
    setView('detail')
    setIsEditing(false)
  }

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setEditedMappings(selectedBank?.v1_column_mappings || {})
    setIsEditing(false)
  }

  const handleSave = () => {
    if (selectedBank) {
      setSaveStatus('saving')
      updateMutation.mutate({
        bankName: selectedBank.config_name,
        mappings: editedMappings
      })
    }
  }

  const handleDelete = () => {
    if (selectedBank && confirm(`Delete mapping for ${selectedBank.bank_name}?`)) {
      deleteMutation.mutate(selectedBank.config_name)
    }
  }

  const handleMappingChange = (field: string, value: string) => {
    setEditedMappings(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleNewBankMappingChange = (field: string, value: string) => {
    setNewBankForm(prev => ({
      ...prev,
      mappings: {
        ...prev.mappings,
        [field]: value
      }
    }))
  }

  const handleCreateBank = () => {
    setSaveStatus('saving')
    createMutation.mutate(newBankForm)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70]">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <aside className="absolute right-0 top-0 h-screen w-[1000px] max-w-[92vw] bg-white shadow-2xl border-l overflow-hidden flex flex-col">
        
        {/* Header */}
        <header className="border-b bg-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Bank Column Mappings</h2>
              <p className="text-xs text-slate-500">Configure V1 standard mappings for bank files (auto-converts to V2)</p>
            </div>
            
            {/* Breadcrumb */}
            {view !== 'list' && (
              <div className="flex items-center text-sm text-gray-600">
                <button onClick={() => setView('list')} className="hover:text-blue-600">
                  All Banks
                </button>
                <ChevronRight className="w-4 h-4 mx-1" />
                <span className="text-gray-900 font-medium">
                  {view === 'detail' ? selectedBank?.bank_name : 'Add New Bank'}
                </span>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Save Status */}
            {saveStatus === 'saved' && (
              <div className="flex items-center text-green-600">
                <CheckCircle className="w-4 h-4 mr-1.5" />
                <span className="text-sm font-medium">Saved successfully</span>
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="flex items-center text-red-600">
                <AlertCircle className="w-4 h-4 mr-1.5" />
                <span className="text-sm font-medium">Failed to save</span>
              </div>
            )}
            
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
            >
              Close
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* LIST VIEW */}
          {view === 'list' && (
            <div className="p-6">
              {/* Add Bank Button */}
              <div className="mb-6 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Configured Banks ({bankMappings.length})</h3>
                  <p className="text-sm text-gray-500 mt-1">Click on a bank to view or edit its column mappings</p>
                </div>
                <button
                  onClick={() => setView('add')}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add New Bank
                </button>
              </div>

              {/* Loading State */}
              {isLoading && (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading bank mappings...</p>
                  </div>
                </div>
              )}

              {/* Bank List */}
              {!isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bankMappings.map(bank => (
                    <button
                      key={bank.id}
                      onClick={() => handleBankSelect(bank)}
                      className="text-left p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 group-hover:text-blue-600">
                            {bank.bank_name}
                          </h4>
                          <p className="text-xs text-gray-500 mt-0.5">{bank.config_name}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 mt-1" />
                      </div>
                      
                      <div className="flex items-center gap-2 text-xs text-gray-600 mt-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100">
                          {bank.file_type.toUpperCase()}
                        </span>
                        {bank.delimiter && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100">
                            Delim: {bank.delimiter}
                          </span>
                        )}
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                          {Object.keys(bank.v1_column_mappings || {}).length} fields
                        </span>
                      </div>
                      
                      <div className="mt-2 text-xs text-gray-500">
                        Source: {bank.source}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DETAIL VIEW */}
          {view === 'detail' && selectedBank && (
            <div className="p-6">
              {/* Bank Header */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{selectedBank.bank_name}</h3>
                    <p className="text-sm text-gray-600 mt-1">Config Name: {selectedBank.config_name}</p>
                    <div className="flex items-center gap-3 mt-3 text-sm">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        {selectedBank.file_type.toUpperCase()}
                      </span>
                      {selectedBank.delimiter && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-gray-100">
                          Delimiter: {selectedBank.delimiter}
                        </span>
                      )}
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-green-100 text-green-800">
                        {selectedBank.source}
                      </span>
                    </div>
                  </div>
                  
                  {!isEditing && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleEdit}
                        className="inline-flex items-center px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        <Edit2 className="w-4 h-4 mr-1" />
                        Edit
                      </button>
                      <button
                        onClick={handleDelete}
                        className="inline-flex items-center px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Info Banner */}
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-900">
                  <AlertCircle className="w-4 h-4 inline mr-1.5" />
                  <strong>Two-Stage Normalization:</strong> These V1 mappings automatically convert to V2 format using v1-column-mapper.js. 
                  Amounts are converted to paise (×100), dates to ISO 8601, and strings are uppercased.
                </p>
              </div>

              {/* Mappings Table */}
              <div className="space-y-6">
                {/* Required Fields */}
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Database className="w-5 h-5 mr-2 text-red-500" />
                    Required V1 Fields
                  </h4>
                  <div className="space-y-3">
                    {V1_BANK_FIELDS.filter(f => f.required).map(field => (
                      <div key={field.name} className="p-4 bg-white border border-gray-200 rounded-lg">
                        <div className="grid grid-cols-2 gap-4 items-center">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {field.label}
                            </label>
                            <p className="text-xs text-gray-500">{field.description}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800">
                                Required
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">
                                {field.dataType}
                              </span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              Bank File Column Name
                            </label>
                            <input
                              type="text"
                              value={editedMappings[field.name] || ''}
                              onChange={(e) => handleMappingChange(field.name, e.target.value)}
                              disabled={!isEditing}
                              placeholder="Enter bank column name"
                              className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Optional Fields */}
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <FileText className="w-5 h-5 mr-2 text-gray-500" />
                    Optional V1 Fields
                  </h4>
                  <div className="space-y-3">
                    {V1_BANK_FIELDS.filter(f => !f.required).map(field => (
                      <div key={field.name} className="p-4 bg-white border border-gray-200 rounded-lg">
                        <div className="grid grid-cols-2 gap-4 items-center">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {field.label}
                            </label>
                            <p className="text-xs text-gray-500">{field.description}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-800">
                                Optional
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">
                                {field.dataType}
                              </span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              Bank File Column Name
                            </label>
                            <input
                              type="text"
                              value={editedMappings[field.name] || ''}
                              onChange={(e) => handleMappingChange(field.name, e.target.value)}
                              disabled={!isEditing}
                              placeholder="(optional)"
                              className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ADD VIEW */}
          {view === 'add' && (
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-6">Add New Bank Configuration</h3>
              
              {/* Bank Details */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Config Name (Uppercase) *
                    </label>
                    <input
                      type="text"
                      value={newBankForm.config_name}
                      onChange={(e) => setNewBankForm(prev => ({ ...prev, config_name: e.target.value }))}
                      placeholder="e.g., KOTAK BANK"
                      className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bank Display Name *
                    </label>
                    <input
                      type="text"
                      value={newBankForm.bank_name}
                      onChange={(e) => setNewBankForm(prev => ({ ...prev, bank_name: e.target.value }))}
                      placeholder="e.g., Kotak Mahindra Bank"
                      className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      File Type *
                    </label>
                    <select
                      value={newBankForm.file_type}
                      onChange={(e) => setNewBankForm(prev => ({ ...prev, file_type: e.target.value }))}
                      className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="xlsx">XLSX (Excel)</option>
                      <option value="csv">CSV</option>
                      <option value="txt">TXT</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Delimiter (for CSV/TXT)
                    </label>
                    <input
                      type="text"
                      value={newBankForm.delimiter}
                      onChange={(e) => setNewBankForm(prev => ({ ...prev, delimiter: e.target.value }))}
                      placeholder="e.g., ~ or | (leave empty for comma)"
                      className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Column Mappings */}
              <div className="space-y-4">
                <h4 className="text-lg font-medium text-gray-900">V1 Column Mappings</h4>
                {V1_BANK_FIELDS.map(field => (
                  <div key={field.name} className="p-4 bg-white border border-gray-200 rounded-lg">
                    <div className="grid grid-cols-2 gap-4 items-center">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {field.label} {field.required && '*'}
                        </label>
                        <p className="text-xs text-gray-500">{field.description}</p>
                      </div>
                      <div>
                        <input
                          type="text"
                          value={newBankForm.mappings[field.name] || ''}
                          onChange={(e) => handleNewBankMappingChange(field.name, e.target.value)}
                          placeholder={field.required ? 'Required' : 'Optional'}
                          className="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="border-t bg-white px-6 py-3 flex justify-between items-center">
          {view === 'detail' && isEditing && (
            <>
              <button
                onClick={handleCancelEdit}
                className="inline-flex items-center px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-4 h-4 mr-1.5" />
                Cancel
              </button>
              
              <button
                onClick={handleSave}
                disabled={saveStatus === 'saving'}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded disabled:opacity-50 transition-colors"
              >
                {saveStatus === 'saving' ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1.5" />
                    Save Changes
                  </>
                )}
              </button>
            </>
          )}
          
          {view === 'add' && (
            <>
              <button
                onClick={() => setView('list')}
                className="inline-flex items-center px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-4 h-4 mr-1.5" />
                Cancel
              </button>
              
              <button
                onClick={handleCreateBank}
                disabled={!newBankForm.config_name || !newBankForm.bank_name || saveStatus === 'saving'}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded disabled:opacity-50 transition-colors"
              >
                {saveStatus === 'saving' ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Create Bank Mapping
                  </>
                )}
              </button>
            </>
          )}
          
          {view === 'list' && (
            <div className="w-full flex justify-end">
              <p className="text-sm text-gray-500">
                {bankMappings.length} bank{bankMappings.length !== 1 ? 's' : ''} configured
              </p>
            </div>
          )}
        </footer>
      </aside>
    </div>
  )
}
