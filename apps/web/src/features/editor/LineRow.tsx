import { useState, useCallback, useRef } from 'react'
import { suggestTranslation } from '@/lib/translateApi'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SubtitleLine, LangCode, LineType, MediaSourceType } from '@elegant-tide/core-types'
import { useEditorStore } from '@/stores/useEditorStore'
import {
  MessageSquare,
  Film,
  AlignLeft,
  Scissors,
  Merge,
  Plus,
  Trash2,
  GripVertical,
  Check,
  X,
  Music,
  Youtube,
  Link,
  Sparkles,
  Loader2,
  Square,
} from 'lucide-react'
import { clsx } from 'clsx'

interface LineRowProps {
  line: SubtitleLine
  languages: LangCode[]
  primaryLang: LangCode
  projectId: string
  isSelected: boolean
  index: number
  isDragging?: boolean
  showNotes?: boolean
}

const TYPE_ICONS: Record<LineType, React.ElementType> = {
  subtitle: AlignLeft,
  comment: MessageSquare,
  media: Film,
  blackout: Square,
}

const TYPE_LABELS: Record<LineType, string> = {
  subtitle: 'Subtitle',
  comment: 'Comment',
  media: 'Media',
  blackout: 'Blackout',
}

const TYPE_COLORS: Record<LineType, string> = {
  subtitle: 'text-slate-400',
  comment: 'text-amber-400',
  media: 'text-purple-400',
  blackout: 'text-slate-600',
}

const MEDIA_SOURCES: { value: MediaSourceType; label: string; Icon: React.ElementType }[] = [
  { value: 'youtube', label: 'YouTube', Icon: Youtube },
  { value: 'vimeo', label: 'Vimeo', Icon: Film },
  { value: 'url-video', label: 'Video URL', Icon: Link },
  { value: 'url-audio', label: 'Audio URL', Icon: Music },
]

export function LineRow({
  line,
  languages,
  primaryLang,
  projectId,
  isSelected,
  index,
  isDragging = false,
  showNotes = false,
}: LineRowProps) {
  const {
    selectLine,
    updateTranslation,
    updateLineType,
    updateComment,
    deleteLine,
    insertLineAfter,
    splitLine,
    joinLines,
    selectedIds,
  } = useEditorStore()

  const { attributes, listeners, setNodeRef, transform, transition, isSorting } = useSortable({
    id: line.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isSorting ? transition : undefined,
    opacity: isDragging ? 0.35 : 1,
  }

  // Split state
  const [splitMode, setSplitMode] = useState<{ lang: LangCode; pos: number } | null>(null)
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})

  // Type picker dropdown
  const [showTypePicker, setShowTypePicker] = useState(false)

  const enterSplitMode = useCallback(
    (lang: LangCode) => {
      const textarea = textareaRefs.current[lang]
      const pos = textarea?.selectionStart ?? 0
      setSplitMode({ lang, pos })
    },
    [],
  )

  const confirmSplit = useCallback(() => {
    if (!splitMode) return
    void splitLine(line.id, splitMode.lang, splitMode.pos)
    setSplitMode(null)
  }, [splitMode, splitLine, line.id])

  const handleTypeChange = useCallback(
    (type: LineType) => {
      void updateLineType(line.id, type)
      setShowTypePicker(false)
    },
    [line.id, updateLineType],
  )

  const TypeIcon = TYPE_ICONS[line.type]

  const rowBg = isDragging
    ? 'bg-slate-800/50 border-slate-700'
    : line.type === 'comment'
      ? 'bg-amber-950/20 border-amber-900/20'
      : line.type === 'media'
        ? 'bg-purple-950/20 border-purple-900/20'
        : isSelected
          ? 'bg-brand-950/30 border-brand-800/40'
          : 'bg-transparent border-slate-800/60 hover:bg-slate-900/40'

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="line-row"
      className={clsx(
        'group flex items-start gap-1 px-3 py-2 border-b transition-colors',
        rowBg,
      )}
      onClick={() => selectLine(line.id, false)}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="w-5 pt-2.5 flex-shrink-0 text-slate-700 hover:text-slate-400 cursor-grab active:cursor-grabbing transition-colors opacity-0 group-hover:opacity-100"
      >
        <GripVertical size={14} />
      </div>

      {/* Line number */}
      <div className="w-7 pt-2.5 text-xs text-slate-700 text-right select-none flex-shrink-0 tabular-nums">
        {index + 1}
      </div>

      {/* Type icon + picker */}
      <div className="w-7 pt-2 flex-shrink-0 flex justify-center relative">
        <button
          onClick={(e) => { e.stopPropagation(); setShowTypePicker((v) => !v) }}
          className={clsx('transition-colors hover:opacity-70', TYPE_COLORS[line.type])}
          title={`Type: ${TYPE_LABELS[line.type]}`}
        >
          <TypeIcon size={13} />
        </button>
        {showTypePicker && (
          <div className="absolute left-0 top-6 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-30 py-1 min-w-32">
            {(['subtitle', 'comment', 'media'] as LineType[]).map((t) => {
              const Icon = TYPE_ICONS[t]
              return (
                <button
                  key={t}
                  onClick={(e) => { e.stopPropagation(); handleTypeChange(t) }}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-700 transition-colors',
                    line.type === t ? 'text-white' : 'text-slate-400',
                  )}
                >
                  <Icon size={12} className={TYPE_COLORS[t]} />
                  {TYPE_LABELS[t]}
                  {line.type === t && <Check size={11} className="ml-auto text-brand-400" />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Content cells */}
      <div className="flex-1 flex gap-1 min-w-0">
        {line.type === 'comment' ? (
          <CommentCell line={line} />
        ) : line.type === 'media' ? (
          <MediaCell line={line} />
        ) : line.type === 'blackout' ? (
          <div className="flex-1 flex items-center px-1 py-2">
            <span className="text-xs text-slate-700 italic select-none">— blackout —</span>
          </div>
        ) : (
          languages.map((lang) => (
            <SubtitleCell
              key={lang}
              line={line}
              lang={lang}
              primaryLang={primaryLang}
              splitMode={splitMode}
              onTextChange={(text) => void updateTranslation(line.id, lang, text)}
              onEnterSplitMode={() => enterSplitMode(lang)}
              onSplitPosChange={(pos) => setSplitMode((m) => m ? { ...m, pos } : null)}
              onConfirmSplit={confirmSplit}
              onCancelSplit={() => setSplitMode(null)}
              textareaRef={(el) => { textareaRefs.current[lang] = el }}
            />
          ))
        )}
      </div>

      {/* Notes column */}
      {showNotes && (
        <div className="w-44 flex-shrink-0">
          <textarea
            value={line.comment ?? ''}
            onChange={(e) => void updateComment(line.id, e.target.value)}
            rows={2}
            placeholder="Note…"
            className="w-full bg-transparent text-slate-500 text-xs italic resize-none outline-none placeholder-slate-700 focus:bg-slate-800/40 rounded px-1 py-0.5 transition-colors"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex-shrink-0 flex items-center gap-0.5 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {line.type === 'subtitle' && !splitMode && (
          <ActionBtn
            icon={Scissors}
            title="Split at cursor (click in text first)"
            onClick={(e) => { e.stopPropagation(); enterSplitMode(languages[0] ?? 'en') }}
          />
        )}
        {splitMode && (
          <>
            <ActionBtn icon={Check} title="Confirm split" onClick={(e) => { e.stopPropagation(); confirmSplit() }} className="text-brand-400 hover:text-brand-300" />
            <ActionBtn icon={X} title="Cancel split" onClick={(e) => { e.stopPropagation(); setSplitMode(null) }} />
          </>
        )}
        {selectedIds.size >= 2 && isSelected && (
          <ActionBtn
            icon={Merge}
            title="Join selected lines"
            onClick={(e) => { e.stopPropagation(); void joinLines([...selectedIds]) }}
          />
        )}
        <ActionBtn
          icon={Plus}
          title="Insert line after"
          onClick={(e) => { e.stopPropagation(); void insertLineAfter(line.id, projectId) }}
        />
        <ActionBtn
          icon={Trash2}
          title="Delete line"
          onClick={(e) => { e.stopPropagation(); void deleteLine(line.id) }}
          className="text-slate-500 hover:text-red-400"
        />
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface SubtitleCellProps {
  line: SubtitleLine
  lang: LangCode
  primaryLang: LangCode
  splitMode: { lang: LangCode; pos: number } | null
  onTextChange: (text: string) => void
  onEnterSplitMode: () => void
  onSplitPosChange: (pos: number) => void
  onConfirmSplit: () => void
  onCancelSplit: () => void
  textareaRef: (el: HTMLTextAreaElement | null) => void
}

function SubtitleCell({
  line,
  lang,
  primaryLang,
  splitMode,
  onTextChange,
  onSplitPosChange,
  onConfirmSplit,
  onCancelSplit,
  textareaRef,
}: SubtitleCellProps) {
  const [suggesting, setSuggesting] = useState(false)

  const handleSuggest = useCallback(async () => {
    const sourceText = line.translations[primaryLang]
    if (!sourceText || lang === primaryLang) return
    setSuggesting(true)
    try {
      const result = await suggestTranslation(sourceText, primaryLang, lang)
      if (result) onTextChange(result)
    } finally {
      setSuggesting(false)
    }
  }, [line.translations, primaryLang, lang, onTextChange])
  const text = line.translations[lang] ?? ''
  const isActiveSplit = splitMode?.lang === lang
  const pos = splitMode?.pos ?? 0

  if (isActiveSplit) {
    const before = text.slice(0, pos)
    const after = text.slice(pos)
    return (
      <div className="flex-1 min-w-0">
        {/* Two-color preview */}
        <div
          className="text-sm whitespace-pre-wrap break-words rounded px-1 py-1 cursor-text border border-brand-600/50 bg-slate-800/60"
          onClick={(e) => {
            // Calculate approximate char position from click
            const el = e.currentTarget
            const range = document.caretRangeFromPoint?.(e.clientX, e.clientY)
            if (range) {
              const node = el.firstChild
              if (node) {
                try {
                  const r2 = document.createRange()
                  r2.selectNodeContents(el)
                  r2.setEnd(range.startContainer, range.startOffset)
                  onSplitPosChange(Math.min(r2.toString().length, text.length))
                } catch {}
              }
            }
          }}
        >
          <span className="bg-brand-600/30 text-brand-200">{before}</span>
          <span className="inline-block w-0.5 h-4 bg-brand-400 align-middle mx-px" />
          <span className="bg-slate-600/40 text-slate-300">{after}</span>
        </div>
        <p className="text-xs text-brand-500 mt-0.5 px-1">
          Click to move split · Enter to confirm · Esc to cancel
        </p>
        <div className="flex gap-1 mt-1">
          <button
            onClick={onConfirmSplit}
            className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-2 py-0.5 rounded transition-colors"
          >
            Split here
          </button>
          <button
            onClick={onCancelSplit}
            className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 relative group/cell">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && splitMode) onCancelSplit()
          if (e.key === 'Enter' && splitMode?.lang === lang) {
            e.preventDefault()
            onConfirmSplit()
          }
        }}
        rows={2}
        placeholder={`[${lang.toUpperCase()}]`}
        className="w-full bg-transparent text-slate-100 text-sm resize-none outline-none placeholder-slate-700 focus:bg-slate-800/50 rounded px-1 py-0.5 transition-colors"
        onClick={(e) => e.stopPropagation()}
      />
      {lang !== primaryLang && !text && (
        <button
          onClick={(e) => { e.stopPropagation(); void handleSuggest() }}
          disabled={suggesting}
          title="AI translation suggestion"
          className="absolute bottom-0.5 right-0.5 p-0.5 text-slate-700 hover:text-brand-400 transition-colors opacity-0 group-hover/cell:opacity-100"
        >
          {suggesting
            ? <Loader2 size={11} className="animate-spin" />
            : <Sparkles size={11} />}
        </button>
      )}
    </div>
  )
}

function CommentCell({ line }: { line: SubtitleLine }) {
  const { updateComment } = useEditorStore()
  return (
    <div className="flex-1 min-w-0">
      <textarea
        value={line.comment ?? ''}
        onChange={(e) => void updateComment(line.id, e.target.value)}
        rows={2}
        placeholder="Stage direction / note (not projected)…"
        className="w-full bg-transparent text-amber-300/80 text-sm italic resize-none outline-none placeholder-amber-900/40 px-1 py-0.5"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

function MediaCell({ line }: { line: SubtitleLine }) {
  const { updateMedia } = useEditorStore()
  const media = line.media
  const source = (media?.sourceType ?? 'url-video') as MediaSourceType
  const url = media?.url ?? ''
  const SourceIcon = MEDIA_SOURCES.find((s) => s.value === source)?.Icon ?? Link

  const patch = (changes: Partial<typeof media>) =>
    void updateMedia(line.id, {
      sourceType: source,
      url,
      autoplay: media?.autoplay ?? false,
      ...media,
      ...changes,
    })

  return (
    <div className="flex-1 min-w-0 flex items-center gap-2 py-1">
      <select
        value={source}
        onChange={(e) => patch({ sourceType: e.target.value as MediaSourceType })}
        className="bg-slate-800 border border-slate-700 rounded text-xs text-purple-300 px-2 py-1 outline-none flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {MEDIA_SOURCES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <div className="flex-1 flex items-center gap-1 min-w-0">
        <SourceIcon size={12} className="text-purple-400 flex-shrink-0" />
        <input
          type="url"
          value={url}
          onChange={(e) => patch({ url: e.target.value })}
          placeholder="Paste URL…"
          className="flex-1 bg-transparent text-slate-300 text-sm outline-none placeholder-slate-600 px-1 min-w-0"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <label className="flex items-center gap-1 text-xs text-slate-500 flex-shrink-0 cursor-pointer">
        <input
          type="checkbox"
          checked={media?.autoplay ?? false}
          onChange={(e) => patch({ autoplay: e.target.checked })}
          className="accent-purple-500"
          onClick={(e) => e.stopPropagation()}
        />
        auto
      </label>
    </div>
  )
}

interface ActionBtnProps {
  icon: React.ElementType
  title: string
  onClick: React.MouseEventHandler<HTMLButtonElement>
  className?: string
}

function ActionBtn({ icon: Icon, title, onClick, className }: ActionBtnProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        'p-1.5 rounded transition-colors text-slate-500 hover:text-white hover:bg-slate-800',
        className,
      )}
    >
      <Icon size={13} />
    </button>
  )
}
