import { buildApp } from './buildApp.js'
import { env } from './lib/env.js'

const app = await buildApp()

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
