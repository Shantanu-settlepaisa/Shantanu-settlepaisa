import { Navigate } from 'react-router-dom'
import { useAuthStore, UserRole } from '@/lib/auth'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  // Skip all authentication checks - allow direct access
  return <>{children}</>
}