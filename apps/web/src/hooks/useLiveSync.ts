/**
 * useLiveSync — real-time projection position sync across devices.
 *
 * Strategy:
 *   1. If backendUrl is configured: connect via SSE to /sync/live/:projectId.
 *      On SSE error/close, fall back to polling /sync/current-cue/:projectId every 3s.
 *   2. Always also bridge via BroadcastChannel for same-device multi-tab.
 *
 * Master role: when isMaster=true and lineId changes, POST /sync/cue to the server
 * AND publish on BroadcastChannel. Other roles only listen.
 */

import { useEffect, useRef, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@elegant-tide/db'
import { useProjectionStore } from '@/stores/useProjectionStore'

interface CuePayload {
  kind: 'cue.goto' | 'cue.ping'
  lineId: string | null
  sentAt: number
  fromRole: string
}

const BC_CHANNEL = 'elegant-tide:projection'

export function useLiveSync(projectId: string, isMaster: boolean) {
  const goTo = useProjectionStore((s) => s.goTo)
  const currentLineId = useProjectionStore((s) => s.currentLineId)
  const config = useLiveQuery(() => db.appConfig.get(1), [])
  const backendUrl = config?.backendUrl

  const sseRef = useRef<EventSource | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bcRef = useRef<BroadcastChannel | null>(null)
  const lastSeenRef = useRef<number>(0)

  const applyPayload = useCallback((payload: CuePayload) => {
    if (isMaster) return // master drives, never receives
    if (payload.sentAt <= lastSeenRef.current) return // dedup
    lastSeenRef.current = payload.sentAt
    if (payload.lineId !== null) {
      goTo(payload.lineId)
    }
  }, [isMaster, goTo])

  // ── BroadcastChannel (always active — same device) ────────────────────────
  useEffect(() => {
    const bc = new BroadcastChannel(BC_CHANNEL)
    bcRef.current = bc
    bc.onmessage = (e: MessageEvent<CuePayload>) => applyPayload(e.data)
    return () => {
      bc.close()
      bcRef.current = null
    }
  }, [applyPayload])

  // ── SSE + polling (when backend configured) ───────────────────────────────
  useEffect(() => {
    if (!backendUrl || !projectId) return

    const base = backendUrl.replace(/\/$/, '')
    let usePoll = false

    function startPoll() {
      if (pollRef.current) return
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${base}/sync/current-cue/${projectId}`, { credentials: 'include' })
          if (!res.ok) return
          const { cue } = await res.json() as { cue: CuePayload | null }
          if (cue) applyPayload(cue)
        } catch { /* network error — silent */ }
      }, 3_000)
    }

    function stopPoll() {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }

    function connectSSE() {
      if (sseRef.current) sseRef.current.close()

      // EventSource can't set Authorization header — use ?token= query param.
      // The cookie is sent automatically via credentials on same-origin, but for
      // cross-origin SSE we pass the JWT as a query param. We read it from the
      // cookie header (it's httpOnly, so only same-origin). For cross-origin we
      // fall back to polling instead of leaking the token in the URL.
      const sseUrl = `${base}/sync/live/${projectId}`
      const es = new EventSource(sseUrl, { withCredentials: true })
      sseRef.current = es

      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data) as CuePayload
          applyPayload(payload)
        } catch { /* malformed — ignore */ }
      }

      es.onerror = () => {
        es.close()
        sseRef.current = null
        if (!usePoll) {
          usePoll = true
          startPoll()
        }
      }
    }

    connectSSE()

    return () => {
      sseRef.current?.close()
      sseRef.current = null
      stopPoll()
    }
  }, [backendUrl, projectId, applyPayload])

  // ── Master: broadcast on lineId change ───────────────────────────────────
  useEffect(() => {
    if (!isMaster || !currentLineId) return

    const payload: CuePayload = {
      kind: 'cue.goto',
      lineId: currentLineId,
      sentAt: Date.now(),
      fromRole: 'master',
    }

    // BroadcastChannel — same device
    bcRef.current?.postMessage(payload)

    // Backend SSE fan-out — other devices
    if (!backendUrl) return
    const base = backendUrl.replace(/\/$/, '')
    fetch(`${base}/sync/cue`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, lineId: currentLineId, fromRole: 'master' }),
    }).catch(() => { /* fire and forget */ })
  }, [currentLineId, isMaster, backendUrl, projectId])
}
