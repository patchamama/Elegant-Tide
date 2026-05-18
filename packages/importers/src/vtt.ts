import type { ImportedLine } from './types.ts'

function parseVttTime(ts: string): number {
  const parts = ts.trim().split(':').map(Number)
  let h = 0, m = 0, s = 0
  if (parts.length === 3) {
    ;[h, m, s] = parts as [number, number, number]
  } else if (parts.length === 2) {
    ;[m, s] = parts as [number, number]
  } else {
    s = parts[0] ?? 0
  }
  const [sInt, msStr] = String(s).split('.')
  const ms = msStr ? Number(msStr.padEnd(3, '0').slice(0, 3)) : 0
  return (h * 3600 + m * 60 + Number(sInt ?? 0)) * 1000 + ms
}

export function parseVtt(raw: string): ImportedLine[] {
  const normalised = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks = normalised.split(/\n{2,}/)
  const lines: ImportedLine[] = []

  for (const block of blocks) {
    const parts = block.trim().split('\n')
    if (!parts.length) continue

    let cursor = 0

    // Skip WEBVTT header and NOTE/STYLE/REGION blocks
    const first = parts[0]?.trim() ?? ''
    if (
      first === 'WEBVTT' ||
      first.startsWith('NOTE') ||
      first.startsWith('STYLE') ||
      first.startsWith('REGION')
    ) continue

    // Optional cue identifier
    if (!/-->/.test(parts[cursor] ?? '')) cursor++

    const timeLine = parts[cursor]?.trim() ?? ''
    const timeMatch = timeLine.match(
      /(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})/,
    )
    if (!timeMatch) continue
    cursor++

    const text = parts
      .slice(cursor)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .replace(/^NOTE\b.*/gm, '')
      .trim()

    if (!text) continue

    lines.push({
      text,
      timecode: {
        startMs: parseVttTime(timeMatch[1]!),
        endMs: parseVttTime(timeMatch[2]!),
      },
    })
  }

  return lines
}
