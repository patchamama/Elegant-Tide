import type { FastifyInstance } from 'fastify'

/**
 * Registers a user and returns their access_token cookie value plus the user id.
 * Reusable across integration test suites.
 */
export async function registerAndGetToken(
  app: FastifyInstance,
  email: string,
  displayName = 'Test User',
): Promise<{ token: string; userId: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'sup3rs3cret', displayName },
  })
  if (res.statusCode !== 200) {
    throw new Error(`registerAndGetToken failed for ${email}: ${res.statusCode} ${res.body}`)
  }
  const body = res.json() as { user: { id: string } }
  const cookie = res.cookies.find((c) => c.name === 'access_token')
  if (!cookie) throw new Error('access_token cookie not set after registration')
  return { token: cookie.value, userId: body.user.id }
}

export function defaultProjectionStyle() {
  return {
    fontFamily: 'Inter',
    fontSizePx: 48,
    fontWeight: 600,
    textColor: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.7)',
    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
    paddingPx: 16,
    textAlign: 'center',
    lineHeight: 1.4,
  }
}

export function makeProjectPayload(overrides: Partial<{ id: string; name: string }> = {}) {
  const now = Date.now()
  return {
    id: overrides.id ?? `proj-${now}`,
    name: overrides.name ?? 'Test Production',
    languages: ['en', 'es'],
    primaryLanguage: 'en',
    defaultStyle: defaultProjectionStyle(),
    projectorWindows: [],
    createdAt: now,
    updatedAt: now,
    version: -1,
  }
}

export function makeLinePayload(projectId: string, overrides: Partial<{ id: string; text: string; updatedAt: number }> = {}) {
  return {
    id: overrides.id ?? `line-${Math.random().toString(36).slice(2)}`,
    projectId,
    type: 'subtitle' as const,
    order: 1024,
    translations: { en: overrides.text ?? 'Hello world.' },
    updatedAt: overrides.updatedAt ?? Date.now(),
    updatedBy: 'local',
    version: -1,
  }
}
