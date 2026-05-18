import { describe, it, expect } from 'vitest'
import { db, conflictsRepo, linesRepo } from '@elegant-tide/db'
import type { SubtitleLine } from '@elegant-tide/core-types'
import { resolveKeepLocal, resolveKeepRemote } from './conflicts.ts'

function makeLine(overrides: Partial<SubtitleLine> = {}): SubtitleLine {
  return {
    id: 'line-1',
    projectId: 'proj-1',
    type: 'subtitle',
    order: 1024,
    translations: { en: 'local text' },
    updatedAt: 1_000,
    updatedBy: 'local',
    version: -1,
    ...overrides,
  }
}

describe('resolveKeepLocal', () => {
  it('does nothing when the conflict id is unknown', async () => {
    await resolveKeepLocal('does-not-exist')
    expect(await db.outbox.count()).toBe(0)
    expect(await db.conflicts.count()).toBe(0)
  })

  it('bumps updatedAt past the remote and re-enqueues the local line', async () => {
    const local = makeLine({ updatedAt: 1_000 })
    const remote = makeLine({ updatedAt: 5_000, translations: { en: 'server text' } })

    await linesRepo.upsert(local)
    await conflictsRepo.record(local)
    await conflictsRepo.setRemote(local.id, remote)

    await resolveKeepLocal(local.id)

    const stored = await linesRepo.get(local.id)
    expect(stored?.updatedAt).toBeGreaterThan(remote.updatedAt)
    expect(stored?.translations['en']).toBe('local text')

    const outbox = await db.outbox.toArray()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]?.op.kind).toBe('line.upsert')
  })

  it('clears the conflict record once resolved', async () => {
    const local = makeLine()
    await linesRepo.upsert(local)
    await conflictsRepo.record(local)

    await resolveKeepLocal(local.id)

    expect(await conflictsRepo.get(local.id)).toBeUndefined()
  })

  it('handles a conflict with no remote yet known (uses Date.now() as baseline)', async () => {
    const local = makeLine({ updatedAt: 1_000 })
    await linesRepo.upsert(local)
    await conflictsRepo.record(local)
    // remoteLine remains null

    const before = Date.now()
    await resolveKeepLocal(local.id)
    const stored = await linesRepo.get(local.id)
    expect(stored?.updatedAt).toBeGreaterThanOrEqual(before)
  })
})

describe('resolveKeepRemote', () => {
  it('returns false when the conflict is unknown', async () => {
    const applied = await resolveKeepRemote('missing')
    expect(applied).toBe(false)
  })

  it('returns false when the remote version has not been pulled yet', async () => {
    const local = makeLine()
    await linesRepo.upsert(local)
    await conflictsRepo.record(local) // remoteLine = null

    const applied = await resolveKeepRemote(local.id)
    expect(applied).toBe(false)
    // The conflict must remain so the user can retry after the next pull
    expect(await conflictsRepo.get(local.id)).toBeDefined()
  })

  it('replaces local with remote and clears the conflict when remote is known', async () => {
    const local = makeLine({ updatedAt: 1_000, translations: { en: 'local' } })
    const remote = makeLine({ updatedAt: 5_000, translations: { en: 'server' } })

    await linesRepo.upsert(local)
    await conflictsRepo.record(local)
    await conflictsRepo.setRemote(local.id, remote)

    const applied = await resolveKeepRemote(local.id)
    expect(applied).toBe(true)

    const stored = await linesRepo.get(local.id)
    expect(stored?.translations['en']).toBe('server')
    expect(stored?.updatedAt).toBe(5_000)

    expect(await conflictsRepo.get(local.id)).toBeUndefined()
  })
})

describe('conflictsRepo basics', () => {
  it('record() preserves detectedAt across updates to the same line', async () => {
    const v1 = makeLine({ updatedAt: 1_000 })
    const v2 = makeLine({ updatedAt: 2_000, translations: { en: 'updated' } })

    await conflictsRepo.record(v1)
    const firstDetectedAt = (await conflictsRepo.get(v1.id))?.detectedAt
    await new Promise((r) => setTimeout(r, 5))
    await conflictsRepo.record(v2)
    const second = await conflictsRepo.get(v1.id)
    expect(second?.detectedAt).toBe(firstDetectedAt)
    expect(second?.localLine.translations['en']).toBe('updated')
  })

  it('clearAll(projectId) only removes conflicts for that project', async () => {
    await conflictsRepo.record(makeLine({ id: 'a', projectId: 'p1' }))
    await conflictsRepo.record(makeLine({ id: 'b', projectId: 'p2' }))
    await conflictsRepo.clearAll('p1')

    expect(await conflictsRepo.list()).toHaveLength(1)
    expect((await conflictsRepo.list())[0]?.id).toBe('b')
  })

  it('count(projectId) returns the number of conflicts for that project', async () => {
    await conflictsRepo.record(makeLine({ id: 'a', projectId: 'p1' }))
    await conflictsRepo.record(makeLine({ id: 'b', projectId: 'p1' }))
    await conflictsRepo.record(makeLine({ id: 'c', projectId: 'p2' }))
    expect(await conflictsRepo.count('p1')).toBe(2)
    expect(await conflictsRepo.count('p2')).toBe(1)
    expect(await conflictsRepo.count()).toBe(3)
  })
})
