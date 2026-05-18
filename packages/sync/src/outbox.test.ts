import { describe, it, expect } from 'vitest'
import { db } from '@elegant-tide/db'
import type { SubtitleLine, SubtitleProject } from '@elegant-tide/core-types'
import {
  enqueueLineUpsert,
  enqueueLineDelete,
  enqueueProjectUpsert,
  enqueueProjectDelete,
  pendingCount,
} from './outbox.ts'

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

function makeProject(overrides: Partial<SubtitleProject> = {}): SubtitleProject {
  return {
    id: 'proj-1',
    name: 'Test',
    languages: ['en'],
    primaryLanguage: 'en',
    defaultStyle: {
      fontFamily: 'Inter',
      fontSizePx: 48,
      fontWeight: 600,
      textColor: '#fff',
      backgroundColor: 'rgba(0,0,0,0.7)',
      textShadow: '',
      paddingPx: 16,
      textAlign: 'center',
      lineHeight: 1.4,
    },
    projectorWindows: [],
    collaborators: [],
    createdAt: 0,
    updatedAt: 0,
    version: -1,
    ...overrides,
  }
}

describe('outbox enqueue helpers', () => {
  it('enqueueLineUpsert writes a line.upsert entry', async () => {
    const line = makeLine()
    await enqueueLineUpsert(line)
    const entries = await db.outbox.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.op).toMatchObject({ kind: 'line.upsert', line })
    expect(entries[0]?.attempts).toBe(0)
  })

  it('enqueueLineDelete writes a line.delete entry with tombstone timestamp', async () => {
    await enqueueLineDelete('line-1', 'proj-1')
    const [entry] = await db.outbox.toArray()
    expect(entry?.op.kind).toBe('line.delete')
    if (entry?.op.kind === 'line.delete') {
      expect(entry.op.lineId).toBe('line-1')
      expect(entry.op.projectId).toBe('proj-1')
      expect(entry.op.deletedAt).toBeGreaterThan(0)
    }
  })

  it('enqueueProjectUpsert writes a project.upsert entry', async () => {
    const project = makeProject()
    await enqueueProjectUpsert(project)
    const [entry] = await db.outbox.toArray()
    expect(entry?.op).toMatchObject({ kind: 'project.upsert', project })
  })

  it('enqueueProjectDelete writes a project.delete entry', async () => {
    await enqueueProjectDelete('proj-1')
    const [entry] = await db.outbox.toArray()
    expect(entry?.op.kind).toBe('project.delete')
    if (entry?.op.kind === 'project.delete') {
      expect(entry.op.projectId).toBe('proj-1')
    }
  })

  it('generates unique ULID-like IDs for each entry', async () => {
    await enqueueLineUpsert(makeLine({ id: 'a' }))
    await enqueueLineUpsert(makeLine({ id: 'b' }))
    await enqueueLineUpsert(makeLine({ id: 'c' }))
    const entries = await db.outbox.toArray()
    const ids = new Set(entries.map((e) => e.id))
    expect(ids.size).toBe(3)
  })

  it('pendingCount reflects the outbox table size', async () => {
    expect(await pendingCount()).toBe(0)
    await enqueueLineUpsert(makeLine({ id: '1' }))
    await enqueueLineUpsert(makeLine({ id: '2' }))
    expect(await pendingCount()).toBe(2)
  })

  it('stores enqueuedAt close to Date.now()', async () => {
    const before = Date.now()
    await enqueueLineUpsert(makeLine())
    const after = Date.now()
    const [entry] = await db.outbox.toArray()
    expect(entry?.enqueuedAt).toBeGreaterThanOrEqual(before)
    expect(entry?.enqueuedAt).toBeLessThanOrEqual(after)
  })
})
