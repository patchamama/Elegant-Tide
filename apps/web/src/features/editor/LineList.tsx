import { useRef, useCallback } from 'react'
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
import type { SubtitleLine, LangCode } from '@elegant-tide/core-types'
import { useEditorStore } from '@/stores/useEditorStore'
import { midOrder } from '@elegant-tide/db'
import { LineRow } from './LineRow'
import { LineRowOverlay } from './LineRowOverlay'

interface LineListProps {
  lines: SubtitleLine[]
  languages: LangCode[]
  primaryLang: LangCode
  projectId: string
}

export function LineList({ lines, languages, primaryLang, projectId }: LineListProps) {
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
        <div ref={parentRef} className="h-full overflow-auto">
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
