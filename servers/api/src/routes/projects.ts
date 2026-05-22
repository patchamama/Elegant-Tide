import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import type { SubtitleProject } from '@elegant-tide/core-types'

const CreateProjectBody = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  languages: z.array(z.string()),
  primaryLanguage: z.string(),
  defaultStyle: z.record(z.unknown()),
  projectorWindows: z.array(z.record(z.unknown())),
  createdAt: z.number(),
  updatedAt: z.number(),
  version: z.number(),
})

const UpdateProjectBody = CreateProjectBody.partial().omit({ id: true })

export async function projectRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  app.get('/projects', auth, async (req) => {
    const rows = await prisma.project.findMany({
      where: { ownerId: req.userId, deletedAt: null },
      include: { collaborators: true },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map(dbToDto)
  })

  app.post('/projects', auth, async (req, reply) => {
    const body = CreateProjectBody.parse(req.body)
    const createData = {
      id: body.id,
      name: body.name,
      description: body.description,
      languages: JSON.stringify(body.languages),
      primaryLanguage: body.primaryLanguage,
      defaultStyle: body.defaultStyle,
      projectorWindows: body.projectorWindows,
      ownerId: req.userId,
    }
    const project = await prisma.project.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: createData as any,
      include: { collaborators: true },
    })
    return reply.code(201).send(dbToDto(project as ProjectWithCollabs))
  })

  app.get('/projects/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const project = await prisma.project.findUnique({ where: { id }, include: { collaborators: true } })
    if (!project || (project.ownerId !== req.userId && !project.collaborators.some((c: { userId: string }) => c.userId === req.userId))) {
      return reply.code(404).send({ error: 'Project not found' })
    }
    return dbToDto(project)
  })

  app.put('/projects/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = UpdateProjectBody.parse(req.body)
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project || project.ownerId !== req.userId) return reply.code(403).send({ error: 'Forbidden' })

    const updateData = {
      ...(body.name && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.languages && { languages: JSON.stringify(body.languages) }),
      ...(body.primaryLanguage && { primaryLanguage: body.primaryLanguage }),
      ...(body.defaultStyle && { defaultStyle: body.defaultStyle }),
      ...(body.projectorWindows && { projectorWindows: body.projectorWindows }),
    }
    const updated = await prisma.project.update({
      where: { id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: updateData as any,
      include: { collaborators: true },
    })
    return dbToDto(updated as ProjectWithCollabs)
  })

  app.delete('/projects/:id', auth, async (req, reply) => {
    const { id } = req.params as { id: string }
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project || project.ownerId !== req.userId) return reply.code(403).send({ error: 'Forbidden' })
    await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } })
    return reply.code(204).send()
  })
}

type Collab = { userId: string; role: string; addedAt: Date }
type ProjectWithCollabs = Awaited<ReturnType<typeof prisma.project.findMany>>[number] & { collaborators: Collab[] }

function dbToDto(row: ProjectWithCollabs): SubtitleProject {
  return {
    id: row.id,
    name: row.name,
    languages: (typeof row.languages === 'string' ? JSON.parse(row.languages) : row.languages) as import('@elegant-tide/core-types').LangCode[],
    primaryLanguage: row.primaryLanguage as import('@elegant-tide/core-types').LangCode,
    defaultStyle: row.defaultStyle as unknown as import('@elegant-tide/core-types').ProjectionStyle,
    projectorWindows: row.projectorWindows as unknown as import('@elegant-tide/core-types').ProjectorWindowConfig[],
    ownerId: row.ownerId,
    collaborators: row.collaborators.map((c: Collab) => ({
      userId: c.userId,
      role: c.role as import('@elegant-tide/core-types').CollaboratorRole,
      addedAt: c.addedAt.getTime(),
    })),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    version: row.version,
    ...(row.deletedAt && { deletedAt: row.deletedAt.getTime() }),
    ...(row.description && { description: row.description }),
  }
}
