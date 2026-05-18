import { useEffect, useRef, useCallback, useState } from 'react'
import { useParams, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, projectsRepo } from '@elegant-tide/db'
import { useProjectionStore } from '@/stores/useProjectionStore'
import { createBus, type Bus } from '@elegant-tide/broadcast-protocol'
import type { LangCode, ProjectorWindowConfig, ProjectionStyle } from '@elegant-tide/core-types'
import { DEFAULT_PROJECTION_STYLE } from '@elegant-tide/core-types'
import { openProjectorWindow as platformOpenProjector } from '@/lib/platform'
import {
  ArrowLeft, ChevronLeft, ChevronRight, EyeOff, ExternalLink,
  Monitor, Pause, Plus, Trash2, Settings,
} from 'lucide-react'
import { clsx } from 'clsx'

const LANG_LABELS: Record<LangCode, string> = {
  en: 'EN', es: 'ES', de: 'DE', fr: 'FR', it: 'IT', pt: 'PT',
}

function makeWindowConfig(language: LangCode, idx: number): ProjectorWindowConfig {
  return {
    id: crypto.randomUUID(),
    label: `Projector ${idx + 1}`,
    language,
    style: { ...DEFAULT_PROJECTION_STYLE },
    opacity: 1,
    showMedia: true,
    isOpen: false,
  }
}

export function ControlPage() {
  const { t } = useTranslation()
  const { projectId } = useParams({ from: '/control/$projectId' })
  const navigate = useNavigate()

  const { currentLineId, blackout, freeze, goTo, next, prev, toggleBlackout, toggleFreeze, setLines } =
    useProjectionStore()

  const busRef = useRef<Bus | null>(null)
  const windowId = useRef(`control-${crypto.randomUUID().slice(0, 8)}`)

  const [activePanel, setActivePanel] = useState<'lines' | 'windows'>('lines')
  const [windowConfigs, setWindowConfigs] = useState<ProjectorWindowConfig[]>([])
  const [editingWindowId, setEditingWindowId] = useState<string | null>(null)

  // Live queries
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId])
  const lines = useLiveQuery(
    () =>
      db.lines
        .where('[projectId+order]')
        .between([projectId, -Infinity], [projectId, Infinity])
        .filter((l) => !l.deletedAt)
        .sortBy('order'),
    [projectId],
  )

  // Seed window configs from project or init with primary lang
  useEffect(() => {
    if (!project) return
    if (project.projectorWindows?.length) {
      setWindowConfigs(project.projectorWindows)
    } else {
      setWindowConfigs([makeWindowConfig(project.primaryLanguage, 0)])
    }
  }, [project])

  // Keep projection store in sync with live lines
  useEffect(() => {
    if (lines) setLines(lines)
  }, [lines, setLines])

  // Single bus instance for the lifetime of this page
  useEffect(() => {
    const bus = createBus({ projectId, windowId: windowId.current, role: 'control' })
    busRef.current = bus

    const unsubState = bus.on('state.request', () => {
      const { currentLineId, blackout, freeze } = useProjectionStore.getState()
      bus.send({ kind: 'state.snapshot', payload: { currentLineId, blackout, freeze } })
    })

    return () => {
      unsubState()
      bus.close()
      busRef.current = null
    }
  }, [projectId])

  const sendGoto = useCallback((lineId: string) => {
    busRef.current?.send({ kind: 'cue.goto', payload: { lineId } })
  }, [])

  const handleGoto = useCallback(
    (lineId: string) => { goTo(lineId); sendGoto(lineId) },
    [goTo, sendGoto],
  )

  const handleNext = useCallback(() => {
    next()
    const { currentLineId: id } = useProjectionStore.getState()
    if (id) sendGoto(id)
  }, [next, sendGoto])

  const handlePrev = useCallback(() => {
    prev()
    const { currentLineId: id } = useProjectionStore.getState()
    if (id) sendGoto(id)
  }, [prev, sendGoto])

  const handleBlackout = useCallback(() => {
    toggleBlackout()
    const { blackout: on } = useProjectionStore.getState()
    busRef.current?.send({ kind: 'cue.blackout', payload: { on } })
  }, [toggleBlackout])

  const handleFreeze = useCallback(() => { toggleFreeze() }, [toggleFreeze])

  const persistWindowConfigs = useCallback(async (configs: ProjectorWindowConfig[]) => {
    if (!project) return
    const updated = { ...project, projectorWindows: configs, updatedAt: Date.now() }
    await projectsRepo.upsert(updated)
  }, [project])

  const openProjectorWindow = useCallback((cfg: ProjectorWindowConfig) => {
    platformOpenProjector(projectId)
    // Mark open
    setWindowConfigs((prev) => prev.map((w) => w.id === cfg.id ? { ...w, isOpen: true } : w))
    // Send config after a tiny delay (window needs to mount and listen first)
    setTimeout(() => {
      busRef.current?.send({ kind: 'projector.config', payload: { config: cfg } })
    }, 800)
  }, [projectId])

  const updateWindowConfig = useCallback(<K extends keyof ProjectorWindowConfig>(
    id: string, key: K, value: ProjectorWindowConfig[K],
  ) => {
    setWindowConfigs((prev) => {
      const next = prev.map((w) => w.id === id ? { ...w, [key]: value } : w)
      void persistWindowConfigs(next)
      // Broadcast config update to any open projector
      const updated = next.find((w) => w.id === id)
      if (updated) {
        busRef.current?.send({ kind: 'projector.config', payload: { config: updated } })
      }
      return next
    })
  }, [persistWindowConfigs])

  const updateWindowStyle = useCallback((id: string, patch: Partial<ProjectionStyle>) => {
    setWindowConfigs((prev) => {
      const next = prev.map((w) => w.id === id ? { ...w, style: { ...w.style, ...patch } } : w)
      void persistWindowConfigs(next)
      const updated = next.find((w) => w.id === id)
      if (updated) busRef.current?.send({ kind: 'projector.config', payload: { config: updated } })
      return next
    })
  }, [persistWindowConfigs])

  const addWindow = useCallback(() => {
    if (!project) return
    const cfg = makeWindowConfig(project.primaryLanguage, windowConfigs.length)
    const next = [...windowConfigs, cfg]
    setWindowConfigs(next)
    void persistWindowConfigs(next)
  }, [project, windowConfigs, persistWindowConfigs])

  const removeWindow = useCallback((id: string) => {
    const next = windowConfigs.filter((w) => w.id !== id)
    setWindowConfigs(next)
    void persistWindowConfigs(next)
    if (editingWindowId === id) setEditingWindowId(null)
  }, [windowConfigs, persistWindowConfigs, editingWindowId])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Space' || e.code === 'ArrowRight') { e.preventDefault(); handleNext() }
      if (e.code === 'ArrowLeft') { e.preventDefault(); handlePrev() }
      if (e.code === 'KeyB') handleBlackout()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleNext, handlePrev, handleBlackout])

  if (project === undefined || lines === undefined) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 animate-pulse">
        {t('common.loading')}
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <Link to="/projects">← Back to projects</Link>
      </div>
    )
  }

  const visibleLines = (lines ?? []).filter((l) => l.type !== 'comment')
  const currentIdx = visibleLines.findIndex((l) => l.id === currentLineId)
  const primaryLang = (project.primaryLanguage ?? project.languages[0] ?? 'en') as LangCode
  const editingWindow = windowConfigs.find((w) => w.id === editingWindowId)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Toolbar */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => void navigate({ to: '/editor/$projectId', params: { projectId } })}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={17} />
        </button>
        <h1 className="font-semibold text-sm text-white flex-1 truncate">
          {project.name} — {t('control.title')}
        </h1>

        {/* Panel toggle */}
        <div className="flex bg-slate-800 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => setActivePanel('lines')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              activePanel === 'lines' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white',
            )}
          >
            <ChevronRight size={13} />
            Script
          </button>
          <button
            onClick={() => setActivePanel('windows')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              activePanel === 'windows' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white',
            )}
          >
            <Monitor size={13} />
            Windows
          </button>
        </div>

        <button
          onClick={handleFreeze}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            freeze ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800',
          )}
        >
          <Pause size={13} />
          Freeze
        </button>

        <button
          onClick={handleBlackout}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            blackout ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800',
          )}
        >
          <EyeOff size={13} />
          {t('control.blackout')}
        </button>
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── SCRIPT PANEL ─────────────────────────────────────────── */}
        {activePanel === 'lines' && (
          <>
            <div className="flex-1 overflow-y-auto">
              {visibleLines.map((line, idx) => (
                <button
                  key={line.id}
                  onClick={() => handleGoto(line.id)}
                  className={clsx(
                    'w-full text-left px-6 py-4 border-b border-slate-800/60 transition-all',
                    line.id === currentLineId
                      ? 'bg-brand-900/30 border-l-[3px] border-l-brand-500 pl-5'
                      : 'hover:bg-slate-900',
                  )}
                >
                  <span className="text-xs text-slate-600 mr-4 tabular-nums">{idx + 1}</span>
                  {line.type === 'media' ? (
                    <span className="text-purple-400 text-sm italic">
                      🎬 {line.media?.sourceType ?? 'media'} — {line.media?.url ?? ''}
                    </span>
                  ) : (
                    <span className={line.id === currentLineId ? 'text-white font-medium' : 'text-slate-300'}>
                      {line.translations[primaryLang] ?? (
                        <em className="text-slate-600 text-sm">No translation</em>
                      )}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Right panel — preview + controls */}
            <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col flex-shrink-0">
              <div className="flex-1 flex items-center justify-center p-6 min-h-0">
                {blackout ? (
                  <div className="text-center">
                    <EyeOff size={24} className="text-red-500 mx-auto mb-2" />
                    <p className="text-slate-600 text-sm italic">Blackout active</p>
                  </div>
                ) : currentLineId ? (
                  <p className="text-white text-xl text-center leading-relaxed">
                    {visibleLines.find((l) => l.id === currentLineId)?.translations[primaryLang] ?? ''}
                  </p>
                ) : (
                  <p className="text-slate-600 text-sm italic">Select a line to preview</p>
                )}
              </div>

              {visibleLines.length > 0 && (
                <div className="px-4 pb-2">
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-600 rounded-full transition-all"
                      style={{ width: `${currentIdx < 0 ? 0 : ((currentIdx + 1) / visibleLines.length) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-600 text-center mt-1">
                    {currentIdx < 0 ? '—' : `${currentIdx + 1} / ${visibleLines.length}`}
                  </p>
                </div>
              )}

              <div className="border-t border-slate-800 p-4 flex gap-3">
                <button
                  onClick={handlePrev}
                  disabled={currentIdx <= 0}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  <ChevronLeft size={18} />
                  {t('control.prev')}
                </button>
                <button
                  onClick={handleNext}
                  disabled={currentIdx >= visibleLines.length - 1}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  {t('control.next')}
                  <ChevronRight size={18} />
                </button>
              </div>
              <p className="text-center text-xs text-slate-700 pb-3">Space/→ next · ← prev · B blackout</p>
            </div>
          </>
        )}

        {/* ── WINDOWS PANEL ────────────────────────────────────────── */}
        {activePanel === 'windows' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Window list */}
            <div className="w-72 border-r border-slate-800 flex flex-col">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h2 className="text-sm font-medium text-white">Projector Windows</h2>
                <button
                  onClick={addWindow}
                  className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
                >
                  <Plus size={13} />
                  Add
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {windowConfigs.map((cfg) => (
                  <div
                    key={cfg.id}
                    className={clsx(
                      'flex items-center gap-3 px-4 py-3 border-b border-slate-800/60 cursor-pointer transition-colors',
                      editingWindowId === cfg.id ? 'bg-slate-800' : 'hover:bg-slate-900',
                    )}
                    onClick={() => setEditingWindowId(cfg.id)}
                  >
                    <Monitor size={16} className="text-slate-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{cfg.label}</p>
                      <p className="text-xs text-slate-500">{LANG_LABELS[cfg.language]}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); openProjectorWindow(cfg) }}
                      title="Open projector window"
                      className="p-1.5 text-slate-500 hover:text-brand-400 transition-colors"
                    >
                      <ExternalLink size={13} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeWindow(cfg.id) }}
                      title="Remove window"
                      className="p-1.5 text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {windowConfigs.length === 0 && (
                  <p className="text-slate-600 text-sm text-center py-8">No windows. Click + to add.</p>
                )}
              </div>
            </div>

            {/* Window config editor */}
            {editingWindow ? (
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                <div className="flex items-center gap-2 mb-2">
                  <Settings size={16} className="text-slate-400" />
                  <h3 className="font-medium text-white">Configure: {editingWindow.label}</h3>
                </div>

                {/* Label */}
                <label className="block">
                  <span className="text-xs text-slate-400 block mb-1">Label</span>
                  <input
                    type="text"
                    value={editingWindow.label}
                    onChange={(e) => updateWindowConfig(editingWindow.id, 'label', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-600"
                  />
                </label>

                {/* Language */}
                <label className="block">
                  <span className="text-xs text-slate-400 block mb-1">Language</span>
                  <select
                    value={editingWindow.language}
                    onChange={(e) => updateWindowConfig(editingWindow.id, 'language', e.target.value as LangCode)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
                  >
                    {(project.languages as LangCode[]).map((lang) => (
                      <option key={lang} value={lang} className="bg-slate-900">
                        {lang.toUpperCase()} — {LANG_LABELS[lang]}
                      </option>
                    ))}
                  </select>
                </label>

                <hr className="border-slate-800" />
                <p className="text-xs text-slate-500 uppercase tracking-wider">Typography</p>

                {/* Font size */}
                <label className="block">
                  <span className="text-xs text-slate-400 block mb-1">Font size: {editingWindow.style.fontSizePx}px</span>
                  <input
                    type="range" min={16} max={120} step={2}
                    value={editingWindow.style.fontSizePx}
                    onChange={(e) => updateWindowStyle(editingWindow.id, { fontSizePx: Number(e.target.value) })}
                    className="w-full accent-brand-500"
                  />
                </label>

                {/* Font weight */}
                <label className="block">
                  <span className="text-xs text-slate-400 block mb-1">Font weight</span>
                  <select
                    value={editingWindow.style.fontWeight}
                    onChange={(e) => updateWindowStyle(editingWindow.id, { fontWeight: Number(e.target.value) as 400 | 600 | 700 })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value={400} className="bg-slate-900">Regular (400)</option>
                    <option value={600} className="bg-slate-900">Semi-bold (600)</option>
                    <option value={700} className="bg-slate-900">Bold (700)</option>
                  </select>
                </label>

                {/* Line height */}
                <label className="block">
                  <span className="text-xs text-slate-400 block mb-1">Line height: {editingWindow.style.lineHeight}</span>
                  <input
                    type="range" min={1} max={2.5} step={0.05}
                    value={editingWindow.style.lineHeight}
                    onChange={(e) => updateWindowStyle(editingWindow.id, { lineHeight: Number(e.target.value) })}
                    className="w-full accent-brand-500"
                  />
                </label>

                <hr className="border-slate-800" />
                <p className="text-xs text-slate-500 uppercase tracking-wider">Colors</p>

                {/* Colors */}
                <div className="flex gap-4">
                  <label className="flex-1">
                    <span className="text-xs text-slate-400 block mb-1">Text color</span>
                    <input
                      type="color"
                      value={editingWindow.style.textColor.startsWith('#') ? editingWindow.style.textColor : '#ffffff'}
                      onChange={(e) => updateWindowStyle(editingWindow.id, { textColor: e.target.value })}
                      className="w-full h-9 rounded-lg cursor-pointer border border-slate-700"
                    />
                  </label>
                  <label className="flex-1">
                    <span className="text-xs text-slate-400 block mb-1">BG color</span>
                    <input
                      type="color"
                      value={editingWindow.style.backgroundColor.startsWith('#') ? editingWindow.style.backgroundColor : '#000000'}
                      onChange={(e) => updateWindowStyle(editingWindow.id, { backgroundColor: e.target.value + 'b3' })}
                      className="w-full h-9 rounded-lg cursor-pointer border border-slate-700"
                    />
                  </label>
                </div>

                <hr className="border-slate-800" />
                <p className="text-xs text-slate-500 uppercase tracking-wider">Layout</p>

                {/* Text align */}
                <div>
                  <span className="text-xs text-slate-400 block mb-1">Text alignment</span>
                  <div className="flex gap-1">
                    {(['left', 'center', 'right'] as const).map((a) => (
                      <button
                        key={a}
                        onClick={() => updateWindowStyle(editingWindow.id, { textAlign: a })}
                        className={clsx(
                          'flex-1 py-2 rounded-lg text-xs capitalize transition-colors',
                          editingWindow.style.textAlign === a ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700',
                        )}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Opacity */}
                <label className="block">
                  <span className="text-xs text-slate-400 block mb-1">Window opacity: {Math.round(editingWindow.opacity * 100)}%</span>
                  <input
                    type="range" min={0.1} max={1} step={0.05}
                    value={editingWindow.opacity}
                    onChange={(e) => updateWindowConfig(editingWindow.id, 'opacity', Number(e.target.value))}
                    className="w-full accent-brand-500"
                  />
                </label>

                {/* Show media */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingWindow.showMedia}
                    onChange={(e) => updateWindowConfig(editingWindow.id, 'showMedia', e.target.checked)}
                    className="accent-brand-500"
                  />
                  <span className="text-sm text-slate-300">Play media cues in this window</span>
                </label>

                <div className="pt-2">
                  <button
                    onClick={() => openProjectorWindow(editingWindow)}
                    className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                  >
                    <ExternalLink size={14} />
                    Open {editingWindow.label}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-slate-600 text-sm">Select a window to configure it</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom nav bar for quick controls — always visible */}
      <footer className="bg-slate-900 border-t border-slate-800 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={handlePrev}
          disabled={currentIdx <= 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
        >
          <ChevronLeft size={16} />
          {t('control.prev')}
        </button>
        <button
          onClick={handleNext}
          disabled={currentIdx >= visibleLines.length - 1}
          className="flex items-center gap-2 px-6 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {t('control.next')}
          <ChevronRight size={16} />
        </button>
        <span className="text-slate-600 text-xs ml-auto">Space/→ next · ← prev · B blackout</span>
      </footer>
    </div>
  )
}
