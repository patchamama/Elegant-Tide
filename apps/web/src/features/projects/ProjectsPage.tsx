import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, linesRepo } from '@elegant-tide/db'
import { useProjectStore } from '@/stores/useProjectStore'
import {
  PlusIcon,
  FolderOpen,
  Trash2,
  Pencil,
  Check,
  X,
  MonitorPlay,
  Film,
  Globe,
  Settings,
  Download,
} from 'lucide-react'
import type { LangCode, SubtitleLine, SubtitleProject } from '@elegant-tide/core-types'
import { ExportDialog } from '@/features/editor/ExportDialog'

export function ProjectsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { createProject, updateProject, deleteProject } = useProjectStore()

  // Live query — auto-updates whenever Dexie changes
  const projects = useLiveQuery(
    () => db.projects.filter((p) => !p.deletedAt).toArray().then((r) => r.sort((a, b) => b.updatedAt - a.updatedAt)),
    [],
  )

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [exportingProject, setExportingProject] = useState<{ project: SubtitleProject; lines: SubtitleLine[] } | null>(null)

  const createInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showCreateDialog) createInputRef.current?.focus()
  }, [showCreateDialog])

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    const project = await createProject(name)
    setNewName('')
    setShowCreateDialog(false)
    void navigate({ to: '/editor/$projectId', params: { projectId: project.id } })
  }

  const handleRename = async (id: string) => {
    const name = renameValue.trim()
    if (name) await updateProject({ id, name })
    setRenamingId(null)
  }

  const handleDelete = async (id: string) => {
    await deleteProject(id)
    setDeletingId(null)
  }

  const startRename = (project: SubtitleProject) => {
    setRenamingId(project.id)
    setRenameValue(project.name)
  }

  const handleExport = async (project: SubtitleProject) => {
    const lines = await linesRepo.listByProject(project.id)
    setExportingProject({ project, lines })
  }

  const loading = projects === undefined

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <MonitorPlay size={16} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white leading-none">Elegant Tide</h1>
              <p className="text-xs text-slate-500 mt-0.5">Theater Subtitles</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/settings"
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Settings"
            >
              <Settings size={18} />
            </Link>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            >
              <PlusIcon size={16} />
              {t('projects.new')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Create dialog */}
        {showCreateDialog && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 mb-6 shadow-2xl">
            <h2 className="font-semibold text-white mb-3">New Project</h2>
            <div className="flex items-center gap-3">
              <input
                ref={createInputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate()
                  if (e.key === 'Escape') setShowCreateDialog(false)
                }}
                placeholder="Project name…"
                className="flex-1 bg-slate-800 border border-slate-600 focus:border-brand-500 rounded-lg px-3 py-2 text-white outline-none transition-colors"
              />
              <button
                onClick={() => void handleCreate()}
                disabled={!newName.trim()}
                className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Check size={15} />
                Create
              </button>
              <button
                onClick={() => { setShowCreateDialog(false); setNewName('') }}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Project list */}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-500">
            <div className="animate-pulse">{t('common.loading')}</div>
          </div>
        ) : !projects?.length ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Film size={28} className="text-slate-600" />
            </div>
            <h2 className="text-slate-400 font-medium mb-1">No projects yet</h2>
            <p className="text-slate-600 text-sm">Create your first subtitle project to get started</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group bg-slate-900 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-xl px-5 py-4 flex items-center gap-4 transition-all"
              >
                {/* Icon */}
                <div className="w-10 h-10 bg-slate-800 group-hover:bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors">
                  <MonitorPlay size={18} className="text-brand-400" />
                </div>

                {/* Name / rename inline */}
                <div className="flex-1 min-w-0">
                  {renamingId === project.id ? (
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRename(project.id)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onBlur={() => void handleRename(project.id)}
                      className="w-full bg-slate-700 border border-brand-500 rounded px-2 py-0.5 text-white outline-none font-semibold"
                    />
                  ) : (
                    <h2 className="font-semibold text-white truncate">{project.name}</h2>
                  )}
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Globe size={11} />
                      {project.languages.map((l) => l.toUpperCase()).join(' · ')}
                    </span>
                    <span className="text-xs text-slate-600">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Delete confirm */}
                {deletingId === project.id ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-red-400">Delete?</span>
                    <button
                      onClick={() => void handleDelete(project.id)}
                      className="text-red-400 hover:text-red-300 font-medium px-2 py-1 rounded hover:bg-red-950/40 transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-700 transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  /* Action buttons */
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => void handleExport(project)}
                      title="Export"
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      <Download size={15} />
                    </button>
                    <button
                      onClick={() => startRename(project)}
                      title={t('projects.rename')}
                      className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setDeletingId(project.id)}
                      title={t('projects.delete')}
                      className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-700 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                    <button
                      onClick={() =>
                        void navigate({ to: '/editor/$projectId', params: { projectId: project.id } })
                      }
                      className="flex items-center gap-1.5 text-sm font-medium text-brand-400 hover:text-brand-300 px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors ml-1"
                    >
                      <FolderOpen size={15} />
                      {t('projects.open')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {exportingProject && (
        <ExportDialog
          projectId={exportingProject.project.id}
          projectName={exportingProject.project.name}
          languages={exportingProject.project.languages as LangCode[]}
          primaryLanguage={exportingProject.project.primaryLanguage}
          lines={exportingProject.lines}
          onClose={() => setExportingProject(null)}
        />
      )}
    </div>
  )
}
