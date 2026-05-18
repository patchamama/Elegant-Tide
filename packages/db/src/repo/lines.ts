import Dexie from 'dexie'
import { db } from '../schema.ts'
import type { SubtitleLine } from '@elegant-tide/core-types'

export const linesRepo = {
  listByProject(projectId: string): Promise<SubtitleLine[]> {
    return db.lines
      .where('[projectId+order]')
      .between([projectId, Dexie.minKey], [projectId, Dexie.maxKey])
      .filter((l) => !l.deletedAt)
      .sortBy('order')
  },

  get(id: string): Promise<SubtitleLine | undefined> {
    return db.lines.get(id)
  },

  async upsert(line: SubtitleLine): Promise<void> {
    await db.lines.put(line)
  },

  async upsertMany(lines: SubtitleLine[]): Promise<void> {
    await db.lines.bulkPut(lines)
  },

  async softDelete(id: string): Promise<void> {
    await db.lines.update(id, { deletedAt: Date.now(), updatedAt: Date.now() })
  },

  // Returns the max `order` value for a project (for appending new lines)
  async maxOrder(projectId: string): Promise<number> {
    const lines = await db.lines
      .where('[projectId+order]')
      .between([projectId, Dexie.minKey], [projectId, Dexie.maxKey])
      .filter((l) => !l.deletedAt)
      .toArray()
    return lines.reduce((max, l) => Math.max(max, l.order), 0)
  },
}

