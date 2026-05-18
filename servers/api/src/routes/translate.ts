import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../lib/env.js'

const TranslateBody = z.object({
  text: z.string().min(1).max(5000),
  sourceLang: z.string(),
  targetLang: z.string(),
})

export async function translateRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] }

  app.post('/translate/deepl', auth, async (req, reply) => {
    if (!env.DEEPL_API_KEY) return reply.code(503).send({ error: 'DeepL not configured' })

    const { text, sourceLang, targetLang } = TranslateBody.parse(req.body)

    const res = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${env.DEEPL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [text],
        source_lang: sourceLang.toUpperCase(),
        target_lang: targetLang.toUpperCase(),
      }),
    })

    if (!res.ok) {
      return reply.code(502).send({ error: 'DeepL API error' })
    }

    const data = await res.json() as { translations: Array<{ text: string }> }
    return {
      translatedText: data.translations[0]?.text ?? '',
      provider: 'deepl',
    }
  })

  app.post('/translate/google', auth, async (req, reply) => {
    if (!env.GOOGLE_TRANSLATE_API_KEY) return reply.code(503).send({ error: 'Google Translate not configured' })

    const { text, sourceLang, targetLang } = TranslateBody.parse(req.body)

    const url = new URL('https://translation.googleapis.com/language/translate/v2')
    url.searchParams.set('key', env.GOOGLE_TRANSLATE_API_KEY)

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: sourceLang,
        target: targetLang,
        format: 'text',
      }),
    })

    if (!res.ok) return reply.code(502).send({ error: 'Google Translate API error' })

    const data = await res.json() as { data: { translations: Array<{ translatedText: string }> } }
    return {
      translatedText: data.data.translations[0]?.translatedText ?? '',
      provider: 'google',
    }
  })
}
