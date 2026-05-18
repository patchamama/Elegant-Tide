import type { ImportedLine } from './types.ts'

function parseSrtTime(ts: string): number {
  const [hms, ms] = ts.trim().split(',')
  const [h, m, s] = (hms ?? '').split(':').map(Number)
  return ((h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0)) * 1000 + Number(ms ?? 0)
}

export function parseSrt(raw: string): ImportedLine[] {
  const blocks = raw.trim().replace(/\r\n/g, '\n').split(/\n{2,}/)
  const lines: ImportedLine[] = []

  for (const block of blocks) {
    const parts = block.trim().split('\n')
    if (parts.length < 2) continue

    // First non-empty line is the sequence number — skip it
    let cursor = 0
    if (/^\d+$/.test(parts[cursor]?.trim() ?? '')) cursor++

    const timeLine = parts[cursor]?.trim() ?? ''
    const timeMatch = timeLine.match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/,
    )
    if (!timeMatch) continue
    cursor++

    const text = parts
      .slice(cursor)
      .join('\n')
      .replace(/<[^>]+>/g, '') // strip HTML tags
      .trim()

    if (!text) continue

    lines.push({
      text,
      timecode: {
        startMs: parseSrtTime(timeMatch[1]!),
        endMs: parseSrtTime(timeMatch[2]!),
      },
    })
  }

  return lines
}
