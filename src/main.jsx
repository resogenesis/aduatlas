import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import router from './router/router'
import { RouterProvider } from 'react-router-dom'
import { initAnalytics } from './lib/analytics'
import { initAuth } from './stores/authStore'

initAnalytics()

const queryClient = new QueryClient()

// Bootstrap the auth session (hydrates the localStorage mirror the synchronous
// gates read) BEFORE first paint, so a logged-in user lands on gated routes
// without a logged-out flash. No-op when Supabase isn't configured.
initAuth().finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
})