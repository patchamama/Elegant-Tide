import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { SubtitleLine, LineType, Translations, LangCode } from '@elegant-tide/core-types'
import { linesRepo, midOrder, initialOrder, ORDER_GAP } from '@elegant-tide/db'

interface EditorStore {
  lines: SubtitleLine[]
  selectedIds: Set<string>
  loading: boolean

  loadLines: (projectId: string) => Promise<void>
  selectLine: (id: string, multi?: boolean) => void
  clearSelection: () => void

  addLine: (projectId: string, type?: LineType) => Promise<SubtitleLine>
  insertLineBefore: (refId: string, projectId: string) => Promise<SubtitleLine>
  insertLineAfter: (refId: string, projectId: string) => Promise<SubtitleLine>
  updateTranslation: (id: string, lang: LangCode, text: string) => Promise<void>
  updateLineType: (id: string, type: LineType) => Promise<void>
  deleteLine: (id: string) => Promise<void>
  splitLine: (id: string, lang: LangCode, splitIndex: number) => Promise<void>
  joinLines: (ids: string[]) => Promise<void>
  reorderLine: (id: string, newOrder: number) => Promise<void>
}

function makeLine(projectId: string, order: number, type: LineType = 'subtitle'): SubtitleLine {
  return {
    id: crypto.randomUUID(),
    projectId,
    type,
    order,
    translations: {},
    updatedAt: Date.now(),
    updatedBy: 'local',
    version: -1,
  }
}

export const useEditorStore = create<EditorStore>()(
  subscribeWithSelector((set, get) => ({
    lines: [],
    selectedIds: new Set(),
    loading: false,

    loadLines: async (projectId) => {
      set({ loading: true })
      const lines = await linesRepo.listByProject(projectId)
      set({ lines, loading: false })
    },

    selectLine: (id, multi = false) => {
      set((s) => {
        const next = new Set(multi ? s.selectedIds : [])
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { selectedIds: next }
      })
    },

    clearSelection: () => set({ selectedIds: new Set() }),

    addLine: async (projectId, type = 'subtitle') => {
      const maxOrder = await linesRepo.maxOrder(projectId)
      const line = makeLine(projectId, maxOrder + ORDER_GAP, type)
      await linesRepo.upsert(line)
      set((s) => ({ lines: [...s.lines, line] }))
      return line
    },

    insertLineBefore: async (refId, projectId) => {
      const { lines } = get()
      const idx = lines.findIndex((l) => l.id === refId)
      const ref = lines[idx]
      if (!ref) return makeLine(projectId, ORDER_GAP)
      const prev = lines[idx - 1]
      const order = prev ? midOrder(prev.order, ref.order) : ref.order - ORDER_GAP / 2
      const line = makeLine(projectId, order)
      await linesRepo.upsert(line)
      const next = [...lines]
      next.splice(idx, 0, line)
      set({ lines: next })
      return line
    },

    insertLineAfter: async (refId, projectId) => {
      const { lines } = get()
      const idx = lines.findIndex((l) => l.id === refId)
      const ref = lines[idx]
      if (!ref) return makeLine(projectId, ORDER_GAP)
      const next_ = lines[idx + 1]
      const order = next_ ? midOrder(ref.order, next_.order) : ref.order + ORDER_GAP
      const line = makeLine(projectId, order)
      await linesRepo.upsert(line)
      const next = [...lines]
      next.splice(idx + 1, 0, line)
      set({ lines: next })
      return line
    },

    updateTranslation: async (id, lang, text) => {
      const line = get().lines.find((l) => l.id === id)
      if (!line) return
      const updated: SubtitleLine = {
        ...line,
        translations: { ...line.translations, [lang]: text },
        updatedAt: Date.now(),
      }
      await linesRepo.upsert(updated)
      set((s) => ({ lines: s.lines.map((l) => (l.id === id ? updated : l)) }))
    },

    updateLineType: async (id, type) => {
      const line = get().lines.find((l) => l.id === id)
      if (!line) return
      const updated: SubtitleLine = { ...line, type, updatedAt: Date.now() }
      await linesRepo.upsert(updated)
      set((s) => ({ lines: s.lines.map((l) => (l.id === id ? updated : l)) }))
    },

    deleteLine: async (id) => {
      await linesRepo.softDelete(id)
      set((s) => ({ lines: s.lines.filter((l) => l.id !== id) }))
    },

    splitLine: async (id, lang, splitIndex) => {
      const { lines } = get()
      const idx = lines.findIndex((l) => l.id === id)
      const line = lines[idx]
      if (!line) return

      const sourceText = line.translations[lang] ?? ''
      const textA = sourceText.slice(0, splitIndex).trimEnd()
      const textB = sourceText.slice(splitIndex).trimStart()

      const next_ = lines[idx + 1]
      const newOrder = next_ ? midOrder(line.order, next_.order) : line.order + ORDER_GAP

      const updatedLine: SubtitleLine = {
        ...line,
        translations: { ...line.translations, [lang]: textA },
        updatedAt: Date.now(),
      }
      const newLine: SubtitleLine = {
        ...makeLine(line.projectId, newOrder),
        translations: { [lang]: textB } as Translations,
      }

      await linesRepo.upsert(updatedLine)
      await linesRepo.upsert(newLine)

      const next = [...lines]
      next[idx] = updatedLine
      next.splice(idx + 1, 0, newLine)
      set({ lines: next })
    },

    joinLines: async (ids) => {
      if (ids.length < 2) return
      const { lines } = get()
      const toJoin = ids
        .map((id) => lines.find((l) => l.id === id))
        .filter(Boolean) as SubtitleLine[]

      // Merge translations: concatenate per language with a space
      const mergedTranslations: Translations = {}
      for (const line of toJoin) {
        for (const [lang, text] of Object.entries(line.translations) as [LangCode, string][]) {
          mergedTranslations[lang] = mergedTranslations[lang]
            ? `${mergedTranslations[lang]} ${text}`
            : text
        }
      }

      const firstLine = toJoin[0]!
      const updated: SubtitleLine = {
        ...firstLine,
        translations: mergedTranslations,
        updatedAt: Date.now(),
      }

      await linesRepo.upsert(updated)
      const deleteIds = ids.slice(1)
      await Promise.all(deleteIds.map((id) => linesRepo.softDelete(id)))

      set((s) => ({
        lines: s.lines
          .filter((l) => !deleteIds.includes(l.id))
          .map((l) => (l.id === firstLine.id ? updated : l)),
        selectedIds: new Set(),
      }))
    },

    reorderLine: async (id, newOrder) => {
      const line = get().lines.find((l) => l.id === id)
      if (!line) return
      const updated: SubtitleLine = { ...line, order: newOrder, updatedAt: Date.now() }
      await linesRepo.upsert(updated)
      set((s) => ({
        lines: s.lines.map((l) => (l.id === id ? updated : l)).sort((a, b) => a.order - b.order),
      }))
    },
  })),
)
