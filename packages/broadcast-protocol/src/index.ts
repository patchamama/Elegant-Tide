import type { BroadcastEnvelope, ProjectorWindowConfig, SubtitleLine, SubtitleProject } from '@elegant-tide/core-types'

// ─── Message payloads ─────────────────────────────────────────────────────────

export type BroadcastMessage =
  // Lifecycle
  | { kind: 'hello'; payload: { role: 'control' | 'projector'; windowId: string; userAgent: string } }
  | { kind: 'welcome'; payload: { controlWindowId: string; currentLineId: string | null; blackout: boolean; freeze: boolean } }
  | { kind: 'goodbye'; payload: { windowId: string } }
  | { kind: 'heartbeat'; payload: { windowId: string } }

  // Operator cues
  | { kind: 'cue.goto'; payload: { lineId: string } }
  | { kind: 'cue.next'; payload: Record<string, never> }
  | { kind: 'cue.prev'; payload: Record<string, never> }
  | { kind: 'cue.blackout'; payload: { on: boolean } }
  | { kind: 'cue.freeze'; payload: { on: boolean } }

  // Projector config (control → specific projector via `to`)
  | { kind: 'projector.config'; payload: { config: ProjectorWindowConfig } }
  | { kind: 'projector.close'; payload: { windowId: string } }

  // Media control
  | { kind: 'media.play'; payload: { lineId: string } }
  | { kind: 'media.pause'; payload: { lineId: string } }
  | { kind: 'media.seek'; payload: { lineId: string; seconds: number } }

  // Live data updates (editor saved while show is running)
  | { kind: 'line.updated'; payload: { line: SubtitleLine } }
  | { kind: 'line.deleted'; payload: { lineId: string } }
  | { kind: 'project.updated'; payload: { project: SubtitleProject } }

  // State sync
  | { kind: 'state.request'; payload: Record<string, never> }
  | { kind: 'state.snapshot'; payload: { currentLineId: string | null; blackout: boolean; freeze: boolean } }

  // Acks
  | { kind: 'ack'; payload: { ofId: string } }
  | { kind: 'nack'; payload: { ofId: string; reason: string } }

export type TypedEnvelope = BroadcastEnvelope<BroadcastMessage>

// ─── Channel name helper ──────────────────────────────────────────────────────

export function channelName(projectId: string): string {
  return `elegant-tide:session:${projectId}`
}

// ─── Bus factory ─────────────────────────────────────────────────────────────

export interface BusOptions {
  projectId: string
  windowId: string
  role: 'control' | 'projector'
  onMessage?: (env: TypedEnvelope) => void
}

export interface Bus {
  send(msg: BroadcastMessage, to?: string): void
  on<K extends BroadcastMessage['kind']>(
    kind: K,
    handler: (env: BroadcastEnvelope<Extract<BroadcastMessage, { kind: K }>>) => void,
  ): () => void
  close(): void
}

let _ulid: () => string

function getUlid(): string {
  // lazy tiny ULID — crypto.randomUUID is available in all modern browsers
  return crypto.randomUUID().replace(/-/g, '').toUpperCase().slice(0, 26)
}

export function createBus(opts: BusOptions): Bus {
  const channel = new BroadcastChannel(channelName(opts.projectId))
  const seen = new Set<string>()
  const handlers = new Map<string, Set<(env: TypedEnvelope) => void>>()
  const DEDUP_TTL = 5_000

  channel.addEventListener('message', (ev: MessageEvent<TypedEnvelope>) => {
    const env = ev.data
    if (!env || env.v !== 1) return
    if (seen.has(env.id)) return
    seen.add(env.id)
    setTimeout(() => seen.delete(env.id), DEDUP_TTL)
    if (env.to && env.to.windowId !== opts.windowId) return
    const set = handlers.get(env.msg.kind)
    if (set) set.forEach((h) => h(env))
  })

  const send: Bus['send'] = (msg, to) => {
    const env: TypedEnvelope = {
      v: 1,
      id: getUlid(),
      ts: Date.now(),
      from: { role: opts.role, windowId: opts.windowId },
      ...(to ? { to: { windowId: to } } : {}),
      msg,
    }
    channel.postMessage(env)
  }

  const on: Bus['on'] = (kind, handler) => {
    if (!handlers.has(kind)) handlers.set(kind, new Set())
    const set = handlers.get(kind)!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set.add(handler as any)
    return () => set.delete(handler as any)
  }

  const close: Bus['close'] = () => {
    channel.close()
    handlers.clear()
  }

  return { send, on, close }
}
