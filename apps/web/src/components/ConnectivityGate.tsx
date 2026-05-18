import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '@elegant-tide/db'
import { WifiOff } from 'lucide-react'

const GRACE_MS = 7 * 24 * 3600 * 1000

export function ConnectivityGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()

  const record = useLiveQuery(() => db.connectivity.get(1), [])

  // While loading, render normally — gate only blocks when we have data
  if (record === undefined) return <>{children}</>

  // Pure-local mode: no backend configured → gate is permanently inactive
  if (!record.backendConfigured) return <>{children}</>

  const grace = record.graceWindowMs ?? GRACE_MS
  const lastSuccess = record.lastServerSuccessAt

  // No successful ping ever, or last ping too long ago
  const expired =
    lastSuccess === null || Date.now() - lastSuccess > grace

  if (!expired) return <>{children}</>

  const daysSince =
    lastSuccess === null
      ? null
      : Math.floor((Date.now() - lastSuccess) / 86400000)

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-8 text-center">
      <div className="mb-6 p-4 bg-red-950/40 border border-red-800/50 rounded-2xl">
        <WifiOff size={40} className="text-red-500 mx-auto" />
      </div>
      <h1 className="text-2xl font-bold mb-2">{t('connectivity.expired')}</h1>
      <p className="text-slate-400 max-w-md mb-8">
        {t('connectivity.expiredDesc', {
          days: daysSince !== null ? String(daysSince) : '—',
        })}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-xl font-medium transition-colors"
      >
        {t('connectivity.reconnecting')}
      </button>
    </div>
  )
}
