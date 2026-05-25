import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as argon2 from 'argon2'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'
import { env } from '../lib/env.js'

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
})

function signRefresh(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh', jti: crypto.randomUUID() }, env.JWT_REFRESH_SECRET, { expiresIn: '30d' })
}

function verifyRefresh(token: string): { sub: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string }
}

function issueTokens(app: FastifyInstance, userId: string) {
  const accessToken = app.jwt.sign({ sub: userId })
  const refreshToken = signRefresh(userId)
  return { accessToken, refreshToken }
}

async function storeRefresh(userId: string, token: string) {
  await prisma.refreshToken.create({
    data: {
      userId,
      token,
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
  })
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (req, reply) => {
    const body = RegisterBody.parse(req.body)
    const existing = await prisma.user.findUnique({ where: { email: body.email } })
    if (existing) return reply.code(409).send({ error: 'Email already in use' })

    const passwordHash = await argon2.hash(body.password)
    const user = await prisma.user.create({
      data: { email: body.email, displayName: body.displayName, passwordHash },
    })

    const { accessToken, refreshToken } = issueTokens(app, user.id)
    await storeRefresh(user.id, refreshToken)

    return reply
      .setCookie('access_token', accessToken, { httpOnly: true, sameSite: 'lax', path: '/' })
      .setCookie('refresh_token', refreshToken, { httpOnly: true, sameSite: 'lax', path: '/auth/refresh' })
      .send({ user: { id: user.id, email: user.email, displayName: user.displayName } })
  })

  app.post('/auth/login', async (req, reply) => {
    const body = LoginBody.parse(req.body)
    const user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user || !(await argon2.verify(user.passwordHash, body.password))) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const { accessToken, refreshToken } = issueTokens(app, user.id)
    await storeRefresh(user.id, refreshToken)

    return reply
      .setCookie('access_token', accessToken, { httpOnly: true, sameSite: 'lax', path: '/' })
      .setCookie('refresh_token', refreshToken, { httpOnly: true, sameSite: 'lax', path: '/auth/refresh' })
      .send({ user: { id: user.id, email: user.email, displayName: user.displayName } })
  })

  app.post('/auth/refresh', async (req, reply) => {
    const token = (req.cookies as Record<string, string>)['refresh_token']
    if (!token) return reply.code(401).send({ error: 'No refresh token' })

    let payload: { sub: string }
    try {
      payload = verifyRefresh(token)
    } catch {
      return reply.code(401).send({ error: 'Invalid refresh token' })
    }

    const stored = await prisma.refreshToken.findUnique({ where: { token } })
    if (!stored || stored.expiresAt < new Date()) {
      return reply.code(401).send({ error: 'Refresh token expired' })
    }

    // Rotate: delete old, issue new
    await prisma.refreshToken.delete({ where: { token } })
    const { accessToken, refreshToken: newRefresh } = issueTokens(app, payload.sub)
    await storeRefresh(payload.sub, newRefresh)

    return reply
      .setCookie('access_token', accessToken, { httpOnly: true, sameSite: 'lax', path: '/' })
      .setCookie('refresh_token', newRefresh, { httpOnly: true, sameSite: 'lax', path: '/auth/refresh' })
      .send({ ok: true })
  })

  app.post('/auth/logout', async (req, reply) => {
    const token = (req.cookies as Record<string, string>)['refresh_token']
    if (token) await prisma.refreshToken.deleteMany({ where: { token } })
    return reply
      .clearCookie('access_token')
      .clearCookie('refresh_token', { path: '/auth/refresh' })
      .send({ ok: true })
  })

  app.get('/auth/me', { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } })
    if (!user) return reply.code(404).send({ error: 'User not found' })
    return { id: user.id, email: user.email, displayName: user.displayName, avatarUrl: user.avatarUrl, isAnonymous: user.isAnonymous }
  })

  app.post('/auth/anonymous', async (req, reply) => {
    const body = z.object({ deviceId: z.string().min(1) }).parse(req.body)

    const existing = await prisma.user.findUnique({ where: { deviceId: body.deviceId } })
    if (existing) {
      const { accessToken, refreshToken } = issueTokens(app, existing.id)
      await storeRefresh(existing.id, refreshToken)
      return reply
        .setCookie('access_token', accessToken, { httpOnly: true, sameSite: 'lax', path: '/' })
        .setCookie('refresh_token', refreshToken, { httpOnly: true, sameSite: 'lax', path: '/auth/refresh' })
        .send({ user: { id: existing.id, email: existing.email, displayName: existing.displayName, isAnonymous: true } })
    }

    const uid = crypto.randomUUID()
    const passwordHash = await argon2.hash(uid)
    const user = await prisma.user.create({
      data: {
        email: `anon_${uid}@local`,
        displayName: 'Anonymous',
        passwordHash,
        isAnonymous: true,
        deviceId: body.deviceId,
      },
    })

    const { accessToken, refreshToken } = issueTokens(app, user.id)
    await storeRefresh(user.id, refreshToken)

    return reply
      .setCookie('access_token', accessToken, { httpOnly: true, sameSite: 'lax', path: '/' })
      .setCookie('refresh_token', refreshToken, { httpOnly: true, sameSite: 'lax', path: '/auth/refresh' })
      .send({ user: { id: user.id, email: user.email, displayName: user.displayName, isAnonymous: true } })
  })
}
