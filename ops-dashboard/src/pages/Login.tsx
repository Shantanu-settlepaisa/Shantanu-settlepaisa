import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore, UserRole } from '@/lib/auth'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('sp-ops')
  const [portal, setPortal] = useState<'ops' | 'merchant'>('ops')
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Demo login - accept any credentials
    const user = {
      id: `user-${Date.now()}`,
      email,
      name: email.split('@')[0],
      role,
      merchantId: portal === 'merchant' ? 'merchant-1' : undefined
    }
    
    login(user, 'demo-token')
    
    // Navigate based on role
    if (portal === 'merchant') {
      navigate('/merchant')
    } else {
      navigate('/ops')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            SettlePaisa
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to access your dashboard
          </p>
        </div>
        
        {/* Portal Selector */}
        <div className="flex justify-center space-x-4">
          <button
            type="button"
            className={`px-4 py-2 rounded-md font-medium ${
              portal === 'ops' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            onClick={() => {
              setPortal('ops')
              setRole('sp-ops')
            }}
          >
            Ops Portal
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded-md font-medium ${
              portal === 'merchant' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            onClick={() => {
              setPortal('merchant')
              setRole('merchant-admin')
            }}
          >
            Merchant Portal
          </button>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder={portal === 'merchant' ? 'merchant@demo.com' : 'ops@settlepaisa.com'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="role" className="sr-only">
                Role
              </label>
              <select
                id="role"
                name="role"
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                {portal === 'ops' ? (
                  <>
                    <option value="sp-ops">Operations</option>
                    <option value="sp-finance">Finance</option>
                    <option value="sp-compliance">Compliance</option>
                  </>
                ) : (
                  <>
                    <option value="merchant-admin">Merchant Admin</option>
                    <option value="merchant-ops">Merchant Ops</option>
                    <option value="merchant-viewer">Merchant Viewer</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-gray-600">Demo Mode: Any credentials work</span>
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}