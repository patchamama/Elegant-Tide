import type { LangCode, SubtitleLine } from '@elegant-tide/core-types'

function msToSrt(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  const msRem = ms % 1_000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(msRem).padStart(3, '0')}`
}

function srtCues(lines: SubtitleLine[], getLang: (l: SubtitleLine) => string | undefined): string {
  let counter = 1
  const parts: string[] = []
  for (const line of lines) {
    if (line.deletedAt || line.skip || line.type === 'blackout' || line.type === 'comment' || line.type === 'media') continue
    if (!line.timecode) continue
    const text = getLang(line)
    if (!text?.trim()) continue
    parts.push(`${counter}\n${msToSrt(line.timecode.startMs)} --> ${msToSrt(line.timecode.endMs)}\n${text.trim()}`)
    counter++
  }
  return parts.join('\n\n')
}

export function exportSrtMono(lines: SubtitleLine[], lang: LangCode): string {
  return srtCues(lines, l => l.translations[lang])
}

export function exportSrtBilingual(lines: SubtitleLine[], primaryLang: LangCode, secondaryLang: LangCode): string {
  return srtCues(lines, l => {
    const primary = l.translations[primaryLang]?.trim()
    const secondary = l.translations[secondaryLang]?.trim()
    if (primary && secondary) return `${primary}\n${secondary}`
    return primary ?? secondary
  })
}
