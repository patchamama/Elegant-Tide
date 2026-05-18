import Dexie, { type EntityTable } from 'dexie'
import type {
  AppConfig,
  ConnectivityRecord,
  OutboxEntry,
  SubtitleLine,
  SubtitleProject,
} from '@elegant-tide/core-types'

export class ElegantTideDB extends Dexie {
  projects!: EntityTable<SubtitleProject, 'id'>
  lines!: EntityTable<SubtitleLine, 'id'>
  outbox!: EntityTable<OutboxEntry, 'id'>
  connectivity!: EntityTable<ConnectivityRecord, 'id'>
  appConfig!: EntityTable<AppConfig, 'id'>

  constructor() {
    super('elegant-tide')

    this.version(1).stores({
      // Primary key + indexed fields
      projects: 'id, updatedAt, deletedAt, ownerId',
      lines: 'id, projectId, order, updatedAt, deletedAt, [projectId+order]',
      outbox: 'id, enqueuedAt',
      connectivity: 'id',
      appConfig: 'id',
    })
  }
}

// Singleton instance — import this everywhere
export const db = new ElegantTideDB()
