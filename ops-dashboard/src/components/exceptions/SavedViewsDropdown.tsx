import { useState } from 'react'
import { Bookmark, ChevronDown, Plus, Eye } from 'lucide-react'
import type { SavedView } from '@/types/exceptions'

interface SavedViewsDropdownProps {
  views: SavedView[]
  selectedView: SavedView | null
  onSelect: (view: SavedView) => void
}

export function SavedViewsDropdown({ views, selectedView, onSelect }: SavedViewsDropdownProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
      >
        <Bookmark className="w-4 h-4 mr-2" />
        {selectedView ? selectedView.name : 'Saved Views'}
        <ChevronDown className="w-4 h-4 ml-2" />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-2 border-b border-gray-200">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-sm font-medium text-gray-900">Saved Views</span>
              <button className="text-blue-600 hover:text-blue-800">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {views.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                No saved views
              </div>
            ) : (
              <div className="py-1">
                {views.map((view) => (
                  <button
                    key={view.id}
                    onClick={() => {
                      onSelect(view)
                      setOpen(false)
                    }}
                    className={`w-full text-left px-4 py-2 hover:bg-gray-50 ${
                      selectedView?.id === view.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <Eye className="w-4 h-4 text-gray-400 mr-2" />
                          <span className="text-sm font-medium text-gray-900">
                            {view.name}
                          </span>
                        </div>
                        {view.description && (
                          <p className="text-xs text-gray-500 mt-0.5 ml-6">
                            {view.description}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 ml-2">
                        {view.useCount}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-2 border-t border-gray-200">
            <button className="w-full text-left px-2 py-1 text-sm text-blue-600 hover:text-blue-800">
              Manage Views...
            </button>
          </div>
        </div>
      )}
    </div>
  )
}