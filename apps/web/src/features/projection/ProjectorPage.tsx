import { useEffect, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { createBus } from '@elegant-tide/broadcast-protocol'
import type { SubtitleLine, LangCode, ProjectionStyle } from '@elegant-tide/core-types'
import { DEFAULT_PROJECTION_STYLE } from '@elegant-tide/core-types'
import { linesRepo } from '@elegant-tide/db'

export function ProjectorPage() {
  const { windowId } = useParams({ from: '/projector/$windowId' })
  const projectId = windowId // windowId is set to projectId when opened from control

  const [currentLine, setCurrentLine] = useState<SubtitleLine | null>(null)
  const [blackout, setBlackout] = useState(false)
  const [language, setLanguage] = useState<LangCode>('en')
  const [style, setStyle] = useState<ProjectionStyle>(DEFAULT_PROJECTION_STYLE)

  useEffect(() => {
    const myWindowId = 'projector-' + crypto.randomUUID().slice(0, 8)
    const bus = createBus({ projectId, windowId: myWindowId, role: 'projector' })

    // Announce ourselves
    bus.send({ kind: 'hello', payload: { role: 'projector', windowId: myWindowId, userAgent: navigator.userAgent } })

    // Ask for current state
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
    })

    const unsubLineUpdated = bus.on('line.updated', (env) => {
      const updated = env.msg.payload.line
      setCurrentLine((current) => (current?.id === updated.id ? updated : current))
    })

    return () => {
      unsubGoto()
      unsubBlackout()
      unsubSnapshot()
      unsubConfig()
      unsubLineUpdated()
      bus.close()
    }
  }, [projectId])

  const text = currentLine?.translations[language] ?? ''

  return (
    <div
      className="min-h-screen flex items-end justify-center pb-12"
      style={{ background: '#000' }}
    >
      {!blackout && text && (
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
          }}
        >
          {text}
        </div>
      )}
    </div>
  )
}
