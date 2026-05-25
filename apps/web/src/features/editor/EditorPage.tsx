import { useEffect } from 'react'
import { useParams, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@elegant-tide/db'
import { saveBookmarkLineId, loadBookmarkLineId, saveColumnState, loadColumnState } from '@/lib/projectionStorage'
import { useProjectRole } from '@/hooks/useProjectRole'
import { useLiveSync } from '@/hooks/useLiveSync'
import { useProjectionStore } from '@/stores/useProjectionStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useEditorStore } from '@/stores/useEditorStore'
import {
  ArrowLeft,
  Play,
  Upload,
  Download,
  Plus,
  Settings,
  Globe,
  AlertTriangle,
  Search,
  ChevronUp,
  ChevronDown,
  X as XIcon,
  UserCog,
  Volume2,
  Lightbulb,
  Radio,
} from 'lucide-react'
import { LineList } from './LineList'
import { ImportDialog } from './ImportDialog'
import { ExportDialog } from './ExportDialog'
import { ConflictsDrawer } from './ConflictsDrawer'
import { useState, useMemo, useRef, useCallback } from 'react'
import type { LangCode, SubtitleProject, ProjectionStyle } from '@elegant-tide/core-types'
import { DEFAULT_PROJECTION_STYLE } from '@elegant-tide/core-types'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const ALL_LANGS: { code: LangCode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
]

export function EditorPage() {
  const { t } = useTranslation()
  const { projectId } = useParams({ from: '/editor/$projectId' })
  const navigate = useNavigate()
  const { loadProject, updateProject } = useProjectStore()
  const { addLine, selectedIds, syncLines } = useEditorStore()
  const { role, setRole, isMaster, canEditSubtitles, canEditComments } = useProjectRole(projectId)
  // Listen for projection position from master (never sends when isMaster=false)
  useLiveSync(projectId, false)
  const currentLineId = useProjectionStore((s) => s.currentLineId)
  const [showImport, setShowImport] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [showProjectSettings, setShowProjectSettings] = useState(false)
  const [showConflicts, setShowConflicts] = useState(false)
  const [showNotes, setShowNotes] = useState<boolean>(() => loadColumnState(projectId)?.showNotes ?? false)
  const [bookmarkLineId, setBookmarkLineId] = useState<string | null>(() => loadBookmarkLineId(projectId))
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatchIndex, setSearchMatchIndex] = useState(0)
  const [selectedColumn, setSelectedColumn] = useState<LangCode | 'comments' | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Live queries — react instantly to DB changes
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId])
  const lines = useLiveQuery(
    () =>
      db.lines
        .where('[projectId+order]')
        .between([projectId, -Infinity], [projectId, Infinity])
        .filter((l) => !l.deletedAt)
        .sortBy('order'),
    [projectId],
  )
  const conflictCount = useLiveQuery(
    () => db.conflicts.where('projectId').equals(projectId).count(),
    [projectId],
    0,
  )

  useEffect(() => {
    void loadProject(projectId)
  }, [projectId, loadProject])

  // Keep editor store in sync with live lines so mutations (updateTranslation etc.) can find lines by id
  useEffect(() => {
    if (lines) syncLines(lines)
  }, [lines]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddLine = async () => {
    await addLine(projectId)
  }

  const handleImportComplete = async (detectedLanguages: LangCode[]) => {
    if (!project || detectedLanguages.length === 0) return
    const existing = new Set(project.languages)
    const added = detectedLanguages.filter(l => !existing.has(l))
    if (added.length > 0) {
      await updateProject({ id: projectId, languages: [...project.languages, ...added] })
    }
  }

  // Persist column visibility whenever it changes
  useEffect(() => {
    if (!project) return
    saveColumnState(projectId, { languages: project.languages, showNotes })
  }, [showNotes, project?.languages]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLanguage = async (lang: LangCode) => {
    if (!project) return
    const langs = project.languages.includes(lang)
      ? project.languages.filter((l) => l !== lang)
      : [...project.languages, lang]
    // Must always keep at least one
    if (langs.length === 0) return
    await updateProject({ id: projectId, languages: langs })
  }

  const searchMatches = useMemo(() => {
    const q = normalize(searchQuery.trim())
    if (!q || !lines) return []
    return lines
      .map((line, index) => {
        let texts: string[] = []
        if (selectedColumn === 'comments') {
          if (showNotes && line.comment) texts = [line.comment]
        } else if (selectedColumn) {
          const t = line.translations[selectedColumn]
          if (t) texts = [t]
        } else {
          texts = Object.values(line.translations)
          if (showNotes && line.comment) texts.push(line.comment)
        }
        const matches = texts.some((t) => normalize(t).includes(q))
        return matches ? { lineId: line.id, index } : null
      })
      .filter(Boolean) as { lineId: string; index: number }[]
  }, [searchQuery, lines, showNotes, selectedColumn])

  // Lines to next sound/light cue from current projection position
  const { linesToNextSound, linesToNextLight } = useMemo(() => {
    if (!lines || !currentLineId) return { linesToNextSound: null, linesToNextLight: null }
    const idx = lines.findIndex((l) => l.id === currentLineId)
    if (idx === -1) return { linesToNextSound: null, linesToNextLight: null }
    const after = lines.slice(idx + 1)
    const nextSound = after.findIndex((l) => l.tags?.includes('sound'))
    const nextLight = after.findIndex((l) => l.tags?.includes('light'))
    return {
      linesToNextSound: nextSound === -1 ? null : nextSound + 1,
      linesToNextLight: nextLight === -1 ? null : nextLight + 1,
    }
  }, [lines, currentLineId])


  const activeMatch = searchMatches[searchMatchIndex] ?? null

  const navigateSearch = useCallback((dir: 1 | -1) => {
    if (searchMatches.length === 0) return
    setSearchMatchIndex((i) => (i + dir + searchMatches.length) % searchMatches.length)
  }, [searchMatches.length])

  if (project === undefined) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="animate-pulse">{t('common.loading')}</div>
      </div>
    )
  }

  if (project === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-4">
        <p>Project not found.</p>
        <Link to="/projects" className="text-brand-400 hover:underline">← Back to projects</Link>
      </div>
    )
  }

  const subtitleCount = lines?.filter(l => l.type === 'subtitle').length ?? 0
  const blackoutCount = lines?.filter(l => l.type === 'blackout').length ?? 0
  const commentCount = lines?.filter(l => l.type === 'comment').length ?? 0

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Toolbar */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => void navigate({ to: '/projects' })}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={17} />
        </button>

        <h1 className="font-semibold text-white text-sm truncate max-w-xs">{project.name}</h1>

        <div className="flex-1" />

        {/* Search bar */}
        <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1">
          <Search size={12} className="text-slate-500 flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchMatchIndex(0) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigateSearch(e.shiftKey ? -1 : 1)
              if (e.key === 'Escape') { setSearchQuery(''); searchInputRef.current?.blur() }
            }}
            placeholder="Search…"
            className="bg-transparent text-xs text-slate-200 outline-none placeholder-slate-600 w-36"
          />
          {searchQuery && (
            <>
              <span className="text-xs text-slate-500 tabular-nums min-w-8 text-center">
                {searchMatches.length > 0 ? `${searchMatchIndex + 1}/${searchMatches.length}` : '0/0'}
              </span>
              <button onClick={() => navigateSearch(-1)} className="p-0.5 text-slate-400 hover:text-white transition-colors" title="Previous (Shift+Enter)">
                <ChevronUp size={13} />
              </button>
              <button onClick={() => navigateSearch(1)} className="p-0.5 text-slate-400 hover:text-white transition-colors" title="Next (Enter)">
                <ChevronDown size={13} />
              </button>
              <button onClick={() => { setSearchQuery(''); setSearchMatchIndex(0) }} className="p-0.5 text-slate-500 hover:text-white transition-colors">
                <XIcon size={11} />
              </button>
            </>
          )}
        </div>

        {/* Language picker */}
        <div className="relative">
          <button
            onClick={() => setShowLangPicker((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors border border-slate-700"
          >
            <Globe size={13} />
            {project.languages.map((l) => l.toUpperCase()).join(' · ')}
          </button>
          {showLangPicker && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowLangPicker(false)} />
              <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-2 z-20 min-w-40">
              {ALL_LANGS.map(({ code, label }) => (
                <button
                  key={code}
                  onClick={() => void toggleLanguage(code)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-700 text-sm transition-colors"
                >
                  <span className={project.languages.includes(code) ? 'text-white' : 'text-slate-400'}>
                    {label}
                  </span>
                  {project.languages.includes(code) && (
                    <span className="text-brand-400 text-xs">✓</span>
                  )}
                </button>
              ))}
              <hr className="border-slate-700 my-1" />
              <button
                onClick={() => setShowNotes((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-700 text-sm transition-colors"
              >
                <span className={showNotes ? 'text-white' : 'text-slate-400'}>Comments</span>
                {showNotes && <span className="text-brand-400 text-xs">✓</span>}
              </button>
            </div>
            </>
          )}
        </div>

        {conflictCount > 0 && (
          <button
            onClick={() => setShowConflicts(true)}
            className="relative flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 px-3 py-1.5 rounded-lg bg-amber-950/40 hover:bg-amber-950/60 border border-amber-900/50 transition-colors"
            title={`${conflictCount} sync conflict${conflictCount === 1 ? '' : 's'} pending`}
          >
            <AlertTriangle size={13} />
            <span>{conflictCount}</span>
          </button>
        )}

        <button
          onClick={() => setShowProjectSettings(true)}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          title="Project settings"
        >
          <Settings size={15} />
        </button>

        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 border border-slate-700 transition-colors"
        >
          <Upload size={13} />
          {t('editor.import')}
        </button>

        <button
          onClick={() => setShowExport(true)}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 border border-slate-700 transition-colors"
        >
          <Download size={13} />
          Export
        </button>

        <button
          onClick={() => void handleAddLine()}
          className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          <Plus size={13} />
          {t('editor.addLine')}
        </button>

        {/* Role selector */}
        <div className="flex items-center gap-1 border border-slate-700 rounded-lg px-1 py-0.5">
          <UserCog size={12} className="text-slate-500 flex-shrink-0" />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as import('@elegant-tide/core-types').ProjectRole)}
            className="bg-transparent text-xs text-slate-300 outline-none cursor-pointer"
          >
            <option value="master">Master</option>
            <option value="sound">Sound</option>
            <option value="lighting">Lighting</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>

        {isMaster && (
          <button
            onClick={() => void navigate({ to: '/control/$projectId', params: { projectId } })}
            className="flex items-center gap-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <Play size={13} />
            {t('control.title')}
          </button>
        )}
      </header>

      {/* Column headers */}
      <div className="bg-slate-900/60 border-b border-slate-800 px-4 py-1.5 flex items-center gap-1 flex-shrink-0 text-xs text-slate-500 uppercase tracking-wider select-none">
        <div className="w-10 text-right">#</div>
        <div className="w-10" />
        {showNotes && (
          <button
            onClick={() => setSelectedColumn(selectedColumn === 'comments' ? null : 'comments')}
            className={clsx(
              'w-44 flex-shrink-0 text-center normal-case tracking-normal border-r border-slate-800/60 pr-1 rounded py-0.5 transition-colors',
              selectedColumn === 'comments' ? 'text-brand-400 bg-brand-950/30' : 'text-slate-600 hover:text-slate-400',
            )}
          >
            Comments
          </button>
        )}
        {(project.languages as LangCode[]).map((lang) => (
          <button
            key={lang}
            onClick={() => setSelectedColumn(selectedColumn === lang ? null : lang as LangCode)}
            className={clsx(
              'flex-1 text-center border-r border-slate-800/60 last:border-r-0 rounded py-0.5 transition-colors',
              selectedColumn === lang ? 'text-brand-400 bg-brand-950/30' : 'text-slate-500 hover:text-slate-300',
            )}
          >
            {lang.toUpperCase()}
          </button>
        ))}
        <div className="w-24" />
      </div>

      {/* Line list — takes remaining height */}
      <div className="flex-1 overflow-hidden">
        {lines === undefined ? (
          <div className="flex items-center justify-center h-full text-slate-500 animate-pulse">
            {t('common.loading')}
          </div>
        ) : (
          <LineList
            lines={lines}
            languages={project.languages as LangCode[]}
            primaryLang={project.primaryLanguage as LangCode}
            projectId={projectId}
            showNotes={showNotes}
            searchQuery={searchQuery}
            selectedColumn={selectedColumn}
            activeMatchLineId={activeMatch?.lineId ?? null}
            activeMatchIndex={activeMatch?.index ?? null}
            bookmarkLineId={bookmarkLineId}
            canEditSubtitles={canEditSubtitles}
            canEditComments={canEditComments}
            followLineId={currentLineId}
            isFollowing={isFollowing}
            onBookmark={(lineId) => {
              const next = bookmarkLineId === lineId ? null : lineId
              setBookmarkLineId(next)
              saveBookmarkLineId(projectId, next)
            }}
          />
        )}
      </div>

      {/* Import dialog */}
      {showImport && (
        <ImportDialog
          projectId={projectId}
          languages={project.languages as LangCode[]}
          primaryLanguage={project.primaryLanguage}
          onClose={() => setShowImport(false)}
          onImportComplete={handleImportComplete}
        />
      )}

      {/* Export dialog */}
      {showExport && lines && (
        <ExportDialog
          projectId={projectId}
          projectName={project.name}
          languages={project.languages as LangCode[]}
          primaryLanguage={project.primaryLanguage}
          lines={lines}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* Conflicts drawer */}
      {showConflicts && (
        <ConflictsDrawer
          projectId={projectId}
          languages={project.languages as LangCode[]}
          onClose={() => setShowConflicts(false)}
        />
      )}

      {/* Project settings dialog */}
      {showProjectSettings && (
        <ProjectSettingsDialog
          project={project}
          onClose={() => setShowProjectSettings(false)}
          onSave={async (patch) => { await updateProject({ id: projectId, ...patch }); setShowProjectSettings(false) }}
        />
      )}

      {/* Bottom status bar */}
      <footer className="bg-slate-900 border-t border-slate-800 px-4 py-1.5 flex items-center gap-3 flex-shrink-0 text-xs text-slate-500 select-none">
        <span className="tabular-nums text-slate-400">{lines?.length ?? 0} lines</span>
        {subtitleCount > 0 && <><span>·</span><span>{subtitleCount} subtitles</span></>}
        {blackoutCount > 0 && <><span>·</span><span>{blackoutCount} blackouts</span></>}
        {commentCount > 0 && <><span>·</span><span>{commentCount} comments</span></>}

        {linesToNextSound !== null && (
          <>
            <span>·</span>
            <span className="flex items-center gap-1 text-sky-400">
              <Volume2 size={11} />
              <span className="tabular-nums">{linesToNextSound}</span>
            </span>
          </>
        )}
        {linesToNextLight !== null && (
          <>
            <span>·</span>
            <span className="flex items-center gap-1 text-yellow-400">
              <Lightbulb size={11} />
              <span className="tabular-nums">{linesToNextLight}</span>
            </span>
          </>
        )}

        <div className="flex-1" />

        {selectedIds.size > 0 && (
          <span className="text-brand-400 tabular-nums">{selectedIds.size} selected</span>
        )}

        <button
          onClick={() => setIsFollowing(v => !v)}
          title={isFollowing ? 'Stop following projection' : 'Follow projection'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
            isFollowing
              ? 'border-brand-600 text-brand-400 bg-brand-950/20'
              : 'border-slate-700 text-slate-600 hover:text-slate-300 hover:border-slate-600'
          }`}
        >
          <Radio size={11} />
          Follow
        </button>

        <button
          onClick={() => setShowNotes(v => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
            showNotes
              ? 'border-brand-600 text-brand-400 bg-brand-950/20'
              : 'border-slate-700 text-slate-600 hover:text-slate-300 hover:border-slate-600'
          }`}
        >
          Notes
        </button>
      </footer>
    </div>
  )
}

// ── Project Settings Dialog ───────────────────────────────────────────────────

interface ProjectSettingsDialogProps {
  project: SubtitleProject
  onClose: () => void
  onSave: (patch: Partial<SubtitleProject>) => Promise<void>
}

function ProjectSettingsDialog({ project, onClose, onSave }: ProjectSettingsDialogProps) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? '')
  const [primaryLang, setPrimaryLang] = useState<LangCode>(project.primaryLanguage)
  const [style, setStyle] = useState<ProjectionStyle>({ ...DEFAULT_PROJECTION_STYLE, ...project.defaultStyle })

  const handleSave = () => {
    const patch: Partial<SubtitleProject> = {
      name: name.trim() || project.name,
      primaryLanguage: primaryLang,
      defaultStyle: style,
    }
    const trimmedDesc = description.trim()
    if (trimmedDesc) patch.description = trimmedDesc
    void onSave(patch)
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white">Project Settings</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
          <label className="block">
            <span className="text-xs text-slate-400 block mb-1">Project name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-brand-600"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-400 block mb-1">Description (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-brand-600 resize-none"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-400 block mb-1">Primary language (source for translation)</span>
            <select
              value={primaryLang}
              onChange={(e) => setPrimaryLang(e.target.value as LangCode)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
            >
              {(project.languages as LangCode[]).map((lang) => (
                <option key={lang} value={lang} className="bg-slate-900">{lang.toUpperCase()}</option>
              ))}
            </select>
          </label>

          <hr className="border-slate-800" />
          <p className="text-xs text-slate-500 uppercase tracking-wider">Default projection style</p>

          <label className="block">
            <span className="text-xs text-slate-400 block mb-1">Font size: {style.fontSizePx}px</span>
            <input
              type="range" min={16} max={120} step={2}
              value={style.fontSizePx}
              onChange={(e) => setStyle((s) => ({ ...s, fontSizePx: Number(e.target.value) }))}
              className="w-full accent-brand-500"
            />
          </label>

          <div className="flex gap-4">
            <label className="flex-1">
              <span className="text-xs text-slate-400 block mb-1">Text color</span>
              <input
                type="color"
                value={style.textColor.startsWith('#') ? style.textColor : '#ffffff'}
                onChange={(e) => setStyle((s) => ({ ...s, textColor: e.target.value }))}
                className="w-full h-9 rounded-lg cursor-pointer border border-slate-700"
              />
            </label>
            <label className="flex-1">
              <span className="text-xs text-slate-400 block mb-1">BG color</span>
              <input
                type="color"
                value={style.backgroundColor.startsWith('#') ? style.backgroundColor : '#000000'}
                onChange={(e) => setStyle((s) => ({ ...s, backgroundColor: e.target.value + 'b3' }))}
                className="w-full h-9 rounded-lg cursor-pointer border border-slate-700"
              />
            </label>
          </div>

          <div>
            <span className="text-xs text-slate-400 block mb-1">Text alignment</span>
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setStyle((s) => ({ ...s, textAlign: a }))}
                  className={`flex-1 py-2 rounded-lg text-xs capitalize transition-colors ${style.textAlign === a ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm text-slate-400 hover:text-white transition-colors px-4 py-2">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
