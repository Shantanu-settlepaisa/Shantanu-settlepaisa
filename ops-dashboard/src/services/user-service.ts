/**
 * User Management Service
 * Handles all user management API calls for admin operations
 */
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5108'

const userClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
})

// Add request interceptor to include JWT token
userClient.interceptors.request.use(
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
userClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('jwt_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('auth-storage')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Types
export interface User {
  id: string
  email: string
  full_name: string
  role: 'ADMIN' | 'OPS_MANAGER' | 'OPS_VIEWER' | 'FINANCE'
  is_active: boolean
  email_verified: boolean
  failed_login_attempts: number
  locked_until: string | null
  last_login_at: string | null
  last_login_ip: string | null
  password_changed_at: string | null
  created_at: string
  updated_at: string
  created_by?: string | null
  updated_by?: string | null
}

export interface UsersListResponse {
  success: boolean
  data?: {
    users: User[]
    pagination: {
      total: number
      limit: number
      offset: number
      hasMore: boolean
    }
  }
  error?: string
}

export interface UserResponse {
  success: boolean
  data?: {
    user: User
  }
  error?: string
}

export interface UpdateUserData {
  full_name?: string
  role?: 'ADMIN' | 'OPS_MANAGER' | 'OPS_VIEWER' | 'FINANCE'
  is_active?: boolean
  email_verified?: boolean
}

export interface ResetPasswordData {
  newPassword: string
}

class UserService {
  /**
   * Get list of users with optional filters
   */
  async getUsers(params?: {
    role?: string
    is_active?: boolean
    search?: string
    limit?: number
    offset?: number
  }): Promise<UsersListResponse> {
    try {
      const response = await userClient.get<UsersListResponse>('/api/users', { params })
      return response.data
    } catch (error: any) {
      if (error.response?.data) return error.response.data
      return { success: false, error: error.message || 'Failed to fetch users' }
    }
  }

  /**
   * Get user details by ID
   */
  async getUserById(userId: string): Promise<UserResponse> {
    try {
      const response = await userClient.get<UserResponse>(`/api/users/${userId}`)
      return response.data
    } catch (error: any) {
      if (error.response?.data) return error.response.data
      return { success: false, error: error.message || 'Failed to fetch user details' }
    }
  }

  /**
   * Update user details
   */
  async updateUser(userId: string, data: UpdateUserData): Promise<UserResponse> {
    try {
      const response = await userClient.put<UserResponse>(`/api/users/${userId}`, data)
      return response.data
    } catch (error: any) {
      if (error.response?.data) return error.response.data
      return { success: false, error: error.message || 'Failed to update user' }
    }
  }

  /**
   * Deactivate user (soft delete)
   */
  async deactivateUser(userId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await userClient.delete(`/api/users/${userId}`)
      return response.data
    } catch (error: any) {
      if (error.response?.data) return error.response.data
      return { success: false, error: error.message || 'Failed to deactivate user' }
    }
  }

  /**
   * Reset user password (admin)
   */
  async resetPassword(userId: string, data: ResetPasswordData): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await userClient.post(`/api/users/${userId}/reset-password`, data)
      return response.data
    } catch (error: any) {
      if (error.response?.data) return error.response.data
      return { success: false, error: error.message || 'Failed to reset password' }
    }
  }

  /**
   * Unlock locked user account
   */
  async unlockUser(userId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await userClient.post(`/api/users/${userId}/unlock`)
      return response.data
    } catch (error: any) {
      if (error.response?.data) return error.response.data
      return { success: false, error: error.message || 'Failed to unlock user' }
    }
  }
}

export const userService = new UserService()
