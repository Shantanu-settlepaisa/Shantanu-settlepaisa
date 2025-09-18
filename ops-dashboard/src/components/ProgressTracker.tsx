import { CheckCircle, Circle, Clock } from 'lucide-react'
import { formatCompactINR } from '@/lib/utils'

interface Stage {
  name: string
  status: 'completed' | 'active' | 'pending'
  count: number
  valuePaise: number
  percentage: number
}

interface ProgressTrackerProps {
  stages: Stage[]
}

export function ProgressTracker({ stages }: ProgressTrackerProps) {
  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div className="relative">
        <div className="overflow-hidden h-3 bg-gray-200 rounded-full">
          <div className="flex h-full">
            {stages.map((stage, index) => (
              <div
                key={stage.name}
                className={`transition-all duration-500 ${
                  stage.status === 'completed' ? 'bg-green-500' :
                  stage.status === 'active' ? 'bg-blue-500' :
                  'bg-gray-300'
                }`}
                style={{ width: `${stage.percentage}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Stage Details */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stages.map((stage, index) => (
          <div key={stage.name} className="relative">
            {index < stages.length - 1 && (
              <div className="hidden md:block absolute top-5 left-full w-full h-0.5 bg-gray-300 -z-10" />
            )}
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-1">
                {stage.status === 'completed' ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : stage.status === 'active' ? (
                  <Clock className="w-5 h-5 text-blue-500" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{stage.name}</p>
                <p className="text-sm text-gray-500">{stage.count} txns</p>
                <p className="text-xs text-gray-500">{formatCompactINR(stage.valuePaise)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}