// Loads fake-indexeddb polyfill so Dexie can run in Node tests
import 'fake-indexeddb/auto'

import { afterEach } from 'vitest'
import { db } from '@elegant-tide/db'

afterEach(async () => {
  // Wipe all tables between tests so they remain isolated
  await Promise.all([
    db.lines.clear(),
    db.projects.clear(),
    db.outbox.clear(),
    db.connectivity.clear(),
    db.appConfig.clear(),
    db.conflicts.clear(),
  ])
})
