import { jsPDF } from 'jspdf'
import type { SubtitleLine, LangCode, ProjectionStyle } from '@elegant-tide/core-types'

export type PdfPageSize = 'a4' | 'letter' | '16:9'

export function parseColor(color: string): [number, number, number] {
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

export function pageDimensions(size: PdfPageSize): [number, number] {
  if (size === 'a4') return [297, 210]
  if (size === 'letter') return [279.4, 215.9]
  return [304.8, 171.45]
}

export function exportPdf(
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
  const padding = (style.paddingPx / 1.33) * 0.352778

  exportableLines.forEach((line, idx) => {
    if (idx > 0) doc.addPage([pageW, pageH], 'landscape')

    doc.setFillColor(bgR, bgG, bgB)
    doc.rect(0, 0, pageW, pageH, 'F')

    doc.setFontSize(headerFontPt)
    doc.setTextColor(Math.min(fgR + 60, 255), Math.min(fgG + 60, 255), Math.min(fgB + 60, 255))
    doc.text(`${projectName}   ${idx + 1} / ${total}`, padding, padding + 2)

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

    if (line.type === 'media') {
      doc.setFontSize(headerFontPt)
      doc.setTextColor(Math.min(fgR + 60, 255), Math.min(fgG + 60, 255), Math.min(fgB + 60, 255))
      doc.text('[MEDIA]', pageW - padding, pageH - padding * 0.5, { align: 'right' })
    }
  })

  doc.save(`${projectName}_projection.pdf`)
}
