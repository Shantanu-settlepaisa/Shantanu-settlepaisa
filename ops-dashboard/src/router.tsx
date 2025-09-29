import { createBrowserRouter, Navigate } from 'react-router-dom'
import { OpsLayout } from './layouts/OpsLayout'
import { MerchantLayout } from './layouts/MerchantLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/Login'
import { UnauthorizedPage } from './pages/Unauthorized'
import { RouteErrorBoundary } from './components/ErrorBoundary'

// Lazy load pages for better performance
import { lazy } from 'react'

// Ops Pages
const Overview = lazy(() => import('./pages/Overview'))
const OverviewSimple = lazy(() => import('./pages/ops/OverviewSimple'))
const ReconOverview = lazy(() => import('./pages/ops/ReconOverviewConsistent'))
const ReconWorkspace = lazy(() => import('./pages/ops/ReconWorkspaceSimplified'))
const ReconConfig = lazy(() => import('./pages/ops/ReconConfigCentral'))
const ManualUpload = lazy(() => import('./components/ManualUploadUnified'))
const ConnectorsUnified = lazy(() => import('./components/ConnectorsUnified'))
const SettlementDetails = lazy(() => import('./pages/ops/SettlementDetails'))
const Exceptions = lazy(() => import('./pages/ops/Exceptions'))
const DataSources = lazy(() => import('./pages/ops/DataSources'))
const Analytics = lazy(() => import('./pages/ops/AnalyticsV3'))
const Settings = lazy(() => import('./pages/ops/Settings'))
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

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/unauthorized',
    element: <UnauthorizedPage />,
  },
  {
    path: '/ops',
    element: <OpsLayout />,
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
        path: 'settlements/:settlementId',
        element: <SettlementDetails />,
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
        path: 'data-sources',
        element: <DataSources />,
      },
      {
        path: 'analytics',
        element: <Analytics />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
    ],
  },
  {
    path: '/merchant',
    element: <MerchantLayout />,
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
  },
  {
    path: '/',
    element: <Navigate to="/merchant/settlements" replace />,
  },
])

// Import Card components for placeholder pages
import { Card, CardContent } from './components/ui/card'