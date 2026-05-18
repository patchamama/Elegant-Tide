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
import type { LangCode } from '@elegant-tide/core-types'

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
    </div>
  )
}
