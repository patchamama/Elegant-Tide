import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiDir = path.resolve(__dirname, '..')

export default function setup() {
  const dbUrl = process.env['DATABASE_URL'] ?? 'file:./prisma/test.db'
  const isSqlite = dbUrl.startsWith('file:')

  if (isSqlite) {
    fs.copyFileSync(
      path.join(apiDir, 'prisma/schema.sqlite.prisma'),
      path.join(apiDir, 'prisma/schema.prisma'),
    )
    execSync('prisma generate', { stdio: 'pipe', cwd: apiDir })
  }

  const schemaFlag = isSqlite ? '--schema prisma/schema.sqlite.prisma' : ''
  execSync(`prisma db push ${schemaFlag} --skip-generate --accept-data-loss`.trim(), {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'pipe',
    cwd: apiDir,
  })
}
