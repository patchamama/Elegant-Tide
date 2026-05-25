import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Toaster } from '@/components/ui/toaster'
import { ConnectivityGate } from '@/components/ConnectivityGate'
import { useAuth } from '@/hooks/useAuth'

function RootLayout() {
  useAuth() // initializes anonymous session in background when backendUrl is set
  return (
    <ConnectivityGate>
      <Outlet />
      <Toaster />
    </ConnectivityGate>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
