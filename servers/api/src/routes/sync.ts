import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import type { MediaPayload, SubtitleLine } from '@elegant-tide/core-types'

const LineUpsertSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  type: z.enum(['subtitle', 'comment', 'media']),
  order: z.number(),
  translations: z.record(z.string()),
  comment: z.string().optional(),
  media: z.record(z.unknown()).optional(),
  timecode: z.object({ startMs: z.number(), endMs: z.number() }).optional(),
  updatedAt: z.number(),
  updatedBy: z.string(),
  version: z.number(),
  deletedAt: z.number().optional(),
})

const PushBody = z.object({
  lines: z.array(LineUpsertSchema),
})

export async function syncRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  // Health check — client calls this periodically to refresh lastServerSuccessAt
  app.get('/sync/ping', auth, async () => ({ ok: true, ts: Date.now() }))

  // Pull: return all lines updated since `since` for accessible projects
  app.get('/sync/pull', auth, async (req) => {
    const { since = '0', projectId } = req.query as { since?: string; projectId?: string }

    const userProjects = await prisma.project.findMany({
      where: {
        OR: [
          { ownerId: req.userId },
          { collaborators: { some: { userId: req.userId } } },
        ],
        ...(projectId && { id: projectId }),
        deletedAt: null,
      },
      select: { id: true },
    })

    const projectIds = userProjects.map((p: { id: string }) => p.id)
    const sinceDate = new Date(parseInt(since, 10))

    const lines = await prisma.line.findMany({
      where: {
        projectId: { in: projectIds },
        updatedAt: { gt: sinceDate },
      },
      orderBy: { updatedAt: 'asc' },
      take: 500,
    })

    return {
      lines: lines.map(dbLineToDto),
      serverTime: Date.now(),
    }
  })

  // Push: upsert a batch of lines from the client outbox
  app.post('/sync/push', auth, async (req, reply) => {
    const { lines } = PushBody.parse(req.body)

    // Verify user has access to all project IDs in the batch
    const projectIds = [...new Set(lines.map((l) => l.projectId))]
    const accessible = await prisma.project.findMany({
      where: {
        id: { in: projectIds },
        OR: [
          { ownerId: req.userId },
          { collaborators: { some: { userId: req.userId, role: { in: ['author', 'translator'] } } } },
        ],
      },
      select: { id: true },
    })
    const accessibleIds = new Set(accessible.map((p: { id: string }) => p.id))
    const blocked = lines.filter((l) => !accessibleIds.has(l.projectId))
    if (blocked.length > 0) return reply.code(403).send({ error: 'Access denied for some projects' })

    const results: { id: string; version: number; conflict: boolean }[] = []

    for (const incoming of lines) {
      const existing = await prisma.line.findUnique({ where: { id: incoming.id } })

      if (!existing) {
        const createData = {
          id: incoming.id,
          projectId: incoming.projectId,
          type: incoming.type,
          order: incoming.order,
          translations: incoming.translations,
          ...(incoming.comment && { comment: incoming.comment }),
          ...(incoming.media && { media: incoming.media }),
          ...(incoming.timecode && { timecode: incoming.timecode }),
          updatedBy: incoming.updatedBy,
          version: 1,
          ...(incoming.deletedAt && { deletedAt: new Date(incoming.deletedAt) }),
        }
        const created = await prisma.line.create({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: createData as any,
        })
        results.push({ id: created.id, version: created.version, conflict: false })
      } else {
        // LWW: last-write-wins by updatedAt
        const existingUpdatedAt = existing.updatedAt.getTime()
        if (incoming.updatedAt <= existingUpdatedAt) {
          results.push({ id: existing.id, version: existing.version, conflict: true })
          continue
        }

        // Prisma's strict Json input types make this awkward to express — cast
        // the data shape since we already validate it with Zod above.
        const updateData = {
          type: incoming.type,
          order: incoming.order,
          translations: incoming.translations,
          comment: incoming.comment ?? null,
          media: incoming.media ?? null,
          timecode: incoming.timecode ?? null,
          updatedBy: incoming.updatedBy,
          version: { increment: 1 },
          ...(incoming.deletedAt && { deletedAt: new Date(incoming.deletedAt) }),
        }
        const updated = await prisma.line.update({
          where: { id: incoming.id },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: updateData as any,
        })
        results.push({ id: updated.id, version: updated.version, conflict: false })
      }
    }

    return { results }
  })
}

type DbLine = Awaited<ReturnType<typeof prisma.line.findMany>>[number]

function dbLineToDto(row: DbLine): SubtitleLine {
  const dto: SubtitleLine = {
    id: row.id,
    projectId: row.projectId,
    type: row.type as SubtitleLine['type'],
    order: row.order,
    translations: row.translations as SubtitleLine['translations'],
    updatedAt: row.updatedAt.getTime(),
    updatedBy: row.updatedBy,
    version: row.version,
  }
  if (row.comment) dto.comment = row.comment
  if (row.media) dto.media = row.media as unknown as MediaPayload
  if (row.timecode) dto.timecode = row.timecode as unknown as { startMs: number; endMs: number }
  if (row.deletedAt) dto.deletedAt = row.deletedAt.getTime()
  return dto
}
