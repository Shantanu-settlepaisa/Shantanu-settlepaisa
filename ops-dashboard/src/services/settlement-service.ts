/**
 * Settlement API Service
 *
 * Authenticated API client for settlement calculations and approval operations.
 * Automatically includes JWT token in all requests.
 *
 * Phase 1 Security: CRIT-003 Fix - Authentication on Settlement API
 */

import axios from 'axios'

// Get settlement API base URL from environment variable
const SETTLEMENT_API_URL = import.meta.env.VITE_SETTLEMENT_API_URL || 'http://localhost:5109'

// Create axios instance with default config
const settlementClient = axios.create({
  baseURL: SETTLEMENT_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout for settlement operations
})

// Request interceptor - Add JWT token to all requests
settlementClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('jwt_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    console.error('[Settlement Service] Request error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor - Handle authentication errors
settlementClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - clear auth and redirect to login
      console.warn('[Settlement Service] 401 Unauthorized - Redirecting to login')
      localStorage.removeItem('jwt_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('auth-storage')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default settlementClient
