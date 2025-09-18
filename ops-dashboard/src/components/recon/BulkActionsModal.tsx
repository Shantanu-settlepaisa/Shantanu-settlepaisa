import { useState } from 'react'
import { X, Users, AlertTriangle } from 'lucide-react'

interface BulkActionsModalProps {
  selectedCount: number
  isOpen: boolean
  onClose: () => void
  onAction: (
    action: 'accept_pg' | 'accept_bank' | 'mark_investigate' | 'write_off' | 'assign',
    note?: string,
    assignTo?: string
  ) => void
}

export function BulkActionsModal({ selectedCount, isOpen, onClose, onAction }: BulkActionsModalProps) {
  const [action, setAction] = useState<string>('')
  const [note, setNote] = useState('')
  const [assignTo, setAssignTo] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleSubmit = () => {
    if (!action) return
    setConfirmOpen(true)
  }

  const handleConfirm = () => {
    onAction(
      action as any,
      note || undefined,
      action === 'assign' ? assignTo : undefined
    )
    
    // Reset form
    setAction('')
    setNote('')
    setAssignTo('')
    setConfirmOpen(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        
        <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
          {!confirmOpen ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-medium leading-6 text-gray-900">
                      Bulk Actions
                    </h3>
                    <p className="text-sm text-gray-500">
                      Apply action to {selectedCount} selected items
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-md text-gray-400 hover:text-gray-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Action
                  </label>
                  <select
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  >
                    <option value="">Select action...</option>
                    <option value="accept_pg">Accept PG Amount</option>
                    <option value="accept_bank">Accept Bank Amount</option>
                    <option value="mark_investigate">Mark for Investigation</option>
                    <option value="write_off">Write Off</option>
                    <option value="assign">Assign to Team Member</option>
                  </select>
                </div>

                {action === 'assign' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Assign To
                    </label>
                    <input
                      type="text"
                      value={assignTo}
                      onChange={(e) => setAssignTo(e.target.value)}
                      placeholder="Enter email or username"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Note (optional)
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    placeholder="Add a note about this bulk action..."
                  />
                </div>

                {/* Summary */}
                <div className="rounded-md bg-blue-50 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertTriangle className="h-5 w-5 text-blue-400" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800">
                        Impact Summary
                      </h3>
                      <div className="mt-2 text-sm text-blue-700">
                        <p>This action will be applied to {selectedCount} reconciliation records.</p>
                        {action === 'accept_pg' && (
                          <p className="mt-1">PG amounts will be accepted as the source of truth.</p>
                        )}
                        {action === 'accept_bank' && (
                          <p className="mt-1">Bank amounts will be accepted as the source of truth.</p>
                        )}
                        {action === 'write_off' && (
                          <p className="mt-1">Differences will be written off and marked as resolved.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!action || (action === 'assign' && !assignTo)}
                  className="inline-flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 sm:col-start-2 sm:text-sm"
                >
                  Apply Action
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:col-start-1 sm:mt-0 sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Confirmation */}
              <div className="sm:flex sm:items-start">
                <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                  <h3 className="text-lg font-medium leading-6 text-gray-900">
                    Confirm Bulk Action
                  </h3>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">
                      Are you sure you want to apply "{action.replace(/_/g, ' ')}" to {selectedCount} items?
                      This action cannot be undone.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="inline-flex w-full justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:mt-0 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}