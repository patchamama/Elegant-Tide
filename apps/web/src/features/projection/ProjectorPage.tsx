import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from '@tanstack/react-router'
import { createBus } from '@elegant-tide/broadcast-protocol'
import type { SubtitleLine, LangCode, ProjectionChannel, ProjectionStyle, MediaPayload } from '@elegant-tide/core-types'
import { DEFAULT_PROJECTION_STYLE } from '@elegant-tide/core-types'
import { linesRepo, db, projectsRepo } from '@elegant-tide/db'
import ReactPlayer from 'react-player'
import { Settings, X, FileDown, Save, Check, Maximize2, Edit3 } from 'lucide-react'
import { saveCurrentLineId, loadCurrentLineId } from '@/lib/projectionStorage'
import { exportPdf, type PdfPageSize } from '@/lib/exportPdf'
import { useProjectRole } from '@/hooks/useProjectRole'
import { LineList } from '@/features/editor/LineList'
import { useLiveQuery } from 'dexie-react-hooks'
import { useProjectionStore } from '@/stores/useProjectionStore'
import { useEditorStore } from '@/stores/useEditorStore'

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
  const [bgVideoUrl, setBgVideoUrl] = useState('')
  const [bgVideoInput, setBgVideoInput] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const busRef = useRef<ReturnType<typeof createBus> | null>(null)
  const allLinesRef = useRef<SubtitleLine[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const myWindowId = useRef(`projector-${crypto.randomUUID().slice(0, 8)}`)
  const configRestoredRef = useRef(false)  // track whether we've restored saved config

  const { isMaster, canEditSubtitles, canEditComments } = useProjectRole(projectId)

  // For editor overlay
  const lines = useLiveQuery(
    () => db.lines
      .where('[projectId+order]')
      .between([projectId, -Infinity], [projectId, Infinity])
      .filter((l) => !l.deletedAt)
      .sortBy('order'),
    [projectId],
  )
  const syncLines = useEditorStore((s) => s.syncLines)
  const { goTo } = useProjectionStore()

  useEffect(() => {
    if (lines) syncLines(lines)
  }, [lines]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const bus = createBus({ projectId, windowId: myWindowId.current, role: 'projector' })
    busRef.current = bus

    bus.send({ kind: 'hello', payload: { role: 'projector', windowId: myWindowId.current, userAgent: navigator.userAgent } })
    bus.send({ kind: 'state.request', payload: {} })
    const retryTimer = setTimeout(() => bus.send({ kind: 'state.request', payload: {} }), 600)

    // Restore persisted config only if control hasn't already sent config
    void db.projects.get(projectId).then((p) => {
      if (configRestoredRef.current) return  // control already configured us
      configRestoredRef.current = true
      const win = p?.projectorWindows?.[0]
      if (win) {
        if (win.language) setLanguage(win.language)
        if (win.style) setStyle(win.style)
        if (typeof win.showMedia === 'boolean') setShowMedia(win.showMedia)
        if (win.bgVideoUrl) { setBgVideoUrl(win.bgVideoUrl); setBgVideoInput(win.bgVideoUrl) }
      }
    })

    void db.lines
      .where('[projectId+order]')
      .between([projectId, -Infinity], [projectId, Infinity])
      .filter((l) => !l.deletedAt && l.type !== 'comment')
      .sortBy('order')
      .then((ls) => {
        allLinesRef.current = ls
        const saved = loadCurrentLineId(projectId)
        if (saved) {
          setTimeout(() => {
            setCurrentLine((cur) => {
              if (cur) return cur
              return ls.find((l) => l.id === saved) ?? null
            })
          }, 300)
        }
      })

    const unsubGoto = bus.on('cue.goto', async (env) => {
      const line = await linesRepo.get(env.msg.payload.lineId)
      if (line) {
        setCurrentLine(line)
        goTo(line.id)
        setLanguage((lang) => {
          if (lang !== 'comment' && line.translations[lang as LangCode]?.trim()) return lang
          const found = Object.entries(line.translations).find(([, v]) => v?.trim())
          return found ? (found[0] as LangCode) : lang
        })
      } else {
        setCurrentLine(null)
      }
    })

    const unsubBlackout = bus.on('cue.blackout', (env) => {
      setBlackout(env.msg.payload.on)
    })

    const unsubSnapshot = bus.on('state.snapshot', async (env) => {
      setBlackout(env.msg.payload.blackout)
      if (env.msg.payload.currentLineId) {
        const line = await linesRepo.get(env.msg.payload.currentLineId)
        setCurrentLine(line ?? null)
        if (line) goTo(line.id)
      }
    })

    const unsubConfig = bus.on('projector.config', (env) => {
      const cfg = env.msg.payload.config
      if (env.from.role === 'control') {
        configRestoredRef.current = true  // control wins — skip DB restore
        setLanguage(cfg.language)
        setStyle(cfg.style)
        if (typeof cfg.showMedia === 'boolean') setShowMedia(cfg.showMedia)
      }
    })

    const unsubLineUpdated = bus.on('line.updated', (env) => {
      const updated = env.msg.payload.line
      setCurrentLine((cur) => (cur?.id === updated.id ? updated : cur))
    })

    const unsubFullscreen = bus.on('projector.fullscreen', (env) => {
      const el = containerRef.current
      if (!el) return
      setShowSettings(false)
      if (env.msg.payload.on) {
        void el.requestFullscreen()
      } else if (document.fullscreenElement) {
        void document.exitFullscreen()
      }
    })

    return () => {
      clearTimeout(retryTimer)
      unsubGoto(); unsubBlackout(); unsubSnapshot(); unsubConfig(); unsubLineUpdated(); unsubFullscreen()
      bus.close()
      busRef.current = null
    }
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const navigateProjector = useCallback((dir: 1 | -1) => {
    const ls = allLinesRef.current
    if (ls.length === 0) return
    setCurrentLine((cur) => {
      const idx = cur ? ls.findIndex((l) => l.id === cur.id) : -1
      const next = ls[idx + dir]
      if (!next) return cur
      saveCurrentLineId(projectId, next.id)
      busRef.current?.send({ kind: 'cue.goto', payload: { lineId: next.id } })
      return next
    })
  }, [projectId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showEditor) return
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'Space') { e.preventDefault(); navigateProjector(1) }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); navigateProjector(-1) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigateProjector, showEditor])

  // Notify control when local config changes
  const isFirstConfigRender = useRef(true)
  useEffect(() => {
    if (isFirstConfigRender.current) { isFirstConfigRender.current = false; return }
    if (!busRef.current) return
    busRef.current.send({
      kind: 'projector.config',
      payload: {
        config: {
          id: myWindowId.current,
          label: 'Projector',
          language,
          style,
          opacity: 1,
          showMedia,
          isOpen: true,
        },
      },
    })
  }, [language, style, showMedia]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleExportPdf = useCallback(async () => {
    const project = await db.projects.get(projectId)
    if (!project) return
    const ls = await db.lines
      .where('[projectId+order]')
      .between([projectId, -Infinity], [projectId, Infinity])
      .filter((l) => !l.deletedAt)
      .sortBy('order')
    exportPdf(ls, project.primaryLanguage as LangCode, project.name, style, pdfPageSize)
  }, [projectId, style, pdfPageSize])

  const handleSaveConfig = useCallback(async () => {
    const project = await db.projects.get(projectId)
    if (!project) return
    const bgPatch = bgVideoUrl ? { bgVideoUrl } : {}
    const windows = project.projectorWindows?.length
      ? project.projectorWindows.map((w, i) => i === 0 ? { ...w, language, style, showMedia, ...bgPatch } : w)
      : [{ id: crypto.randomUUID(), label: 'Projector 1', language, style, opacity: 1, showMedia, isOpen: false, ...bgPatch }]
    await projectsRepo.upsert({ ...project, projectorWindows: windows, updatedAt: Date.now() })
    setSavedFeedback(true)
    setTimeout(() => setSavedFeedback(false), 2000)
  }, [projectId, language, style, showMedia, bgVideoUrl])

  const handleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setShowSettings(false)
    if (!document.fullscreenElement) {
      void el.requestFullscreen()
    } else {
      void document.exitFullscreen()
    }
  }, [])

  const text = (!blackout && currentLine?.type !== 'media')
    ? language === 'comment'
      ? (currentLine?.comment ?? '')
      : (currentLine?.translations[language as LangCode] ?? '')
    : ''
  const media: MediaPayload | undefined = currentLine?.type === 'media' ? currentLine.media : undefined
  const activeBgVideo = bgVideoUrl || (showMedia && media?.url ? undefined : undefined)

  return (
    <div
      ref={containerRef}
      className="min-h-screen overflow-hidden relative select-none"
      style={{ background: '#000' }}
    >
      {/* Background video (manual URL) */}
      {bgVideoUrl && (
        <div className="absolute inset-0 pointer-events-none">
          <ReactPlayer
            url={bgVideoUrl}
            playing
            loop
            volume={0.7}
            width="100%"
            height="100%"
            style={{ position: 'absolute', inset: 0 }}
          />
        </div>
      )}

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

      {/* Subtitle text */}
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

      {/* Editor overlay — master only */}
      {showEditor && isMaster && lines && (
        <div className="absolute inset-0 bg-slate-950/95 z-40 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 flex-shrink-0">
            <span className="text-sm font-medium text-white">Script Editor</span>
            <button onClick={() => setShowEditor(false)} className="p-1.5 text-slate-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <LineList
              lines={lines}
              languages={language === 'comment' ? [] : [language as LangCode]}
              primaryLang={(language === 'comment' ? 'en' : language) as LangCode}
              projectId={projectId}
              canEditSubtitles={canEditSubtitles}
              canEditComments={canEditComments}
              followLineId={currentLine?.id ?? null}
              isFollowing={true}
            />
          </div>
        </div>
      )}

      {/* Settings overlay */}
      {showSettings && (
        <div className="absolute top-0 right-0 m-4 bg-black/80 border border-white/10 rounded-2xl p-4 w-72 backdrop-blur-sm text-white text-sm space-y-4 z-50 max-h-[90vh] overflow-y-auto">
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

          {/* Colors */}
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

          {/* Horizontal align */}
          <div>
            <span className="text-slate-400 text-xs block mb-1">Horizontal</span>
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button key={a}
                  onClick={() => setStyle((s) => ({ ...s, textAlign: a }))}
                  className={`flex-1 py-1 rounded text-xs capitalize transition-colors ${style.textAlign === a ? 'bg-brand-600 text-white' : 'bg-white/10 text-slate-400 hover:bg-white/20'}`}
                >{a}</button>
              ))}
            </div>
          </div>

          {/* Vertical align */}
          <div>
            <span className="text-slate-400 text-xs block mb-1">Vertical</span>
            <div className="flex gap-1">
              {(['top', 'center', 'bottom'] as const).map((a) => (
                <button key={a}
                  onClick={() => setStyle((s) => ({ ...s, verticalAlign: a }))}
                  className={`flex-1 py-1 rounded text-xs capitalize transition-colors ${(style.verticalAlign ?? 'center') === a ? 'bg-brand-600 text-white' : 'bg-white/10 text-slate-400 hover:bg-white/20'}`}
                >{a}</button>
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

          {/* Background video URL */}
          <div className="space-y-2">
            <span className="text-slate-400 text-xs block">Background video (YouTube / Vimeo / URL)</span>
            <input
              type="text"
              value={bgVideoInput}
              onChange={(e) => setBgVideoInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setBgVideoUrl(bgVideoInput.trim()) }}
              placeholder="https://youtube.com/watch?v=..."
              className="w-full bg-white/10 border border-white/10 rounded-lg px-2 py-1.5 text-xs outline-none placeholder-slate-600"
            />
            <div className="flex gap-1">
              <button
                onClick={() => setBgVideoUrl(bgVideoInput.trim())}
                className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-slate-300 transition-colors"
              >
                Apply
              </button>
              {bgVideoUrl && (
                <button
                  onClick={() => { setBgVideoUrl(''); setBgVideoInput('') }}
                  className="px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-900/60 text-xs text-red-300 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

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

          {/* Fullscreen */}
          <button
            onClick={handleFullscreen}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-sm transition-colors"
          >
            <Maximize2 size={14} />
            Fullscreen
          </button>
        </div>
      )}

      {/* Top-right controls — settings + editor (master only) */}
      <div className="absolute top-4 right-4 flex gap-2 z-40">
        {isMaster && !showEditor && (
          <button
            onClick={() => setShowEditor(true)}
            className="p-2 text-white/20 hover:text-white/60 transition-colors"
            title="Open script editor"
          >
            <Edit3 size={14} />
          </button>
        )}
        {!showSettings && (
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-white/20 hover:text-white/60 transition-colors"
          >
            <Settings size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
