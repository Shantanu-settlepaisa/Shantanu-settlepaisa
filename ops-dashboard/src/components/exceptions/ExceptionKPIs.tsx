import { AlertCircle, Clock, CheckCircle, TrendingUp, AlertTriangle, Archive } from 'lucide-react'

interface KPIMetrics {
  open: number
  investigating: number
  snoozed: number
  slaBreached: number
  resolved7d: number
  last24hInflow: number
}

interface ExceptionKPIsProps {
  metrics: KPIMetrics
}

export function ExceptionKPIs({ metrics }: ExceptionKPIsProps) {
  const kpis = [
    {
      label: 'Open',
      value: metrics.open,
      icon: AlertCircle,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200'
    },
    {
      label: 'Investigating',
      value: metrics.investigating,
      icon: Clock,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200'
    },
    {
      label: 'Snoozed',
      value: metrics.snoozed,
      icon: Archive,
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200'
    },
    {
      label: 'SLA Breached',
      value: metrics.slaBreached,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200'
    },
    {
      label: 'Resolved (7d)',
      value: metrics.resolved7d,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    {
      label: 'Last 24h Inflow',
      value: metrics.last24hInflow,
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200'
    }
  ]

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="grid grid-cols-6 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <div
              key={kpi.label}
              className={`rounded-lg border ${kpi.borderColor} ${kpi.bgColor} p-4`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-600">{kpi.label}</p>
                  <p className={`text-2xl font-bold ${kpi.color} mt-1`}>
                    {kpi.value.toLocaleString()}
                  </p>
                </div>
                <Icon className={`w-8 h-8 ${kpi.color} opacity-20`} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}