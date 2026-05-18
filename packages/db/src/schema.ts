import Dexie, { type EntityTable } from 'dexie'
import type {
  AppConfig,
  ConnectivityRecord,
  OutboxEntry,
  SubtitleLine,
  SubtitleProject,
  SyncConflict,
} from '@elegant-tide/core-types'

export class ElegantTideDB extends Dexie {
  projects!: EntityTable<SubtitleProject, 'id'>
  lines!: EntityTable<SubtitleLine, 'id'>
  outbox!: EntityTable<OutboxEntry, 'id'>
  connectivity!: EntityTable<ConnectivityRecord, 'id'>
  appConfig!: EntityTable<AppConfig, 'id'>
  conflicts!: EntityTable<SyncConflict, 'id'>

  constructor() {
    super('elegant-tide')

    this.version(1).stores({
      projects: 'id, updatedAt, deletedAt, ownerId',
      lines: 'id, projectId, order, updatedAt, deletedAt, [projectId+order]',
      outbox: 'id, enqueuedAt',
      connectivity: 'id',
      appConfig: 'id',
    })

    this.version(2).stores({
      projects: 'id, updatedAt, deletedAt, ownerId',
      lines: 'id, projectId, order, updatedAt, deletedAt, [projectId+order]',
      outbox: 'id, enqueuedAt',
      connectivity: 'id',
      appConfig: 'id',
      conflicts: 'id, projectId, detectedAt',
    })
  }
}

// Singleton instance — import this everywhere
export const db = new ElegantTideDB()
