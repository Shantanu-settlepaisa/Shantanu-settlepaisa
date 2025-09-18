import { useState } from 'react'
import { X, Calendar, AlertCircle, Info } from 'lucide-react'
import { format, differenceInDays, eachDayOfInterval } from 'date-fns'
import { sftpPoller } from '@/services/sftp-poller'
import type { Connector } from '@/types/connectors'

interface BackfillModalProps {
  isOpen: boolean
  connector: Connector | null
  onClose: () => void
  onSuccess?: () => void
}

export function BackfillModal({ isOpen, connector, onClose, onSuccess }: BackfillModalProps) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [forceOverwrite, setForceOverwrite] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const handleBackfill = async () => {
    if (!connector || !startDate || !endDate) return

    setProcessing(true)
    setProgress({ current: 0, total: getDayCount() })

    try {
      // Use the SFTP poller service for backfill
      const result = await sftpPoller.backfillDateRange(
        connector,
        startDate,
        endDate,
        forceOverwrite
      )

      if (result.success) {
        alert(`Backfill completed! Processed ${result.daysProcessed} days of data.`)
        onSuccess?.()
        onClose()
      } else {
        alert('Backfill failed. Please check the logs.')
      }
    } catch (error) {
      console.error('Backfill failed:', error)
      alert('Failed to start backfill process')
    } finally {
      setProcessing(false)
      setProgress({ current: 0, total: 0 })
    }
  }

  const getDayCount = () => {
    if (!startDate || !endDate) return 0
    const start = new Date(startDate)
    const end = new Date(endDate)
    return differenceInDays(end, start) + 1
  }

  const getDateRange = () => {
    if (!startDate || !endDate) return []
    const start = new Date(startDate)
    const end = new Date(endDate)
    return eachDayOfInterval({ start, end })
  }

  const estimatedDuration = () => {
    const days = getDayCount()
    const minutesPerDay = 2 // Estimated
    const totalMinutes = days * minutesPerDay
    if (totalMinutes < 60) {
      return `~${totalMinutes} minutes`
    }
    return `~${Math.round(totalMinutes / 60)} hours`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold">Backfill Historical Data</h2>
            <p className="text-sm text-gray-600">{connector?.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Date Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Date Range Summary */}
          {startDate && endDate && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Backfill Summary</span>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                  {getDayCount()} days
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Date Range</span>
                  <p className="font-medium">
                    {format(new Date(startDate), 'MMM d')} - {format(new Date(endDate), 'MMM d, yyyy')}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600">Estimated Duration</span>
                  <p className="font-medium">{estimatedDuration()}</p>
                </div>
              </div>

              {getDayCount() > 30 && (
                <div className="rounded-lg bg-yellow-50 p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-800">
                    Large backfill detected. This may take several hours to complete.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Options */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="force"
              checked={forceOverwrite}
              onChange={(e) => setForceOverwrite(e.target.checked)}
              className="mt-1"
            />
            <div>
              <label htmlFor="force" className="text-sm font-medium cursor-pointer">
                Force Re-download
              </label>
              <p className="text-xs text-gray-600">
                Re-download and process files even if they were already processed
              </p>
            </div>
          </div>

          {/* Info Box */}
          <div className="rounded-lg bg-blue-50 p-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Backfill will:</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs">
                  <li>Check for files matching the configured pattern for each date</li>
                  <li>Download and validate files with checksums if available</li>
                  <li>Normalize data using the configured mapping template</li>
                  <li>Trigger reconciliation if matching PG files exist</li>
                  <li>Create exceptions for any missing bank files</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Preview of dates */}
          {startDate && endDate && getDayCount() <= 7 && (
            <div>
              <label className="text-xs font-medium text-gray-700">Files to Process</label>
              <div className="mt-1 rounded-lg bg-gray-50 p-3 space-y-1">
                {getDateRange().map(date => (
                  <div key={date.toISOString()} className="text-xs font-mono text-gray-600">
                    {connector?.provider}_RECON_{format(date, 'yyyyMMdd')}.csv
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {processing && progress.total > 0 && (
            <div>
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Processing...</span>
                <span>{progress.current} / {progress.total} days</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={processing}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleBackfill}
            disabled={!startDate || !endDate || processing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? 'Processing...' : `Start Backfill (${getDayCount()} days)`}
          </button>
        </div>
      </div>
    </div>
  )
}