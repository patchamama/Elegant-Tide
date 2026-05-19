import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 15_000,
    // Provide defaults so env.ts validation doesn't throw when running tests
    // locally without a configured backend. DATABASE_URL is still required
    // to actually run the integration tests (see test-setup.ts → TEST_DB_AVAILABLE).
    env: {
      JWT_SECRET: process.env['JWT_SECRET'] ?? 'test-jwt-secret-min-32-chars-1234567890ab',
      JWT_REFRESH_SECRET: process.env['JWT_REFRESH_SECRET'] ?? 'test-refresh-secret-min-32-chars-12345678',
      DATABASE_URL: process.env['DATABASE_URL'] ?? 'postgresql://noop:noop@localhost:5432/noop',
      NODE_ENV: 'test',
    },
  },
})
