import { createHashRouter, Navigate } from 'react-router-dom'
import { OpsLayout } from './layouts/OpsLayout'
import { MerchantLayout } from './layouts/MerchantLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/Login'
import { UnauthorizedPage } from './pages/Unauthorized'
import { RouteErrorBoundary } from './components/ErrorBoundary'

// Lazy load pages for better performance
import { lazy } from 'react'

// Feature flags
const ENABLE_OPS_DASHBOARD = import.meta.env.VITE_ENABLE_OPS_DASHBOARD === 'true'
const ENABLE_MERCHANT_DASHBOARD = import.meta.env.VITE_ENABLE_MERCHANT_DASHBOARD === 'true'

// Ops Pages
const Overview = lazy(() => import('./pages/Overview'))
const OverviewSimple = lazy(() => import('./pages/ops/OverviewSimple'))
const ReconOverview = lazy(() => import('./pages/ops/ReconOverviewConsistent'))
const ReconWorkspace = lazy(() => import('./pages/ops/ReconWorkspaceSimplified'))
const ReconConfig = lazy(() => import('./pages/ops/ReconConfigCentral'))
const ManualUpload = lazy(() => import('./components/ManualUploadUnified'))
const ConnectorsUnified = lazy(() => import('./components/ConnectorsUnified'))
const SettlementDetails = lazy(() => import('./pages/ops/SettlementDetails'))
const Settlements = lazy(() => import('./pages/ops/Settlements'))
const SettlementApprove = lazy(() => import('./pages/ops/SettlementApprove'))
const Exceptions = lazy(() => import('./pages/ops/Exceptions'))
const Analytics = lazy(() => import('./pages/ops/AnalyticsV3'))
const FinancialDashboard = lazy(() => import('./pages/ops/FinancialDashboard'))
const Settings = lazy(() => import('./pages/ops/Settings'))
const Users = lazy(() => import('./pages/ops/Users'))
const Connectors = lazy(() => import('./pages/ops/Connectors'))
const ReconciliationView = lazy(() => import('./pages/ops/ReconciliationView'))
const Reports = lazy(() => import('./pages/ops/Reports'))
const Disputes = lazy(() => import('./pages/ops/Disputes'))
const SettlementPipelineDemo = lazy(() => import('./pages/ops/SettlementPipelineDemo'))

// Merchant Pages
const MerchantDashboard = lazy(() => import('./pages/merchant/Dashboard'))
const MerchantSettlements = lazy(() => import('./pages/merchant/Settlements'))
const MerchantReports = lazy(() => import('./pages/merchant/Reports'))
const MerchantDisputes = lazy(() => import('./pages/merchant/DisputesList'))
const MerchantDisputeDetail = lazy(() => import('./pages/merchant/DisputeDetail'))

// Build route configuration based on enabled modules
const routes = [
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/unauthorized',
    element: <UnauthorizedPage />,
  },
]

// Add Ops Dashboard routes if enabled
if (ENABLE_OPS_DASHBOARD) {
  routes.push({
    path: '/ops',
    element: (
      <ProtectedRoute>
        <OpsLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/ops/overview" replace />,
      },
      {
        path: 'overview',
        element: <Overview />,
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'recon',
        element: <ReconWorkspace />,
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'recon/manual',
        element: <ManualUpload />,
      },
      {
        path: 'recon/connectors',
        element: <ConnectorsUnified />,
      },
      {
        path: 'recon/config',
        element: <ReconConfig />,
      },
      {
        path: 'recon/results',
        element: <ReconciliationView />,
      },
      {
        path: 'settlements',
        element: <Settlements />,
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'settlements/:batchId',
        element: <SettlementDetails />,
      },
      {
        path: 'settlements/:batchId/approve',
        element: <SettlementApprove />,
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'exceptions',
        element: <Exceptions />,
      },
      {
        path: 'connectors',
        element: <Connectors />,
      },
      {
        path: 'reports',
        element: <Reports />,
      },
      {
        path: 'disputes',
        element: <Disputes />,
      },
      {
        path: 'settlement-pipeline',
        element: <SettlementPipelineDemo />,
      },
      {
        path: 'analytics',
        element: <Analytics />,
      },
      {
        path: 'financial',
        element: <FinancialDashboard />,
      },
      {
        path: 'users',
        element: <Users />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
    ],
  })
}

// Add Merchant Dashboard routes if enabled
if (ENABLE_MERCHANT_DASHBOARD) {
  routes.push({
    path: '/merchant',
    element: (
      <ProtectedRoute>
        <MerchantLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/merchant/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <MerchantDashboard />,
      },
      {
        path: 'disputes',
        element: <MerchantDisputes />,
      },
      {
        path: 'disputes/:disputeId',
        element: <MerchantDisputeDetail />,
      },
      {
        path: 'payments',
        element: <div className="p-6"><Card><CardContent className="py-12 text-center">Payments coming soon</CardContent></Card></div>,
      },
      {
        path: 'settlements',
        element: <MerchantSettlements />,
      },
      {
        path: 'reports',
        element: <MerchantReports />,
      },
      {
        path: 'settings',
        element: <div className="p-6"><Card><CardContent className="py-12 text-center">Settings coming soon</CardContent></Card></div>,
      },
    ],
  })
}

// Add root redirect based on enabled modules
if (ENABLE_MERCHANT_DASHBOARD) {
  routes.push({
    path: '/',
    element: <Navigate to="/merchant/settlements" replace />,
  })
} else if (ENABLE_OPS_DASHBOARD) {
  routes.push({
    path: '/',
    element: <Navigate to="/ops/overview" replace />,
  })
} else {
  routes.push({
    path: '/',
    element: <div className="flex items-center justify-center h-screen">
      <Card><CardContent className="py-12 text-center">
        <h1 className="text-2xl font-bold">No Dashboard Enabled</h1>
        <p className="text-gray-600 mt-2">Please configure VITE_ENABLE_OPS_DASHBOARD or VITE_ENABLE_MERCHANT_DASHBOARD</p>
      </CardContent></Card>
    </div>,
  })
}

export const router = createHashRouter(routes)

// Import Card components for placeholder pages
import { Card, CardContent } from './components/ui/card'