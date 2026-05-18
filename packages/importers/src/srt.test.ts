import { describe, it, expect } from 'vitest'
import { parseSrt } from './srt.ts'

describe('parseSrt', () => {
  it('parses a basic SRT block', () => {
    const raw = `1
00:00:01,000 --> 00:00:04,000
Hello world.`
    const lines = parseSrt(raw)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual({
      text: 'Hello world.',
      timecode: { startMs: 1000, endMs: 4000 },
    })
  })

  it('parses multiple SRT blocks separated by blank lines', () => {
    const raw = `1
00:00:01,000 --> 00:00:04,000
First line.

2
00:00:05,500 --> 00:00:08,250
Second line.`
    const lines = parseSrt(raw)
    expect(lines).toHaveLength(2)
    expect(lines[0]?.text).toBe('First line.')
    expect(lines[1]?.text).toBe('Second line.')
    expect(lines[1]?.timecode).toEqual({ startMs: 5500, endMs: 8250 })
  })

  it('strips HTML tags from text', () => {
    const raw = `1
00:00:01,000 --> 00:00:04,000
<i>Italic</i> and <b>bold</b>.`
    const lines = parseSrt(raw)
    expect(lines[0]?.text).toBe('Italic and bold.')
  })

  it('joins multi-line subtitle text with newlines', () => {
    const raw = `1
00:00:01,000 --> 00:00:04,000
Line one
Line two`
    const lines = parseSrt(raw)
    expect(lines[0]?.text).toBe('Line one\nLine two')
  })

  it('normalises Windows line endings', () => {
    const raw = '1\r\n00:00:01,000 --> 00:00:04,000\r\nHello.'
    const lines = parseSrt(raw)
    expect(lines).toHaveLength(1)
    expect(lines[0]?.text).toBe('Hello.')
  })

  it('skips blocks without a valid timecode', () => {
    const raw = `1
not a timecode
Some text.

2
00:00:05,000 --> 00:00:08,000
Valid line.`
    const lines = parseSrt(raw)
    expect(lines).toHaveLength(1)
    expect(lines[0]?.text).toBe('Valid line.')
  })

  it('skips blocks with empty text after stripping', () => {
    const raw = `1
00:00:01,000 --> 00:00:04,000
<b></b>

2
00:00:05,000 --> 00:00:08,000
Real content.`
    const lines = parseSrt(raw)
    expect(lines).toHaveLength(1)
    expect(lines[0]?.text).toBe('Real content.')
  })

  it('returns an empty array for empty input', () => {
    expect(parseSrt('')).toEqual([])
  })

  it('converts hours, minutes, seconds, and milliseconds correctly', () => {
    const raw = `1
01:02:03,456 --> 01:02:04,000
Time test.`
    const lines = parseSrt(raw)
    const expected = (1 * 3600 + 2 * 60 + 3) * 1000 + 456
    expect(lines[0]?.timecode?.startMs).toBe(expected)
  })
})
