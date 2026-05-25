import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

const SettingsBody = z.object({
  locale: z.string().optional(),
  theme: z.string().optional(),
})

export async function usersRoutes(app: FastifyInstance) {
  app.get('/users/settings', { preHandler: [app.authenticate] }, async (req, reply) => {
    const settings = await prisma.userSettings.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId },
      update: {},
    })
    return { locale: settings.locale, theme: settings.theme }
  })

  app.put('/users/settings', { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = SettingsBody.parse(req.body)
    const settings = await prisma.userSettings.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId, ...body },
      update: body,
    })
    return { locale: settings.locale, theme: settings.theme }
  })
}
