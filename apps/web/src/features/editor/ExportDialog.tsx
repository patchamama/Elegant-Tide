import { useState } from 'react'
import type { LangCode, SubtitleLine, ProjectionStyle } from '@elegant-tide/core-types'
import { DEFAULT_PROJECTION_STYLE } from '@elegant-tide/core-types'
import { exportSrtMono, exportSrtBilingual, exportPlaintext, exportEtide } from '@elegant-tide/importers'
import { FileDown, Download, X, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@elegant-tide/db'
import { jsPDF } from 'jspdf'

const LANG_LABELS: Record<LangCode, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  pt: 'Português',
}

type ExportFormat = 'srt-mono' | 'srt-bilingual' | 'plaintext' | 'etide' | 'pdf'
type PdfPageSize = 'a4' | 'letter' | '16:9'

interface ExportDialogProps {
  projectId: string
  projectName: string
  languages: LangCode[]
  primaryLanguage: LangCode
  lines: SubtitleLine[]
  onClose: () => void
}

function triggerDownload(content: string, filename: string, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function countExportableLines(lines: SubtitleLine[], lang?: LangCode): number {
  return lines.filter(l => {
    if (l.deletedAt || l.skip) return false
    if (l.type === 'blackout' || l.type === 'comment' || l.type === 'media') return false
    if (lang) return !!l.translations[lang]?.trim()
    return true
  }).length
}

function parseColor(color: string): [number, number, number] {
  const hex = color.trim()
  if (hex.startsWith('#')) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return [isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b]
  }
  const rgba = hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (rgba) return [parseInt(rgba[1] ?? '0'), parseInt(rgba[2] ?? '0'), parseInt(rgba[3] ?? '0')]
  return [0, 0, 0]
}

function pageDimensions(size: PdfPageSize): [number, number] {
  if (size === 'a4') return [297, 210]
  if (size === 'letter') return [279.4, 215.9]
  return [304.8, 171.45] // 16:9 at 12 inches wide
}

function exportPdf(
  lines: SubtitleLine[],
  primaryLanguage: LangCode,
  projectName: string,
  style: ProjectionStyle,
  pageSize: PdfPageSize,
): void {
  const [pageW, pageH] = pageDimensions(pageSize)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [pageW, pageH] })

  const [bgR, bgG, bgB] = parseColor(
    style.backgroundColor === 'transparent' ? '#000000' : style.backgroundColor,
  )
  const [fgR, fgG, fgB] = parseColor(style.textColor)

  const exportableLines = lines.filter(l => {
    if (l.deletedAt || l.skip) return false
    if (l.type === 'comment' || l.type === 'blackout') return false
    return !!l.translations[primaryLanguage]?.trim()
  })

  const total = exportableLines.length
  const fontSizePt = Math.round(style.fontSizePx / 1.33)
  const headerFontPt = 7
  const padding = (style.paddingPx / 1.33) * 0.352778 // px → mm

  exportableLines.forEach((line, idx) => {
    if (idx > 0) doc.addPage([pageW, pageH], 'landscape')

    doc.setFillColor(bgR, bgG, bgB)
    doc.rect(0, 0, pageW, pageH, 'F')

    // Header: project name + line number
    doc.setFontSize(headerFontPt)
    doc.setTextColor(Math.min(fgR + 60, 255), Math.min(fgG + 60, 255), Math.min(fgB + 60, 255))
    doc.text(`${projectName}   ${idx + 1} / ${total}`, padding, padding + 2)

    // Main text
    doc.setFontSize(fontSizePt)
    doc.setTextColor(fgR, fgG, fgB)

    const text = line.translations[primaryLanguage] ?? ''
    const maxWidth = pageW - padding * 2

    const jsPdfAlign = style.textAlign === 'left' ? 'left' : style.textAlign === 'right' ? 'right' : 'center'
    let textX: number
    if (style.textAlign === 'left') textX = padding
    else if (style.textAlign === 'right') textX = pageW - padding
    else textX = pageW / 2

    const lines2d = doc.splitTextToSize(text, maxWidth) as string[]
    const lineHeightMm = (fontSizePt * 0.352778) * style.lineHeight
    const blockH = lines2d.length * lineHeightMm

    let textY: number
    if (style.verticalAlign === 'top') {
      textY = padding + 8 + lineHeightMm
    } else if (style.verticalAlign === 'bottom') {
      textY = pageH - padding - blockH + lineHeightMm
    } else {
      textY = (pageH - blockH) / 2 + lineHeightMm
    }

    doc.text(lines2d, textX, textY, { align: jsPdfAlign, lineHeightFactor: style.lineHeight })

    // Footer: line type indicator for media lines
    if (line.type === 'media') {
      doc.setFontSize(headerFontPt)
      doc.setTextColor(Math.min(fgR + 60, 255), Math.min(fgG + 60, 255), Math.min(fgB + 60, 255))
      doc.text('[MEDIA]', pageW - padding, pageH - padding * 0.5, { align: 'right' })
    }
  })

  doc.save(`${projectName}_projection.pdf`)
}

export function ExportDialog({
  projectId,
  projectName,
  languages,
  primaryLanguage,
  lines,
  onClose,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('srt-mono')
  const [lang, setLang] = useState<LangCode>(primaryLanguage)
  const [secondaryLang, setSecondaryLang] = useState<LangCode>(
    languages.find(l => l !== primaryLanguage) ?? primaryLanguage,
  )
  const [pdfPageSize, setPdfPageSize] = useState<PdfPageSize>('a4')
  const [exporting, setExporting] = useState(false)

  const project = useLiveQuery(() => db.projects.get(projectId), [projectId])

  const projectionStyle: ProjectionStyle =
    project?.projectorWindows?.[0]?.style ?? project?.defaultStyle ?? DEFAULT_PROJECTION_STYLE

  const lineCount = format === 'etide'
    ? lines.filter(l => !l.deletedAt).length
    : format === 'pdf'
      ? lines.filter(l => !l.deletedAt && !l.skip && l.type !== 'comment' && l.type !== 'blackout' && !!l.translations[primaryLanguage]?.trim()).length
      : countExportableLines(lines, lang)

  const handleExport = () => {
    setExporting(true)
    setTimeout(() => {
      try {
        if (format === 'pdf') {
          exportPdf(lines, primaryLanguage, projectName, projectionStyle, pdfPageSize)
          onClose()
          return
        }

        let content: string
        let filename: string

        if (format === 'srt-mono') {
          content = exportSrtMono(lines, lang)
          filename = `${projectName}_${lang}.srt`
        } else if (format === 'srt-bilingual') {
          content = exportSrtBilingual(lines, lang, secondaryLang)
          filename = `${projectName}_${lang}-${secondaryLang}.srt`
        } else if (format === 'plaintext') {
          content = exportPlaintext(lines, lang)
          filename = `${projectName}.txt`
        } else {
          content = exportEtide(lines, projectName, languages)
          filename = `${projectName}.etide`
        }

        triggerDownload(content, filename)
        onClose()
      } finally {
        setExporting(false)
      }
    }, 0)
  }

  const FORMAT_OPTIONS: { id: ExportFormat; label: string; description: string }[] = [
    { id: 'srt-mono', label: 'SRT (single language)', description: 'Standard subtitle file for one language' },
    { id: 'srt-bilingual', label: 'SRT bilingual', description: 'Two languages stacked per cue' },
    { id: 'plaintext', label: 'Plain text', description: 'One line per subtitle, no timecodes' },
    { id: 'etide', label: 'Elegant Tide (.etide)', description: 'Full round-trip export — preserves all data' },
    { id: 'pdf', label: 'PDF (Projector style)', description: 'One page per subtitle line, styled for projection' },
  ]

  const secondaryLangOptions = languages.filter(l => l !== lang)

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <FileDown size={16} className="text-slate-400" />
            <h2 className="font-semibold text-white">Export Script</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Format picker */}
          <div className="space-y-2">
            {FORMAT_OPTIONS.map(opt => (
              <label
                key={opt.id}
                className={clsx(
                  'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                  format === opt.id
                    ? 'border-brand-500 bg-brand-950/20'
                    : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/40',
                )}
              >
                <input
                  type="radio"
                  name="export-format"
                  value={opt.id}
                  checked={format === opt.id}
                  onChange={() => setFormat(opt.id)}
                  className="mt-0.5 accent-brand-500"
                />
                <div>
                  <p className="text-sm font-medium text-white">{opt.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Language pickers */}
          {(format === 'srt-mono' || format === 'plaintext') && (
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400 flex-shrink-0">Language:</label>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as LangCode)}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 outline-none"
              >
                {languages.map(l => (
                  <option key={l} value={l}>{LANG_LABELS[l]}</option>
                ))}
              </select>
            </div>
          )}

          {format === 'srt-bilingual' && (
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm text-slate-400 flex-shrink-0">Primary:</label>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as LangCode)}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 outline-none"
              >
                {languages.map(l => (
                  <option key={l} value={l}>{LANG_LABELS[l]}</option>
                ))}
              </select>
              <label className="text-sm text-slate-400 flex-shrink-0">Secondary:</label>
              <select
                value={secondaryLang}
                onChange={(e) => setSecondaryLang(e.target.value as LangCode)}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 outline-none"
                disabled={secondaryLangOptions.length === 0}
              >
                {secondaryLangOptions.length > 0
                  ? secondaryLangOptions.map(l => (
                    <option key={l} value={l}>{LANG_LABELS[l]}</option>
                  ))
                  : <option value={lang}>{LANG_LABELS[lang]} (only one language)</option>
                }
              </select>
            </div>
          )}

          {/* PDF page size picker */}
          {format === 'pdf' && (
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400 flex-shrink-0">Page size:</label>
              <div className="flex gap-1">
                {(['a4', 'letter', '16:9'] as PdfPageSize[]).map(size => (
                  <button
                    key={size}
                    onClick={() => setPdfPageSize(size)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-xs transition-colors',
                      pdfPageSize === size
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700',
                    )}
                  >
                    {size === '16:9' ? '16:9 (Presentation)' : size.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Line count summary */}
          <p className="text-xs text-slate-500">
            {lineCount === 1 ? '1 line' : `${lineCount} lines`} will be exported
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="text-sm text-slate-400 hover:text-white transition-colors px-4 py-2"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={lineCount === 0 || exporting}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors"
          >
            {exporting
              ? <Loader2 size={14} className="animate-spin" />
              : <Download size={14} />
            }
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
