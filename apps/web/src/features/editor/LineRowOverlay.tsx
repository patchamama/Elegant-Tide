import type { SubtitleLine, LangCode } from '@elegant-tide/core-types'
import { AlignLeft, MessageSquare, Film, GripVertical } from 'lucide-react'

interface LineRowOverlayProps {
  line: SubtitleLine
  languages: LangCode[]
}

export function LineRowOverlay({ line, languages }: LineRowOverlayProps) {
  const Icon = line.type === 'comment' ? MessageSquare : line.type === 'media' ? Film : AlignLeft

  return (
    <div className="flex items-start gap-1 px-3 py-2 bg-slate-800 border border-brand-600/50 rounded-lg shadow-2xl opacity-95">
      <div className="w-5 pt-2.5 text-brand-400">
        <GripVertical size={14} />
      </div>
      <div className="w-7 pt-2.5 flex justify-center text-slate-500">
        <Icon size={13} />
      </div>
      <div className="flex-1 flex gap-1 min-w-0">
        {languages.slice(0, 2).map((lang) => (
          <div key={lang} className="flex-1 text-sm text-slate-300 py-1 px-1 truncate">
            {line.translations[lang] ?? <em className="text-slate-600">[{lang}]</em>}
          </div>
        ))}
      </div>
    </div>
  )
}
