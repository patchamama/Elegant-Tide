import { db, linesRepo, conflictsRepo } from '@elegant-tide/db'
import type { SubtitleLine } from '@elegant-tide/core-types'

const BATCH_SIZE = 50
const FLUSH_INTERVAL_MS = 30_000
const PULL_INTERVAL_MS = 60_000
const PING_INTERVAL_MS = 5 * 60_000

type SyncConfig = {
  backendUrl: string
  projectId?: string
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

async function apiFetch(
  backendUrl: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${backendUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
}

// ─── Ping ──────────────────────────────────────────────────────────────────────

async function ping(backendUrl: string): Promise<boolean> {
  try {
    const res = await apiFetch(backendUrl, '/sync/ping')
    if (res.ok) {
      await db.connectivity.put({
        id: 1,
        lastServerSuccessAt: Date.now(),
        backendConfigured: true,
        graceWindowMs: 7 * 24 * 3600 * 1000,
      })
      return true
    }
  } catch {
    // Network error — offline
  }
  return false
}

// ─── Flush outbox (push) ───────────────────────────────────────────────────────

export async function flushOutbox(config: SyncConfig): Promise<void> {
  const entries = await db.outbox.orderBy('enqueuedAt').limit(BATCH_SIZE).toArray()
  if (entries.length === 0) return

  const lineUpserts = entries
    .filter((e) => e.op.kind === 'line.upsert')
    .map((e) => (e.op as Extract<typeof e.op, { kind: 'line.upsert' }>).line)

  if (lineUpserts.length > 0) {
    try {
      const res = await apiFetch(config.backendUrl, '/sync/push', {
        method: 'POST',
        body: JSON.stringify({ lines: lineUpserts }),
      })

      if (res.ok) {
        const { results } = await res.json() as { results: Array<{ id: string; version: number; conflict: boolean }> }

        // Update local version numbers for non-conflicting writes; record conflicts otherwise
        for (const r of results) {
          const local = await linesRepo.get(r.id)
          if (!local) continue
          if (r.conflict) {
            await conflictsRepo.record(local)
          } else {
            await linesRepo.upsert({ ...local, version: r.version })
            // If this line had a stale conflict record, clear it
            await conflictsRepo.clear(r.id)
          }
        }

        // Remove flushed entries from outbox
        const flushedIds = entries
          .filter((e) => e.op.kind === 'line.upsert')
          .map((e) => e.id)
        await db.outbox.bulkDelete(flushedIds)

        // Bump connectivity
        await db.connectivity.put({
          id: 1,
          lastServerSuccessAt: Date.now(),
          backendConfigured: true,
          graceWindowMs: 7 * 24 * 3600 * 1000,
        })
      } else if (res.status === 401) {
        // Not authenticated — stop trying
        return
      } else {
        // Server error — increment attempt counts
        for (const entry of entries) {
          await db.outbox.update(entry.id, {
            attempts: entry.attempts + 1,
            lastAttemptAt: Date.now(),
            lastError: `HTTP ${res.status}`,
          })
        }
      }
    } catch {
      // Network error — will retry on next flush
    }
  }
}

// ─── Pull ──────────────────────────────────────────────────────────────────────

export async function pullUpdates(config: SyncConfig): Promise<void> {
  // Find most recent local updatedAt to use as cursor
  const lines = await db.lines
    .where('[projectId+order]')
    .between(
      [config.projectId ?? '', -Infinity],
      [config.projectId ?? '￿', Infinity],
    )
    .toArray()

  const maxUpdatedAt = lines.reduce((max, l) => Math.max(max, l.updatedAt), 0)

  try {
    const params = new URLSearchParams({ since: String(maxUpdatedAt) })
    if (config.projectId) params.set('projectId', config.projectId)

    const res = await apiFetch(config.backendUrl, `/sync/pull?${params}`)
    if (!res.ok) return

    const { lines: remoteLines } = await res.json() as { lines: SubtitleLine[]; serverTime: number }

    for (const remote of remoteLines) {
      // If this line has a pending conflict, only update the conflict record —
      // do NOT overwrite local. User must resolve manually.
      const conflict = await conflictsRepo.get(remote.id)
      if (conflict) {
        await conflictsRepo.setRemote(remote.id, remote)
        continue
      }

      const local = await linesRepo.get(remote.id)
      // LWW: apply only if remote is newer
      if (!local || remote.updatedAt > local.updatedAt) {
        await linesRepo.upsert(remote)
      }
    }

    await db.connectivity.put({
      id: 1,
      lastServerSuccessAt: Date.now(),
      backendConfigured: true,
      graceWindowMs: 7 * 24 * 3600 * 1000,
    })
  } catch {
    // Network error — skip
  }
}

// ─── Background sync engine ────────────────────────────────────────────────────

type SyncWorker = { stop: () => void }

export function startSyncWorker(config: SyncConfig): SyncWorker {
  let stopped = false

  const loop = async (fn: () => Promise<void>, intervalMs: number) => {
    while (!stopped) {
      await fn()
      await new Promise<void>((r) => setTimeout(r, intervalMs))
    }
  }

  void loop(async () => { await ping(config.backendUrl) }, PING_INTERVAL_MS)
  void loop(() => flushOutbox(config), FLUSH_INTERVAL_MS)
  void loop(() => pullUpdates(config), PULL_INTERVAL_MS)

  return {
    stop() {
      stopped = true
    },
  }
}

export { ping }
