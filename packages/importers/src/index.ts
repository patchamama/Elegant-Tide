import type { LangCode, SubtitleLine } from '@elegant-tide/core-types'
import { ORDER_GAP, initialOrder } from '@elegant-tide/db'
import type { FileFormat, ImportedLine, ImportOptions, ImportResult } from './types.ts'
import { parseSrt } from './srt.ts'
import { parseVtt } from './vtt.ts'
import { parseDocx } from './docx.ts'
import { parsePdf } from './pdf.ts'
import { parsePlaintext } from './plaintext.ts'
import { parseSpectitular } from './spectitular.ts'

export type { ImportedLine, ImportOptions, ImportResult, FileFormat }

export function detectFormat(filename: string): FileFormat {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'srt') return 'srt'
  if (ext === 'vtt') return 'vtt'
  if (ext === 'docx') return 'docx'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'spectitular') return 'spectitular'
  return 'plaintext'
}

function buildLines(
  imported: ImportedLine[],
  opts: ImportOptions,
): SubtitleLine[] {
  const { projectId, targetLang, startOrder, orderGap = ORDER_GAP } = opts
  const base = startOrder ?? initialOrder(0)

  return imported.map((item, i) => {
    const line: SubtitleLine = {
      id: crypto.randomUUID(),
      projectId,
      type: 'subtitle',
      order: base + i * orderGap,
      translations: { [targetLang as LangCode]: item.text } as Partial<Record<LangCode, string>>,
      updatedAt: Date.now(),
      updatedBy: 'import',
      version: -1,
    }
    if (item.timecode) line.timecode = item.timecode
    return line
  })
}

export async function importFile(
  file: File,
  opts: ImportOptions,
): Promise<ImportResult> {
  const format = detectFormat(file.name)
  const warnings: string[] = []
  let imported: ImportedLine[] = []

  if (format === 'spectitular') {
    const text = await file.text()
    const result = parseSpectitular(text, opts.projectId)
    return {
      lines: result.lines,
      format: 'spectitular',
      warnings: result.warnings,
      projectName: result.projectName,
      detectedLanguages: result.detectedLanguages,
    }
  }

  if (format === 'srt') {
    const text = await file.text()
    imported = parseSrt(text)
  } else if (format === 'vtt') {
    const text = await file.text()
    imported = parseVtt(text)
  } else if (format === 'docx') {
    const buf = await file.arrayBuffer()
    const result = await parseDocx(buf)
    imported = result.lines
    warnings.push(...result.warnings)
  } else if (format === 'pdf') {
    const buf = await file.arrayBuffer()
    const result = await parsePdf(buf)
    imported = result.lines
    warnings.push(...result.warnings)
  } else {
    const text = await file.text()
    imported = parsePlaintext(text)
  }

  if (imported.length === 0) {
    warnings.push('No subtitle lines were found in the file.')
  }

  return {
    lines: buildLines(imported, opts),
    format,
    warnings,
  }
}
