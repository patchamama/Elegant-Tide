import { useEffect, useRef, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { createBus } from '@elegant-tide/broadcast-protocol'
import type { SubtitleLine, LangCode, ProjectionStyle, MediaPayload } from '@elegant-tide/core-types'
import { DEFAULT_PROJECTION_STYLE } from '@elegant-tide/core-types'
import { linesRepo } from '@elegant-tide/db'
import ReactPlayer from 'react-player'
import { Settings, X } from 'lucide-react'

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
  const [language, setLanguage] = useState<LangCode>('en')
  const [style, setStyle] = useState<ProjectionStyle>(DEFAULT_PROJECTION_STYLE)
  const [showSettings, setShowSettings] = useState(false)
  const [showMedia, setShowMedia] = useState(true)
  const settingsHideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const myWindowId = useRef(`projector-${crypto.randomUUID().slice(0, 8)}`)

  useEffect(() => {
    const bus = createBus({ projectId, windowId: myWindowId.current, role: 'projector' })

    bus.send({ kind: 'hello', payload: { role: 'projector', windowId: myWindowId.current, userAgent: navigator.userAgent } })
    bus.send({ kind: 'state.request', payload: {} })

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
      unsubGoto(); unsubBlackout(); unsubSnapshot(); unsubConfig(); unsubLineUpdated()
      bus.close()
    }
  }, [projectId])

  // Auto-hide settings overlay after 3s of no interaction
  const revealSettings = () => {
    setShowSettings(true)
    if (settingsHideTimeout.current) clearTimeout(settingsHideTimeout.current)
    settingsHideTimeout.current = setTimeout(() => setShowSettings(false), 3000)
  }

  const text = (!blackout && currentLine?.type !== 'media') ? (currentLine?.translations[language] ?? '') : ''
  const media: MediaPayload | undefined = currentLine?.type === 'media' ? currentLine.media : undefined

  return (
    <div
      className="min-h-screen overflow-hidden relative select-none"
      style={{ background: '#000' }}
      onMouseMove={revealSettings}
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

      {/* Subtitle text — bottom strip */}
      {!blackout && text && (
        <div className="absolute bottom-12 inset-x-0 flex justify-center px-8">
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
              onChange={(e) => setLanguage(e.target.value as LangCode)}
              className="w-full bg-white/10 border border-white/10 rounded-lg px-2 py-1.5 text-sm outline-none"
            >
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
            <span className="text-slate-400 text-xs block mb-1">Alignment</span>
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
        </div>
      )}

      {/* Settings trigger — tiny icon top-left when overlay hidden */}
      {!showSettings && (
        <button
          onClick={revealSettings}
          className="absolute top-4 right-4 p-2 text-white/20 hover:text-white/60 transition-colors z-40"
        >
          <Settings size={14} />
        </button>
      )}
    </div>
  )
}
