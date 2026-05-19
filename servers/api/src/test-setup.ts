import { afterEach, afterAll } from 'vitest'
import { prisma } from './lib/prisma.js'

export const TEST_DB_AVAILABLE = (process.env['DATABASE_URL'] ?? '').includes('test')

if (!TEST_DB_AVAILABLE) {
  console.warn(
    '⚠️  Skipping API integration tests: DATABASE_URL must contain "test" in the db name. ' +
      'Set DATABASE_URL=postgresql://user:pass@host:5432/elegant_tide_test before running.',
  )
}

if (TEST_DB_AVAILABLE) {
  afterEach(async () => {
    // Wipe data between tests. Order matters because of FK constraints.
    await prisma.refreshToken.deleteMany()
    await prisma.line.deleteMany()
    await prisma.collaborator.deleteMany()
    await prisma.project.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })
}
