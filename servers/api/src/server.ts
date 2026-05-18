import Fastify from 'fastify'
import cors from '@fastify/cors'
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
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
