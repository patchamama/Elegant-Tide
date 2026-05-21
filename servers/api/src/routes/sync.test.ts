import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../buildApp.js'
import { prisma } from '../lib/prisma.js'
import { TEST_DB_AVAILABLE } from '../test-setup.js'
import { registerAndGetToken, makeProjectPayload, makeLinePayload } from './test-helpers.js'

const describeIfDb = describe.skipIf(!TEST_DB_AVAILABLE)
let app: FastifyInstance

beforeAll(async () => {
  if (!TEST_DB_AVAILABLE) return
  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  if (app) await app.close()
})

async function createProject(token: string, id: string) {
  await app.inject({
    method: 'POST',
    url: '/projects',
    payload: makeProjectPayload({ id }),
    cookies: { access_token: token },
  })
}

describeIfDb('GET /sync/ping', () => {
  it('returns ok with a timestamp', async () => {
    const { token } = await registerAndGetToken(app, 'ping@example.com')
    const res = await app.inject({ method: 'GET', url: '/sync/ping', cookies: { access_token: token } })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { ok: boolean; ts: number }
    expect(body.ok).toBe(true)
    expect(body.ts).toBeGreaterThan(0)
  })

  it('rejects unauthenticated calls with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/sync/ping' })
    expect(res.statusCode).toBe(401)
  })
})

describeIfDb('POST /sync/push', () => {
  it('creates new lines for the user\'s project', async () => {
    const { token } = await registerAndGetToken(app, 'push1@example.com')
    await createProject(token, 'pp1')
    const line = makeLinePayload('pp1', { id: 'l-new' })

    const res = await app.inject({
      method: 'POST', url: '/sync/push',
      payload: { lines: [line] },
      cookies: { access_token: token },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { results: Array<{ id: string; version: number; conflict: boolean }> }
    expect(body.results).toEqual([{ id: 'l-new', version: 1, conflict: false }])

    const stored = await prisma.line.findUnique({ where: { id: 'l-new' } })
    expect(stored).not.toBeNull()
  })

  it('updates an existing line when incoming.updatedAt is newer (LWW)', async () => {
    const { token } = await registerAndGetToken(app, 'push2@example.com')
    await createProject(token, 'pp2')
    const initial = makeLinePayload('pp2', { id: 'l-update', text: 'first', updatedAt: 1_000 })
    await app.inject({
      method: 'POST', url: '/sync/push',
      payload: { lines: [initial] },
      cookies: { access_token: token },
    })

    const newer = { ...initial, translations: { en: 'second' }, updatedAt: 5_000 }
    const res = await app.inject({
      method: 'POST', url: '/sync/push',
      payload: { lines: [newer] },
      cookies: { access_token: token },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { results: Array<{ conflict: boolean; version: number }> }
    expect(body.results[0]?.conflict).toBe(false)
    expect(body.results[0]?.version).toBe(2) // incremented

    const stored = await prisma.line.findUnique({ where: { id: 'l-update' } })
    expect((stored?.translations as { en: string })?.en).toBe('second')
  })

  it('marks the result as conflict when incoming.updatedAt is older than existing', async () => {
    const { token } = await registerAndGetToken(app, 'push3@example.com')
    await createProject(token, 'pp3')
    const existing = makeLinePayload('pp3', { id: 'l-conflict', text: 'server', updatedAt: 5_000 })
    await app.inject({
      method: 'POST', url: '/sync/push',
      payload: { lines: [existing] },
      cookies: { access_token: token },
    })

    const stale = { ...existing, translations: { en: 'stale' }, updatedAt: 1_000 }
    const res = await app.inject({
      method: 'POST', url: '/sync/push',
      payload: { lines: [stale] },
      cookies: { access_token: token },
    })
    const body = res.json() as { results: Array<{ conflict: boolean }> }
    expect(body.results[0]?.conflict).toBe(true)

    // Server text remains the winner
    const stored = await prisma.line.findUnique({ where: { id: 'l-conflict' } })
    expect((stored?.translations as { en: string })?.en).toBe('server')
  })

  it('rejects the push with 403 if any line targets a project the user cannot write to', async () => {
    const owner = await registerAndGetToken(app, 'pushowner@example.com')
    const stranger = await registerAndGetToken(app, 'pushstranger@example.com')
    await createProject(owner.token, 'pp4')

    const line = makeLinePayload('pp4', { id: 'l-blocked' })
    const res = await app.inject({
      method: 'POST', url: '/sync/push',
      payload: { lines: [line] },
      cookies: { access_token: stranger.token },
    })
    expect(res.statusCode).toBe(403)
    expect(await prisma.line.findUnique({ where: { id: 'l-blocked' } })).toBeNull()
  })
})

describeIfDb('GET /sync/pull', () => {
  it('returns lines updated since the given cursor', async () => {
    const { token } = await registerAndGetToken(app, 'pull1@example.com')
    await createProject(token, 'pull-p1')

    await app.inject({
      method: 'POST', url: '/sync/push',
      payload: {
        lines: [
          makeLinePayload('pull-p1', { id: 'l-a', updatedAt: 1_000 }),
          makeLinePayload('pull-p1', { id: 'l-b', updatedAt: 2_000 }),
        ],
      },
      cookies: { access_token: token },
    })

    // since=0 → both lines
    const all = await app.inject({
      method: 'GET', url: '/sync/pull?since=0',
      cookies: { access_token: token },
    })
    const allBody = all.json() as { lines: Array<{ id: string }> }
    expect(allBody.lines.length).toBeGreaterThanOrEqual(2)
  })

  it('does not return lines from projects the user cannot access', async () => {
    const owner = await registerAndGetToken(app, 'pull-owner@example.com')
    const other = await registerAndGetToken(app, 'pull-other@example.com')
    await createProject(owner.token, 'pull-p2')

    await app.inject({
      method: 'POST', url: '/sync/push',
      payload: { lines: [makeLinePayload('pull-p2', { id: 'l-hidden' })] },
      cookies: { access_token: owner.token },
    })

    const res = await app.inject({
      method: 'GET', url: '/sync/pull?since=0',
      cookies: { access_token: other.token },
    })
    const body = res.json() as { lines: Array<{ id: string }> }
    expect(body.lines.find((l) => l.id === 'l-hidden')).toBeUndefined()
  })

  it('rejects unauthenticated calls with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/sync/pull?since=0' })
    expect(res.statusCode).toBe(401)
  })
})
