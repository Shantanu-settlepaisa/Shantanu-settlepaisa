import { LucideIcon, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react'
import { formatCompactINR } from '@/lib/utils'
import { useState, useRef, useEffect } from 'react'

interface KpiCardEnhancedProps {
  title: string
  value: string | number
  subtitle: string
  contextLine?: string
  rangeLabel?: string
  icon: LucideIcon
  trend?: {
    value: number
    direction: 'up' | 'down' | 'neutral'
    compareLabel?: string
  }
  color: 'green' | 'amber' | 'red' | 'blue'
  loading?: boolean
  tooltip?: string
  format?: 'number' | 'percentage' | 'currency'
}

export function KpiCardEnhanced({
  title,
  value,
  subtitle,
  contextLine,
  rangeLabel,
  icon: Icon,
  trend,
  color,
  loading = false,
  tooltip,
  format = 'number'
}: KpiCardEnhancedProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setShowTooltip(false)
      }
    }
    
    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTooltip])
  
  const colorClasses = {
    green: {
      bg: 'bg-green-50',
      icon: 'text-green-600',
      trend: 'text-green-600',
      border: 'border-green-200'
    },
    amber: {
      bg: 'bg-amber-50',
      icon: 'text-amber-600',
      trend: 'text-amber-600',
      border: 'border-amber-200'
    },
    red: {
      bg: 'bg-red-50',
      icon: 'text-red-600',
      trend: 'text-red-600',
      border: 'border-red-200'
    },
    blue: {
      bg: 'bg-blue-50',
      icon: 'text-blue-600',
      trend: 'text-blue-600',
      border: 'border-blue-200'
    }
  }
  
  const formatValue = (val: string | number) => {
    if (format === 'currency' && typeof val === 'number') {
      return formatCompactINR(val)
    }
    if (format === 'percentage' && typeof val === 'number') {
      return `${val}%`
    }
    return val
  }
  
  const TrendIcon = trend?.direction === 'up' ? TrendingUp : 
                    trend?.direction === 'down' ? TrendingDown : 
                    Minus
  
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 bg-gray-200 rounded w-24"></div>
          <div className="h-8 w-8 bg-gray-200 rounded"></div>
        </div>
        <div className="h-8 bg-gray-200 rounded w-32 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-48"></div>
      </div>
    )
  }
  
  return (
    <div className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-900">{title}</h3>
            {tooltip && (
              <div className="relative" ref={tooltipRef}>
                <button
                  onClick={() => setShowTooltip(!showTooltip)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
                {showTooltip && (
                  <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg">
                    {tooltip}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                      <div className="border-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={`p-2 rounded-lg ${colorClasses[color].bg}`}>
            <Icon className={`w-5 h-5 ${colorClasses[color].icon}`} />
          </div>
        </div>
        
        <div className="space-y-1">
          <div className="text-2xl font-bold text-gray-900">
            {formatValue(value)}
          </div>
          
          {contextLine && rangeLabel && (
            <p className="text-sm text-gray-600">
              {contextLine} — for {rangeLabel}
            </p>
          )}
          
          {!contextLine && subtitle && (
            <p className="text-sm text-gray-600">{subtitle}</p>
          )}
          
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <TrendIcon className={`w-4 h-4 ${
                trend.direction === 'up' ? 'text-green-600' :
                trend.direction === 'down' ? 'text-red-600' :
                'text-gray-400'
              }`} />
              <span className={`text-sm font-medium ${
                trend.direction === 'up' ? 'text-green-600' :
                trend.direction === 'down' ? 'text-red-600' :
                'text-gray-600'
              }`}>
                {trend.direction === 'neutral' ? '—' : 
                 `${trend.direction === 'up' ? '↑' : '↓'} ${trend.value.toFixed(1)}%`}
              </span>
              {trend.compareLabel && (
                <span className="text-sm text-gray-500">
                  vs {trend.compareLabel}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}