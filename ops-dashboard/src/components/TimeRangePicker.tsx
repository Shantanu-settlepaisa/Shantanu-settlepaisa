import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown, Clock } from 'lucide-react'
import { format, startOfDay, endOfDay, subDays, startOfMonth } from 'date-fns'

export type TimeRange = 
  | 'today'
  | 'yesterday' 
  | 'last7d'
  | 'last30d'
  | 'mtd'
  | { start: Date; end: Date; label: string }

interface TimeRangePickerProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
  timezone?: string
  className?: string
}

const presets = [
  { value: 'today', label: 'Today', shortLabel: 'Today' },
  { value: 'yesterday', label: 'Yesterday', shortLabel: 'Yesterday' },
  { value: 'last7d', label: 'Last 7 days', shortLabel: '7d' },
  { value: 'last30d', label: 'Last 30 days', shortLabel: '30d' },
  { value: 'mtd', label: 'Month to date', shortLabel: 'MTD' },
] as const

export function getTimeRangeLabel(range: TimeRange): string {
  if (typeof range === 'string') {
    return presets.find(p => p.value === range)?.label || range
  }
  return range.label
}

export function getTimeRangeShortLabel(range: TimeRange): string {
  if (typeof range === 'string') {
    return presets.find(p => p.value === range)?.shortLabel || range
  }
  return range.label
}

export function getTimeRangeBounds(range: TimeRange, tz: string = 'Asia/Kolkata'): { start: Date; end: Date } {
  const now = new Date()
  
  switch (range) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) }
    case 'yesterday':
      const yesterday = subDays(now, 1)
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) }
    case 'last7d':
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) }
    case 'last30d':
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) }
    case 'mtd':
      return { start: startOfMonth(now), end: endOfDay(now) }
    default:
      if (typeof range === 'object') {
        return { start: range.start, end: range.end }
      }
      // Default to last 7 days
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) }
  }
}

export function TimeRangePicker({ value, onChange, timezone = 'Asia/Kolkata', className = '' }: TimeRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setShowCustom(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  const handlePresetClick = (preset: typeof presets[number]) => {
    onChange(preset.value as TimeRange)
    setIsOpen(false)
    setShowCustom(false)
  }
  
  const handleCustomSubmit = () => {
    if (customStart && customEnd) {
      const start = new Date(customStart)
      const end = new Date(customEnd)
      onChange({
        start,
        end,
        label: `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`
      })
      setIsOpen(false)
      setShowCustom(false)
    }
  }
  
  const currentLabel = getTimeRangeLabel(value)
  
  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-500"
      >
        <Calendar className="w-4 h-4 mr-2 text-gray-500" />
        <span>{currentLabel}</span>
        <ChevronDown className="w-4 h-4 ml-2 text-gray-400" />
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          {!showCustom ? (
            <div className="py-2">
              {presets.map(preset => (
                <button
                  key={preset.value}
                  onClick={() => handlePresetClick(preset)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center justify-between ${
                    typeof value === 'string' && value === preset.value ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                  }`}
                >
                  <span>{preset.label}</span>
                  {typeof value === 'string' && value === preset.value && (
                    <Clock className="w-4 h-4" />
                  )}
                </button>
              ))}
              <div className="border-t border-gray-200 my-2"></div>
              <button
                onClick={() => setShowCustom(true)}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Custom range...
              </button>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Start date</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">End date</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowCustom(false)}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCustomSubmit}
                  disabled={!customStart || !customEnd}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
          
          {!showCustom && (
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                Timezone: {timezone}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}