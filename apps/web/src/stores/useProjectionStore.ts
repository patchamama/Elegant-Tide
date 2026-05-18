import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { SubtitleLine } from '@elegant-tide/core-types'

interface ProjectionStore {
  currentLineId: string | null
  lines: SubtitleLine[]
  blackout: boolean
  freeze: boolean
  openWindowIds: string[]

  setLines: (lines: SubtitleLine[]) => void
  goTo: (lineId: string) => void
  next: () => void
  prev: () => void
  toggleBlackout: () => void
  toggleFreeze: () => void
  registerWindow: (windowId: string) => void
  unregisterWindow: (windowId: string) => void
}

export const useProjectionStore = create<ProjectionStore>()(
  subscribeWithSelector((set, get) => ({
    currentLineId: null,
    lines: [],
    blackout: false,
    freeze: false,
    openWindowIds: [],

    setLines: (lines) => set({ lines }),

    goTo: (lineId) => {
      if (get().freeze) return
      set({ currentLineId: lineId })
    },

    next: () => {
      const { lines, currentLineId, freeze } = get()
      if (freeze) return
      const visibleLines = lines.filter((l) => l.type !== 'comment')
      const idx = visibleLines.findIndex((l) => l.id === currentLineId)
      const nextLine = visibleLines[idx + 1]
      if (nextLine) set({ currentLineId: nextLine.id })
    },

    prev: () => {
      const { lines, currentLineId, freeze } = get()
      if (freeze) return
      const visibleLines = lines.filter((l) => l.type !== 'comment')
      const idx = visibleLines.findIndex((l) => l.id === currentLineId)
      const prevLine = visibleLines[idx - 1]
      if (prevLine) set({ currentLineId: prevLine.id })
    },

    toggleBlackout: () => set((s) => ({ blackout: !s.blackout })),
    toggleFreeze: () => set((s) => ({ freeze: !s.freeze })),

    registerWindow: (windowId) =>
      set((s) => ({ openWindowIds: [...new Set([...s.openWindowIds, windowId])] })),

    unregisterWindow: (windowId) =>
      set((s) => ({ openWindowIds: s.openWindowIds.filter((id) => id !== windowId) })),
  })),
)
