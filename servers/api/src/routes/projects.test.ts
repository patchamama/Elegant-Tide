import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../buildApp.js'
import { prisma } from '../lib/prisma.js'
import { TEST_DB_AVAILABLE } from '../test-setup.js'
import { registerAndGetToken, makeProjectPayload } from './test-helpers.js'

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

describeIfDb('POST /projects', () => {
  it('creates a project owned by the authenticated user', async () => {
    const { token, userId } = await registerAndGetToken(app, 'creator@example.com')
    const payload = makeProjectPayload({ name: 'My Show' })

    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      payload,
      cookies: { access_token: token },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as { id: string; name: string; ownerId: string }
    expect(body.id).toBe(payload.id)
    expect(body.name).toBe('My Show')
    expect(body.ownerId).toBe(userId)
  })

  it('rejects an unauthenticated request with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: makeProjectPayload(),
    })
    expect(res.statusCode).toBe(401)
  })
})

describeIfDb('GET /projects', () => {
  it('lists only projects owned by the caller', async () => {
    const a = await registerAndGetToken(app, 'a@example.com')
    const b = await registerAndGetToken(app, 'b@example.com')

    await app.inject({
      method: 'POST', url: '/projects',
      payload: makeProjectPayload({ id: 'a1', name: "A's project" }),
      cookies: { access_token: a.token },
    })
    await app.inject({
      method: 'POST', url: '/projects',
      payload: makeProjectPayload({ id: 'b1', name: "B's project" }),
      cookies: { access_token: b.token },
    })

    const res = await app.inject({ method: 'GET', url: '/projects', cookies: { access_token: a.token } })
    expect(res.statusCode).toBe(200)
    const list = res.json() as Array<{ id: string; name: string }>
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe('a1')
  })

  it('returns an empty array when the user has no projects', async () => {
    const { token } = await registerAndGetToken(app, 'empty@example.com')
    const res = await app.inject({ method: 'GET', url: '/projects', cookies: { access_token: token } })
    expect(res.json()).toEqual([])
  })
})

describeIfDb('GET /projects/:id', () => {
  it('returns the project to its owner', async () => {
    const { token } = await registerAndGetToken(app, 'owner@example.com')
    const payload = makeProjectPayload({ id: 'p1' })
    await app.inject({ method: 'POST', url: '/projects', payload, cookies: { access_token: token } })

    const res = await app.inject({ method: 'GET', url: '/projects/p1', cookies: { access_token: token } })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { id: string }).id).toBe('p1')
  })

  it('returns 404 to a non-collaborator', async () => {
    const owner = await registerAndGetToken(app, 'owner2@example.com')
    const other = await registerAndGetToken(app, 'other@example.com')
    await app.inject({
      method: 'POST', url: '/projects',
      payload: makeProjectPayload({ id: 'p2' }),
      cookies: { access_token: owner.token },
    })

    const res = await app.inject({
      method: 'GET', url: '/projects/p2',
      cookies: { access_token: other.token },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns the project to a collaborator', async () => {
    const owner = await registerAndGetToken(app, 'owner3@example.com')
    const collab = await registerAndGetToken(app, 'collab@example.com')
    await app.inject({
      method: 'POST', url: '/projects',
      payload: makeProjectPayload({ id: 'p3' }),
      cookies: { access_token: owner.token },
    })

    // Manually add collaborator (no route exposed yet)
    await prisma.collaborator.create({
      data: { projectId: 'p3', userId: collab.userId, role: 'translator' },
    })

    const res = await app.inject({
      method: 'GET', url: '/projects/p3',
      cookies: { access_token: collab.token },
    })
    expect(res.statusCode).toBe(200)
  })
})

describeIfDb('PUT /projects/:id', () => {
  it('updates a project for its owner', async () => {
    const { token } = await registerAndGetToken(app, 'putowner@example.com')
    await app.inject({
      method: 'POST', url: '/projects',
      payload: makeProjectPayload({ id: 'pu1', name: 'old' }),
      cookies: { access_token: token },
    })

    const res = await app.inject({
      method: 'PUT', url: '/projects/pu1',
      payload: { name: 'new' },
      cookies: { access_token: token },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { name: string }).name).toBe('new')
  })

  it('returns 403 when called by a non-owner', async () => {
    const owner = await registerAndGetToken(app, 'owner4@example.com')
    const other = await registerAndGetToken(app, 'other2@example.com')
    await app.inject({
      method: 'POST', url: '/projects',
      payload: makeProjectPayload({ id: 'pu2' }),
      cookies: { access_token: owner.token },
    })

    const res = await app.inject({
      method: 'PUT', url: '/projects/pu2',
      payload: { name: 'hijacked' },
      cookies: { access_token: other.token },
    })
    expect(res.statusCode).toBe(403)
  })
})

describeIfDb('DELETE /projects/:id', () => {
  it('soft-deletes a project (sets deletedAt) and hides it from subsequent lists', async () => {
    const { token } = await registerAndGetToken(app, 'del@example.com')
    await app.inject({
      method: 'POST', url: '/projects',
      payload: makeProjectPayload({ id: 'd1' }),
      cookies: { access_token: token },
    })

    const del = await app.inject({
      method: 'DELETE', url: '/projects/d1',
      cookies: { access_token: token },
    })
    expect(del.statusCode).toBe(204)

    const stillInDb = await prisma.project.findUnique({ where: { id: 'd1' } })
    expect(stillInDb).not.toBeNull()
    expect(stillInDb?.deletedAt).not.toBeNull()

    const list = await app.inject({ method: 'GET', url: '/projects', cookies: { access_token: token } })
    expect(list.json()).toEqual([])
  })

  it('returns 403 when called by a non-owner', async () => {
    const owner = await registerAndGetToken(app, 'owner5@example.com')
    const other = await registerAndGetToken(app, 'other3@example.com')
    await app.inject({
      method: 'POST', url: '/projects',
      payload: makeProjectPayload({ id: 'd2' }),
      cookies: { access_token: owner.token },
    })

    const res = await app.inject({
      method: 'DELETE', url: '/projects/d2',
      cookies: { access_token: other.token },
    })
    expect(res.statusCode).toBe(403)
  })
})
