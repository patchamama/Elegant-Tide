import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { env } from './lib/env.js'
import jwtPlugin from './plugins/jwt.js'
import { authRoutes } from './routes/auth.js'
import { projectRoutes } from './routes/projects.js'
import { syncRoutes } from './routes/sync.js'
import { translateRoutes } from './routes/translate.js'
import { usersRoutes } from './routes/users.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV === 'test'
      ? false
      : { level: env.NODE_ENV === 'development' ? 'info' : 'warn' },
  })

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  })

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Elegant Tide API',
        description: 'Backend API for the Elegant Tide theater subtitle projection system.',
        version: '0.1.0',
      },
      servers: [{ url: `http://localhost:${env.PORT}` }],
      components: {
        securitySchemes: {
          cookieAuth: { type: 'apiKey', in: 'cookie', name: 'access_token' },
        },
      },
    },
  })
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  })

  await app.register(jwtPlugin)

  await app.register(authRoutes)
  await app.register(projectRoutes)
  await app.register(syncRoutes)
  await app.register(translateRoutes)
  await app.register(usersRoutes)

  app.get('/health', async () => ({ ok: true, env: env.NODE_ENV }))

  return app
}
