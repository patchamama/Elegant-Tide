import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, projectsRepo } from '@elegant-tide/db'
import { useProjectionStore } from '@/stores/useProjectionStore'
import { useEditorStore } from '@/stores/useEditorStore'
import { createBus, type Bus } from '@elegant-tide/broadcast-protocol'
import type { LangCode, ProjectionChannel, ProjectorWindowConfig, ProjectionStyle } from '@elegant-tide/core-types'
import { DEFAULT_PROJECTION_STYLE } from '@elegant-tide/core-types'
import { openProjectorWindow as platformOpenProjector, isCapacitor } from '@/lib/platform'
import { saveCurrentLineId, loadCurrentLineId } from '@/lib/projectionStorage'
import { useLiveSync } from '@/hooks/useLiveSync'
import { useAudioPreloader } from '@/hooks/useAudioPreloader'
import { LineList } from '@/features/editor/LineList'
import {
  ArrowLeft, ChevronLeft, ChevronRight, EyeOff, ExternalLink,
  Monitor, Pause, Plus, Trash2, Settings, Play, Volume2,
  Search, ChevronUp, ChevronDown, X as XIcon, Lightbulb, Radio, MessageSquare,
} from 'lucide-react'
import { clsx } from 'clsx'

const LANG_LABELS: Record<ProjectionChannel, string> = {
  comment: 'Comments',
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

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const AUDIO_KW = /klingeln|musik|echo/i

export function ControlPage() {
  const { t } = useTranslation()
  const { projectId } = useParams({ from: '/control/$projectId' })
  const navigate = useNavigate()

  const { currentLineId, blackout, freeze, goTo, next, prev, toggleBlackout, toggleFreeze, setLines } =
    useProjectionStore()
  const syncLines = useEditorStore((s) => s.syncLines)

  useLiveSync(projectId, true)

  const busRef = useRef<Bus | null>(null)
  const windowId = useRef(`control-${crypto.randomUUID().slice(0, 8)}`)
  const onProjConfigRef = useRef<((incoming: ProjectorWindowConfig) => void) | null>(null)

  const [rightPanel, setRightPanel] = useState<'preview' | 'windows'>('preview')
  const [broadcastEnabled, setBroadcastEnabled] = useState(true)
  const prevBroadcastRef = useRef(true)
  const [allFullscreen, setAllFullscreen] = useState(false)
  const [windowConfigs, setWindowConfigs] = useState<ProjectorWindowConfig[]>([])
  const [editingWindowId, setEditingWindowId] = useState<string | null>(null)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [audioProgress, setAudioProgress] = useState<{ current: number; duration: number }>({ current: 0, duration: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatchIndex, setSearchMatchIndex] = useState(0)
  const [showNotes, setShowNotes] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  const audioMapRef = useAudioPreloader(lines ?? [], currentLineId, projectId)

  useEffect(() => {
    const audio = currentLineId ? audioMapRef.current.get(currentLineId) : undefined
    if (!audio) { setAudioPlaying(false); setAudioProgress({ current: 0, duration: 0 }); return }

    const currentLine = (lines ?? []).find((l) => l.id === currentLineId)
    const shouldAutoplay = currentLine?.audioRef != null &&
      (currentLine.media?.autoplay === true || !currentLine.media)

    const onTimeUpdate = () => setAudioProgress({ current: audio.currentTime, duration: audio.duration || 0 })
    const onEnded = () => setAudioPlaying(false)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)

    if (shouldAutoplay) {
      audio.currentTime = 0
      void audio.play().then(() => setAudioPlaying(true)).catch(() => {})
    }

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
    }
  }, [currentLineId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!project) return
    if (project.projectorWindows?.length) {
      setWindowConfigs(project.projectorWindows)
    } else {
      setWindowConfigs([makeWindowConfig(project.primaryLanguage, 0)])
    }
  }, [project])

  useEffect(() => {
    if (!lines) return
    setLines(lines)
    syncLines(lines)
    if (!currentLineId) {
      const saved = loadCurrentLineId(projectId)
      if (saved && lines.some((l) => l.id === saved)) goTo(saved)
    }
  }, [lines, setLines, syncLines]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const bus = createBus({ projectId, windowId: windowId.current, role: 'control' })
    busRef.current = bus

    const sendSnapshot = () => {
      const { currentLineId, blackout, freeze } = useProjectionStore.getState()
      bus.send({ kind: 'state.snapshot', payload: { currentLineId, blackout, freeze } })
    }

    const unsubState = bus.on('state.request', sendSnapshot)
    // Projector just opened — send snapshot + explicit goto so it loads the line
    const unsubHello = bus.on('hello', () => {
      sendSnapshot()
      const { currentLineId } = useProjectionStore.getState()
      if (currentLineId) bus.send({ kind: 'cue.goto', payload: { lineId: currentLineId } })
    })

    // Projector notified us of a local config change — delegate to ref so we have access to persistWindowConfigs
    const unsubProjConfig = bus.on('projector.config', (env) => {
      if (env.from.role !== 'projector') return
      onProjConfigRef.current?.(env.msg.payload.config)
    })

    return () => {
      unsubState()
      unsubHello()
      unsubProjConfig()
      bus.close()
      busRef.current = null
    }
  }, [projectId])

  const sendGoto = useCallback((lineId: string) => {
    if (broadcastEnabled) busRef.current?.send({ kind: 'cue.goto', payload: { lineId } })
    saveCurrentLineId(projectId, lineId)
  }, [projectId, broadcastEnabled])

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

  // When broadcast is re-enabled, push current line to projectors immediately
  useEffect(() => {
    const wasEnabled = prevBroadcastRef.current
    prevBroadcastRef.current = broadcastEnabled
    if (broadcastEnabled && !wasEnabled) {
      // Lift blackout first, then send current line
      busRef.current?.send({ kind: 'cue.blackout', payload: { on: false } })
      const { currentLineId } = useProjectionStore.getState()
      if (currentLineId) busRef.current?.send({ kind: 'cue.goto', payload: { lineId: currentLineId } })
    } else if (!broadcastEnabled && wasEnabled) {
      busRef.current?.send({ kind: 'cue.blackout', payload: { on: true } })
    }
  }, [broadcastEnabled])

  // Wire projector→control config sync once persistWindowConfigs is ready
  useEffect(() => {
    onProjConfigRef.current = (incoming) => {
      setWindowConfigs((prev) => {
        const idx = prev.findIndex((w) => w.id === incoming.id)
        if (idx === -1) return prev
        const next = prev.map((w, i) => i === idx ? { ...w, language: incoming.language, style: incoming.style, showMedia: incoming.showMedia } : w)
        void persistWindowConfigs(next)
        return next
      })
    }
  }, [persistWindowConfigs])

  const openProjectorWindow = useCallback((cfg: ProjectorWindowConfig) => {
    platformOpenProjector(projectId)
    setWindowConfigs((prev) => prev.map((w) => w.id === cfg.id ? { ...w, isOpen: true } : w))
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'ArrowDown') { e.preventDefault(); handleNext() }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); handlePrev() }
      if (e.code === 'KeyB') handleBlackout()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleNext, handlePrev, handleBlackout])

  const visibleLines = useMemo(() => (lines ?? []).filter((l) => l.type !== 'comment'), [lines])
  const currentIdx = visibleLines.findIndex((l) => l.id === currentLineId)

  // Search
  const searchMatches = useMemo(() => {
    const q = normalize(searchQuery.trim())
    if (!q || !lines) return []
    return lines
      .map((line) => {
        const texts = [...Object.values(line.translations), line.comment ?? '']
        return texts.some((t) => normalize(t).includes(q)) ? { lineId: line.id } : null
      })
      .filter(Boolean) as { lineId: string }[]
  }, [searchQuery, lines])

  const activeMatch = searchMatches[searchMatchIndex] ?? null

  const navigateSearch = useCallback((dir: 1 | -1) => {
    if (searchMatches.length === 0) return
    setSearchMatchIndex((i) => (i + dir + searchMatches.length) % searchMatches.length)
  }, [searchMatches.length])

  // Footer cue counters
  const { linesToNextSound, linesToNextLight } = useMemo(() => {
    if (!lines || !currentLineId) return { linesToNextSound: null, linesToNextLight: null }
    const idx = lines.findIndex((l) => l.id === currentLineId)
    if (idx === -1) return { linesToNextSound: null, linesToNextLight: null }
    const after = lines.slice(idx + 1)
    const isSoundLine = (l: typeof lines[0]) => l.tags?.includes('sound') || (l.comment ? AUDIO_KW.test(l.comment) : false)
    const isLightLine = (l: typeof lines[0]) => l.tags?.includes('light')
    const nextSound = after.findIndex(isSoundLine)
    const nextLight = after.findIndex(isLightLine)
    return {
      linesToNextSound: nextSound === -1 ? null : nextSound + 1,
      linesToNextLight: nextLight === -1 ? null : nextLight + 1,
    }
  }, [lines, currentLineId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const primaryLang = (project.primaryLanguage ?? project.languages[0] ?? 'en') as LangCode
  const editingWindow = windowConfigs.find((w) => w.id === editingWindowId)

  // Mini projector preview — replicate ProjectorPage visual
  const previewStyle = windowConfigs[0]?.style ?? DEFAULT_PROJECTION_STYLE
  const previewChannel: ProjectionChannel = windowConfigs[0]?.language ?? primaryLang
  const currentLine = (lines ?? []).find((l) => l.id === currentLineId)
  const previewText = !blackout && currentLine?.type !== 'media'
    ? previewChannel === 'comment'
      ? (currentLine?.comment ?? '')
      : (currentLine?.translations[previewChannel as LangCode] ?? '')
    : ''

  const subtitleCount = lines?.filter(l => l.type === 'subtitle').length ?? 0
  const blackoutCount = lines?.filter(l => l.type === 'blackout').length ?? 0
  const commentCount = lines?.filter(l => l.type === 'comment').length ?? 0

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      {/* Header — same structure as EditorPage */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => void navigate({ to: '/editor/$projectId', params: { projectId } })}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={17} />
        </button>
        <h1 className="font-semibold text-sm text-white truncate max-w-xs">
          {project.name}
        </h1>

        <div className="flex-1" />

        {/* Search bar */}
        <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1">
          <Search size={12} className="text-slate-500 flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchMatchIndex(0) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigateSearch(e.shiftKey ? -1 : 1)
              if (e.key === 'Escape') { setSearchQuery(''); searchInputRef.current?.blur() }
            }}
            placeholder="Search…"
            className="bg-transparent text-xs text-slate-200 outline-none placeholder-slate-600 w-36"
          />
          {searchQuery && (
            <>
              <span className="text-xs text-slate-500 tabular-nums min-w-8 text-center">
                {searchMatches.length > 0 ? `${searchMatchIndex + 1}/${searchMatches.length}` : '0/0'}
              </span>
              <button onClick={() => navigateSearch(-1)} className="p-0.5 text-slate-400 hover:text-white transition-colors">
                <ChevronUp size={13} />
              </button>
              <button onClick={() => navigateSearch(1)} className="p-0.5 text-slate-400 hover:text-white transition-colors">
                <ChevronDown size={13} />
              </button>
              <button onClick={() => { setSearchQuery(''); setSearchMatchIndex(0) }} className="p-0.5 text-slate-500 hover:text-white transition-colors">
                <XIcon size={11} />
              </button>
            </>
          )}
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

        {/* Right panel toggle */}
        <div className="flex bg-slate-800 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => setRightPanel('preview')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              rightPanel === 'preview' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white',
            )}
          >
            <Radio size={13} />
            Preview
          </button>
          <button
            onClick={() => setRightPanel('windows')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              rightPanel === 'windows' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white',
            )}
          >
            <Monitor size={13} />
            Windows
          </button>
        </div>
      </header>

      {/* Main — always: [line list | right panel] */}
      <div className="flex-1 flex overflow-hidden">

        {/* Line list with play-on-hover row numbers */}
        <div className="flex-1 overflow-hidden flex flex-col" onClick={(e) => {
          const row = (e.target as HTMLElement).closest('[data-testid="line-row"]') as HTMLElement | null
          if (row) {
            const lineId = row.getAttribute('data-line-id')
            if (lineId) handleGoto(lineId)
          }
        }}>
          <LineList
            lines={lines ?? []}
            languages={project.languages as LangCode[]}
            primaryLang={primaryLang}
            projectId={projectId}
            canEditSubtitles={false}
            canEditComments={false}
            showNotes={showNotes}
            searchQuery={searchQuery}
            activeMatchLineId={activeMatch?.lineId ?? null}
            activeMatchIndex={activeMatch ? (lines ?? []).findIndex(l => l.id === activeMatch.lineId) : null}
            followLineId={currentLineId}
            isFollowing={!searchQuery}
            onLineActivate={handleGoto}
          />
        </div>

        {/* Right panel */}
        <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col flex-shrink-0">

          {rightPanel === 'preview' && (
            <>
              {/* Mini projector — black canvas with styled text */}
              <div
                className="flex-1 flex items-center justify-center min-h-0 relative overflow-hidden"
                style={{ background: previewStyle.backgroundColor ?? '#000' }}
              >
                {blackout ? (
                  <div className="text-center">
                    <EyeOff size={20} className="text-red-500 mx-auto mb-2" />
                    <p className="text-slate-600 text-xs italic">Blackout</p>
                  </div>
                ) : previewText ? (
                  <div
                    style={{
                      fontFamily: previewStyle.fontFamily,
                      fontSize: `${Math.min(previewStyle.fontSizePx, 32)}px`,
                      fontWeight: previewStyle.fontWeight,
                      color: previewStyle.textColor,
                      textShadow: previewStyle.textShadow,
                      padding: `${previewStyle.paddingPx}px ${previewStyle.paddingPx * 2}px`,
                      textAlign: previewStyle.textAlign,
                      lineHeight: previewStyle.lineHeight,
                      borderRadius: `${previewStyle.borderRadiusPx ?? 4}px`,
                      maxWidth: '90%',
                      whiteSpace: 'pre-wrap',
                      backgroundColor: 'transparent',
                    }}
                  >
                    {previewText}
                  </div>
                ) : (
                  <p className="text-slate-700 text-xs italic">No line active</p>
                )}
              </div>

              {/* Audio mini player */}
              {currentLineId && audioMapRef.current.has(currentLineId) && (() => {
                const audio = audioMapRef.current.get(currentLineId)!
                const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
                return (
                  <div className="px-4 py-2 flex items-center gap-2 bg-sky-950/20 border-t border-sky-900/30">
                    <Volume2 size={13} className="text-sky-400 flex-shrink-0" />
                    <button
                      onClick={() => {
                        if (audio.paused) { void audio.play(); setAudioPlaying(true) }
                        else { audio.pause(); setAudioPlaying(false) }
                      }}
                      className="text-sky-300 hover:text-white transition-colors flex-shrink-0"
                    >
                      {audioPlaying ? <Pause size={15} /> : <Play size={15} />}
                    </button>
                    <span className="text-xs text-slate-400 tabular-nums">
                      {fmt(audioProgress.current)} / {fmt(audioProgress.duration)}
                    </span>
                  </div>
                )
              })()}

              {/* Broadcast + fullscreen toggles */}
              <div className="px-4 py-2 border-t border-slate-800 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={broadcastEnabled}
                    onChange={(e) => setBroadcastEnabled(e.target.checked)}
                    className="accent-brand-500"
                  />
                  <span className="text-xs text-slate-300">Show on projectors</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allFullscreen}
                    onChange={(e) => {
                      setAllFullscreen(e.target.checked)
                      busRef.current?.send({ kind: 'projector.fullscreen', payload: { on: e.target.checked } })
                    }}
                    className="accent-brand-500"
                  />
                  <span className="text-xs text-slate-300">All fullscreen</span>
                </label>
              </div>
              {!broadcastEnabled && (
                <div className="px-4 pb-2 -mt-1">
                  <span className="text-xs text-amber-400 font-medium">Preview only</span>
                </div>
              )}

              {/* Progress bar */}
              {visibleLines.length > 0 && (
                <div className="px-4 py-2 border-t border-slate-800">
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

              {/* Prev / Next */}
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
            </>
          )}

          {rightPanel === 'windows' && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Window list */}
              <div className="flex-1 overflow-y-auto">
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
                {windowConfigs.map((cfg) => (
                  <div
                    key={cfg.id}
                    className={clsx(
                      'flex items-center gap-3 px-4 py-3 border-b border-slate-800/60 cursor-pointer transition-colors',
                      editingWindowId === cfg.id ? 'bg-slate-800' : 'hover:bg-slate-900/60',
                    )}
                    onClick={() => setEditingWindowId(editingWindowId === cfg.id ? null : cfg.id)}
                  >
                    <Monitor size={16} className="text-slate-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{cfg.label}</p>
                      <p className="text-xs text-slate-500">{LANG_LABELS[cfg.language]}</p>
                    </div>
                    {!isCapacitor && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openProjectorWindow(cfg) }}
                        title="Open projector window"
                        className="p-1.5 text-slate-500 hover:text-brand-400 transition-colors"
                      >
                        <ExternalLink size={13} />
                      </button>
                    )}
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

              {/* Window config editor — shown inline below list */}
              {editingWindow && (
                <div className="border-t border-slate-800 overflow-y-auto p-4 space-y-4 max-h-96">
                  <div className="flex items-center gap-2">
                    <Settings size={14} className="text-slate-400" />
                    <h3 className="font-medium text-white text-sm">{editingWindow.label}</h3>
                  </div>

                  <label className="block">
                    <span className="text-xs text-slate-400 block mb-1">Label</span>
                    <input
                      type="text"
                      value={editingWindow.label}
                      onChange={(e) => updateWindowConfig(editingWindow.id, 'label', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-600"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs text-slate-400 block mb-1">Language</span>
                    <select
                      value={editingWindow.language}
                      onChange={(e) => updateWindowConfig(editingWindow.id, 'language', e.target.value as ProjectionChannel)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
                    >
                      <option value="comment" className="bg-slate-900">Comments</option>
                      {(project.languages as LangCode[]).map((lang) => (
                        <option key={lang} value={lang} className="bg-slate-900">
                          {lang.toUpperCase()} — {LANG_LABELS[lang]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-xs text-slate-400 block mb-1">Font size: {editingWindow.style.fontSizePx}px</span>
                    <input type="range" min={16} max={120} step={2}
                      value={editingWindow.style.fontSizePx}
                      onChange={(e) => updateWindowStyle(editingWindow.id, { fontSizePx: Number(e.target.value) })}
                      className="w-full accent-brand-500"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs text-slate-400 block mb-1">Line height: {editingWindow.style.lineHeight}</span>
                    <input type="range" min={1} max={4} step={0.05}
                      value={editingWindow.style.lineHeight}
                      onChange={(e) => updateWindowStyle(editingWindow.id, { lineHeight: Number(e.target.value) })}
                      className="w-full accent-brand-500"
                    />
                  </label>

                  <div className="flex gap-3">
                    <label className="flex-1">
                      <span className="text-xs text-slate-400 block mb-1">Text</span>
                      <input type="color"
                        value={editingWindow.style.textColor.startsWith('#') ? editingWindow.style.textColor : '#ffffff'}
                        onChange={(e) => updateWindowStyle(editingWindow.id, { textColor: e.target.value })}
                        className="w-full h-8 rounded-lg cursor-pointer border border-slate-700"
                      />
                    </label>
                    <label className="flex-1">
                      <span className="text-xs text-slate-400 block mb-1">BG</span>
                      <input type="color"
                        value={editingWindow.style.backgroundColor.startsWith('#') ? editingWindow.style.backgroundColor : '#000000'}
                        onChange={(e) => updateWindowStyle(editingWindow.id, { backgroundColor: e.target.value + 'b3' })}
                        className="w-full h-8 rounded-lg cursor-pointer border border-slate-700"
                      />
                    </label>
                  </div>

                  <div>
                    <span className="text-xs text-slate-400 block mb-1">Horizontal</span>
                    <div className="flex gap-1">
                      {(['left', 'center', 'right'] as const).map((a) => (
                        <button key={a}
                          onClick={() => updateWindowStyle(editingWindow.id, { textAlign: a })}
                          className={clsx('flex-1 py-1.5 rounded-lg text-xs capitalize transition-colors',
                            editingWindow.style.textAlign === a ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')}
                        >{a}</button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-slate-400 block mb-1">Vertical</span>
                    <div className="flex gap-1">
                      {(['top', 'center', 'bottom'] as const).map((a) => (
                        <button key={a}
                          onClick={() => updateWindowStyle(editingWindow.id, { verticalAlign: a })}
                          className={clsx('flex-1 py-1.5 rounded-lg text-xs capitalize transition-colors',
                            (editingWindow.style.verticalAlign ?? 'center') === a ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700')}
                        >{a}</button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox"
                      checked={editingWindow.showMedia}
                      onChange={(e) => updateWindowConfig(editingWindow.id, 'showMedia', e.target.checked)}
                      className="accent-brand-500"
                    />
                    <span className="text-sm text-slate-300">Show media cues</span>
                  </label>

                  {!isCapacitor && (
                    <button
                      onClick={() => openProjectorWindow(editingWindow)}
                      className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors w-full justify-center"
                    >
                      <ExternalLink size={14} />
                      Open {editingWindow.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer — same structure as EditorPage status bar */}
      <footer className="bg-slate-900 border-t border-slate-800 px-4 py-1.5 flex items-center gap-3 flex-shrink-0 text-xs text-slate-500 select-none">
        <button
          onClick={handlePrev}
          disabled={currentIdx <= 0}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-slate-300"
        >
          <ChevronLeft size={14} />
          {t('control.prev')}
        </button>
        <button
          onClick={handleNext}
          disabled={currentIdx >= visibleLines.length - 1}
          className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-white font-medium"
        >
          {t('control.next')}
          <ChevronRight size={14} />
        </button>

        <span className="tabular-nums text-slate-400">{lines?.length ?? 0} lines</span>
        {subtitleCount > 0 && <><span>·</span><span>{subtitleCount} subtitles</span></>}
        {blackoutCount > 0 && <><span>·</span><span>{blackoutCount} blackouts</span></>}
        {commentCount > 0 && <><span>·</span><span>{commentCount} comments</span></>}

        {linesToNextSound !== null && (
          <>
            <span>·</span>
            <span className={clsx(
              'flex items-center gap-1 font-semibold tabular-nums transition-colors',
              linesToNextSound <= 3 ? 'text-red-400 animate-pulse' :
              linesToNextSound <= 8 ? 'text-orange-400' : 'text-sky-400',
            )}>
              <Volume2 size={11} />
              <span>{linesToNextSound}</span>
            </span>
          </>
        )}
        {linesToNextLight !== null && (
          <>
            <span>·</span>
            <span className={clsx(
              'flex items-center gap-1 font-semibold tabular-nums transition-colors',
              linesToNextLight <= 3 ? 'text-red-400 animate-pulse' :
              linesToNextLight <= 8 ? 'text-orange-400' : 'text-yellow-400',
            )}>
              <Lightbulb size={11} />
              <span>{linesToNextLight}</span>
            </span>
          </>
        )}

        <button
          onClick={() => setShowNotes(v => !v)}
          className={clsx(
            'ml-auto flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors',
            showNotes ? 'text-amber-400 bg-amber-950/30' : 'text-slate-600 hover:text-slate-400',
          )}
          title="Toggle notes column"
        >
          <MessageSquare size={12} />
          Notes
        </button>
        <span className="text-slate-700">Space/→ · ← · B</span>
      </footer>
    </div>
  )
}
