import { useState, useEffect } from 'react'
import { Save, Plus, Trash2, AlertCircle } from 'lucide-react'

interface MappingTemplate {
  id?: string
  name: string
  scope: 'global' | 'merchant'
  acquirer: string
  fieldMap: Record<string, string>
  dateFormats: Record<string, string>
  amountParsers: Record<string, AmountParser>
}

interface AmountParser {
  type: 'inr_to_paise' | 'paise' | 'custom'
  multiplier?: number
  decimalPlaces?: number
}

interface MappingTemplateEditorProps {
  template?: MappingTemplate
  bankFields: string[]
  onSave: (template: MappingTemplate) => void
  onCancel: () => void
}

const INTERNAL_FIELDS = [
  'utr',
  'bank_txn_id',
  'rrn',
  'amount',
  'fee',
  'tax',
  'gst',
  'tds',
  'txn_time',
  'bank_status',
  'merchant_ref',
  'order_id',
  'customer_id',
  'payment_method',
]

const DATE_FORMATS = [
  'dd-MMM-yy HH:mm:ss',
  'yyyy-MM-dd HH:mm:ss',
  'dd/MM/yyyy HH:mm:ss',
  'MM/dd/yyyy HH:mm:ss',
  'yyyy-MM-dd\'T\'HH:mm:ss\'Z\'',
  'dd-MM-yyyy',
  'yyyy-MM-dd',
]

export function MappingTemplateEditor({ 
  template, 
  bankFields, 
  onSave, 
  onCancel 
}: MappingTemplateEditorProps) {
  const [formData, setFormData] = useState<MappingTemplate>({
    name: '',
    scope: 'merchant',
    acquirer: '',
    fieldMap: {},
    dateFormats: {},
    amountParsers: {},
    ...template,
  })

  const [mappings, setMappings] = useState<Array<{
    bankField: string
    internalField: string
    dataType: 'string' | 'amount' | 'date'
    dateFormat?: string
    amountParser?: AmountParser
  }>>([])

  useEffect(() => {
    // Convert fieldMap to mappings array
    if (formData.fieldMap) {
      const mappingsList = Object.entries(formData.fieldMap).map(([bankField, internalField]) => {
        const dataType = formData.dateFormats[bankField] ? 'date' : 
                        formData.amountParsers[bankField] ? 'amount' : 'string'
        
        return {
          bankField,
          internalField,
          dataType,
          dateFormat: formData.dateFormats[bankField],
          amountParser: formData.amountParsers[bankField],
        }
      })
      setMappings(mappingsList)
    }
  }, [])

  const addMapping = () => {
    setMappings([...mappings, {
      bankField: '',
      internalField: '',
      dataType: 'string',
    }])
  }

  const removeMapping = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index))
  }

  const updateMapping = (index: number, field: string, value: any) => {
    const updated = [...mappings]
    updated[index] = { ...updated[index], [field]: value }
    setMappings(updated)
  }

  const handleSave = () => {
    // Convert mappings to fieldMap, dateFormats, amountParsers
    const fieldMap: Record<string, string> = {}
    const dateFormats: Record<string, string> = {}
    const amountParsers: Record<string, AmountParser> = {}

    mappings.forEach(mapping => {
      if (mapping.bankField && mapping.internalField) {
        fieldMap[mapping.bankField] = mapping.internalField
        
        if (mapping.dataType === 'date' && mapping.dateFormat) {
          dateFormats[mapping.bankField] = mapping.dateFormat
        }
        
        if (mapping.dataType === 'amount' && mapping.amountParser) {
          amountParsers[mapping.bankField] = mapping.amountParser
        }
      }
    })

    onSave({
      ...formData,
      fieldMap,
      dateFormats,
      amountParsers,
    })
  }

  return (
    <div className="bg-white rounded-lg shadow-lg max-h-[80vh] overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
        <h3 className="text-lg font-medium">
          {template ? 'Edit Mapping Template' : 'Create Mapping Template'}
        </h3>
      </div>

      <div className="p-6 space-y-6">
        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Template Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300"
              placeholder="e.g., ICICI NEFT v1"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Acquirer</label>
            <select
              value={formData.acquirer}
              onChange={(e) => setFormData({ ...formData, acquirer: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300"
              required
            >
              <option value="">Select acquirer...</option>
              <option value="ICICI Bank">ICICI Bank</option>
              <option value="HDFC Bank">HDFC Bank</option>
              <option value="SBI">SBI</option>
              <option value="Axis Bank">Axis Bank</option>
              <option value="Bank of Baroda">Bank of Baroda</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Scope</label>
            <select
              value={formData.scope}
              onChange={(e) => setFormData({ ...formData, scope: e.target.value as 'global' | 'merchant' })}
              className="mt-1 block w-full rounded-md border-gray-300"
            >
              <option value="merchant">Merchant Specific</option>
              <option value="global">Global (All Merchants)</option>
            </select>
          </div>
        </div>

        {/* Field Mappings */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-900">Field Mappings</h4>
            <button
              type="button"
              onClick={addMapping}
              className="inline-flex items-center px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Mapping
            </button>
          </div>

          {bankFields.length > 0 && (
            <div className="mb-3 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <AlertCircle className="inline w-4 h-4 mr-1" />
                Detected bank fields: {bankFields.join(', ')}
              </p>
            </div>
          )}

          <div className="space-y-3">
            {mappings.map((mapping, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Bank Field
                  </label>
                  <select
                    value={mapping.bankField}
                    onChange={(e) => updateMapping(index, 'bankField', e.target.value)}
                    className="block w-full rounded-md border-gray-300 text-sm"
                  >
                    <option value="">Select...</option>
                    {bankFields.map(field => (
                      <option key={field} value={field}>{field}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Maps To
                  </label>
                  <select
                    value={mapping.internalField}
                    onChange={(e) => updateMapping(index, 'internalField', e.target.value)}
                    className="block w-full rounded-md border-gray-300 text-sm"
                  >
                    <option value="">Select...</option>
                    {INTERNAL_FIELDS.map(field => (
                      <option key={field} value={field}>{field}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Data Type
                  </label>
                  <select
                    value={mapping.dataType}
                    onChange={(e) => updateMapping(index, 'dataType', e.target.value)}
                    className="block w-full rounded-md border-gray-300 text-sm"
                  >
                    <option value="string">String</option>
                    <option value="amount">Amount</option>
                    <option value="date">Date/Time</option>
                  </select>
                </div>

                {mapping.dataType === 'date' && (
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Date Format
                    </label>
                    <select
                      value={mapping.dateFormat || ''}
                      onChange={(e) => updateMapping(index, 'dateFormat', e.target.value)}
                      className="block w-full rounded-md border-gray-300 text-sm"
                    >
                      <option value="">Select format...</option>
                      {DATE_FORMATS.map(format => (
                        <option key={format} value={format}>{format}</option>
                      ))}
                    </select>
                  </div>
                )}

                {mapping.dataType === 'amount' && (
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Amount Type
                    </label>
                    <select
                      value={mapping.amountParser?.type || 'inr_to_paise'}
                      onChange={(e) => updateMapping(index, 'amountParser', { 
                        type: e.target.value as any 
                      })}
                      className="block w-full rounded-md border-gray-300 text-sm"
                    >
                      <option value="inr_to_paise">INR to Paise (×100)</option>
                      <option value="paise">Already in Paise</option>
                      <option value="custom">Custom Multiplier</option>
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => removeMapping(index)}
                  className="mt-6 p-1 text-red-600 hover:text-red-800"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {mappings.length === 0 && (
              <div className="text-center py-6 text-gray-500">
                <p className="text-sm">No mappings defined yet.</p>
                <p className="text-xs mt-1">Click "Add Mapping" to get started.</p>
              </div>
            )}
          </div>
        </div>

        {/* Sample Mappings */}
        <div className="p-4 bg-amber-50 rounded-lg">
          <h4 className="text-sm font-medium text-amber-900 mb-2">Common Mappings</h4>
          <div className="text-xs text-amber-700 space-y-1">
            <p>• UTR/ReferenceNo → utr</p>
            <p>• AMOUNT_INR/Amount (₹) → amount (with INR to Paise conversion)</p>
            <p>• FEE_INR/Charges (₹) → fee</p>
            <p>• GST_INR/Tax (₹) → tax</p>
            <p>• TXN_DATE/TxnDateTime → txn_time (with date format)</p>
            <p>• STATUS/TxnStatus → bank_status</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!formData.name || !formData.acquirer || mappings.length === 0}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Template
          </button>
        </div>
      </div>
    </div>
  )
}