import { useRef, useCallback, useEffect, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useState } from 'react'
import type { SubtitleLine, LangCode, CueMarker } from '@elegant-tide/core-types'
import { useEditorStore } from '@/stores/useEditorStore'
import { midOrder } from '@elegant-tide/db'
import { LineRow, type OpenRange } from './LineRow'
import { LineRowOverlay } from './LineRowOverlay'

interface LineListProps {
  lines: SubtitleLine[]
  languages: LangCode[]
  primaryLang: LangCode
  projectId: string
  showNotes?: boolean
  searchQuery?: string
  selectedColumn?: string | null
  activeMatchLineId?: string | null
  activeMatchIndex?: number | null
  bookmarkLineId?: string | null
  onBookmark?: (lineId: string) => void
  canEditSubtitles?: boolean
  canEditComments?: boolean
  followLineId?: string | null
  isFollowing?: boolean
}

export function LineList({ lines, languages, primaryLang, projectId, showNotes = false, searchQuery = '', selectedColumn = null, activeMatchLineId = null, activeMatchIndex = null, bookmarkLineId = null, onBookmark, canEditSubtitles = true, canEditComments = true, followLineId = null, isFollowing = false }: LineListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const { selectedIds, reorderLine } = useEditorStore()
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }, // require 6px drag before activating
    }),
  )

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88,
    overscan: 8,
  })

  useEffect(() => {
    if (activeMatchIndex !== null) {
      virtualizer.scrollToIndex(activeMatchIndex, { align: 'center', behavior: 'smooth' })
    }
  }, [activeMatchIndex, activeMatchLineId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bookmark on mount (once, deferred so virtualizer has measured)
  const didScrollToBookmark = useRef(false)
  useEffect(() => {
    if (didScrollToBookmark.current || !bookmarkLineId || lines.length === 0) return
    const idx = lines.findIndex((l) => l.id === bookmarkLineId)
    if (idx === -1) return
    didScrollToBookmark.current = true
    // Defer two frames: first frame measures items, second scrolls
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' })
      })
    })
  }, [lines, bookmarkLineId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute open ranges at each line index (for range highlight indicators)
  const openRangesPerLine = useMemo((): OpenRange[][] => {
    const result: OpenRange[][] = new Array(lines.length).fill(null).map(() => [])
    const openMap = new Map<string, OpenRange>() // rangeId → OpenRange

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      const cues: CueMarker[] = line.cues ?? []

      // Ranges open BEFORE processing this line are the open ranges FOR this line
      result[i] = [...openMap.values()]

      for (const cue of cues) {
        if (cue.markerType === 'range-start' && cue.rangeId) {
          openMap.set(cue.rangeId, { rangeId: cue.rangeId, kind: cue.kind, name: cue.name, startLineId: line.id })
        } else if (cue.markerType === 'range-end' && cue.rangeId) {
          openMap.delete(cue.rangeId)
        }
      }
    }
    return result
  }, [lines])

  // Auto-scroll to current projection line when following
  useEffect(() => {
    if (!isFollowing || !followLineId) return
    const idx = lines.findIndex((l) => l.id === followLineId)
    if (idx === -1) return
    virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' })
  }, [isFollowing, followLineId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggingId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingId(null)
      const { active, over } = event
      if (!over || active.id === over.id) return

      const activeIdx = lines.findIndex((l) => l.id === active.id)
      const overIdx = lines.findIndex((l) => l.id === over.id)
      if (activeIdx === -1 || overIdx === -1) return

      // Moving down: insert after overIdx; moving up: insert before overIdx
      const movingDown = activeIdx < overIdx
      const prevLine = movingDown ? lines[overIdx] : lines[overIdx - 1]
      const nextLine = movingDown ? lines[overIdx + 1] : lines[overIdx]

      let newOrder: number
      if (!prevLine) {
        newOrder = (lines[0]?.order ?? 1024) / 2
      } else if (!nextLine) {
        newOrder = (prevLine.order ?? 0) + 1024
      } else {
        newOrder = midOrder(prevLine.order, nextLine.order)
      }

      void reorderLine(String(active.id), newOrder)
    },
    [lines, reorderLine],
  )

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
        <p className="text-sm">No subtitle lines yet.</p>
        <p className="text-xs">Use "Add line" in the toolbar, or import a script.</p>
      </div>
    )
  }

  const draggingLine = draggingId ? lines.find((l) => l.id === draggingId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={lines.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <div ref={parentRef} data-testid="line-list" className="h-full overflow-auto">
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vItem) => {
              const line = lines[vItem.index]
              if (!line) return null
              return (
                <div
                  key={line.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${vItem.start}px)`,
                  }}
                  ref={virtualizer.measureElement}
                  data-index={vItem.index}
                >
                  <LineRow
                    line={line}
                    languages={languages}
                    primaryLang={primaryLang}
                    projectId={projectId}
                    isSelected={selectedIds.has(line.id)}
                    index={vItem.index}
                    isDragging={line.id === draggingId}
                    showNotes={showNotes}
                    searchQuery={searchQuery}
                    selectedColumn={selectedColumn}
                    isActiveMatch={line.id === activeMatchLineId}
                    isBookmarked={line.id === bookmarkLineId}
                    onBookmark={onBookmark}
                    canEditSubtitles={canEditSubtitles}
                    canEditComments={canEditComments}
                    openRanges={openRangesPerLine[vItem.index] ?? []}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </SortableContext>

      {/* Drag overlay — shown while dragging, not affected by virtual scroll */}
      <DragOverlay dropAnimation={null}>
        {draggingLine && (
          <LineRowOverlay line={draggingLine} languages={languages} />
        )}
      </DragOverlay>
    </DndContext>
  )
}
