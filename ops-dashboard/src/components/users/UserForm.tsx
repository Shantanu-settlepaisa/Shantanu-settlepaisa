import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { User, userService, UpdateUserData } from '@/services/user-service'
import { authService } from '@/services/auth-service'

interface UserFormProps {
  user: User | null
  onClose: (shouldRefresh?: boolean) => void
}

export function UserForm({ user, onClose }: UserFormProps) {
  const isEdit = !!user
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    email: user?.email || '',
    full_name: user?.full_name || '',
    password: '',
    confirmPassword: '',
    role: user?.role || 'OPS_VIEWER',
    is_active: user?.is_active ?? true,
    email_verified: user?.email_verified ?? false
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isEdit) {
        // Update existing user
        const updateData: UpdateUserData = {
          full_name: formData.full_name,
          role: formData.role as any,
          is_active: formData.is_active,
          email_verified: formData.email_verified
        }

        const response = await userService.updateUser(user.id, updateData)

        if (response.success) {
          onClose(true)
        } else {
          setError(response.error || 'Failed to update user')
        }
      } else {
        // Create new user via registration API
        if (!formData.email || !formData.password) {
          setError('Email and password are required')
          setLoading(false)
          return
        }

        if (formData.password !== formData.confirmPassword) {
          setError('Passwords do not match')
          setLoading(false)
          return
        }

        if (formData.password.length < 8) {
          setError('Password must be at least 8 characters')
          setLoading(false)
          return
        }

        const response = await authService.registerUser({
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          role: formData.role as any
        })

        if (response.success) {
          onClose(true)
        } else {
          setError(response.error || 'Failed to create user')
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">
            {isEdit ? 'Edit User' : 'Add New User'}
          </h2>
          <button
            onClick={() => onClose()}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              disabled={isEdit}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            {isEdit && (
              <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
            )}
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Password (only for new users) */}
          {!isEdit && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={8}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">Minimum 8 characters</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password *
                </label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </>
          )}

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role *
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="ADMIN">Admin</option>
              <option value="OPS_MANAGER">Ops Manager</option>
              <option value="OPS_VIEWER">Ops Viewer</option>
              <option value="FINANCE">Finance</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {formData.role === 'ADMIN' && 'Full access to all features'}
              {formData.role === 'OPS_MANAGER' && 'Can manage reconciliation and settlements'}
              {formData.role === 'OPS_VIEWER' && 'View-only access to dashboard'}
              {formData.role === 'FINANCE' && 'Access to financial reports and settlements'}
            </p>
          </div>

          {/* Active Status (edit only) */}
          {isEdit && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Active Account</span>
              </label>
              <p className="mt-1 ml-6 text-xs text-gray-500">
                Inactive users cannot log in
              </p>
            </div>
          )}

          {/* Email Verified (edit only) */}
          {isEdit && (
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.email_verified}
                  onChange={(e) => setFormData({ ...formData, email_verified: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Email Verified</span>
              </label>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => onClose()}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : (isEdit ? 'Update User' : 'Create User')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
