import { useState } from 'react'
import { Edit, Trash2, Lock, Unlock, Key, MoreVertical, CheckCircle, XCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { User, userService } from '@/services/user-service'
import { format } from 'date-fns'

interface UserListProps {
  users: User[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
  onEditUser: (user: User) => void
  onRefresh: () => void
  onPageChange: (newOffset: number) => void
}

export function UserList({ users, pagination, onEditUser, onRefresh, onPageChange }: UserListProps) {
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-100 text-purple-800'
      case 'OPS_MANAGER':
        return 'bg-blue-100 text-blue-800'
      case 'OPS_VIEWER':
        return 'bg-gray-100 text-gray-800'
      case 'FINANCE':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const handleDeactivate = async (userId: string) => {
    setLoading(userId)
    setError('')
    setSuccess('')

    const response = await userService.deactivateUser(userId)

    if (response.success) {
      setSuccess('User deactivated successfully')
      setConfirmDelete(null)
      onRefresh()
    } else {
      setError(response.error || 'Failed to deactivate user')
    }

    setLoading(null)
  }

  const handleUnlock = async (userId: string) => {
    setLoading(userId)
    setError('')
    setSuccess('')

    const response = await userService.unlockUser(userId)

    if (response.success) {
      setSuccess('User account unlocked successfully')
      onRefresh()
    } else {
      setError(response.error || 'Failed to unlock user')
    }

    setLoading(null)
  }

  const handleResetPassword = async (userId: string) => {
    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(userId)
    setError('')
    setSuccess('')

    const response = await userService.resetPassword(userId, { newPassword })

    if (response.success) {
      setSuccess('Password reset successfully. User must login with new password.')
      setResetPasswordUserId(null)
      setNewPassword('')
    } else {
      setError(response.error || 'Failed to reset password')
    }

    setLoading(null)
  }

  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1
  const totalPages = Math.ceil(pagination.total / pagination.limit)

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Success/Error Messages */}
      {error && (
        <div className="m-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="m-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="font-medium text-gray-900">{user.full_name}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadgeColor(user.role)}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      {user.is_active ? (
                        <span className="inline-flex items-center gap-1 text-green-600 text-sm">
                          <CheckCircle className="w-4 h-4" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600 text-sm">
                          <XCircle className="w-4 h-4" />
                          Inactive
                        </span>
                      )}
                      {user.locked_until && new Date(user.locked_until) > new Date() && (
                        <span className="inline-flex items-center gap-1 text-orange-600 text-xs">
                          <Lock className="w-3 h-3" />
                          Locked
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.last_login_at ? (
                      <div>
                        <div>{format(new Date(user.last_login_at), 'MMM d, yyyy')}</div>
                        <div className="text-xs text-gray-400">{format(new Date(user.last_login_at), 'HH:mm:ss')}</div>
                      </div>
                    ) : (
                      <span className="text-gray-400">Never</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(user.created_at), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="relative">
                      <button
                        onClick={() => setActionMenuOpen(actionMenuOpen === user.id ? null : user.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>

                      {actionMenuOpen === user.id && (
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                          <button
                            onClick={() => {
                              onEditUser(user)
                              setActionMenuOpen(null)
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                          >
                            <Edit className="w-4 h-4" />
                            Edit User
                          </button>

                          {user.locked_until && new Date(user.locked_until) > new Date() && (
                            <button
                              onClick={() => {
                                handleUnlock(user.id)
                                setActionMenuOpen(null)
                              }}
                              disabled={loading === user.id}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50"
                            >
                              <Unlock className="w-4 h-4" />
                              Unlock Account
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setResetPasswordUserId(user.id)
                              setActionMenuOpen(null)
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                          >
                            <Key className="w-4 h-4" />
                            Reset Password
                          </button>

                          {user.is_active && (
                            <button
                              onClick={() => {
                                setConfirmDelete(user.id)
                                setActionMenuOpen(null)
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" />
                              Deactivate
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.total > 0 && (
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing <span className="font-medium">{pagination.offset + 1}</span> to{' '}
            <span className="font-medium">{Math.min(pagination.offset + pagination.limit, pagination.total)}</span> of{' '}
            <span className="font-medium">{pagination.total}</span> users
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(pagination.offset - pagination.limit)}
              disabled={pagination.offset === 0}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <span className="px-4 py-2 text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange(pagination.offset + pagination.limit)}
              disabled={!pagination.hasMore}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Deactivation</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to deactivate this user? This will revoke all active sessions and prevent login.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeactivate(confirmDelete)}
                disabled={loading === confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {loading === confirmDelete ? 'Deactivating...' : 'Deactivate User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordUserId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reset Password</h3>
            <p className="text-gray-600 mb-4">
              Enter a new password for this user. All active sessions will be revoked.
            </p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setResetPasswordUserId(null)
                  setNewPassword('')
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleResetPassword(resetPasswordUserId)}
                disabled={loading === resetPasswordUserId || !newPassword || newPassword.length < 8}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading === resetPasswordUserId ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
