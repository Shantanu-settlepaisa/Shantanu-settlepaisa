/**
 * Upload API Service
 *
 * Authenticated API client for file upload operations (PG and Bank CSV files).
 * Automatically includes JWT token in all requests.
 *
 * Phase 1 Security: CRIT-002 Fix - Authentication on Upload API
 */

import axios from 'axios'

// Get upload API base URL from environment variable
const UPLOAD_API_URL = import.meta.env.VITE_UPLOAD_API_URL || 'http://localhost:5107'

// Create axios instance with default config
const uploadClient = axios.create({
  baseURL: UPLOAD_API_URL,
  timeout: 60000, // 60 second timeout for file uploads
  // Note: Content-Type is set automatically for FormData
})

// Request interceptor - Add JWT token to all requests
uploadClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('jwt_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    console.error('[Upload Service] Request error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor - Handle authentication errors
uploadClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - clear auth and redirect to login
      console.warn('[Upload Service] 401 Unauthorized - Redirecting to login')
      localStorage.removeItem('jwt_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('auth-storage')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default uploadClient
