import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from '@tanstack/react-router'
import { createBus } from '@elegant-tide/broadcast-protocol'
import type { SubtitleLine, LangCode, ProjectionChannel, ProjectionStyle, MediaPayload } from '@elegant-tide/core-types'
import { DEFAULT_PROJECTION_STYLE } from '@elegant-tide/core-types'
import { linesRepo, db, projectsRepo } from '@elegant-tide/db'
import ReactPlayer from 'react-player'
import { Settings, X, FileDown, Save, Check } from 'lucide-react'
import { saveCurrentLineId, loadCurrentLineId } from '@/lib/projectionStorage'
import { exportPdf, type PdfPageSize } from '@/lib/exportPdf'

const LANG_OPTIONS: { value: LangCode; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
]

export function ProjectorPage() {
  const { windowId } = useParams({ from: '/projector/$windowId' })
  const projectId = windowId

  const [currentLine, setCurrentLine] = useState<SubtitleLine | null>(null)
  const [blackout, setBlackout] = useState(false)
  const [language, setLanguage] = useState<ProjectionChannel>('en')
  const [style, setStyle] = useState<ProjectionStyle>(DEFAULT_PROJECTION_STYLE)
  const [showSettings, setShowSettings] = useState(false)
  const [showMedia, setShowMedia] = useState(true)
  const [pdfPageSize, setPdfPageSize] = useState<PdfPageSize>('a4')
  const [savedFeedback, setSavedFeedback] = useState(false)
  const busRef = useRef<ReturnType<typeof createBus> | null>(null)
  const allLinesRef = useRef<SubtitleLine[]>([])

  const myWindowId = useRef(`projector-${crypto.randomUUID().slice(0, 8)}`)

  useEffect(() => {
    const bus = createBus({ projectId, windowId: myWindowId.current, role: 'projector' })
    busRef.current = bus

    bus.send({ kind: 'hello', payload: { role: 'projector', windowId: myWindowId.current, userAgent: navigator.userAgent } })
    bus.send({ kind: 'state.request', payload: {} })
    // Retry in case control page hadn't registered its listener yet
    const retryTimer = setTimeout(() => bus.send({ kind: 'state.request', payload: {} }), 600)

    // Load all lines for local next/prev navigation
    void db.lines
      .where('[projectId+order]')
      .between([projectId, -Infinity], [projectId, Infinity])
      .filter((l) => !l.deletedAt && l.type !== 'comment')
      .sortBy('order')
      .then((ls) => {
        allLinesRef.current = ls
        // Restore last position if no state.snapshot comes within 300ms
        const saved = loadCurrentLineId(projectId)
        if (saved) {
          setTimeout(() => {
            setCurrentLine((cur) => {
              if (cur) return cur
              const found = ls.find((l) => l.id === saved)
              return found ?? null
            })
          }, 300)
        }
      })

    const unsubGoto = bus.on('cue.goto', async (env) => {
      const line = await linesRepo.get(env.msg.payload.lineId)
      setCurrentLine(line ?? null)
    })

    const unsubBlackout = bus.on('cue.blackout', (env) => {
      setBlackout(env.msg.payload.on)
    })

    const unsubSnapshot = bus.on('state.snapshot', async (env) => {
      setBlackout(env.msg.payload.blackout)
      if (env.msg.payload.currentLineId) {
        const line = await linesRepo.get(env.msg.payload.currentLineId)
        setCurrentLine(line ?? null)
      }
    })

    const unsubConfig = bus.on('projector.config', (env) => {
      const cfg = env.msg.payload.config
      setLanguage(cfg.language)
      setStyle(cfg.style)
      if (typeof cfg.showMedia === 'boolean') setShowMedia(cfg.showMedia)
    })

    const unsubLineUpdated = bus.on('line.updated', (env) => {
      const updated = env.msg.payload.line
      setCurrentLine((cur) => (cur?.id === updated.id ? updated : cur))
    })

    return () => {
      clearTimeout(retryTimer)
      unsubGoto(); unsubBlackout(); unsubSnapshot(); unsubConfig(); unsubLineUpdated()
      bus.close()
      busRef.current = null
    }
  }, [projectId])

  const navigateProjector = useCallback((dir: 1 | -1) => {
    const lines = allLinesRef.current
    if (lines.length === 0) return
    setCurrentLine((cur) => {
      const idx = cur ? lines.findIndex((l) => l.id === cur.id) : -1
      const next = lines[idx + dir]
      if (!next) return cur
      saveCurrentLineId(projectId, next.id)
      busRef.current?.send({ kind: 'cue.goto', payload: { lineId: next.id } })
      return next
    })
  }, [projectId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'Space') { e.preventDefault(); navigateProjector(1) }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); navigateProjector(-1) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigateProjector])

  const handleExportPdf = useCallback(async () => {
    const project = await db.projects.get(projectId)
    if (!project) return
    const lines = await db.lines
      .where('[projectId+order]')
      .between([projectId, -Infinity], [projectId, Infinity])
      .filter((l) => !l.deletedAt)
      .sortBy('order')
    exportPdf(lines, project.primaryLanguage as LangCode, project.name, style, pdfPageSize)
  }, [projectId, style, pdfPageSize])

  const handleSaveConfig = useCallback(async () => {
    const project = await db.projects.get(projectId)
    if (!project) return
    const windows = project.projectorWindows?.length
      ? project.projectorWindows.map((w, i) => i === 0 ? { ...w, language, style, showMedia } : w)
      : [{ id: crypto.randomUUID(), label: 'Projector 1', language, style, opacity: 1, showMedia, isOpen: false }]
    await projectsRepo.upsert({ ...project, projectorWindows: windows, updatedAt: Date.now() })
    setSavedFeedback(true)
    setTimeout(() => setSavedFeedback(false), 2000)
  }, [projectId, language, style, showMedia])

  const text = (!blackout && currentLine?.type !== 'media')
    ? language === 'comment'
      ? (currentLine?.comment ?? '')
      : (currentLine?.translations[language as LangCode] ?? '')
    : ''
  const media: MediaPayload | undefined = currentLine?.type === 'media' ? currentLine.media : undefined

  return (
    <div
      className="min-h-screen overflow-hidden relative select-none"
      style={{ background: '#000' }}
    >
      {/* Media player — full screen background */}
      {showMedia && !blackout && media?.url && (
        <div className="absolute inset-0 flex items-center justify-center">
          <ReactPlayer
            url={media.url}
            playing={media.autoplay}
            loop={media.loop ?? false}
            volume={media.volume ?? 1}
            width="100%"
            height="100%"
            style={{ position: 'absolute', inset: 0 }}
            config={{
              youtube: { playerVars: { start: media.startSeconds, end: media.endSeconds } },
              vimeo: { playerOptions: { autoplay: media.autoplay } },
            }}
          />
        </div>
      )}

      {/* Subtitle text — positioned by verticalAlign */}
      {!blackout && text && (
        <div
          className="absolute inset-x-0 flex justify-center px-8"
          style={
            (style.verticalAlign ?? 'center') === 'top'
              ? { top: '2rem' }
              : (style.verticalAlign ?? 'center') === 'bottom'
              ? { bottom: '3rem' }
              : { top: '50%', transform: 'translateY(-50%)' }
          }
        >
          <div
            style={{
              fontFamily: style.fontFamily,
              fontSize: `${style.fontSizePx}px`,
              fontWeight: style.fontWeight,
              color: style.textColor,
              backgroundColor: style.backgroundColor,
              textShadow: style.textShadow,
              padding: `${style.paddingPx}px ${style.paddingPx * 2}px`,
              textAlign: style.textAlign,
              lineHeight: style.lineHeight,
              borderRadius: `${style.borderRadiusPx ?? 4}px`,
              maxWidth: '90vw',
              whiteSpace: 'pre-wrap',
            }}
            data-testid="projector-text"
          >
            {text}
          </div>
        </div>
      )}

      {/* Settings overlay — appears on mouse move */}
      {showSettings && (
        <div className="absolute top-0 right-0 m-4 bg-black/80 border border-white/10 rounded-2xl p-4 w-72 backdrop-blur-sm text-white text-sm space-y-4 z-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings size={14} className="text-slate-400" />
              <span className="font-medium">Projector Settings</span>
            </div>
            <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-white">
              <X size={14} />
            </button>
          </div>

          {/* Language */}
          <label className="block">
            <span className="text-slate-400 text-xs block mb-1">Language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as ProjectionChannel)}
              className="w-full bg-white/10 border border-white/10 rounded-lg px-2 py-1.5 text-sm outline-none"
            >
              <option value="comment" className="bg-slate-900">Comments</option>
              {LANG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-slate-900">{o.label}</option>
              ))}
            </select>
          </label>

          {/* Font size */}
          <label className="block">
            <span className="text-slate-400 text-xs block mb-1">Font size: {style.fontSizePx}px</span>
            <input
              type="range" min={16} max={120} step={2}
              value={style.fontSizePx}
              onChange={(e) => setStyle((s) => ({ ...s, fontSizePx: Number(e.target.value) }))}
              className="w-full accent-brand-500"
            />
          </label>

          {/* Text color */}
          <div className="flex items-center gap-3">
            <label className="flex-1">
              <span className="text-slate-400 text-xs block mb-1">Text color</span>
              <input
                type="color"
                value={style.textColor.startsWith('#') ? style.textColor : '#ffffff'}
                onChange={(e) => setStyle((s) => ({ ...s, textColor: e.target.value }))}
                className="w-full h-8 rounded cursor-pointer"
              />
            </label>
            <label className="flex-1">
              <span className="text-slate-400 text-xs block mb-1">BG color</span>
              <input
                type="color"
                value={style.backgroundColor.startsWith('#') ? style.backgroundColor : '#000000'}
                onChange={(e) => setStyle((s) => ({ ...s, backgroundColor: e.target.value + 'b3' }))}
                className="w-full h-8 rounded cursor-pointer"
              />
            </label>
          </div>

          {/* Text align */}
          <div>
            <span className="text-slate-400 text-xs block mb-1">Horizontal</span>
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setStyle((s) => ({ ...s, textAlign: a }))}
                  className={`flex-1 py-1 rounded text-xs capitalize transition-colors ${style.textAlign === a ? 'bg-brand-600 text-white' : 'bg-white/10 text-slate-400 hover:bg-white/20'}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Vertical align */}
          <div>
            <span className="text-slate-400 text-xs block mb-1">Vertical</span>
            <div className="flex gap-1">
              {(['top', 'center', 'bottom'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setStyle((s) => ({ ...s, verticalAlign: a }))}
                  className={`flex-1 py-1 rounded text-xs capitalize transition-colors ${(style.verticalAlign ?? 'center') === a ? 'bg-brand-600 text-white' : 'bg-white/10 text-slate-400 hover:bg-white/20'}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Show media toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showMedia}
              onChange={(e) => setShowMedia(e.target.checked)}
              className="accent-brand-500"
            />
            <span className="text-sm text-slate-300">Show media cues</span>
          </label>

          <hr className="border-white/10" />

          {/* PDF export */}
          <div className="space-y-2">
            <span className="text-slate-400 text-xs block">Export PDF</span>
            <div className="flex gap-1">
              {(['a4', 'letter', '16:9'] as PdfPageSize[]).map(size => (
                <button
                  key={size}
                  onClick={() => setPdfPageSize(size)}
                  className={`flex-1 py-1 rounded text-xs transition-colors ${pdfPageSize === size ? 'bg-brand-600 text-white' : 'bg-white/10 text-slate-400 hover:bg-white/20'}`}
                >
                  {size === '16:9' ? '16:9' : size.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={() => void handleExportPdf()}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-sm transition-colors"
            >
              <FileDown size={14} />
              Export PDF
            </button>
          </div>

          {/* Save config */}
          <button
            onClick={() => void handleSaveConfig()}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
          >
            {savedFeedback ? <Check size={14} /> : <Save size={14} />}
            {savedFeedback ? 'Saved!' : 'Save configuration'}
          </button>
        </div>
      )}

      {/* Settings trigger */}
      {!showSettings && (
        <button
          onClick={() => setShowSettings(true)}
          className="absolute top-4 right-4 p-2 text-white/20 hover:text-white/60 transition-colors z-40"
        >
          <Settings size={14} />
        </button>
      )}
    </div>
  )
}
