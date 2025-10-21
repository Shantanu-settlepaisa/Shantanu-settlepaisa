import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authService } from '@/services/auth-service'

export type UserRole = 'sp-ops' | 'sp-finance' | 'sp-compliance' | 'auditor' | 'merchant-admin' | 'merchant-ops' | 'merchant-viewer'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  merchantId?: string
  backendRole?: 'ADMIN' | 'OPS_MANAGER' | 'OPS_VIEWER' | 'FINANCE'
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (user: User, token: string) => void
  logout: () => Promise<void>
  hasRole: (roles: UserRole[]) => boolean
  canAccessOps: () => boolean
  refreshUser: () => Promise<void>
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

      logout: async () => {
        // Call backend logout endpoint
        await authService.logout()
        // Clear local state
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

      refreshUser: async () => {
        const currentUser = await authService.getCurrentUser()
        if (currentUser) {
          const mappedRole = authService.mapBackendRoleToFrontend(currentUser.role)
          set({
            user: {
              id: currentUser.id,
              email: currentUser.email,
              name: currentUser.full_name,
              role: mappedRole,
              backendRole: currentUser.role,
            },
            isAuthenticated: true,
          })
        } else {
          set({ user: null, isAuthenticated: false })
        }
      },
    }),
    {
      name: 'auth-storage',
    }
  )
)