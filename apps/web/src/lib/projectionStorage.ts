const key = (projectId: string) => `projection:${projectId}:currentLineId`
const bookmarkKey = (projectId: string) => `editor:${projectId}:bookmarkLineId`

export function saveCurrentLineId(projectId: string, lineId: string) {
  localStorage.setItem(key(projectId), lineId)
}

export function loadCurrentLineId(projectId: string): string | null {
  return localStorage.getItem(key(projectId))
}

export function saveBookmarkLineId(projectId: string, lineId: string | null) {
  if (lineId === null) localStorage.removeItem(bookmarkKey(projectId))
  else localStorage.setItem(bookmarkKey(projectId), lineId)
}

export function loadBookmarkLineId(projectId: string): string | null {
  return localStorage.getItem(bookmarkKey(projectId))
}

const columnsKey = (projectId: string) => `editor:${projectId}:columns`

export interface ColumnState {
  languages: string[]   // ordered list of visible lang codes
  showNotes: boolean
}

export function saveColumnState(projectId: string, state: ColumnState) {
  localStorage.setItem(columnsKey(projectId), JSON.stringify(state))
}

export function loadColumnState(projectId: string): ColumnState | null {
  try {
    const raw = localStorage.getItem(columnsKey(projectId))
    return raw ? (JSON.parse(raw) as ColumnState) : null
  } catch {
    return null
  }
}
