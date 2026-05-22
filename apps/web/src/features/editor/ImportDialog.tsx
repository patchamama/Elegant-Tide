import { useCallback, useRef, useState } from 'react'
import type { LangCode } from '@elegant-tide/core-types'
import { linesRepo } from '@elegant-tide/db'
import { importFile, detectFormat } from '@elegant-tide/importers'
import type { ImportResult } from '@elegant-tide/importers'
import { useEditorStore } from '@/stores/useEditorStore'
import { AlertCircle, FileUp, X, Layers, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
      <div
        className="h-full bg-brand-500 rounded-full transition-all duration-100 ease-out"
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

const LANG_LABELS: Record<LangCode, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  pt: 'Português',
}

const FORMAT_ACCEPT = '.srt,.vtt,.docx,.pdf,.txt,.spectitular,.etide'

interface ImportDialogProps {
  projectId: string
  languages: LangCode[]
  primaryLanguage: LangCode
  onClose: () => void
  onImportComplete?: (detectedLanguages: LangCode[]) => void
}

type Step = 'pick' | 'preview' | 'importing' | 'done'

export function ImportDialog({ projectId, languages, primaryLanguage, onClose, onImportComplete }: ImportDialogProps) {
  const [step, setStep] = useState<Step>('pick')
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [targetLang, setTargetLang] = useState<LangCode>(primaryLanguage)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { loadLines } = useEditorStore()

  const isMultiLang = result?.format === 'spectitular' || result?.format === 'etide'
  const isSpectitular = result?.format === 'spectitular'

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setError(null)
    setStep('preview')
    try {
      const res = await importFile(f, { projectId, targetLang })
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStep('pick')
    }
  }, [projectId, targetLang])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) void handleFile(f)
  }, [handleFile])

  const handleConfirm = useCallback(async () => {
    if (!result) return
    setStep('importing')
    try {
      const res = file && !isMultiLang
        ? await importFile(file, { projectId, targetLang })
        : result
      setProgress({ done: 0, total: res.lines.length })
      for (let i = 0; i < res.lines.length; i++) {
        await linesRepo.upsert(res.lines[i]!)
        setProgress({ done: i + 1, total: res.lines.length })
      }
      await loadLines(projectId)
      setProgress(null)
      if (res.detectedLanguages && res.detectedLanguages.length > 0) {
        onImportComplete?.(res.detectedLanguages)
      }
      setStep('done')
    } catch (e) {
      setProgress(null)
      setError(e instanceof Error ? e.message : String(e))
      setStep('preview')
    }
  }, [result, file, projectId, targetLang, loadLines, isMultiLang])

  const previewLangs = isMultiLang && result?.detectedLanguages?.length
    ? result.detectedLanguages
    : [targetLang]

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <h2 className="font-semibold text-white">Import Script</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Step: pick */}
          {(step === 'pick') && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={clsx(
                  'border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors select-none',
                  dragOver
                    ? 'border-brand-500 bg-brand-950/20'
                    : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/30',
                )}
              >
                <FileUp size={32} className="text-slate-500" />
                <p className="text-slate-300 text-sm font-medium">Drop file here or click to browse</p>
                <p className="text-slate-600 text-xs">SRT · VTT · DOCX · PDF · TXT · Spectitular</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept={FORMAT_ACCEPT}
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 text-red-400 text-sm bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}
            </>
          )}

          {/* Step: preview — parsing */}
          {step === 'preview' && !result && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
              <Loader2 size={24} className="animate-spin text-brand-400" />
              <span className="text-sm">Parsing file…</span>
            </div>
          )}

          {/* Step: preview — ready */}
          {(step === 'preview' || step === 'importing') && result && (
            <>
              {/* File info */}
              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-400 truncate flex-1">{file?.name}</span>
                <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-xs uppercase tracking-wider">
                  {detectFormat(file?.name ?? '')}
                </span>
                <span className="text-slate-400">{result.lines.length} lines</span>
              </div>

              {/* Spectitular info banner */}
              {isSpectitular && (
                <div className="flex items-center gap-2 text-sm bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-2.5">
                  <Layers size={14} className="text-brand-400 flex-shrink-0" />
                  <span className="text-slate-300">
                    <span className="font-medium text-white">{result.projectName}</span>
                    {result.detectedLanguages && result.detectedLanguages.length > 0 && (
                      <> &mdash; {result.detectedLanguages.map(l => LANG_LABELS[l] ?? l.toUpperCase()).join(', ')}</>
                    )}
                  </span>
                </div>
              )}

              {/* Language picker — only for single-language formats */}
              {!isMultiLang && (
                <div className="flex items-center gap-3">
                  <label className="text-sm text-slate-400 flex-shrink-0">Import as language:</label>
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value as LangCode)}
                    className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 outline-none"
                  >
                    {languages.map((lang) => (
                      <option key={lang} value={lang}>{LANG_LABELS[lang]}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="space-y-1">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-amber-400 text-xs bg-amber-950/20 border border-amber-900/30 rounded-lg px-3 py-1.5">
                      <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Preview table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-slate-400 font-medium w-10">#</th>
                        {isSpectitular && (
                          <th className="text-left px-3 py-2 text-slate-400 font-medium w-16">Type</th>
                        )}
                        {previewLangs.map(lang => (
                          <th key={lang} className="text-left px-3 py-2 text-slate-400 font-medium">
                            {LANG_LABELS[lang] ?? lang.toUpperCase()}
                          </th>
                        ))}
                        {result.lines[0]?.timecode && (
                          <th className="text-left px-3 py-2 text-slate-400 font-medium w-32">Timecode</th>
                        )}
                        {isSpectitular && (
                          <th className="text-left px-3 py-2 text-slate-400 font-medium w-32">Note</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {result.lines.slice(0, 200).map((line, i) => (
                        <tr
                          key={line.id}
                          className={clsx(
                            i % 2 === 0 ? 'bg-transparent' : 'bg-slate-800/30',
                            line.type === 'blackout' && 'opacity-50',
                          )}
                        >
                          <td className="px-3 py-1.5 text-slate-600 tabular-nums">{i + 1}</td>
                          {isSpectitular && (
                            <td className="px-3 py-1.5">
                              {line.type === 'blackout' && (
                                <span className="text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">■</span>
                              )}
                              {line.skip && (
                                <span className="text-xs bg-yellow-900/50 text-yellow-400 px-1.5 py-0.5 rounded ml-1">skip</span>
                              )}
                            </td>
                          )}
                          {previewLangs.map(lang => (
                            <td key={lang} className={clsx(
                              'px-3 py-1.5 text-slate-200 whitespace-pre-wrap break-words',
                              line.styleClasses?.includes('italic') && 'italic',
                            )}>
                              {line.type === 'blackout'
                                ? <span className="text-slate-600">— blackout —</span>
                                : (line.translations[lang] ?? '')
                              }
                            </td>
                          ))}
                          {line.timecode && (
                            <td className="px-3 py-1.5 text-slate-500 text-xs tabular-nums whitespace-nowrap">
                              {formatMs(line.timecode.startMs)}
                            </td>
                          )}
                          {isSpectitular && (
                            <td className="px-3 py-1.5 text-slate-500 text-xs truncate max-w-32">
                              {line.comment ?? ''}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.lines.length > 200 && (
                    <p className="text-center text-slate-600 text-xs py-2">
                      …and {result.lines.length - 200} more lines
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Step: done */}
          {step === 'done' && (
            <div className="text-center py-8">
              <p className="text-slate-300 font-medium">Import complete!</p>
              <p className="text-slate-500 text-sm mt-1">{result?.lines.length} lines added to your project.</p>
              {isSpectitular && result?.detectedLanguages && result.detectedLanguages.length > 0 && (
                <p className="text-slate-600 text-xs mt-1">
                  Languages: {result.detectedLanguages.map(l => LANG_LABELS[l] ?? l).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex-shrink-0 flex items-center justify-between gap-3">
          {step === 'preview' && (
            <>
              <button
                onClick={() => { setStep('pick'); setResult(null); setFile(null) }}
                className="text-sm text-slate-400 hover:text-white transition-colors"
              >
                Choose different file
              </button>
              <button
                onClick={() => void handleConfirm()}
                disabled={step !== 'preview'}
                className="bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors disabled:opacity-50"
              >
                Import {result?.lines.length} lines
                {isSpectitular && result?.detectedLanguages && result.detectedLanguages.length > 0 && (
                  <> ({result.detectedLanguages.map(l => l.toUpperCase()).join('+')})</>
                )}
              </button>
            </>
          )}
          {step === 'importing' && progress && (
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Saving to database…</span>
                <span className="tabular-nums">{progress.done} / {progress.total}</span>
              </div>
              <ProgressBar value={Math.round((progress.done / progress.total) * 100)} />
            </div>
          )}
          {(step === 'pick' || step === 'done') && (
            <button
              onClick={onClose}
              className="ml-auto text-sm text-slate-400 hover:text-white transition-colors"
            >
              {step === 'done' ? 'Close' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const msRem = ms % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(msRem).padStart(3, '0')}`
}
