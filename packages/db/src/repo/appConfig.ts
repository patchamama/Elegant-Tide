import { db } from '../schema.ts'
import type { AppConfig } from '@elegant-tide/core-types'

const SINGLETON_ID = 1 as const

const DEFAULTS: AppConfig = {
  id: SINGLETON_ID,
  locale: 'en',
  theme: 'system',
}

export const appConfigRepo = {
  async get(): Promise<AppConfig> {
    return (await db.appConfig.get(SINGLETON_ID)) ?? DEFAULTS
  },

  async update(patch: Partial<Omit<AppConfig, 'id'>>): Promise<void> {
    const existing = await db.appConfig.get(SINGLETON_ID)
    await db.appConfig.put({ ...(existing ?? DEFAULTS), ...patch })
  },
}
