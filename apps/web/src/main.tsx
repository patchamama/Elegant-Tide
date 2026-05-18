import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import '@/styles/globals.css'
import '@/i18n'
import { appConfigRepo } from '@elegant-tide/db'
import { startSyncWorker } from '@elegant-tide/sync'

// Start background sync if a backend URL is configured
appConfigRepo.get().then((cfg) => {
  if (cfg.backendUrl) {
    startSyncWorker({ backendUrl: cfg.backendUrl })
  }
})

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
