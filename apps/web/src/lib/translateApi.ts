import { appConfigRepo } from '@elegant-tide/db'
import type { LangCode } from '@elegant-tide/core-types'

export async function suggestTranslation(
  text: string,
  sourceLang: LangCode,
  targetLang: LangCode,
  provider: 'deepl' | 'google' = 'deepl',
): Promise<string | null> {
  const cfg = await appConfigRepo.get()
  if (!cfg.backendUrl) return null

  const url = `${cfg.backendUrl.replace(/\/$/, '')}/translate/${provider}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sourceLang, targetLang }),
    })
    if (!res.ok) return null
    const data = await res.json() as { translatedText: string }
    return data.translatedText
  } catch {
    return null
  }
}
