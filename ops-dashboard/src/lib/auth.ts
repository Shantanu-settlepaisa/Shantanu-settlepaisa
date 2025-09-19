import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole = 'sp-ops' | 'sp-finance' | 'sp-compliance' | 'auditor' | 'merchant-admin' | 'merchant-ops' | 'merchant-viewer'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  merchantId?: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (user: User, token: string) => void
  logout: () => void
  hasRole: (roles: UserRole[]) => boolean
  canAccessOps: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (user, token) => {
        set({ user, token, isAuthenticated: true })
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false })
      },

      hasRole: (roles) => {
        const { user } = get()
        return user ? roles.includes(user.role) : false
      },

      canAccessOps: () => {
        const { user } = get()
        return user ? ['sp-ops', 'sp-finance', 'sp-compliance'].includes(user.role) : false
      },
    }),
    {
      name: 'auth-storage',
    }
  )
)

// Demo mode: Auto-login with sp-ops role for SettlePaisa 2.0 Ops Dashboard
if (import.meta.env.VITE_DEMO_MODE === 'true') {
  // Clear old localStorage data and force ops login
  localStorage.removeItem('auth-storage')
  
  // Use setTimeout to ensure Zustand has initialized
  setTimeout(() => {
    const store = useAuthStore.getState()
    console.log('Demo mode - forcing logout and re-login with sp-ops role')
    
    // Force logout first to clear any existing state
    store.logout()
    
    // Then login with correct ops role
    store.login(
      {
        id: 'demo-ops-user',
        email: 'ops@settlepaisa.com',
        name: 'Demo Operations Admin',
        role: 'sp-ops',
        merchantId: undefined,
      },
      'demo-ops-token'
    )
    
    console.log('New auth state:', { isAuthenticated: store.isAuthenticated, role: store.user?.role })
  }, 50)
}