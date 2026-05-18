import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db, linesRepo, conflictsRepo } from '@elegant-tide/db'
import type { SubtitleLine } from '@elegant-tide/core-types'
import { flushOutbox, pullUpdates, ping } from './engine.ts'
import { enqueueLineUpsert } from './outbox.ts'

const BACKEND = 'http://localhost:9999'

function makeLine(overrides: Partial<SubtitleLine> = {}): SubtitleLine {
  return {
    id: 'line-1',
    projectId: 'proj-1',
    type: 'subtitle',
    order: 1024,
    translations: { en: 'Hello' },
    updatedAt: 1_000,
    updatedBy: 'local',
    version: -1,
    ...overrides,
  }
}

function mockFetch(impl: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    const path = new URL(url).pathname + new URL(url).search
    return Promise.resolve(impl(path, init))
  }))
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('ping', () => {
  it('updates connectivity record when server responds ok', async () => {
    mockFetch(() => jsonResponse({ ok: true, ts: Date.now() }))
    const before = Date.now()
    const ok = await ping(BACKEND)
    expect(ok).toBe(true)

    const record = await db.connectivity.get(1)
    expect(record?.backendConfigured).toBe(true)
    expect(record?.lastServerSuccessAt).toBeGreaterThanOrEqual(before)
  })

  it('returns false on network failure and leaves connectivity untouched', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))))
    const ok = await ping(BACKEND)
    expect(ok).toBe(false)
    expect(await db.connectivity.get(1)).toBeUndefined()
  })

  it('returns false on non-2xx responses', async () => {
    mockFetch(() => new Response('boom', { status: 500 }))
    const ok = await ping(BACKEND)
    expect(ok).toBe(false)
  })
})

describe('flushOutbox', () => {
  it('does nothing when the outbox is empty', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await flushOutbox({ backendUrl: BACKEND })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('pushes pending line upserts, applies returned versions, and clears the outbox', async () => {
    const line = makeLine()
    await linesRepo.upsert(line)
    await enqueueLineUpsert(line)

    mockFetch((path) => {
      expect(path).toBe('/sync/push')
      return jsonResponse({
        results: [{ id: line.id, version: 42, conflict: false }],
      })
    })

    await flushOutbox({ backendUrl: BACKEND })

    expect(await db.outbox.count()).toBe(0)
    const stored = await linesRepo.get(line.id)
    expect(stored?.version).toBe(42)
  })

  it('records a conflict (and keeps version unchanged) when server reports one', async () => {
    const line = makeLine({ version: -1 })
    await linesRepo.upsert(line)
    await enqueueLineUpsert(line)

    mockFetch(() =>
      jsonResponse({
        results: [{ id: line.id, version: 7, conflict: true }],
      }),
    )

    await flushOutbox({ backendUrl: BACKEND })

    const conflict = await conflictsRepo.get(line.id)
    expect(conflict).toBeDefined()
    expect(conflict?.localLine.id).toBe(line.id)
    expect(conflict?.remoteLine).toBeNull()

    const stored = await linesRepo.get(line.id)
    expect(stored?.version).toBe(-1)
    // Outbox is still cleared since the server consumed the message
    expect(await db.outbox.count()).toBe(0)
  })

  it('clears a stale conflict when the next push succeeds', async () => {
    const line = makeLine()
    await linesRepo.upsert(line)
    await conflictsRepo.record(line)

    await enqueueLineUpsert(line)
    mockFetch(() =>
      jsonResponse({ results: [{ id: line.id, version: 3, conflict: false }] }),
    )

    await flushOutbox({ backendUrl: BACKEND })
    expect(await conflictsRepo.get(line.id)).toBeUndefined()
  })

  it('increments attempts on 5xx and keeps entries for retry', async () => {
    const line = makeLine()
    await linesRepo.upsert(line)
    await enqueueLineUpsert(line)

    mockFetch(() => new Response('server error', { status: 500 }))

    await flushOutbox({ backendUrl: BACKEND })
    const [entry] = await db.outbox.toArray()
    expect(entry?.attempts).toBe(1)
    expect(entry?.lastError).toContain('500')
  })

  it('exits silently on 401 — does not delete the outbox', async () => {
    const line = makeLine()
    await linesRepo.upsert(line)
    await enqueueLineUpsert(line)

    mockFetch(() => new Response('unauthorized', { status: 401 }))

    await flushOutbox({ backendUrl: BACKEND })
    expect(await db.outbox.count()).toBe(1)
  })
})

describe('pullUpdates', () => {
  it('applies remote lines newer than local (LWW)', async () => {
    await linesRepo.upsert(makeLine({ id: 'line-1', updatedAt: 1_000 }))

    const remote = makeLine({
      id: 'line-1',
      updatedAt: 5_000,
      translations: { en: 'fresh from server' },
    })
    mockFetch(() => jsonResponse({ lines: [remote], serverTime: Date.now() }))

    await pullUpdates({ backendUrl: BACKEND, projectId: 'proj-1' })

    const stored = await linesRepo.get('line-1')
    expect(stored?.translations['en']).toBe('fresh from server')
  })

  it('does NOT overwrite a line that has a pending conflict — only updates conflict.remoteLine', async () => {
    const local = makeLine({ id: 'line-1', updatedAt: 1_000, translations: { en: 'local' } })
    await linesRepo.upsert(local)
    await conflictsRepo.record(local)

    const remote = makeLine({
      id: 'line-1',
      updatedAt: 9_000,
      translations: { en: 'server' },
    })
    mockFetch(() => jsonResponse({ lines: [remote], serverTime: Date.now() }))

    await pullUpdates({ backendUrl: BACKEND, projectId: 'proj-1' })

    const stored = await linesRepo.get('line-1')
    expect(stored?.translations['en']).toBe('local')

    const conflict = await conflictsRepo.get('line-1')
    expect(conflict?.remoteLine?.translations['en']).toBe('server')
  })

  it('inserts new remote lines that do not exist locally', async () => {
    const remote = makeLine({ id: 'line-new', updatedAt: 7_000 })
    mockFetch(() => jsonResponse({ lines: [remote], serverTime: Date.now() }))

    await pullUpdates({ backendUrl: BACKEND, projectId: 'proj-1' })
    expect(await linesRepo.get('line-new')).toBeDefined()
  })

  it('uses max(local updatedAt) as the since cursor', async () => {
    await linesRepo.upsert(makeLine({ id: 'a', updatedAt: 100 }))
    await linesRepo.upsert(makeLine({ id: 'b', updatedAt: 500 }))

    const fetchSpy = vi.fn((_url: string) =>
      Promise.resolve(jsonResponse({ lines: [], serverTime: Date.now() })),
    )
    vi.stubGlobal('fetch', fetchSpy)

    await pullUpdates({ backendUrl: BACKEND, projectId: 'proj-1' })
    const firstCall = fetchSpy.mock.calls[0]
    expect(firstCall).toBeDefined()
    const url = String(firstCall?.[0] ?? '')
    expect(url).toContain('since=500')
  })
})
