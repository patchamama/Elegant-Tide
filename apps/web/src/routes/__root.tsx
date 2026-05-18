import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Toaster } from '@/components/ui/toaster'
import { ConnectivityGate } from '@/components/ConnectivityGate'

export const Route = createRootRoute({
  component: () => (
    <ConnectivityGate>
      <Outlet />
      <Toaster />
    </ConnectivityGate>
  ),
})
