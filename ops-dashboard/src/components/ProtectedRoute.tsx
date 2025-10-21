import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore, UserRole } from '@/lib/auth'
import { authService } from '@/services/auth-service'
import { useEffect, useState } from 'react'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const location = useLocation()
  const { isAuthenticated, user, hasRole } = useAuthStore()
  const [isValidating, setIsValidating] = useState(true)
  const [isValid, setIsValid] = useState(false)

  useEffect(() => {
    const validateAuth = async () => {
      // Check if user is authenticated in store
      if (!isAuthenticated || !user) {
        setIsValid(false)
        setIsValidating(false)
        return
      }

      // Check if token exists and is not expired
      const token = authService.getToken()
      if (!token || authService.isTokenExpired()) {
        setIsValid(false)
        setIsValidating(false)
        return
      }

      // Verify token with backend (optional - can be removed for performance)
      const tokenValid = await authService.verifyToken(token)
      if (!tokenValid) {
        setIsValid(false)
        setIsValidating(false)
        return
      }

      setIsValid(true)
      setIsValidating(false)
    }

    validateAuth()
  }, [isAuthenticated, user])

  // Show loading state while validating
  if (isValidating) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-600">Verifying authentication...</div>
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!isValid) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Check role-based access if allowed roles are specified
  if (allowedRoles && allowedRoles.length > 0 && !hasRole(allowedRoles)) {
    return <Navigate to="/unauthorized" replace />
  }

  // User is authenticated and authorized
  return <>{children}</>
}