import type { ImportedLine } from './types.ts'

export async function parseDocx(buffer: ArrayBuffer): Promise<{ lines: ImportedLine[]; warnings: string[] }> {
  // mammoth is CJS-only; dynamic import via default export
  const mammoth = await import('mammoth')
  const result = await mammoth.default.extractRawText({ arrayBuffer: buffer })
  const warnings = result.messages
    .filter((m) => m.type === 'warning')
    .map((m) => m.message)

  const lines: ImportedLine[] = result.value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((text) => ({ text }))

  return { lines, warnings }
}
