import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import type { MediaPayload, SubtitleLine } from '@elegant-tide/core-types'

// ── SSE fan-out registry ──────────────────────────────────────────────────────
// Maps projectId → set of active SSE reply objects.
// This is intentionally process-local (no Redis). If you scale to multiple
// instances, replace with a pub/sub broker.
const sseClients = new Map<string, Set<FastifyReply>>()

function addClient(projectId: string, reply: FastifyReply) {
  if (!sseClients.has(projectId)) sseClients.set(projectId, new Set())
  sseClients.get(projectId)!.add(reply)
}

function removeClient(projectId: string, reply: FastifyReply) {
  sseClients.get(projectId)?.delete(reply)
}

// Last known cue per project — serves polling fallback and late-joiners
const lastCue = new Map<string, CuePayload>()

export function broadcastCue(projectId: string, payload: CuePayload) {
  lastCue.set(projectId, payload)
  const clients = sseClients.get(projectId)
  if (!clients || clients.size === 0) return
  const data = `data: ${JSON.stringify(payload)}\n\n`
  for (const reply of clients) {
    try {
      reply.raw.write(data)
    } catch {
      // client disconnected mid-write; will be cleaned up on close event
    }
  }
}

export interface CuePayload {
  kind: 'cue.goto' | 'cue.ping'
  lineId: string | null
  sentAt: number
  fromRole: string
}

const LineUpsertSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  type: z.enum(['subtitle', 'comment', 'media', 'blackout']),
  order: z.number(),
  translations: z.record(z.string()),
  comment: z.string().optional(),
  media: z.record(z.unknown()).optional(),
  timecode: z.object({ startMs: z.number(), endMs: z.number() }).optional(),
  updatedAt: z.number(),
  updatedBy: z.string(),
  version: z.number(),
  deletedAt: z.number().optional(),
  skip: z.boolean().optional(),
  role: z.string().optional(),
  styleClasses: z.string().optional(),
  spectitularMeta: z.record(z.unknown()).optional(),
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
          ...(incoming.skip !== undefined && { skip: incoming.skip }),
          ...(incoming.role && { role: incoming.role }),
          ...(incoming.styleClasses && { styleClasses: incoming.styleClasses }),
          ...(incoming.spectitularMeta && { spectitularMeta: incoming.spectitularMeta }),
          updatedBy: incoming.updatedBy,
          updatedAt: new Date(incoming.updatedAt),
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
          skip: incoming.skip ?? false,
          role: incoming.role ?? null,
          styleClasses: incoming.styleClasses ?? null,
          spectitularMeta: incoming.spectitularMeta ?? null,
          updatedBy: incoming.updatedBy,
          updatedAt: new Date(incoming.updatedAt),
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

  // ── SSE live stream ───────────────────────────────────────────────────────
  // GET /sync/live/:projectId
  // Clients connect here and receive real-time cue.goto events as SSE.
  // Auth: Bearer token in Authorization header OR ?token= query param (for
  // EventSource which cannot set custom headers in the browser).
  app.get('/sync/live/:projectId', async (req, reply) => {
    // Auth: try cookie first (jwtVerify), then ?token= query param
    try {
      await req.jwtVerify()
      req.userId = (req.user as { sub: string }).sub
    } catch {
      const { token } = req.query as { token?: string }
      if (!token) return reply.code(401).send({ error: 'Unauthorized' })
      try {
        const decoded = app.jwt.verify<{ sub: string }>(token)
        req.userId = decoded.sub
      } catch {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
    }

    const { projectId } = req.params as { projectId: string }

    // Verify access
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
        OR: [
          { ownerId: req.userId },
          { collaborators: { some: { userId: req.userId } } },
        ],
      },
      select: { id: true },
    })
    if (!project) return reply.code(403).send({ error: 'Access denied' })

    // Set SSE headers and keep connection open
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    })
    reply.raw.write(': connected\n\n')

    addClient(projectId, reply)

    // Heartbeat every 25s to prevent proxy timeouts
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n')
      } catch {
        clearInterval(heartbeat)
      }
    }, 25_000)

    req.raw.on('close', () => {
      clearInterval(heartbeat)
      removeClient(projectId, reply)
    })

    // Never resolve — connection stays open
    await new Promise<void>(() => {})
  })

  // POST /sync/cue  { projectId, lineId, fromRole }
  // Master sends current projection position; server fans out to SSE clients.
  // Also persists the last cue so late-joining clients can GET it.
  const CueBody = z.object({
    projectId: z.string(),
    lineId: z.string().nullable(),
    fromRole: z.string().default('master'),
  })

  app.post('/sync/cue', auth, async (req, reply) => {
    const { projectId, lineId, fromRole } = CueBody.parse(req.body)

    // Verify write access
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
        OR: [
          { ownerId: req.userId },
          { collaborators: { some: { userId: req.userId, role: { in: ['author', 'translator'] } } } },
        ],
      },
      select: { id: true },
    })
    if (!project) return reply.code(403).send({ error: 'Access denied' })

    const payload: CuePayload = { kind: 'cue.goto', lineId, sentAt: Date.now(), fromRole }
    broadcastCue(projectId, payload)
    return { ok: true, payload }
  })

  // GET /sync/current-cue/:projectId — polling fallback
  app.get('/sync/current-cue/:projectId', auth, async (req) => {
    const { projectId } = req.params as { projectId: string }
    return { cue: lastCue.get(projectId) ?? null }
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
  if (row.skip) dto.skip = row.skip
  if (row.role) dto.role = row.role
  if (row.styleClasses) dto.styleClasses = row.styleClasses
  if (row.spectitularMeta) dto.spectitularMeta = row.spectitularMeta as Record<string, unknown>
  if (row.deletedAt) dto.deletedAt = row.deletedAt.getTime()
  return dto
}
