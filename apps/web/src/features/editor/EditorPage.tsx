import { useEffect } from 'react'
import { useParams, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@elegant-tide/db'
import { useProjectStore } from '@/stores/useProjectStore'
import { useEditorStore } from '@/stores/useEditorStore'
import {
  ArrowLeft,
  Play,
  Upload,
  Plus,
  Settings,
  Globe,
} from 'lucide-react'
import { LineList } from './LineList'
import { ImportDialog } from './ImportDialog'
import { useState } from 'react'
import type { LangCode, SubtitleProject, ProjectionStyle } from '@elegant-tide/core-types'
import { DEFAULT_PROJECTION_STYLE } from '@elegant-tide/core-types'
import { X } from 'lucide-react'

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
  const { currentProject, loadProject, updateProject } = useProjectStore()
  const { addLine } = useEditorStore()
  const [showImport, setShowImport] = useState(false)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [showProjectSettings, setShowProjectSettings] = useState(false)

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

  useEffect(() => {
    void loadProject(projectId)
  }, [projectId, loadProject])

  const handleAddLine = async () => {
    await addLine(projectId)
  }

  const toggleLanguage = async (lang: LangCode) => {
    if (!project) return
    const langs = project.languages.includes(lang)
      ? project.languages.filter((l) => l !== lang)
      : [...project.languages, lang]
    // Must always keep at least one
    if (langs.length === 0) return
    await updateProject({ id: projectId, languages: langs })
  }

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
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
            <div
              className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-2 z-20 min-w-40"
              onMouseLeave={() => setShowLangPicker(false)}
            >
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
            </div>
          )}
        </div>

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
          onClick={() => void handleAddLine()}
          className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          <Plus size={13} />
          {t('editor.addLine')}
        </button>

        <button
          onClick={() => void navigate({ to: '/control/$projectId', params: { projectId } })}
          className="flex items-center gap-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <Play size={13} />
          {t('control.title')}
        </button>
      </header>

      {/* Column headers */}
      <div className="bg-slate-900/60 border-b border-slate-800 px-4 py-1.5 flex items-center gap-1 flex-shrink-0 text-xs text-slate-500 uppercase tracking-wider select-none">
        <div className="w-10 text-right">#</div>
        <div className="w-10" />
        {(project.languages as LangCode[]).map((lang) => (
          <div key={lang} className="flex-1 text-center">
            {lang.toUpperCase()}
          </div>
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
