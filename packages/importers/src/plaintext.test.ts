import { describe, it, expect } from 'vitest'
import { parsePlaintext } from './plaintext.ts'

describe('parsePlaintext', () => {
  it('splits on newlines and produces one entry per non-empty line', () => {
    const raw = `First line
Second line
Third line`
    const lines = parsePlaintext(raw)
    expect(lines).toHaveLength(3)
    expect(lines.map((l) => l.text)).toEqual(['First line', 'Second line', 'Third line'])
  })

  it('does not produce timecodes', () => {
    const lines = parsePlaintext('Hello')
    expect(lines[0]?.timecode).toBeUndefined()
  })

  it('skips empty and whitespace-only lines', () => {
    const raw = `One


Two
`
    const lines = parsePlaintext(raw)
    expect(lines.map((l) => l.text)).toEqual(['One', 'Two'])
  })

  it('trims whitespace from each line', () => {
    const lines = parsePlaintext('   padded   ')
    expect(lines[0]?.text).toBe('padded')
  })

  it('normalises Windows line endings', () => {
    const lines = parsePlaintext('a\r\nb\r\nc')
    expect(lines.map((l) => l.text)).toEqual(['a', 'b', 'c'])
  })

  it('returns an empty array for empty input', () => {
    expect(parsePlaintext('')).toEqual([])
  })
})
