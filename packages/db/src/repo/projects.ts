import { db } from '../schema.ts'
import type { SubtitleProject } from '@elegant-tide/core-types'

export const projectsRepo = {
  list(): Promise<SubtitleProject[]> {
    return db.projects.filter((p) => !p.deletedAt).toArray().then((rows) =>
      rows.sort((a, b) => b.updatedAt - a.updatedAt),
    )
  },

  get(id: string): Promise<SubtitleProject | undefined> {
    return db.projects.get(id)
  },

  async upsert(project: SubtitleProject): Promise<void> {
    await db.projects.put(project)
  },

  async softDelete(id: string): Promise<void> {
    await db.projects.update(id, { deletedAt: Date.now(), updatedAt: Date.now() })
  },
}
