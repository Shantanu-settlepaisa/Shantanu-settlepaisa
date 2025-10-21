/**
 * Authentication Service
 *
 * Handles all authentication-related API calls to the backend.
 * Uses the Phase 1 JWT authentication endpoints deployed on staging.
 */

import axios from 'axios'

// Get API base URL from environment variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5108'

// Create axios instance with default config
const authClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 second timeout
})

// Add request interceptor to include JWT token
authClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('jwt_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Add response interceptor to handle auth errors
authClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - clear auth and redirect to login
      localStorage.removeItem('jwt_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('auth-storage')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Types
export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  success: boolean
  data?: {
    token: string
    refreshToken: string
    expiresAt: string
    user: {
      id: string
      email: string
      full_name: string
      role: 'ADMIN' | 'OPS_MANAGER' | 'OPS_VIEWER' | 'FINANCE'
    }
  }
  error?: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export interface User {
  id: string
  email: string
  full_name: string
  role: 'ADMIN' | 'OPS_MANAGER' | 'OPS_VIEWER' | 'FINANCE'
  is_active: boolean
  last_login_at?: string
}

/**
 * Authentication Service Class
 */
class AuthService {
  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      const response = await authClient.post<LoginResponse>('/api/auth/login', {
        email,
        password,
      })

      if (response.data.success && response.data.data) {
        // Store tokens in localStorage
        localStorage.setItem('jwt_token', response.data.data.token)
        localStorage.setItem('refresh_token', response.data.data.refreshToken)
        localStorage.setItem('token_expires_at', response.data.data.expiresAt)
      }

      return response.data
    } catch (error: any) {
      if (error.response?.data) {
        return error.response.data
      }
      return {
        success: false,
        error: error.message || 'Login failed. Please try again.',
      }
    }
  }

  /**
   * Logout and revoke session
   */
  async logout(): Promise<void> {
    try {
      await authClient.post('/api/auth/logout')
    } catch (error) {
      console.error('Logout API call failed:', error)
    } finally {
      // Clear tokens regardless of API response
      localStorage.removeItem('jwt_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('token_expires_at')
      localStorage.removeItem('auth-storage')
    }
  }

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      const response = await authClient.get<{ success: boolean; data: { user: User } }>('/api/auth/me')
      if (response.data.success) {
        return response.data.data.user
      }
      return null
    } catch (error) {
      console.error('Get current user failed:', error)
      return null
    }
  }

  /**
   * Verify JWT token validity
   */
  async verifyToken(token: string): Promise<boolean> {
    try {
      const response = await authClient.post<{ success: boolean; data: { valid: boolean } }>('/api/auth/verify-token', {
        token,
      })
      return response.data.data?.valid || false
    } catch (error) {
      return false
    }
  }

  /**
   * Change user password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await authClient.post<{ success: boolean; message?: string; error?: string }>('/api/auth/change-password', {
        currentPassword,
        newPassword,
      })
      return response.data
    } catch (error: any) {
      if (error.response?.data) {
        return error.response.data
      }
      return {
        success: false,
        error: error.message || 'Password change failed',
      }
    }
  }

  /**
   * Register new user (admin only)
   */
  async registerUser(email: string, password: string, full_name: string, role: 'ADMIN' | 'OPS_MANAGER' | 'OPS_VIEWER' | 'FINANCE'): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await authClient.post<{ success: boolean; data?: any; error?: string }>('/api/auth/register', {
        email,
        password,
        full_name,
        role,
      })
      return response.data
    } catch (error: any) {
      if (error.response?.data) {
        return error.response.data
      }
      return {
        success: false,
        error: error.message || 'User registration failed',
      }
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(): boolean {
    const expiresAt = localStorage.getItem('token_expires_at')
    if (!expiresAt) return true

    const expiryDate = new Date(expiresAt)
    return expiryDate <= new Date()
  }

  /**
   * Get stored JWT token
   */
  getToken(): string | null {
    return localStorage.getItem('jwt_token')
  }

  /**
   * Map backend role to frontend role
   */
  mapBackendRoleToFrontend(backendRole: 'ADMIN' | 'OPS_MANAGER' | 'OPS_VIEWER' | 'FINANCE'): 'sp-ops' | 'sp-finance' | 'sp-compliance' | 'auditor' {
    const roleMap: Record<string, 'sp-ops' | 'sp-finance' | 'sp-compliance' | 'auditor'> = {
      ADMIN: 'sp-ops',
      OPS_MANAGER: 'sp-ops',
      OPS_VIEWER: 'auditor',
      FINANCE: 'sp-finance',
    }
    return roleMap[backendRole] || 'auditor'
  }
}

export const authService = new AuthService()
