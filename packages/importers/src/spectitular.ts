import type { LangCode, SubtitleLine } from '@elegant-tide/core-types'
import { ORDER_GAP, initialOrder } from '@elegant-tide/db'

const BLACKOUT_CHAR = '■'

// Spectitular stores language as lowercase LangCode in meta.columns[].language
// The column data key (e.g. "ES", "DE") is the row property name
const SUPPORTED_LANG_CODES = new Set<LangCode>(['en', 'es', 'de', 'fr', 'it', 'pt'])

interface SpectitularColumn {
  data: string
  coltype: string
  language?: string
  title?: string
  hidden?: boolean
}

interface SpectitularMeta {
  version?: number
  projectName?: string
  columns: SpectitularColumn[]
  [key: string]: unknown
}

interface SpectitularRow {
  UID?: string
  skip?: boolean
  timecode?: string
  act?: string
  scene?: string
  score?: string
  marker?: string
  prNumber?: string
  bgclasses?: string
  fadeTime?: number
  fadeType?: string
  role?: string
  comments?: string
  styleclasses?: string
  brightness?: number
  [key: string]: unknown
}

interface SpectitularFile {
  meta: SpectitularMeta
  data: SpectitularRow[]
}

export interface SpectitularResult {
  lines: SubtitleLine[]
  warnings: string[]
  projectName: string
  detectedLanguages: LangCode[]
}

export function parseSpectitular(json: string, projectId: string): SpectitularResult {
  const warnings: string[] = []
  let parsed: SpectitularFile

  try {
    parsed = JSON.parse(json) as SpectitularFile
  } catch {
    throw new Error('Invalid .spectitular file: not valid JSON')
  }

  if (!parsed.meta || !Array.isArray(parsed.data)) {
    throw new Error('Invalid .spectitular file: missing "meta" or "data" fields')
  }

  // Detect language columns — meta.columns[].language is already a lowercase LangCode ('es','de',…)
  const langCols = parsed.meta.columns
    .filter(col => col.coltype === 'track' && col.language && SUPPORTED_LANG_CODES.has(col.language as LangCode))
    .map(col => ({ key: col.data, lang: col.language as LangCode }))

  const detectedLanguages = langCols.map(c => c.lang)

  if (langCols.length === 0) {
    warnings.push('No recognized language columns found (ES, DE, EN, FR, IT, PT).')
  }

  const base = initialOrder(0)
  const lines: SubtitleLine[] = []

  parsed.data.forEach((row, i) => {
    // Build translations — skip ■ and empty values
    const translations: Partial<Record<LangCode, string>> = {}
    for (const { key, lang } of langCols) {
      const val = row[key]
      if (typeof val === 'string' && val.trim() && val.trim() !== BLACKOUT_CHAR) {
        translations[lang] = val.trim()
      }
    }

    // A row is a blackout cue when every language column is ■ (or absent)
    const isBlackout = langCols.length > 0 && langCols.every(({ key }) => {
      const v = row[key]
      return v === BLACKOUT_CHAR || v === null || v === undefined || String(v).trim() === ''
    })

    // Skip rows that are empty and not a blackout cue and have no comments
    if (!isBlackout && Object.keys(translations).length === 0 && !row.comments) return

    // Timecode — spectitular stores it as "HH:MM:SS,mmm --> HH:MM:SS,mmm"
    const timecode = row.timecode ? parseSrtRange(row.timecode) : undefined

    // Performance show logs — keys like "show_20260413175433"
    const showLogs: Record<string, number[]> = {}
    for (const [key, value] of Object.entries(row)) {
      if (key.startsWith('show_') && typeof value === 'string') {
        try {
          const obj = JSON.parse(value) as { launched?: number[] }
          if (Array.isArray(obj.launched)) showLogs[key] = obj.launched
        } catch { /* skip malformed */ }
      }
    }

    // Extra spectitular metadata preserved verbatim
    const spectitularMeta: Record<string, unknown> = {}
    if (row.UID) spectitularMeta.uid = row.UID
    if (row.act) spectitularMeta.act = row.act
    if (row.scene) spectitularMeta.scene = row.scene
    if (row.score) spectitularMeta.score = row.score
    if (row.marker) spectitularMeta.marker = row.marker
    if (row.prNumber) spectitularMeta.prNumber = row.prNumber
    if (row.bgclasses) spectitularMeta.bgClasses = row.bgclasses
    if (row.fadeTime != null) spectitularMeta.fadeTime = row.fadeTime
    if (row.fadeType) spectitularMeta.fadeType = row.fadeType
    if (row.brightness != null) spectitularMeta.brightness = row.brightness
    if (Object.keys(showLogs).length > 0) spectitularMeta.showLogs = showLogs

    const line: SubtitleLine = {
      id: crypto.randomUUID(),
      projectId,
      type: isBlackout ? 'blackout' : 'subtitle',
      order: base + i * ORDER_GAP,
      translations,
      updatedAt: Date.now(),
      updatedBy: 'import',
      version: -1,
    }

    if (row.comments) line.comment = row.comments
    if (row.skip === true) line.skip = true
    if (row.role) line.role = row.role
    if (row.styleclasses) line.styleClasses = row.styleclasses
    if (timecode) line.timecode = timecode
    if (Object.keys(spectitularMeta).length > 0) line.spectitularMeta = spectitularMeta

    lines.push(line)
  })

  if (lines.length === 0) {
    warnings.push('No lines were extracted from the file.')
  }

  return {
    lines,
    warnings,
    projectName: parsed.meta.projectName ?? 'Imported Project',
    detectedLanguages,
  }
}

function parseSrtRange(tc: string): { startMs: number; endMs: number } | undefined {
  const match = tc.match(
    /(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/,
  )
  if (!match) return undefined
  return { startMs: toMs(match[1]!), endMs: toMs(match[2]!) }
}

function toMs(ts: string): number {
  const [hms, ms] = ts.replace(',', '.').split('.')
  const [h, m, s] = (hms ?? '').split(':').map(Number)
  return ((h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0)) * 1000 + Number(ms ?? 0)
}
