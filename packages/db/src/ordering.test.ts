import { describe, it, expect } from 'vitest'
import { ORDER_GAP, ORDER_MIN_GAP, midOrder, needsCompaction, initialOrder } from './index.ts'

describe('fractional ordering', () => {
  describe('initialOrder', () => {
    it('returns ORDER_GAP for the first item (index 0)', () => {
      expect(initialOrder(0)).toBe(ORDER_GAP)
    })

    it('returns multiples of ORDER_GAP for subsequent indices', () => {
      expect(initialOrder(1)).toBe(2 * ORDER_GAP)
      expect(initialOrder(2)).toBe(3 * ORDER_GAP)
      expect(initialOrder(99)).toBe(100 * ORDER_GAP)
    })

    it('uses a non-zero base so we can always insert before the first item', () => {
      // initialOrder(0) > 0 means midOrder(0, initialOrder(0)) is a valid slot
      expect(initialOrder(0)).toBeGreaterThan(0)
    })
  })

  describe('midOrder', () => {
    it('returns the midpoint between two orders', () => {
      expect(midOrder(0, 1024)).toBe(512)
      expect(midOrder(1024, 2048)).toBe(1536)
    })

    it('produces a value strictly between its arguments when there is room', () => {
      const result = midOrder(100, 200)
      expect(result).toBeGreaterThan(100)
      expect(result).toBeLessThan(200)
    })

    it('handles fractional inputs correctly', () => {
      expect(midOrder(512, 1024)).toBe(768)
      expect(midOrder(512, 768)).toBe(640)
    })

    it('repeated halving still yields unique values until precision runs out', () => {
      const prev = 0
      let next = ORDER_GAP
      for (let i = 0; i < 10; i++) {
        const mid = midOrder(prev, next)
        expect(mid).toBeGreaterThan(prev)
        expect(mid).toBeLessThan(next)
        next = mid
      }
    })
  })

  describe('needsCompaction', () => {
    it('returns false when the gap is wider than the minimum', () => {
      expect(needsCompaction(0, ORDER_GAP)).toBe(false)
      expect(needsCompaction(100, 102)).toBe(false)
    })

    it('returns true when the gap shrinks below ORDER_MIN_GAP', () => {
      expect(needsCompaction(100, 100.5)).toBe(true)
      expect(needsCompaction(100, 100)).toBe(true)
    })

    it('uses ORDER_MIN_GAP as the threshold', () => {
      expect(needsCompaction(0, ORDER_MIN_GAP - 0.1)).toBe(true)
      expect(needsCompaction(0, ORDER_MIN_GAP + 0.1)).toBe(false)
    })
  })

  describe('insertion scenarios', () => {
    it('insert at the end: append by adding ORDER_GAP to the last order', () => {
      const last = initialOrder(4) // 5 * 1024 = 5120
      const next = last + ORDER_GAP
      expect(next).toBe(6144)
    })

    it('insert at the start: prepend with midOrder(0, first)', () => {
      const first = initialOrder(0) // 1024
      const newOrder = midOrder(0, first)
      expect(newOrder).toBe(512)
      expect(newOrder).toBeGreaterThan(0)
      expect(newOrder).toBeLessThan(first)
    })

    it('insert between A and B: midOrder(A.order, B.order)', () => {
      const a = initialOrder(0) // 1024
      const b = initialOrder(1) // 2048
      const newOrder = midOrder(a, b)
      expect(newOrder).toBe(1536)
    })
  })
})
