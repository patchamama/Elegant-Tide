import type { LangCode, SubtitleLine } from '@elegant-tide/core-types'
import type { ImportResult } from './types.ts'

export interface EtideFile {
  version: 1
  exportedAt: number
  projectName: string
  languages?: LangCode[]
  lines: SubtitleLine[]
}

export function exportEtide(lines: SubtitleLine[], projectName: string, languages?: LangCode[]): string {
  const file: EtideFile = {
    version: 1,
    exportedAt: Date.now(),
    projectName,
    ...(languages && { languages }),
    lines: lines.filter(l => !l.deletedAt),
  }
  return JSON.stringify(file, null, 2)
}

export function parseEtide(json: string, projectId: string): ImportResult {
  let parsed: EtideFile
  try {
    parsed = JSON.parse(json) as EtideFile
  } catch {
    throw new Error('Invalid .etide file: not valid JSON')
  }
  if (parsed.version !== 1 || !Array.isArray(parsed.lines)) {
    throw new Error('Invalid .etide file: missing version or lines')
  }
  const lines: SubtitleLine[] = parsed.lines.map(l => ({
    ...l,
    projectId,
    version: -1,
    updatedBy: 'import',
    updatedAt: Date.now(),
  }))
  const result: ImportResult = {
    lines,
    format: 'etide',
    warnings: [],
    projectName: parsed.projectName,
  }
  if (parsed.languages) result.detectedLanguages = parsed.languages
  return result
}
