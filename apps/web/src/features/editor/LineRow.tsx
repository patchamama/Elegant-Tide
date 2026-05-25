import { useState, useCallback, useRef, useEffect } from 'react'
import { suggestTranslation } from '@/lib/translateApi'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SubtitleLine, LangCode, LineType, MediaSourceType, CueMarker, CueKind } from '@elegant-tide/core-types'
import { useEditorStore } from '@/stores/useEditorStore'
import { db } from '@elegant-tide/db'
import type { AudioAsset } from '@elegant-tide/db'
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
  Bookmark,
  Volume2,
  Lightbulb,
  ChevronDown,
  PlayCircle,
  StopCircle,
  Zap,
  Paperclip,
  Play,
} from 'lucide-react'
import { clsx } from 'clsx'

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export interface OpenRange {
  rangeId: string
  kind: 'sound' | 'light'
  name: string
  startLineId: string
}

interface LineRowProps {
  line: SubtitleLine
  languages: LangCode[]
  primaryLang: LangCode
  projectId: string
  isSelected: boolean
  index: number
  isDragging?: boolean
  showNotes?: boolean
  searchQuery?: string
  selectedColumn?: string | null
  isActiveMatch?: boolean
  isBookmarked?: boolean
  onBookmark?: ((lineId: string) => void) | undefined
  canEditSubtitles?: boolean
  canEditComments?: boolean
  openRanges?: OpenRange[]
  onLineActivate?: ((lineId: string) => void) | undefined
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
  searchQuery = '',
  selectedColumn = null,
  isActiveMatch = false,
  isBookmarked = false,
  onBookmark,
  canEditSubtitles = true,
  canEditComments = true,
  openRanges = [],
  onLineActivate,
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
  const [isEditing, setIsEditing] = useState(false)

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
    : isActiveMatch
      ? 'bg-yellow-900/20 border-yellow-700/40'
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
      data-line-id={line.id}
      className={clsx(
        'group flex items-start gap-1 px-3 py-2 border-b transition-colors',
        rowBg,
        isEditing && 'ring-1 ring-inset ring-brand-600/30 z-10 relative',
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

      {/* Line number — click to activate (control mode) or bookmark (editor mode) */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (onLineActivate) onLineActivate(line.id)
          else onBookmark?.(line.id)
        }}
        className={clsx(
          'w-7 pt-2.5 text-xs text-right select-none flex-shrink-0 tabular-nums transition-colors group/num',
          isBookmarked ? 'text-brand-400' : 'text-slate-700 hover:text-slate-400',
        )}
        title={onLineActivate ? 'Set as current line' : (isBookmarked ? 'Remove bookmark' : 'Bookmark this line')}
      >
        {onLineActivate ? (
          <>
            <span className="group-hover/num:hidden">{index + 1}</span>
            <Play size={12} className="ml-auto hidden group-hover/num:block text-brand-400" />
          </>
        ) : isBookmarked ? (
          <Bookmark size={12} className="ml-auto fill-brand-400 text-brand-400" />
        ) : (
          <>
            <span className="group-hover/num:hidden">{index + 1}</span>
            <Bookmark size={12} className="ml-auto hidden group-hover/num:block text-slate-600" />
          </>
        )}
      </button>

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
          <>
            <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); setShowTypePicker(false) }} />
            <div className="absolute left-0 top-6 z-30 py-1 min-w-32 rounded-xl border border-slate-600 shadow-2xl"
              style={{ backgroundColor: 'rgb(30 41 59)' }}>
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
          </>
        )}
      </div>

      {/* Notes column */}
      {showNotes && (
        <NoteCell
          comment={line.comment ?? ''}
          searchQuery={searchQuery}
          selectedColumn={selectedColumn}
          canEdit={canEditComments}
          onChange={(v) => void updateComment(line.id, v)}
        />
      )}

      {/* Content cells */}
      <div className="flex-1 flex min-w-0 divide-x divide-slate-800/60">
        {line.type === 'comment' ? (
          <CommentCell line={line} canEdit={canEditComments} openRanges={openRanges} />
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
              searchQuery={searchQuery}
              selectedColumn={selectedColumn}
              canEdit={canEditSubtitles}
              onFocusChange={(f) => setIsEditing(f)}
            />
          ))
        )}
      </div>

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
  searchQuery?: string
  selectedColumn?: string | null
  canEdit?: boolean
  onFocusChange?: (focused: boolean) => void
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
  searchQuery = '',
  selectedColumn = null,
  canEdit = true,
  onFocusChange,
}: SubtitleCellProps) {
  const [suggesting, setSuggesting] = useState(false)
  const [focused, setFocused] = useState(false)
  const remoteText = line.translations[lang] ?? ''
  const [localText, setLocalText] = useState(remoteText)

  // Sync from DB only when not focused (avoid overwriting in-progress edits)
  useEffect(() => {
    if (!focused) setLocalText(remoteText)
  }, [remoteText, focused])

  const q = normalize(searchQuery.trim())
  const isSelectedColumn = selectedColumn === lang
  const columnActive = !selectedColumn || isSelectedColumn
  const hasMatch = q !== '' && columnActive && normalize(remoteText).includes(q)

  const handleSuggest = useCallback(async () => {
    const sourceText = line.translations[primaryLang]
    if (!sourceText || lang === primaryLang) return
    setSuggesting(true)
    try {
      const result = await suggestTranslation(sourceText, primaryLang, lang)
      if (result) { onTextChange(result); setLocalText(result) }
    } finally {
      setSuggesting(false)
    }
  }, [line.translations, primaryLang, lang, onTextChange])
  const text = localText
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
    <div className={clsx(
      'flex-1 min-w-0 relative group/cell px-1 rounded transition-colors',
      focused ? 'bg-slate-800/70 ring-1 ring-brand-600/50' : hasMatch ? 'bg-yellow-900/15' : isSelectedColumn ? 'bg-brand-950/25' : '',
    )}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => { setLocalText(e.target.value); onTextChange(e.target.value) }}
        onFocus={() => { setFocused(true); onFocusChange?.(true) }}
        onBlur={() => { setFocused(false); onFocusChange?.(false) }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && splitMode) onCancelSplit()
          if (e.key === 'Enter' && splitMode?.lang === lang) {
            e.preventDefault()
            onConfirmSplit()
          }
        }}
        rows={focused ? 4 : 2}
        placeholder={`[${lang.toUpperCase()}]`}
        readOnly={!canEdit}
        className={clsx(
          'w-full bg-transparent text-sm resize-none outline-none placeholder-slate-700 rounded px-1 py-0.5 transition-colors',
          canEdit ? 'text-slate-100' : 'text-slate-500 cursor-default',
        )}
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

function NoteCell({ comment, searchQuery, selectedColumn, canEdit = true, onChange }: { comment: string; searchQuery: string; selectedColumn?: string | null; canEdit?: boolean; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false)
  const [localComment, setLocalComment] = useState(comment)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!focused) setLocalComment(comment)
  }, [comment, focused])

  const q = normalize(searchQuery.trim())
  const isSelectedColumn = selectedColumn === 'comments'
  const columnActive = !selectedColumn || isSelectedColumn
  const hasMatch = q !== '' && columnActive && normalize(comment).includes(q)

  const insertAtCursor = (icon: string) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart ?? localComment.length
    const end = el.selectionEnd ?? localComment.length
    const next = localComment.slice(0, start) + icon + localComment.slice(end)
    setLocalComment(next)
    onChange(next)
    // Restore cursor after icon
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + icon.length
      el.focus()
    })
  }

  return (
    <div className={clsx(
      'w-44 flex-shrink-0 border-r border-slate-800/60 pr-1 rounded transition-colors',
      focused ? 'bg-slate-800/70 ring-1 ring-brand-600/50' : hasMatch ? 'bg-yellow-900/15' : isSelectedColumn ? 'bg-brand-950/25' : '',
    )}>
      {focused && canEdit && (
        <div className="flex gap-0.5 px-1 pt-0.5">
          <button
            onMouseDown={(e) => { e.preventDefault(); insertAtCursor('🔊') }}
            className="text-slate-500 hover:text-sky-400 transition-colors text-xs px-1 rounded hover:bg-slate-700"
            title="Insert sound cue marker"
          >
            <Volume2 size={10} />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); insertAtCursor('💡') }}
            className="text-slate-500 hover:text-yellow-400 transition-colors text-xs px-1 rounded hover:bg-slate-700"
            title="Insert light cue marker"
          >
            <Lightbulb size={10} />
          </button>
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={localComment}
        onChange={(e) => { setLocalComment(e.target.value); onChange(e.target.value) }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        readOnly={!canEdit}
        rows={focused ? 4 : 2}
        placeholder={canEdit ? 'Note…' : ''}
        className={clsx(
          'w-full bg-transparent text-xs italic resize-none outline-none placeholder-slate-700 rounded px-1 py-0.5 transition-colors',
          canEdit ? 'text-slate-500' : 'text-slate-600 cursor-default',
        )}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

const AUDIO_KEYWORDS = /klingeln|musik|echo/i

type CuePopupState =
  | { phase: 'menu'; kind: CueKind }
  | { phase: 'name-start'; kind: CueKind; name: string }
  | { phase: 'name-point'; kind: CueKind; name: string }
  | null

function CueIcon({ kind, size = 11 }: { kind: CueKind; size?: number }) {
  return kind === 'sound' ? <Volume2 size={size} /> : <Lightbulb size={size} />
}

const CUE_COLORS: Record<CueKind, { bg: string; text: string; border: string; active: string }> = {
  sound: { bg: 'bg-sky-950/30', text: 'text-sky-300', border: 'border-sky-700/50', active: 'bg-sky-900/60' },
  light: { bg: 'bg-yellow-950/30', text: 'text-yellow-300', border: 'border-yellow-700/50', active: 'bg-yellow-900/60' },
}

function CommentCell({ line, canEdit = true, openRanges = [] }: { line: SubtitleLine; canEdit?: boolean; openRanges?: OpenRange[] }) {
  const { updateComment, updateTags, updateCues, updateAudioRef } = useEditorStore()
  const tags = line.tags ?? []
  const cues = line.cues ?? []
  const remoteComment = line.comment ?? ''
  const [localComment, setLocalComment] = useState(remoteComment)
  const [commentFocused, setCommentFocused] = useState(false)
  const [cuePopup, setCuePopup] = useState<CuePopupState>(null)

  useEffect(() => {
    if (!commentFocused) setLocalComment(remoteComment)
  }, [remoteComment, commentFocused])

  const hasSoundTag = tags.includes('sound')
  const hasLightTag = tags.includes('light')
  const hasAudioKeyword = AUDIO_KEYWORDS.test(localComment)

  const [showAudioPanel, setShowAudioPanel] = useState(false)
  const [audioUrlInput, setAudioUrlInput] = useState('')
  const [audioAssetName, setAudioAssetName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Resolve display name for existing audioRef
  useEffect(() => {
    if (!line.audioRef) { setAudioAssetName(null); return }
    if (line.audioRef.startsWith('http') || line.audioRef.startsWith('blob:')) {
      setAudioAssetName(line.audioRef)
      return
    }
    void db.audioAssets.get(line.audioRef).then((a) => setAudioAssetName(a?.name ?? null))
  }, [line.audioRef])

  const handleFileUpload = async (file: File) => {
    const asset: AudioAsset = {
      id: crypto.randomUUID(),
      projectId: line.projectId,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      blob: file,
      createdAt: Date.now(),
    }
    await db.audioAssets.add(asset)
    await updateAudioRef(line.id, asset.id)
    setShowAudioPanel(false)
  }

  const handleUrlAttach = async () => {
    const url = audioUrlInput.trim()
    if (!url) return
    const asset: AudioAsset = {
      id: crypto.randomUUID(),
      projectId: line.projectId,
      name: url,
      mimeType: 'audio/unknown',
      size: 0,
      url,
      createdAt: Date.now(),
    }
    await db.audioAssets.add(asset)
    await updateAudioRef(line.id, url)
    setAudioUrlInput('')
    setShowAudioPanel(false)
  }

  const handleRemoveAudio = async () => {
    const ref = line.audioRef
    if (ref && !ref.startsWith('http') && !ref.startsWith('blob:')) {
      await db.audioAssets.delete(ref)
    }
    await updateAudioRef(line.id, undefined)
  }

  // Auto-tag: run once on mount AND whenever remoteComment changes (covers DB-loaded lines)
  useEffect(() => {
    const hasKw = AUDIO_KEYWORDS.test(remoteComment)
    const currentTags = line.tags ?? []
    if (hasKw && !currentTags.includes('sound')) {
      void updateTags(line.id, [...currentTags, 'sound'])
    }
  }, [remoteComment]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cues on this line grouped by kind
  const soundCues = cues.filter((c) => c.kind === 'sound')
  const lightCues = cues.filter((c) => c.kind === 'light')

  // Whether a range of each kind is currently active (started before, not ended)
  const soundRangeActive = openRanges.some((r) => r.kind === 'sound')
  const lightRangeActive = openRanges.some((r) => r.kind === 'light')

  const addCue = useCallback((marker: CueMarker) => {
    void updateCues(line.id, [...cues, marker])
    // Also set the tag so existing highlight logic keeps working
    const tag = marker.kind
    if (!tags.includes(tag)) void updateTags(line.id, [...tags, tag])
  }, [cues, tags, line.id, updateCues, updateTags])

  const removeCue = useCallback((id: string) => {
    const next = cues.filter((c) => c.id !== id)
    void updateCues(line.id, next)
  }, [cues, line.id, updateCues])

  const handleCueMenuClick = (e: React.MouseEvent, kind: CueKind) => {
    e.stopPropagation()
    if (!canEdit) return
    setCuePopup({ phase: 'menu', kind })
  }

  const commitCue = (popup: CuePopupState) => {
    if (!popup || popup.phase === 'menu') return
    if (popup.phase === 'name-point') {
      addCue({ id: crypto.randomUUID(), kind: popup.kind, markerType: 'point', name: popup.name })
    } else if (popup.phase === 'name-start') {
      const rangeId = crypto.randomUUID()
      addCue({ id: crypto.randomUUID(), kind: popup.kind, markerType: 'range-start', name: popup.name, rangeId })
    }
    setCuePopup(null)
  }

  // Detect if this line has range-start/end cues that are "active" (show colored indicator)
  const activeSoundRangeMarker = soundCues.find((c) => c.markerType === 'range-start' || c.markerType === 'range-end')
  const activeLightRangeMarker = lightCues.find((c) => c.markerType === 'range-start' || c.markerType === 'range-end')

  const rowBgClass = clsx(
    hasSoundTag && hasLightTag ? 'bg-gradient-to-r from-sky-950/40 to-yellow-950/40' :
    hasSoundTag ? 'bg-sky-950/30' :
    hasLightTag ? 'bg-yellow-950/30' : '',
  )

  return (
    <div className={clsx('flex-1 min-w-0 flex flex-col gap-0.5 px-1 py-0.5', rowBgClass)}>
      {/* Cue markers row */}
      <div className="flex items-center gap-1 flex-wrap">
        {hasAudioKeyword && soundCues.length === 0 && !hasSoundTag && (
          <span className="flex items-center gap-0.5 px-1 py-0.5 rounded text-xs text-sky-400/60 border border-sky-800/40 bg-sky-950/20" title="Audio keyword detected">
            <Volume2 size={10} />
          </span>
        )}

        {/* Existing cue markers on this line */}
        {cues.map((cue) => {
          const colors = CUE_COLORS[cue.kind]
          const Icon = cue.kind === 'sound' ? Volume2 : Lightbulb
          const MarkerIcon = cue.markerType === 'range-start' ? PlayCircle : cue.markerType === 'range-end' ? StopCircle : Zap
          return (
            <span key={cue.id} className={clsx('group/cue flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs border', colors.active, colors.text, colors.border)}>
              <MarkerIcon size={9} />
              <Icon size={9} />
              <span className="max-w-20 truncate">{cue.name || (cue.markerType === 'point' ? 'cue' : cue.markerType === 'range-start' ? 'start' : 'end')}</span>
              {canEdit && (
                <button onClick={(e) => { e.stopPropagation(); removeCue(cue.id) }} className="ml-0.5 opacity-0 group-hover/cue:opacity-100 transition-opacity hover:text-red-400">
                  <X size={9} />
                </button>
              )}
            </span>
          )
        })}

        {/* Open-range indicators (this line is INSIDE an active range) */}
        {openRanges.map((r) => {
          const colors = CUE_COLORS[r.kind]
          const notClosedOnThisLine = !cues.find((c) => c.rangeId === r.rangeId && c.markerType === 'range-end')
          if (!notClosedOnThisLine) return null
          return (
            <span key={r.rangeId} className={clsx('flex items-center gap-0.5 px-1 py-0.5 rounded-sm text-xs border-l-2', r.kind === 'sound' ? 'border-sky-500/60 text-sky-400/50' : 'border-yellow-500/60 text-yellow-400/50')}>
              <CueIcon kind={r.kind} size={9} />
              <span className="italic opacity-60 max-w-16 truncate">{r.name}</span>
            </span>
          )
        })}

        {/* Add cue buttons — hidden when a cue of that kind already exists on this line */}
        {canEdit && soundCues.length === 0 && (
          <div className="relative">
            <button
              onClick={(e) => handleCueMenuClick(e, 'sound')}
              title={soundRangeActive ? 'Close open sound range' : 'Add sound cue'}
              className={clsx(
                'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs transition-colors',
                soundRangeActive
                  ? 'text-sky-400/70 border border-sky-600/50 bg-sky-950/30'
                  : 'text-slate-600 hover:text-sky-400 border border-transparent',
              )}
            >
              <Volume2 size={11} />
              {soundRangeActive ? <StopCircle size={9} className="ml-0.5" /> : <ChevronDown size={9} className="ml-0.5" />}
            </button>

            {cuePopup?.kind === 'sound' && (
              <CuePopup
                kind="sound"
                popup={cuePopup}
                openRange={openRanges.find((r) => r.kind === 'sound') ?? undefined}
                onSelect={(phase) => setCuePopup({ phase, kind: 'sound', name: '' })}
                onNameChange={(name) => setCuePopup((p) => p && p.phase !== 'menu' ? { ...p, name } : p)}
                onCommit={() => commitCue(cuePopup)}
                onCloseRange={(r) => { addCue({ id: crypto.randomUUID(), kind: 'sound', markerType: 'range-end', name: r.name, rangeId: r.rangeId }); setCuePopup(null) }}
                onClose={() => setCuePopup(null)}
              />
            )}
          </div>
        )}

        {canEdit && lightCues.length === 0 && (
          <div className="relative">
            <button
              onClick={(e) => handleCueMenuClick(e, 'light')}
              title={lightRangeActive ? 'Close open light range' : 'Add light cue'}
              className={clsx(
                'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs transition-colors',
                lightRangeActive
                  ? 'text-yellow-400/70 border border-yellow-600/50 bg-yellow-950/30'
                  : 'text-slate-600 hover:text-yellow-400 border border-transparent',
              )}
            >
              <Lightbulb size={11} />
              {lightRangeActive ? <StopCircle size={9} className="ml-0.5" /> : <ChevronDown size={9} className="ml-0.5" />}
            </button>

            {cuePopup?.kind === 'light' && (
              <CuePopup
                kind="light"
                popup={cuePopup}
                openRange={openRanges.find((r) => r.kind === 'light') ?? undefined}
                onSelect={(phase) => setCuePopup({ phase, kind: 'light', name: '' })}
                onNameChange={(name) => setCuePopup((p) => p && p.phase !== 'menu' ? { ...p, name } : p)}
                onCommit={() => commitCue(cuePopup)}
                onCloseRange={(r) => { addCue({ id: crypto.randomUUID(), kind: 'light', markerType: 'range-end', name: r.name, rangeId: r.rangeId }); setCuePopup(null) }}
                onClose={() => setCuePopup(null)}
              />
            )}
          </div>
        )}
      </div>

      {/* Audio attachment — shown when line has sound tag */}
      {hasSoundTag && (
        <div className="flex items-center gap-1 flex-wrap">
          {line.audioRef ? (
            <>
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-sky-950/40 border border-sky-700/40 text-sky-300 max-w-48 truncate" title={audioAssetName ?? line.audioRef}>
                <Paperclip size={9} />
                <span className="truncate">{audioAssetName ?? '…'}</span>
              </span>
              {canEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); void handleRemoveAudio() }}
                  className="p-0.5 text-slate-600 hover:text-red-400 transition-colors"
                  title="Remove audio"
                >
                  <X size={9} />
                </button>
              )}
            </>
          ) : canEdit ? (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowAudioPanel((v) => !v) }}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs text-slate-600 hover:text-sky-400 border border-transparent hover:border-sky-700/40 transition-colors"
                title="Attach audio"
              >
                <Paperclip size={10} />
                Attach audio
              </button>
              {showAudioPanel && (
                <>
                  <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setShowAudioPanel(false) }} />
                  <div
                    className="absolute left-0 top-7 z-50 w-64 rounded-xl border border-slate-600 shadow-2xl p-3 flex flex-col gap-2"
                    style={{ backgroundColor: 'rgb(15 23 42)' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-xs text-slate-400 font-medium">Attach audio file</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void handleFileUpload(file)
                      }}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-sky-950/40 border border-sky-700/40 text-sky-300 hover:bg-sky-900/40 text-xs transition-colors"
                    >
                      <Paperclip size={11} />
                      Upload file…
                    </button>
                    <div className="flex gap-1">
                      <input
                        type="url"
                        value={audioUrlInput}
                        onChange={(e) => setAudioUrlInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleUrlAttach() }}
                        placeholder="Or paste URL…"
                        className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-slate-400 min-w-0"
                      />
                      <button
                        onClick={() => void handleUrlAttach()}
                        disabled={!audioUrlInput.trim()}
                        className="px-2 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white text-xs disabled:opacity-40 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Inline range-close suggestion — if open range and no action yet */}
      {openRanges.length > 0 && canEdit && cues.filter((c) => c.markerType === 'range-end').length === 0 && (
        <div className="flex gap-1 flex-wrap">
          {openRanges.map((r) => (
            <button
              key={r.rangeId}
              onClick={(e) => { e.stopPropagation(); addCue({ id: crypto.randomUUID(), kind: r.kind, markerType: 'range-end', name: r.name, rangeId: r.rangeId }) }}
              className={clsx(
                'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs border border-dashed transition-colors',
                r.kind === 'sound' ? 'border-sky-700/40 text-sky-400/50 hover:text-sky-300 hover:border-sky-600' : 'border-yellow-700/40 text-yellow-400/50 hover:text-yellow-300 hover:border-yellow-600',
              )}
              title={`Close "${r.name}" range here`}
            >
              <StopCircle size={9} />
              <CueIcon kind={r.kind} size={9} />
              <span>End "{r.name}"?</span>
            </button>
          ))}
        </div>
      )}

      <textarea
        value={localComment}
        onChange={(e) => {
          const val = e.target.value
          setLocalComment(val)
          if (canEdit) {
            void updateComment(line.id, val)
            // Auto-tag sound if keyword detected
            const currentTags = line.tags ?? []
            if (AUDIO_KEYWORDS.test(val) && !currentTags.includes('sound')) {
              void updateTags(line.id, [...currentTags, 'sound'])
            }
          }
        }}
        onFocus={() => setCommentFocused(true)}
        onBlur={() => setCommentFocused(false)}
        readOnly={!canEdit}
        rows={commentFocused ? 4 : 2}
        placeholder={canEdit ? 'Stage direction / note (not projected)…' : ''}
        className={clsx(
          'w-full bg-transparent text-sm italic resize-none outline-none placeholder-amber-900/40',
          canEdit ? 'text-amber-300/80' : 'text-amber-300/40 cursor-default',
        )}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

function CuePopup({
  kind,
  popup,
  openRange,
  onSelect,
  onNameChange,
  onCommit,
  onCloseRange,
  onClose,
}: {
  kind: CueKind
  popup: CuePopupState
  openRange?: OpenRange | undefined
  onSelect: (phase: 'name-start' | 'name-point') => void
  onNameChange: (name: string) => void
  onCommit: () => void
  onCloseRange: (r: OpenRange) => void
  onClose: () => void
}) {
  if (!popup) return null
  const colors = CUE_COLORS[kind]

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); onClose() }} />
      <div
        className="absolute left-0 top-7 z-50 w-56 rounded-xl border border-slate-600 shadow-2xl py-1"
        style={{ backgroundColor: 'rgb(15 23 42)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {popup.phase === 'menu' && (
          <>
            {openRange && (
              <>
                <button
                  onClick={() => onCloseRange(openRange)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-800 text-slate-300 transition-colors"
                >
                  <StopCircle size={11} className={colors.text} />
                  <span>End "{openRange.name}"</span>
                </button>
                <div className="mx-3 my-1 border-t border-slate-700/60" />
              </>
            )}
            <button
              onClick={() => onSelect('name-point')}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-800 text-slate-300 transition-colors"
            >
              <Zap size={11} className={colors.text} />
              Point cue
            </button>
            <button
              onClick={() => onSelect('name-start')}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-800 text-slate-300 transition-colors"
            >
              <PlayCircle size={11} className={colors.text} />
              Start range…
            </button>
          </>
        )}
        {(popup.phase === 'name-start' || popup.phase === 'name-point') && (
          <div className="px-3 py-2 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              {popup.phase === 'name-start' ? <PlayCircle size={11} className={colors.text} /> : <Zap size={11} className={colors.text} />}
              {popup.phase === 'name-start' ? 'Range name' : 'Cue name'} <span className="text-slate-600">(optional)</span>
            </div>
            <input
              autoFocus
              type="text"
              value={popup.name}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onCommit(); if (e.key === 'Escape') onClose() }}
              placeholder={popup.phase === 'name-start' ? 'e.g. Musik der Nacht' : 'e.g. Bell'}
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-slate-400"
            />
            <div className="flex gap-1">
              <button onClick={onCommit} className={clsx('flex-1 py-1 rounded text-xs transition-colors', colors.active, colors.text)}>
                Add
              </button>
              <button onClick={onClose} className="px-2 py-1 rounded text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
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
