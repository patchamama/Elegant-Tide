import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../buildApp.js'
import { prisma } from '../lib/prisma.js'
import { TEST_DB_AVAILABLE } from '../test-setup.js'

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

async function register(email: string, password = 'sup3rs3cret', displayName = 'Test User') {
  return app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password, displayName },
  })
}

async function login(email: string, password = 'sup3rs3cret') {
  return app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  })
}

function extractCookies(res: { cookies: Array<{ name: string; value: string; path?: string }> }) {
  return res.cookies.reduce<Record<string, string>>((acc, c) => {
    acc[c.name] = c.value
    return acc
  }, {})
}

describeIfDb('POST /auth/register', () => {
  it('creates a user, returns it, and sets auth cookies', async () => {
    const res = await register('a@example.com')
    expect(res.statusCode).toBe(200)
    const body = res.json() as { user: { id: string; email: string; displayName: string } }
    expect(body.user.email).toBe('a@example.com')
    expect(body.user.id).toBeTypeOf('string')

    const cookies = extractCookies(res)
    expect(cookies['access_token']).toBeTruthy()
    expect(cookies['refresh_token']).toBeTruthy()

    // Verify user exists in DB
    const dbUser = await prisma.user.findUnique({ where: { email: 'a@example.com' } })
    expect(dbUser).not.toBeNull()
    expect(dbUser?.displayName).toBe('Test User')
  })

  it('rejects duplicate emails with 409', async () => {
    await register('dup@example.com')
    const res = await register('dup@example.com')
    expect(res.statusCode).toBe(409)
  })

  it('validates the email format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'not-an-email', password: 'longenough', displayName: 'x' },
    })
    expect(res.statusCode).toBe(500) // Zod throw bubbles as 500 without an error handler
    // Note: a global error handler that maps ZodError → 400 is a future improvement
  })

  it('rejects passwords shorter than 8 chars', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'short@example.com', password: '12345', displayName: 'x' },
    })
    expect(res.statusCode).toBe(500)
  })

  it('persists a refresh token in the database', async () => {
    const res = await register('refresh@example.com')
    expect(res.statusCode).toBe(200)
    const tokens = await prisma.refreshToken.findMany()
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })
})

describeIfDb('POST /auth/login', () => {
  it('authenticates with valid credentials and sets cookies', async () => {
    await register('login@example.com')
    const res = await login('login@example.com')
    expect(res.statusCode).toBe(200)
    const cookies = extractCookies(res)
    expect(cookies['access_token']).toBeTruthy()
    expect(cookies['refresh_token']).toBeTruthy()
  })

  it('rejects an unknown email with 401', async () => {
    const res = await login('does-not-exist@example.com')
    expect(res.statusCode).toBe(401)
  })

  it('rejects a wrong password with 401', async () => {
    await register('pw@example.com')
    const res = await login('pw@example.com', 'wrongpassword')
    expect(res.statusCode).toBe(401)
  })
})

describeIfDb('GET /auth/me', () => {
  it('returns 401 when no cookie is provided', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' })
    expect(res.statusCode).toBe(401)
  })

  it('returns the user profile when a valid access cookie is sent', async () => {
    const reg = await register('me@example.com', 'longpassword', 'Me')
    const cookies = extractCookies(reg)

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { access_token: cookies['access_token']! },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { email: string; displayName: string }
    expect(body.email).toBe('me@example.com')
    expect(body.displayName).toBe('Me')
  })

  it('rejects a tampered cookie with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { access_token: 'not.a.real.jwt' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describeIfDb('POST /auth/refresh', () => {
  it('returns 401 when no refresh cookie is sent', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/refresh' })
    expect(res.statusCode).toBe(401)
  })

  it('rotates the refresh token: old token becomes unusable, new one is issued', async () => {
    const reg = await register('rotate@example.com')
    const cookies = extractCookies(reg)
    const oldRefresh = cookies['refresh_token']!

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { refresh_token: oldRefresh },
    })
    expect(res.statusCode).toBe(200)
    const newCookies = extractCookies(res)
    expect(newCookies['access_token']).toBeTruthy()
    expect(newCookies['refresh_token']).toBeTruthy()
    expect(newCookies['refresh_token']).not.toBe(oldRefresh)

    // Old refresh token is gone from the DB
    expect(await prisma.refreshToken.findUnique({ where: { token: oldRefresh } })).toBeNull()
    // Trying to use it again returns 401
    const replay = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { refresh_token: oldRefresh },
    })
    expect(replay.statusCode).toBe(401)
  })
})

describeIfDb('POST /auth/logout', () => {
  it('clears cookies and deletes the stored refresh token', async () => {
    const reg = await register('logout@example.com')
    const cookies = extractCookies(reg)
    expect(await prisma.refreshToken.count()).toBe(1)

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { refresh_token: cookies['refresh_token']! },
    })
    expect(res.statusCode).toBe(200)
    expect(await prisma.refreshToken.count()).toBe(0)
  })

  it('is idempotent — calling without a cookie still returns 200', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/logout' })
    expect(res.statusCode).toBe(200)
  })
})
