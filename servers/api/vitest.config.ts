import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./src/test-global-setup.ts'],
    setupFiles: ['./src/test-setup.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 15_000,
    hookTimeout: 30_000,
    env: {
      JWT_SECRET: process.env['JWT_SECRET'] ?? 'test-jwt-secret-min-32-chars-1234567890ab',
      JWT_REFRESH_SECRET: process.env['JWT_REFRESH_SECRET'] ?? 'test-refresh-secret-min-32-chars-12345678',
      DATABASE_URL: process.env['DATABASE_URL'] ?? 'file:./prisma/test.db',
      NODE_ENV: 'test',
    },
  },
})
