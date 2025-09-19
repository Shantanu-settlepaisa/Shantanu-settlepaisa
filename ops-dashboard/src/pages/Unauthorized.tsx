import { useNavigate } from 'react-router-dom'
import { ShieldX } from 'lucide-react'

export function UnauthorizedPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full text-center">
        <ShieldX className="mx-auto h-16 w-16 text-red-500" />
        <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
          Access Denied
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          You don't have permission to access the Operations Dashboard.
        </p>
        <p className="mt-4 text-sm text-gray-500">
          This area is restricted to sp-ops, sp-finance, and sp-compliance roles only.
        </p>
        <div className="mt-6 space-x-4">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Go Back
          </button>
          <button
            onClick={() => navigate('/login')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Sign In Again
          </button>
        </div>
      </div>
    </div>
  )
}