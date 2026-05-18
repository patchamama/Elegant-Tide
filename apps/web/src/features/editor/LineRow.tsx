import { useState, useCallback } from 'react'
import type { SubtitleLine, LangCode } from '@elegant-tide/core-types'
import { useEditorStore } from '@/stores/useEditorStore'
import { MessageSquare, Film, AlignLeft, Scissors, Merge, Plus, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'

interface LineRowProps {
  line: SubtitleLine
  languages: LangCode[]
  projectId: string
  isSelected: boolean
  index: number
}

const TYPE_ICONS = {
  subtitle: AlignLeft,
  comment: MessageSquare,
  media: Film,
} as const

const TYPE_COLORS = {
  subtitle: 'text-slate-400',
  comment: 'text-amber-400',
  media: 'text-purple-400',
} as const

export function LineRow({ line, languages, projectId, isSelected, index }: LineRowProps) {
  const {
    selectLine,
    updateTranslation,
    updateLineType,
    deleteLine,
    insertLineBefore,
    insertLineAfter,
    splitLine,
    joinLines,
    selectedIds,
  } = useEditorStore()

  const [showMenu, setShowMenu] = useState(false)
  const [splitMode, setSplitMode] = useState<{ lang: LangCode } | null>(null)
  const [splitPreview, setSplitPreview] = useState<number | null>(null)

  const TypeIcon = TYPE_ICONS[line.type]

  const handleTextChange = useCallback(
    (lang: LangCode, text: string) => {
      void updateTranslation(line.id, lang, text)
    },
    [line.id, updateTranslation],
  )

  const handleSplit = (lang: LangCode) => {
    if (splitPreview === null) return
    void splitLine(line.id, lang, splitPreview)
    setSplitMode(null)
    setSplitPreview(null)
  }

  const bgColor =
    line.type === 'comment'
      ? 'bg-amber-950/20 border-amber-900/30'
      : line.type === 'media'
        ? 'bg-purple-950/20 border-purple-900/30'
        : isSelected
          ? 'bg-brand-900/20 border-brand-700/40'
          : 'bg-slate-900/50 border-slate-800'

  return (
    <div
      className={clsx(
        'group flex items-start gap-1 px-4 py-2 border-b transition-colors cursor-pointer',
        bgColor,
      )}
      onClick={() => selectLine(line.id, false)}
    >
      {/* Line number */}
      <div className="w-8 pt-2 text-xs text-slate-600 text-right select-none flex-shrink-0">
        {index + 1}
      </div>

      {/* Type icon */}
      <div className="w-8 pt-2 flex-shrink-0 flex justify-center">
        <TypeIcon size={14} className={TYPE_COLORS[line.type]} />
      </div>

      {/* Translation cells */}
      {line.type === 'comment' ? (
        <div className="flex-1 pt-1">
          <textarea
            value={line.comment ?? ''}
            onChange={(e) =>
              void updateTranslation(line.id, languages[0] ?? 'en', e.target.value)
            }
            rows={2}
            placeholder="Stage direction / comment (not projected)…"
            className="w-full bg-transparent text-amber-300/80 text-sm resize-none outline-none placeholder-amber-900/50 italic"
          />
        </div>
      ) : (
        languages.map((lang) => {
          const text = line.translations[lang] ?? ''
          const isSplitTarget = splitMode?.lang === lang

          return (
            <div key={lang} className="flex-1 relative">
              {isSplitTarget ? (
                // Split preview mode
                <div
                  className="relative cursor-text select-none"
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const x = e.clientX - rect.left
                    const fraction = x / rect.width
                    setSplitPreview(Math.floor(text.length * fraction))
                  }}
                  onClick={() => handleSplit(lang)}
                >
                  <span className="text-sm text-white whitespace-pre-wrap">
                    <span className="bg-brand-600/40">{text.slice(0, splitPreview ?? 0)}</span>
                    <span className="border-l-2 border-brand-400" />
                    <span className="bg-slate-600/40">{text.slice(splitPreview ?? 0)}</span>
                  </span>
                  <p className="text-xs text-brand-400 mt-1">Click to confirm split · Esc to cancel</p>
                </div>
              ) : (
                <textarea
                  value={text}
                  onChange={(e) => handleTextChange(lang, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && splitMode) {
                      setSplitMode(null)
                      setSplitPreview(null)
                    }
                  }}
                  rows={2}
                  placeholder={`[${lang.toUpperCase()}]`}
                  className="w-full bg-transparent text-slate-100 text-sm resize-none outline-none placeholder-slate-700 focus:bg-slate-800/40 rounded px-1 transition-colors"
                />
              )}
            </div>
          )
        })
      )}

      {/* Actions */}
      <div className="w-24 pt-1 flex-shrink-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {line.type === 'subtitle' && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSplitMode({ lang: languages[0] ?? 'en' })
            }}
            title="Split line"
            className="p-1 text-slate-500 hover:text-white rounded"
          >
            <Scissors size={13} />
          </button>
        )}
        {selectedIds.size >= 2 && isSelected && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              void joinLines([...selectedIds])
            }}
            title="Join selected lines"
            className="p-1 text-slate-500 hover:text-white rounded"
          >
            <Merge size={13} />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            void insertLineAfter(line.id, projectId)
          }}
          title="Insert after"
          className="p-1 text-slate-500 hover:text-white rounded"
        >
          <Plus size={13} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (confirm('Delete this line?')) void deleteLine(line.id)
          }}
          title="Delete line"
          className="p-1 text-slate-500 hover:text-red-400 rounded"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}
