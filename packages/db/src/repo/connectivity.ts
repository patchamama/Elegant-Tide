import { db } from '../schema.ts'
import type { ConnectivityRecord } from '@elegant-tide/core-types'

const SINGLETON_ID = 1 as const

const DEFAULTS: ConnectivityRecord = {
  id: SINGLETON_ID,
  lastServerSuccessAt: null,
  backendConfigured: false,
  graceWindowMs: 7 * 24 * 60 * 60 * 1000,
}

export const connectivityRepo = {
  async get(): Promise<ConnectivityRecord> {
    return (await db.connectivity.get(SINGLETON_ID)) ?? DEFAULTS
  },

  async markSuccess(): Promise<void> {
    const existing = await db.connectivity.get(SINGLETON_ID)
    await db.connectivity.put({
      ...(existing ?? DEFAULTS),
      lastServerSuccessAt: Date.now(),
    })
  },

  async setBackendConfigured(configured: boolean): Promise<void> {
    const existing = await db.connectivity.get(SINGLETON_ID)
    await db.connectivity.put({ ...(existing ?? DEFAULTS), backendConfigured: configured })
  },
}
