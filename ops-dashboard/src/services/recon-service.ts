/**
 * Reconciliation API Service
 *
 * Authenticated API client for all reconciliation operations.
 * Automatically includes JWT token in all requests.
 *
 * Phase 1 Security: CRIT-001 Fix - Authentication on Recon API
 */

import axios from 'axios'

// Get recon API base URL from environment variable
const RECON_API_URL = import.meta.env.VITE_RECON_API_URL || 'http://localhost:5103'

// Create axios instance with default config
const reconClient = axios.create({
  baseURL: RECON_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout for recon operations
})

// Request interceptor - Add JWT token to all requests
reconClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('jwt_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    console.error('[Recon Service] Request error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor - Handle authentication errors
reconClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - clear auth and redirect to login
      console.warn('[Recon Service] 401 Unauthorized - Redirecting to login')
      localStorage.removeItem('jwt_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('auth-storage')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default reconClient
