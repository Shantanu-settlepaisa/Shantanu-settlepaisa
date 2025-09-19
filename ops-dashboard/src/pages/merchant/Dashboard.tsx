// Merchant Dashboard Page
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  DollarSign, TrendingUp, AlertTriangle, CheckCircle, 
  Clock, FileText, Shield, CreditCard
} from 'lucide-react'

export default function MerchantDashboard() {
  const navigate = useNavigate()

  const stats = [
    {
      title: 'Total Revenue',
      value: '₹12,45,678',
      change: '+12.5%',
      icon: DollarSign,
      color: 'text-green-600'
    },
    {
      title: 'Pending Settlement',
      value: '₹2,34,567',
      change: '3 batches',
      icon: Clock,
      color: 'text-yellow-600'
    },
    {
      title: 'Active Disputes',
      value: '3',
      change: '₹17,500',
      icon: AlertTriangle,
      color: 'text-red-600'
    },
    {
      title: 'Success Rate',
      value: '98.5%',
      change: '+0.5%',
      icon: TrendingUp,
      color: 'text-blue-600'
    }
  ]

  const quickActions = [
    {
      title: 'View Disputes',
      description: 'Manage chargebacks and upload evidence',
      icon: Shield,
      action: () => navigate('/merchant/disputes'),
      color: 'bg-red-50 text-red-600'
    },
    {
      title: 'Settlements',
      description: 'Track your settlement batches',
      icon: DollarSign,
      action: () => navigate('/merchant/settlements'),
      color: 'bg-green-50 text-green-600'
    },
    {
      title: 'Payments',
      description: 'View transaction history',
      icon: CreditCard,
      action: () => navigate('/merchant/payments'),
      color: 'bg-blue-50 text-blue-600'
    },
    {
      title: 'Reports',
      description: 'Download financial reports',
      icon: FileText,
      action: () => navigate('/merchant/reports'),
      color: 'bg-purple-50 text-purple-600'
    }
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Welcome back, Demo Merchant
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{stat.title}</p>
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
                    <p className={`text-sm mt-1 ${stat.color}`}>{stat.change}</p>
                  </div>
                  <Icon className={`h-8 w-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Card 
                key={action.title}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={action.action}
              >
                <CardContent className="p-6">
                  <div className={`w-12 h-12 rounded-lg ${action.color} flex items-center justify-center mb-4`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold">{action.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{action.description}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest transactions and events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <div>
                  <p className="text-sm font-medium">Settlement Processed</p>
                  <p className="text-xs text-gray-500">Batch SETTLE-2025-01-10 • ₹3,45,678</p>
                </div>
              </div>
              <span className="text-xs text-gray-500">2 hours ago</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <div>
                  <p className="text-sm font-medium">New Dispute Raised</p>
                  <p className="text-xs text-gray-500">HDFC-CB-2025-101 • ₹5,000</p>
                </div>
              </div>
              <span className="text-xs text-gray-500">5 hours ago</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <div>
                  <p className="text-sm font-medium">Evidence Submitted</p>
                  <p className="text-xs text-gray-500">AXIS-CB-2025-103 • 2 files uploaded</p>
                </div>
              </div>
              <span className="text-xs text-gray-500">1 day ago</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}