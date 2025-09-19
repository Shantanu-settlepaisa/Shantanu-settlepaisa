import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { router } from './router'
import { useAuthStore } from './lib/auth'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

// Force merchant auth for SettlePaisa 2.0 Merchant Dashboard
if (import.meta.env.VITE_DEMO_MODE === 'true') {
  const authStore = useAuthStore.getState()
  if (!authStore.isAuthenticated || authStore.user?.role !== 'merchant-admin') {
    console.log('Resetting auth to merchant-admin for SettlePaisa 2.0 Merchant Dashboard')
    authStore.logout() // Clear any existing auth
    authStore.login(
      {
        id: 'demo-merchant-user',
        email: 'merchant@settlepaisa.com',
        name: 'Demo Merchant Admin',
        role: 'merchant-admin',
        merchantId: '11111111-1111-1111-1111-111111111111',
      },
      'demo-token'
    )
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  </React.StrictMode>,
)