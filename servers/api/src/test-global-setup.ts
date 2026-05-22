import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default function setup() {
  const dbUrl = process.env['DATABASE_URL'] ?? 'file:./prisma/test.db'
  const isSqlite = dbUrl.startsWith('file:')
  const schemaFlag = isSqlite ? '--schema prisma/schema.sqlite.prisma' : ''
  execSync(`prisma db push ${schemaFlag} --skip-generate --accept-data-loss`.trim(), {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
    cwd: path.resolve(__dirname, '..'),
  })
}
