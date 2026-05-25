import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@elegant-tide/db'
import { useAuthStore } from '@/stores/useAuthStore'

function getDeviceId(): string {
  let id = localStorage.getItem('elegant-tide:deviceId')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('elegant-tide:deviceId', id)
  }
  return id
}

export function useAuth() {
  const config = useLiveQuery(() => db.appConfig.get(1), [])
  const { user, isLoading, initialized, setUser, setLoading, setInitialized } = useAuthStore()

  useEffect(() => {
    if (config === undefined) return // still loading from Dexie
    if (!config?.backendUrl) { setInitialized(); return }

    const base = config.backendUrl.replace(/\/$/, '')

    async function init() {
      setLoading(true)
      try {
        const me = await fetch(`${base}/auth/me`, { credentials: 'include' })
        if (me.ok) {
          const data = await me.json() as { id: string; email: string; displayName: string; avatarUrl?: string; isAnonymous: boolean }
          setUser(data)
          syncSettings(base)
          return
        }

        // Not authenticated — try anonymous login
        const anon = await fetch(`${base}/auth/anonymous`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: getDeviceId() }),
        })
        if (anon.ok) {
          const data = await anon.json() as { user: { id: string; email: string; displayName: string; isAnonymous: boolean } }
          setUser({ ...data.user, isAnonymous: true })
          syncSettings(base)
        }
      } catch {
        // Backend unreachable — local-only mode, silent
      } finally {
        setLoading(false)
        setInitialized()
      }
    }

    void init()
  }, [config?.backendUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  return { user, isLoading, initialized }
}

async function syncSettings(base: string) {
  try {
    const res = await fetch(`${base}/users/settings`, { credentials: 'include' })
    if (!res.ok) return
    // Settings fetched but Dexie locale/theme not overwritten here to avoid
    // overriding user's local preference on every startup. This is intentional.
  } catch { /* silent */ }
}
