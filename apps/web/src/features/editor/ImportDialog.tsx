import type { LangCode } from '@elegant-tide/core-types'
import { X } from 'lucide-react'

interface ImportDialogProps {
  projectId: string
  languages: LangCode[]
  primaryLanguage: LangCode
  onClose: () => void
}

// Phase 3 will implement actual parsers (SRT/VTT/DOCX/PDF)
export function ImportDialog({ onClose }: ImportDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white">Import Script</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-slate-400 text-sm">
          Import coming in Phase 3. Supported formats: SRT, VTT, DOCX, PDF.
        </p>
      </div>
    </div>
  )
}
