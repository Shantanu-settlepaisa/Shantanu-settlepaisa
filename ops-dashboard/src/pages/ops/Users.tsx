import { useState, useEffect } from 'react'
import { Plus, Search, Filter } from 'lucide-react'
import { userService, User } from '@/services/user-service'
import { UserList } from '@/components/users/UserList'
import { UserForm } from '@/components/users/UserForm'
import { useAuthStore } from '@/lib/auth'

export default function UsersPage() {
  const { user: currentUser } = useAuthStore()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showUserForm, setShowUserForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false
  })

  // Check if current user is admin
  const isAdmin = currentUser?.backendRole === 'ADMIN'

  useEffect(() => {
    if (!isAdmin) {
      setError('Access denied. Admin privileges required.')
      setLoading(false)
      return
    }
    fetchUsers()
  }, [roleFilter, statusFilter, pagination.offset])

  const fetchUsers = async () => {
    setLoading(true)
    setError('')

    const params: any = {
      limit: pagination.limit,
      offset: pagination.offset
    }

    if (roleFilter) params.role = roleFilter
    if (statusFilter !== '') params.is_active = statusFilter === 'active'
    if (searchQuery) params.search = searchQuery

    const response = await userService.getUsers(params)

    if (response.success && response.data) {
      setUsers(response.data.users)
      setPagination(response.data.pagination)
    } else {
      setError(response.error || 'Failed to load users')
    }

    setLoading(false)
  }

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, offset: 0 }))
    fetchUsers()
  }

  const handleEditUser = (user: User) => {
    setEditingUser(user)
    setShowUserForm(true)
  }

  const handleAddUser = () => {
    setEditingUser(null)
    setShowUserForm(true)
  }

  const handleFormClose = (shouldRefresh?: boolean) => {
    setShowUserForm(false)
    setEditingUser(null)
    if (shouldRefresh) {
      fetchUsers()
    }
  }

  const handlePageChange = (newOffset: number) => {
    setPagination(prev => ({ ...prev, offset: newOffset }))
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <div className="text-red-600 text-4xl mb-4">⛔</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">You need administrator privileges to access user management.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="mt-2 text-gray-600">Manage ops dashboard users, roles, and permissions</p>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by email or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Role Filter */}
            <div className="w-full md:w-48">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Roles</option>
                <option value="ADMIN">Admin</option>
                <option value="OPS_MANAGER">Ops Manager</option>
                <option value="OPS_VIEWER">Ops Viewer</option>
                <option value="FINANCE">Finance</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="w-full md:w-48">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Search Button */}
            <button
              onClick={handleSearch}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              Search
            </button>

            {/* Add User Button */}
            <button
              onClick={handleAddUser}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add User
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Users List */}
        {loading ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-600">Loading users...</p>
          </div>
        ) : (
          <UserList
            users={users}
            pagination={pagination}
            onEditUser={handleEditUser}
            onRefresh={fetchUsers}
            onPageChange={handlePageChange}
          />
        )}

        {/* User Form Modal */}
        {showUserForm && (
          <UserForm
            user={editingUser}
            onClose={handleFormClose}
          />
        )}
      </div>
    </div>
  )
}
