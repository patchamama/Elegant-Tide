import { db } from '../schema.ts'
import type { SubtitleLine, SyncConflict } from '@elegant-tide/core-types'

export const conflictsRepo = {
  list(projectId?: string): Promise<SyncConflict[]> {
    if (projectId) {
      return db.conflicts.where('projectId').equals(projectId).sortBy('detectedAt')
    }
    return db.conflicts.orderBy('detectedAt').toArray()
  },

  get(id: string): Promise<SyncConflict | undefined> {
    return db.conflicts.get(id)
  },

  async record(localLine: SubtitleLine): Promise<void> {
    const existing = await db.conflicts.get(localLine.id)
    const conflict: SyncConflict = {
      id: localLine.id,
      projectId: localLine.projectId,
      localLine,
      remoteLine: existing?.remoteLine ?? null,
      detectedAt: existing?.detectedAt ?? Date.now(),
    }
    await db.conflicts.put(conflict)
  },

  async setRemote(id: string, remoteLine: SubtitleLine): Promise<void> {
    const existing = await db.conflicts.get(id)
    if (!existing) return
    await db.conflicts.put({ ...existing, remoteLine })
  },

  async clear(id: string): Promise<void> {
    await db.conflicts.delete(id)
  },

  async clearAll(projectId?: string): Promise<void> {
    if (projectId) {
      await db.conflicts.where('projectId').equals(projectId).delete()
    } else {
      await db.conflicts.clear()
    }
  },

  count(projectId?: string): Promise<number> {
    if (projectId) return db.conflicts.where('projectId').equals(projectId).count()
    return db.conflicts.count()
  },
}
