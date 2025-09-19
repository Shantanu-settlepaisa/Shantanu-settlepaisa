import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { 
  ArrowLeft,
  Save,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  AlertCircle,
  FileText,
  Database
} from 'lucide-react'
import { opsApiExtended as opsApi } from '@/lib/ops-api-extended'

interface BankSchema {
  id: string
  bankName: string
  bankCode: string
  fileFormat: 'csv' | 'excel' | 'json'
  delimiter?: string
  headerRow: number
  fieldMappings: {
    [key: string]: {
      sourceColumn: string
      dataType: 'string' | 'amount' | 'date' | 'boolean'
      format?: string // For dates and amounts
      transform?: string // Optional transformation logic
    }
  }
  sampleHeaders: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// Standard internal fields that all bank schemas should map to
const STANDARD_FIELDS = [
  { field: 'transaction_id', label: 'Transaction ID', required: true, dataType: 'string' },
  { field: 'utr', label: 'UTR', required: true, dataType: 'string' },
  { field: 'gross_amount', label: 'Gross Amount', required: true, dataType: 'amount' },
  { field: 'net_amount', label: 'Net Amount', required: true, dataType: 'amount' },
  { field: 'fee_amount', label: 'Fee Amount', required: false, dataType: 'amount' },
  { field: 'tax_amount', label: 'Tax Amount', required: false, dataType: 'amount' },
  { field: 'transaction_date', label: 'Transaction Date', required: true, dataType: 'date' },
  { field: 'payment_date', label: 'Payment Date', required: false, dataType: 'date' },
  { field: 'bank_name', label: 'Bank Name', required: false, dataType: 'string' },
  { field: 'is_on_us', label: 'On-Us Transaction', required: false, dataType: 'boolean' },
  { field: 'rrn', label: 'RRN', required: false, dataType: 'string' },
  { field: 'approval_code', label: 'Approval Code', required: false, dataType: 'string' },
  { field: 'merchant_ref', label: 'Merchant Reference', required: false, dataType: 'string' },
  { field: 'settlement_status', label: 'Settlement Status', required: false, dataType: 'string' },
  { field: 'remarks', label: 'Remarks', required: false, dataType: 'string' }
]

export default function ReconConfigCentral() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedBank, setSelectedBank] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [currentSchema, setCurrentSchema] = useState<Partial<BankSchema>>({})

  // Fetch all bank schemas
  const { data: schemas, isLoading } = useQuery({
    queryKey: ['bank-schemas'],
    queryFn: async () => {
      // Mock data for now
      return [
        {
          id: 'axis-001',
          bankName: 'Axis Bank',
          bankCode: 'AXIS',
          fileFormat: 'csv' as const,
          delimiter: ',',
          headerRow: 1,
          fieldMappings: {
            transaction_id: { sourceColumn: 'Transaction ID', dataType: 'string' as const },
            utr: { sourceColumn: 'UTR Number', dataType: 'string' as const },
            gross_amount: { sourceColumn: 'Gross Amt', dataType: 'amount' as const, format: 'paise' },
            net_amount: { sourceColumn: 'Net Amt', dataType: 'amount' as const, format: 'paise' },
            transaction_date: { sourceColumn: 'Txn Date', dataType: 'date' as const, format: 'DD/MM/YYYY' }
          },
          sampleHeaders: ['Transaction ID', 'UTR Number', 'Gross Amt', 'Net Amt', 'Txn Date'],
          isActive: true,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-15'
        },
        {
          id: 'hdfc-001',
          bankName: 'HDFC Bank',
          bankCode: 'HDFC',
          fileFormat: 'csv' as const,
          delimiter: ',',
          headerRow: 0,
          fieldMappings: {
            transaction_id: { sourceColumn: 'TXN_ID', dataType: 'string' as const },
            utr: { sourceColumn: 'UTR_NO', dataType: 'string' as const },
            gross_amount: { sourceColumn: 'AMOUNT', dataType: 'amount' as const, format: 'rupees' },
            net_amount: { sourceColumn: 'NET_AMOUNT', dataType: 'amount' as const, format: 'rupees' },
            transaction_date: { sourceColumn: 'TXN_DATE', dataType: 'date' as const, format: 'YYYY-MM-DD' }
          },
          sampleHeaders: ['TXN_ID', 'UTR_NO', 'AMOUNT', 'NET_AMOUNT', 'TXN_DATE'],
          isActive: true,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-10'
        }
      ] as BankSchema[]
    }
  })

  // Save schema mutation
  const saveSchemaMutation = useMutation({
    mutationFn: async (schema: Partial<BankSchema>) => {
      // API call to save schema
      console.log('Saving schema:', schema)
      return schema
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-schemas'] })
      setEditMode(false)
      setCurrentSchema({})
    }
  })

  const handleAddSchema = () => {
    setCurrentSchema({
      bankName: '',
      bankCode: '',
      fileFormat: 'csv',
      delimiter: ',',
      headerRow: 1,
      fieldMappings: {},
      sampleHeaders: [],
      isActive: true
    })
    setEditMode(true)
  }

  const handleEditSchema = (schema: BankSchema) => {
    setCurrentSchema(schema)
    setEditMode(true)
  }

  const handleDeleteSchema = (schemaId: string) => {
    if (confirm('Are you sure you want to delete this schema?')) {
      // Delete schema
      console.log('Deleting schema:', schemaId)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading bank schemas...</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/ops/recon')}
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Reconciliation Configuration</h1>
              <p className="text-sm text-gray-500">Central bank schema management for automatic normalization</p>
            </div>
          </div>
          <button
            onClick={handleAddSchema}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Bank Schema
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Schema List */}
        <div className="w-1/3 border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-medium text-gray-700 uppercase tracking-wider mb-3">
              Configured Banks
            </h2>
            <div className="space-y-2">
              {schemas?.map((schema) => (
                <div
                  key={schema.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedBank === schema.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedBank(schema.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <Database className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-900">{schema.bankName}</span>
                        <span className="text-xs text-gray-500">({schema.bankCode})</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Format: {schema.fileFormat.toUpperCase()} • 
                        {Object.keys(schema.fieldMappings).length} fields mapped
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditSchema(schema)
                        }}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteSchema(schema.id)
                        }}
                        className="p-1 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {schema.isActive ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mt-2">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 mt-2">
                      Inactive
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Schema Details/Editor */}
        <div className="flex-1 overflow-y-auto">
          {editMode ? (
            // Edit Mode
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                {currentSchema.id ? 'Edit Bank Schema' : 'New Bank Schema'}
              </h2>
              
              {/* Bank Details */}
              <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Bank Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Bank Name</label>
                    <input
                      type="text"
                      value={currentSchema.bankName || ''}
                      onChange={(e) => setCurrentSchema({ ...currentSchema, bankName: e.target.value })}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Bank Code</label>
                    <input
                      type="text"
                      value={currentSchema.bankCode || ''}
                      onChange={(e) => setCurrentSchema({ ...currentSchema, bankCode: e.target.value })}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">File Format</label>
                    <select
                      value={currentSchema.fileFormat || 'csv'}
                      onChange={(e) => setCurrentSchema({ ...currentSchema, fileFormat: e.target.value as any })}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
                    >
                      <option value="csv">CSV</option>
                      <option value="excel">Excel</option>
                      <option value="json">JSON</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Header Row</label>
                    <input
                      type="number"
                      value={currentSchema.headerRow || 1}
                      onChange={(e) => setCurrentSchema({ ...currentSchema, headerRow: parseInt(e.target.value) })}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Field Mappings */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Field Mappings</h3>
                <div className="text-xs text-gray-500 mb-3">
                  Map bank file columns to standard reconciliation fields
                </div>
                <div className="space-y-2">
                  {STANDARD_FIELDS.map((field) => (
                    <div key={field.field} className="flex items-center space-x-4">
                      <div className="w-1/3">
                        <span className="text-sm text-gray-700">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </span>
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Bank column name"
                          value={currentSchema.fieldMappings?.[field.field]?.sourceColumn || ''}
                          onChange={(e) => {
                            const mappings = { ...currentSchema.fieldMappings }
                            mappings[field.field] = {
                              ...mappings[field.field],
                              sourceColumn: e.target.value,
                              dataType: field.dataType as any
                            }
                            setCurrentSchema({ ...currentSchema, fieldMappings: mappings })
                          }}
                          className="block w-full border-gray-300 rounded-md shadow-sm text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setEditMode(false)
                    setCurrentSchema({})
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveSchemaMutation.mutate(currentSchema)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Schema
                </button>
              </div>
            </div>
          ) : selectedBank ? (
            // View Mode
            <div className="p-6">
              {(() => {
                const schema = schemas?.find(s => s.id === selectedBank)
                if (!schema) return null
                
                return (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-medium text-gray-900">{schema.bankName} Schema</h2>
                      <button
                        onClick={() => handleEditSchema(schema)}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <Edit2 className="w-4 h-4 mr-1.5" />
                        Edit Schema
                      </button>
                    </div>

                    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Configuration</h3>
                      <dl className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <dt className="text-gray-500">Bank Code</dt>
                          <dd className="font-medium text-gray-900">{schema.bankCode}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">File Format</dt>
                          <dd className="font-medium text-gray-900">{schema.fileFormat.toUpperCase()}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">Header Row</dt>
                          <dd className="font-medium text-gray-900">Row {schema.headerRow}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">Status</dt>
                          <dd>
                            {schema.isActive ? (
                              <span className="text-green-600">Active</span>
                            ) : (
                              <span className="text-gray-500">Inactive</span>
                            )}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Field Mappings</h3>
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead>
                          <tr>
                            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Standard Field
                            </th>
                            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Bank Column
                            </th>
                            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Data Type
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {STANDARD_FIELDS.map((field) => {
                            const mapping = schema.fieldMappings[field.field]
                            return (
                              <tr key={field.field}>
                                <td className="py-2 text-sm text-gray-900">
                                  {field.label}
                                  {field.required && <span className="text-red-500 ml-1">*</span>}
                                </td>
                                <td className="py-2 text-sm">
                                  {mapping ? (
                                    <span className="font-mono text-blue-600">{mapping.sourceColumn}</span>
                                  ) : (
                                    <span className="text-gray-400">Not mapped</span>
                                  )}
                                </td>
                                <td className="py-2 text-sm text-gray-500">
                                  {field.dataType}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              })()}
            </div>
          ) : (
            // Empty State
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500">Select a bank schema to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}