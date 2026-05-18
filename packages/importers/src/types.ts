import type { LangCode, SubtitleLine } from '@elegant-tide/core-types'

export interface ImportedLine {
  text: string
  timecode?: { startMs: number; endMs: number }
}

export interface ImportOptions {
  projectId: string
  targetLang: LangCode
  startOrder?: number   // fractional order for the first imported line
  orderGap?: number     // gap between lines, default 1024
}

export interface ImportResult {
  lines: SubtitleLine[]
  format: 'srt' | 'vtt' | 'docx' | 'pdf' | 'plaintext'
  warnings: string[]
}

export type FileFormat = ImportResult['format']
