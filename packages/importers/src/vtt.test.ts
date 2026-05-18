import { describe, it, expect } from 'vitest'
import { parseVtt } from './vtt.ts'

describe('parseVtt', () => {
  it('parses a basic WebVTT cue', () => {
    const raw = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world.`
    const lines = parseVtt(raw)
    expect(lines).toHaveLength(1)
    expect(lines[0]?.text).toBe('Hello world.')
    expect(lines[0]?.timecode).toEqual({ startMs: 1000, endMs: 4000 })
  })

  it('skips WEBVTT, NOTE, STYLE, and REGION blocks', () => {
    const raw = `WEBVTT

NOTE This is a note

STYLE
::cue { color: red; }

REGION
id:fred
width:40%

00:00:01.000 --> 00:00:04.000
Real cue.`
    const lines = parseVtt(raw)
    expect(lines).toHaveLength(1)
    expect(lines[0]?.text).toBe('Real cue.')
  })

  it('handles optional cue identifiers', () => {
    const raw = `WEBVTT

cue-1
00:00:01.000 --> 00:00:04.000
With identifier.`
    const lines = parseVtt(raw)
    expect(lines).toHaveLength(1)
    expect(lines[0]?.text).toBe('With identifier.')
  })

  it('parses MM:SS.mmm format', () => {
    const raw = `WEBVTT

01:23.456 --> 01:25.000
Short format.`
    const lines = parseVtt(raw)
    expect(lines).toHaveLength(1)
    const expected = (1 * 60 + 23) * 1000 + 456
    expect(lines[0]?.timecode?.startMs).toBe(expected)
  })

  it('strips inline HTML tags', () => {
    const raw = `WEBVTT

00:00:01.000 --> 00:00:04.000
<c.classname>Styled</c> text.`
    const lines = parseVtt(raw)
    expect(lines[0]?.text).toBe('Styled text.')
  })

  it('normalises CRLF and CR line endings', () => {
    const raw = 'WEBVTT\r\n\r\n00:00:01.000 --> 00:00:04.000\r\nHello.'
    const lines = parseVtt(raw)
    expect(lines).toHaveLength(1)
    expect(lines[0]?.text).toBe('Hello.')
  })

  it('returns an empty array for empty input', () => {
    expect(parseVtt('')).toEqual([])
  })
})
