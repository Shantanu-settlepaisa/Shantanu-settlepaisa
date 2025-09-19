import axios, { AxiosInstance } from 'axios'
import { v4 as uuidv4 } from 'uuid'
import { useAuthStore } from './auth'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === 'true'

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
apiClient.interceptors.request.use((config) => {
  const { token, user } = useAuthStore.getState()
  
  // Add auth token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  
  // Add user role for RBAC
  if (user) {
    config.headers['X-User-Role'] = user.role
    if (user.merchantId) {
      config.headers['X-Merchant-Id'] = user.merchantId
    }
  }
  
  // Add idempotency key for mutations
  if (['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase() || '')) {
    if (!config.headers['X-Idempotency-Key']) {
      config.headers['X-Idempotency-Key'] = uuidv4()
    }
  }
  
  return config
})

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only logout on 401 for critical auth endpoints, not data endpoints
    if (error.response?.status === 401 && error.config?.url?.includes('/auth')) {
      // Unauthorized on auth endpoints - logout
      useAuthStore.getState().logout()
      window.location.href = '/login'
    } else if (error.response?.status === 401) {
      // For other 401s, just log the warning without logging out
      console.warn('API returned 401 but not logging out user (data endpoint)')
    } else if (error.response?.status === 403) {
      // Forbidden - show role error
      error.message = 'You do not have permission to perform this action'
    }
    return Promise.reject(error)
  }
)

// Common types
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
  cursor?: string
}

export interface ApiError {
  message: string
  code?: string
  details?: Record<string, any>
}

// Date range params
export interface DateRangeParams {
  from: string
  to: string
}

// Pagination params
export interface PaginationParams {
  page?: number
  limit?: number
  cursor?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}