import Fastify from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { env } from './lib/env.js'
import { authRoutes } from './routes/auth.js'
import { projectRoutes } from './routes/projects.js'
import { syncRoutes } from './routes/sync.js'
import { translateRoutes } from './routes/translate.js'

const app = Fastify({ logger: { level: env.NODE_ENV === 'development' ? 'info' : 'warn' } })

await app.register(cors, {
  origin: env.CORS_ORIGIN,
  credentials: true,
})

// OpenAPI docs — available at /docs in development
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
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'access_token',
        },
      },
    },
  },
})
await app.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: { docExpansion: 'list', deepLinking: true },
})

// JWT + cookie auth plugin
const { default: jwtPlugin } = await import('./plugins/jwt.js')
await app.register(jwtPlugin)

// Routes
await app.register(authRoutes)
await app.register(projectRoutes)
await app.register(syncRoutes)
await app.register(translateRoutes)

app.get('/health', async () => ({ ok: true, env: env.NODE_ENV }))

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  console.log(`Server running on port ${env.PORT}`)
  if (env.NODE_ENV === 'development') {
    console.log(`OpenAPI docs: http://localhost:${env.PORT}/docs`)
  }
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
