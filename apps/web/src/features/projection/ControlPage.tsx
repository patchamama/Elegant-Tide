import { useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@elegant-tide/db'
import { useProjectionStore } from '@/stores/useProjectionStore'
import { createBus, type Bus } from '@elegant-tide/broadcast-protocol'
import { ArrowLeft, ChevronLeft, ChevronRight, EyeOff, ExternalLink, Pause } from 'lucide-react'
import { clsx } from 'clsx'
import type { LangCode } from '@elegant-tide/core-types'

export function ControlPage() {
  const { t } = useTranslation()
  const { projectId } = useParams({ from: '/control/$projectId' })
  const navigate = useNavigate()

  const { currentLineId, blackout, freeze, goTo, next, prev, toggleBlackout, toggleFreeze, setLines } =
    useProjectionStore()

  const busRef = useRef<Bus | null>(null)
  const windowId = useRef(`control-${crypto.randomUUID().slice(0, 8)}`)

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

  // Keep projection store in sync with live lines
  useEffect(() => {
    if (lines) setLines(lines)
  }, [lines, setLines])

  // Single bus instance for the lifetime of this page
  useEffect(() => {
    const bus = createBus({ projectId, windowId: windowId.current, role: 'control' })
    busRef.current = bus

    // Respond to state requests from projectors that just opened
    const unsubState = bus.on('state.request', () => {
      const { currentLineId, blackout, freeze } = useProjectionStore.getState()
      bus.send({
        kind: 'state.snapshot',
        payload: { currentLineId, blackout, freeze },
      })
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
    (lineId: string) => {
      goTo(lineId)
      sendGoto(lineId)
    },
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

  const handleFreeze = useCallback(() => {
    toggleFreeze()
  }, [toggleFreeze])

  const openProjector = useCallback(() => {
    window.open(`/projector/${projectId}`, '_blank', 'popup,width=1280,height=720')
  }, [projectId])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
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

  const visibleLines = lines.filter((l) => l.type !== 'comment')
  const currentIdx = visibleLines.findIndex((l) => l.id === currentLineId)
  const primaryLang = (project.primaryLanguage ?? project.languages[0] ?? 'en') as LangCode

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

        <button
          onClick={openProjector}
          className="flex items-center gap-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <ExternalLink size={13} />
          {t('control.openProjector')}
        </button>
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line list */}
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
              <span className={line.id === currentLineId ? 'text-white font-medium' : 'text-slate-300'}>
                {line.translations[primaryLang] ?? (
                  <em className="text-slate-600 text-sm">No translation</em>
                )}
              </span>
            </button>
          ))}
        </div>

        {/* Right panel — preview + controls */}
        <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col flex-shrink-0">
          {/* Preview */}
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

          {/* Progress */}
          {visibleLines.length > 0 && (
            <div className="px-4 pb-2">
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-600 rounded-full transition-all"
                  style={{
                    width: `${currentIdx < 0 ? 0 : ((currentIdx + 1) / visibleLines.length) * 100}%`,
                  }}
                />
              </div>
              <p className="text-xs text-slate-600 text-center mt-1">
                {currentIdx < 0 ? '—' : `${currentIdx + 1} / ${visibleLines.length}`}
              </p>
            </div>
          )}

          {/* Navigation buttons */}
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
      </div>
    </div>
  )
}
