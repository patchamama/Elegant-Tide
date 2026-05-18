import { conflictsRepo, linesRepo } from '@elegant-tide/db'
import { enqueueLineUpsert } from './outbox.ts'

/**
 * Resolve a conflict by keeping the local version.
 * Bumps `updatedAt` past the remote so the next push wins.
 */
export async function resolveKeepLocal(conflictId: string): Promise<void> {
  const conflict = await conflictsRepo.get(conflictId)
  if (!conflict) return

  const remoteTs = conflict.remoteLine?.updatedAt ?? 0
  const forcedTs = Math.max(remoteTs, Date.now()) + 1
  const forced = { ...conflict.localLine, updatedAt: forcedTs }

  await linesRepo.upsert(forced)
  await enqueueLineUpsert(forced)
  await conflictsRepo.clear(conflictId)
}

/**
 * Resolve a conflict by accepting the remote version. Local edits are discarded.
 * If the remote is not yet known, we leave the conflict in place — the next pull
 * cycle will populate `remoteLine` and the user can retry.
 */
export async function resolveKeepRemote(conflictId: string): Promise<boolean> {
  const conflict = await conflictsRepo.get(conflictId)
  if (!conflict || !conflict.remoteLine) return false

  await linesRepo.upsert(conflict.remoteLine)
  await conflictsRepo.clear(conflictId)
  return true
}
