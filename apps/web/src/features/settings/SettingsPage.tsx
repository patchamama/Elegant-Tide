import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db, appConfigRepo } from '@elegant-tide/db'
import type { AppConfig, LangCode } from '@elegant-tide/core-types'
import { ArrowLeft, Globe, Server, Palette, Sun, Moon } from 'lucide-react'

const LOCALE_OPTIONS: { value: LangCode; label: string; native: string }[] = [
  { value: 'en', label: 'English', native: 'English' },
  { value: 'es', label: 'Spanish', native: 'Español' },
  { value: 'de', label: 'German', native: 'Deutsch' },
  { value: 'fr', label: 'French', native: 'Français' },
  { value: 'it', label: 'Italian', native: 'Italiano' },
  { value: 'pt', label: 'Portuguese', native: 'Português' },
]

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const config = useLiveQuery(() => appConfigRepo.get(), [])
  const [backendUrl, setBackendUrl] = useState('')
  const [backendSaved, setBackendSaved] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('et-theme') ?? 'dark') as 'dark' | 'light',
  )

  const pushSettings = (patch: { locale?: string; theme?: string }) => {
    const base = config?.backendUrl?.replace(/\/$/, '')
    if (!base) return
    void fetch(`${base}/users/settings`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  }

  const applyTheme = (next: 'dark' | 'light') => {
    setTheme(next)
    localStorage.setItem('et-theme', next)
    document.documentElement.setAttribute('data-theme', next)
    pushSettings({ theme: next })
  }

  useEffect(() => {
    if (config?.backendUrl !== undefined) setBackendUrl(config.backendUrl ?? '')
  }, [config])

  const updateLocale = async (locale: LangCode) => {
    await appConfigRepo.update({ locale })
    await i18n.changeLanguage(locale)
    pushSettings({ locale })
  }

  const saveBackendUrl = async () => {
    const url = backendUrl.trim()
    const patch: Partial<Omit<AppConfig, 'id'>> = {}
    if (url) patch.backendUrl = url
    await appConfigRepo.update(patch)
    // Also update connectivity record
    await db.connectivity.put({
      id: 1,
      lastServerSuccessAt: null,
      backendConfigured: !!url,
      graceWindowMs: 7 * 24 * 3600 * 1000,
    })
    setBackendSaved(true)
    setTimeout(() => setBackendSaved(false), 2000)
  }

  const clearBackendUrl = async () => {
    setBackendUrl('')
    await db.appConfig.where('id').equals(1).modify((rec) => { delete rec.backendUrl })
    await db.connectivity.put({
      id: 1,
      lastServerSuccessAt: null,
      backendConfigured: false,
      graceWindowMs: 7 * 24 * 3600 * 1000,
    })
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 animate-pulse">
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <Link
          to="/projects"
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-lg font-semibold text-white">{t('settings.title')}</h1>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        {/* App language */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Globe size={16} className="text-slate-400" />
            <h2 className="font-medium text-white">App language</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {LOCALE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => void updateLocale(opt.value)}
                className={`flex flex-col items-start px-4 py-3 rounded-xl border transition-colors ${
                  config.locale === opt.value
                    ? 'border-brand-500 bg-brand-950/30 text-white'
                    : 'border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white'
                }`}
              >
                <span className="font-medium text-sm">{opt.native}</span>
                <span className="text-xs text-slate-500">{opt.label}</span>
              </button>
            ))}
          </div>
        </section>

        <hr className="border-slate-800" />

        {/* Backend / collaboration server */}
        <section>
          <div className="flex items-center gap-2 mb-1">
            <Server size={16} className="text-slate-400" />
            <h2 className="font-medium text-white">Backend server</h2>
          </div>
          <p className="text-slate-500 text-sm mb-4">
            Optional. Leave blank to run fully offline. When configured, the app syncs projects and lines with your server.
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void saveBackendUrl() }}
              placeholder="https://your-server.example.com"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-brand-600 placeholder-slate-600"
            />
            <button
              onClick={() => void saveBackendUrl()}
              className="bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors min-w-16"
            >
              {backendSaved ? '✓' : 'Save'}
            </button>
          </div>
          {config.backendUrl && (
            <div className="mt-2 flex items-center gap-3">
              <span className="text-xs text-slate-500">Current: {config.backendUrl}</span>
              <button
                onClick={() => void clearBackendUrl()}
                className="text-xs text-red-500 hover:text-red-400 transition-colors"
              >
                Clear
              </button>
            </div>
          )}
          {!config.backendUrl && (
            <p className="text-xs text-slate-600 mt-2">Running in pure offline mode — 7-day gate inactive.</p>
          )}
        </section>

        <hr className="border-slate-800" />

        {/* Appearance */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Palette size={16} className="text-slate-400" />
            <h2 className="font-medium text-white">Appearance</h2>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => applyTheme('dark')}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm transition-colors ${
                theme === 'dark'
                  ? 'border-brand-500 bg-brand-950/30 text-white'
                  : 'border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white'
              }`}
            >
              <Moon size={15} />
              Dark
            </button>
            <button
              onClick={() => applyTheme('light')}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm transition-colors ${
                theme === 'light'
                  ? 'border-brand-500 bg-brand-950/30 text-white'
                  : 'border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white'
              }`}
            >
              <Sun size={15} />
              Light
            </button>
          </div>
        </section>

        <hr className="border-slate-800" />

        {/* App info */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Palette size={16} className="text-slate-400" />
            <h2 className="font-medium text-white">About</h2>
          </div>
          <div className="text-sm text-slate-500 space-y-1">
            <p>Elegant Tide — Theater Subtitle Projection System</p>
            <p>Version 0.2.0 · Offline-first · Powered by Dexie + React 19</p>
          </div>
        </section>
      </div>
    </div>
  )
}
