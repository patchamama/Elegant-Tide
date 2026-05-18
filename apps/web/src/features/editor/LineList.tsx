import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SubtitleLine, LangCode } from '@elegant-tide/core-types'
import { LineRow } from './LineRow'
import { useEditorStore } from '@/stores/useEditorStore'

interface LineListProps {
  lines: SubtitleLine[]
  languages: LangCode[]
  projectId: string
}

export function LineList({ lines, languages, projectId }: LineListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const { selectedIds } = useEditorStore()

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88,
    overscan: 8,
  })

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
        <p className="text-sm">No subtitle lines yet.</p>
        <p className="text-xs">Use "Add line" in the toolbar to start, or import a script.</p>
      </div>
    )
  }

  return (
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
                projectId={projectId}
                isSelected={selectedIds.has(line.id)}
                index={vItem.index}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
