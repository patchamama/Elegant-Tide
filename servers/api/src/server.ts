import { buildApp } from './buildApp.js'
import { env } from './lib/env.js'

function describeDatabase(url: string): string {
  if (url.startsWith('file:')) return `SQLite → ${url.slice(5)}`
  try {
    const u = new URL(url)
    return `PostgreSQL → ${u.host}${u.pathname}`
  } catch {
    return 'PostgreSQL'
  }
}

const app = await buildApp()

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  console.log(`Server running on port ${env.PORT}`)
  console.log(`Database: ${describeDatabase(env.DATABASE_URL)}`)
  if (env.NODE_ENV === 'development') {
    console.log(`OpenAPI docs: http://localhost:${env.PORT}/docs`)
  }
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
