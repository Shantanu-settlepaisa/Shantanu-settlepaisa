import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Suspense } from 'react'
import { 
  LayoutDashboard, 
  Receipt, 
  Shield,
  FileText, 
  CreditCard,
  Settings,
  LogOut,
  User,
  HelpCircle
} from 'lucide-react'
import { useAuthStore } from '@/lib/auth'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/merchant/dashboard', icon: LayoutDashboard },
  { name: 'Payments', href: '/merchant/payments', icon: CreditCard },
  { name: 'Settlements', href: '/merchant/settlements', icon: Receipt },
  { name: 'Disputes', href: '/merchant/disputes', icon: Shield },
  { name: 'Reports', href: '/merchant/reports', icon: FileText },
  { name: 'Settings', href: '/merchant/settings', icon: Settings },
]

export function MerchantLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-xl font-bold text-gray-900">SettlePaisa</h1>
            <p className="text-sm text-gray-500">Merchant Portal</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    'flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  )
                }
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.name}
              </NavLink>
            ))}
          </nav>

          {/* Help section */}
          <div className="p-4 border-t border-gray-200">
            <a
              href="/help"
              className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50"
            >
              <HelpCircle className="w-5 h-5 mr-3" />
              Help & Support
            </a>
          </div>

          {/* User section */}
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">{user?.name || 'Merchant User'}</p>
                  <p className="text-xs text-gray-500">{user?.role || 'merchant-admin'}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading...</p>
              </div>
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </div>
    </div>
  )
}