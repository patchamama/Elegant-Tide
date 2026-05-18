import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, conflictsRepo } from '@elegant-tide/db'
import { resolveKeepLocal, resolveKeepRemote } from '@elegant-tide/sync'
import type { LangCode, SubtitleLine, SyncConflict } from '@elegant-tide/core-types'
import { X, AlertTriangle, Cloud, HardDrive, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'

interface ConflictsDrawerProps {
  projectId: string
  languages: LangCode[]
  onClose: () => void
}

export function ConflictsDrawer({ projectId, languages, onClose }: ConflictsDrawerProps) {
  const conflicts = useLiveQuery(
    () => db.conflicts.where('projectId').equals(projectId).sortBy('detectedAt'),
    [projectId],
    [],
  )

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-stretch justify-end z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-slate-900 border-l border-slate-700 w-full max-w-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-400" />
            <h2 className="font-semibold text-white">Sync Conflicts</h2>
            {conflicts.length > 0 && (
              <span className="bg-amber-500/20 text-amber-300 text-xs px-2 py-0.5 rounded-full">
                {conflicts.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {conflicts.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-400 text-sm">No pending conflicts.</p>
              <p className="text-slate-600 text-xs mt-2">
                When a local edit collides with a newer remote change, it will appear here.
              </p>
            </div>
          ) : (
            conflicts.map((conflict) => (
              <ConflictRow key={conflict.id} conflict={conflict} languages={languages} />
            ))
          )}
        </div>

        {/* Footer */}
        {conflicts.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-800 flex-shrink-0 flex justify-between items-center">
            <p className="text-xs text-slate-500">
              Choose <strong className="text-slate-300">local</strong> to push yours, or{' '}
              <strong className="text-slate-300">server</strong> to discard local edits.
            </p>
            <button
              onClick={() => void conflictsRepo.clearAll(projectId)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors"
              title="Clear all without resolving"
            >
              <Trash2 size={12} />
              Clear all
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface ConflictRowProps {
  conflict: SyncConflict
  languages: LangCode[]
}

function ConflictRow({ conflict, languages }: ConflictRowProps) {
  const [resolving, setResolving] = useState<'local' | 'remote' | null>(null)

  const handleKeepLocal = async () => {
    setResolving('local')
    try {
      await resolveKeepLocal(conflict.id)
    } finally {
      setResolving(null)
    }
  }

  const handleKeepRemote = async () => {
    setResolving('remote')
    try {
      const applied = await resolveKeepRemote(conflict.id)
      if (!applied) {
        // Remote not yet known — surface to user
        alert('Remote version not yet downloaded. Wait a few seconds for the next pull cycle and try again.')
      }
    } finally {
      setResolving(null)
    }
  }

  const localPreview = previewText(conflict.localLine, languages)
  const remotePreview = conflict.remoteLine ? previewText(conflict.remoteLine, languages) : null

  return (
    <div className="border border-amber-900/30 bg-amber-950/10 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-amber-950/30 border-b border-amber-900/30 flex items-center justify-between">
        <span className="text-xs text-amber-300 font-mono truncate">{conflict.id.slice(0, 12)}…</span>
        <span className="text-xs text-slate-500">
          Detected {formatRelative(conflict.detectedAt)}
        </span>
      </div>

      <div className="grid grid-cols-2 divide-x divide-slate-800">
        {/* Local side */}
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-blue-400">
            <HardDrive size={12} />
            Local (your edit)
          </div>
          <div className="text-sm text-slate-200 whitespace-pre-wrap break-words min-h-[3rem]">
            {localPreview || <span className="text-slate-600 italic">empty</span>}
          </div>
          <button
            onClick={() => void handleKeepLocal()}
            disabled={resolving !== null}
            className={clsx(
              'w-full mt-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors',
              'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50',
            )}
          >
            {resolving === 'local' ? 'Pushing…' : 'Keep local'}
          </button>
        </div>

        {/* Remote side */}
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-emerald-400">
            <Cloud size={12} />
            Server (newer)
          </div>
          <div className="text-sm text-slate-200 whitespace-pre-wrap break-words min-h-[3rem]">
            {remotePreview ?? (
              <span className="text-slate-600 italic">Loading from server…</span>
            )}
          </div>
          <button
            onClick={() => void handleKeepRemote()}
            disabled={resolving !== null || !conflict.remoteLine}
            className={clsx(
              'w-full mt-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors',
              'bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {resolving === 'remote' ? 'Applying…' : 'Keep server'}
          </button>
        </div>
      </div>
    </div>
  )
}

function previewText(line: SubtitleLine, languages: LangCode[]): string {
  if (line.deletedAt) return '(deleted)'
  if (line.type === 'comment') return `// ${line.comment ?? ''}`
  if (line.type === 'media') return `🎬 ${line.media?.url ?? ''}`
  return languages
    .map((lang) => line.translations[lang])
    .filter(Boolean)
    .join(' · ')
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}
