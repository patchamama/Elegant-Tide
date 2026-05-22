import type { LangCode, SubtitleLine } from '@elegant-tide/core-types'

export function exportPlaintext(lines: SubtitleLine[], lang: LangCode): string {
  return lines
    .filter(l => !l.deletedAt && !l.skip && l.type !== 'blackout' && l.type !== 'comment' && l.type !== 'media')
    .map(l => l.translations[lang]?.trim())
    .filter(Boolean)
    .join('\n')
}
