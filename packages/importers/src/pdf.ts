import type { ImportedLine } from './types.ts'

export async function parsePdf(buffer: ArrayBuffer): Promise<{ lines: ImportedLine[]; warnings: string[] }> {
  const pdfjsLib = await import('pdfjs-dist')

  // Use the bundled worker so we don't need an external URL
  const workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const warnings: string[] = []
  const rawLines: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .filter((item): item is typeof item & { str: string } => 'str' in item)
      .map((item) => item.str)
      .join(' ')
    const paragraphs = pageText.split(/\s{2,}|\n/).map((s) => s.trim()).filter(Boolean)
    rawLines.push(...paragraphs)
  }

  if (rawLines.length === 0) {
    warnings.push('No text found — the PDF may be scanned or image-based.')
  }

  const lines: ImportedLine[] = rawLines.map((text) => ({ text }))
  return { lines, warnings }
}
