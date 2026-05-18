import { db, linesRepo, projectsRepo } from '@elegant-tide/db'
import type { MutationOp, OutboxEntry, SubtitleLine, SubtitleProject } from '@elegant-tide/core-types'

function ulid(): string {
  // Simple ULID-like: timestamp + random — not spec-compliant but collision-resistant enough
  return Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 10).toUpperCase()
}

export async function enqueueLineUpsert(line: SubtitleLine): Promise<void> {
  const entry: OutboxEntry = {
    id: ulid(),
    op: { kind: 'line.upsert', line },
    enqueuedAt: Date.now(),
    attempts: 0,
  }
  await db.outbox.put(entry)
}

export async function enqueueLineDelete(lineId: string, projectId: string): Promise<void> {
  const entry: OutboxEntry = {
    id: ulid(),
    op: { kind: 'line.delete', lineId, projectId, deletedAt: Date.now() },
    enqueuedAt: Date.now(),
    attempts: 0,
  }
  await db.outbox.put(entry)
}

export async function enqueueProjectUpsert(project: SubtitleProject): Promise<void> {
  const entry: OutboxEntry = {
    id: ulid(),
    op: { kind: 'project.upsert', project },
    enqueuedAt: Date.now(),
    attempts: 0,
  }
  await db.outbox.put(entry)
}

export async function enqueueProjectDelete(projectId: string): Promise<void> {
  const entry: OutboxEntry = {
    id: ulid(),
    op: { kind: 'project.delete', projectId, deletedAt: Date.now() },
    enqueuedAt: Date.now(),
    attempts: 0,
  }
  await db.outbox.put(entry)
}

export async function pendingCount(): Promise<number> {
  return db.outbox.count()
}

export { linesRepo, projectsRepo }
export type { OutboxEntry, MutationOp }
