import type { ImportedLine } from './types.ts'

export function parsePlaintext(raw: string): ImportedLine[] {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((text) => ({ text }))
}
