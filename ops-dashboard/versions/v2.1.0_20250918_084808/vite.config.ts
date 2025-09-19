import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true, // Fail if port is already in use
    host: true,
    proxy: {
      // API routes that should be proxied to backend
      '^/merchant/settlement/.*': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '^/v1/merchant/.*': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ops/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    },
    // Configure history API fallback for client-side routing
    historyApiFallback: {
      rewrites: [
        { from: /^\/merchant\/.*/, to: '/' },
        { from: /^\/ops\/.*/, to: '/' }
      ]
    }
  },
})