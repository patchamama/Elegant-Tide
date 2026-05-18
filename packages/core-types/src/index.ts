// ─── Language & Line types ────────────────────────────────────────────────────

export type LangCode = 'en' | 'es' | 'de' | 'fr' | 'it' | 'pt'

export type LineType = 'subtitle' | 'comment' | 'media'

export type MediaSourceType = 'youtube' | 'vimeo' | 'url-video' | 'url-audio'

// Partial because user may not have translated every language yet
export type Translations = Partial<Record<LangCode, string>>

// ─── Media ────────────────────────────────────────────────────────────────────

export interface MediaPayload {
  sourceType: MediaSourceType
  url: string
  autoplay: boolean
  loop?: boolean
  startSeconds?: number
  endSeconds?: number
  volume?: number // 0..1
}

// ─── Projection style ────────────────────────────────────────────────────────

export interface ProjectionStyle {
  fontFamily: string
  fontSizePx: number
  fontWeight: 400 | 600 | 700
  textColor: string       // hex or rgba
  backgroundColor: string // hex, rgba, or 'transparent'
  textShadow: string      // CSS shadow string, '' to disable
  paddingPx: number
  textAlign: 'left' | 'center' | 'right'
  lineHeight: number      // unitless multiplier
  borderRadiusPx?: number
}

export const DEFAULT_PROJECTION_STYLE: ProjectionStyle = {
  fontFamily: 'Inter, sans-serif',
  fontSizePx: 48,
  fontWeight: 600,
  textColor: '#ffffff',
  backgroundColor: 'rgba(0,0,0,0.7)',
  textShadow: '0 2px 4px rgba(0,0,0,0.8)',
  paddingPx: 16,
  textAlign: 'center',
  lineHeight: 1.4,
  borderRadiusPx: 4,
}

// ─── Projector window config ──────────────────────────────────────────────────

export interface ProjectorWindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ProjectorWindowConfig {
  id: string              // stable UUID for this window slot
  label: string           // 'Stage Left', 'Balcony', ...
  language: LangCode
  style: ProjectionStyle
  bounds?: ProjectorWindowBounds
  opacity: number         // 0..1
  showMedia: boolean      // whether this window plays media cues
  isOpen: boolean         // runtime: whether the OS window is open
}

// ─── Subtitle line ───────────────────────────────────────────────────────────

export interface SubtitleLine {
  id: string              // ULID
  projectId: string
  type: LineType
  order: number           // fractional index — gaps of 1024 initially
  translations: Translations
  comment?: string        // for type='comment': stage direction text (not projected)
  media?: MediaPayload    // for type='media'
  timecode?: { startMs: number; endMs: number } // optional, from SRT/VTT import
  updatedAt: number       // epoch ms — used for last-write-wins sync
  updatedBy: string       // userId or 'local'
  version: number         // server-issued; -1 means local-only (never synced)
  deletedAt?: number      // tombstone epoch ms — soft delete for sync
}

// ─── Project ─────────────────────────────────────────────────────────────────

export type CollaboratorRole = 'author' | 'translator' | 'viewer'

export interface Collaborator {
  userId: string
  role: CollaboratorRole
  addedAt: number
}

export interface SubtitleProject {
  id: string              // ULID
  name: string
  description?: string
  languages: LangCode[]   // active translation columns
  primaryLanguage: LangCode // source language — translation suggestions source from this
  defaultStyle: ProjectionStyle
  projectorWindows: ProjectorWindowConfig[]
  ownerId?: string        // null in pure-local mode
  collaborators: Collaborator[]
  createdAt: number
  updatedAt: number
  version: number         // server-issued; -1 = local-only
  deletedAt?: number
}

// ─── Sync / Outbox ───────────────────────────────────────────────────────────

export type MutationOp =
  | { kind: 'project.upsert'; project: SubtitleProject }
  | { kind: 'project.delete'; projectId: string; deletedAt: number }
  | { kind: 'line.upsert'; line: SubtitleLine }
  | { kind: 'line.delete'; lineId: string; projectId: string; deletedAt: number }

export interface OutboxEntry {
  id: string              // ULID
  op: MutationOp
  enqueuedAt: number
  attempts: number
  lastError?: string
  lastAttemptAt?: number
}

// ─── Connectivity guard ──────────────────────────────────────────────────────

export interface ConnectivityRecord {
  id: 1                   // singleton row
  lastServerSuccessAt: number | null
  backendConfigured: boolean
  graceWindowMs: number   // default: 7 * 24 * 3600 * 1000
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  accessExpiresAt: number // epoch ms
}

// ─── App config (persisted locally) ──────────────────────────────────────────

export interface AppConfig {
  id: 1                   // singleton row
  locale: LangCode
  backendUrl?: string     // if set, backendConfigured = true
  theme: 'light' | 'dark' | 'system'
  lastOpenedProjectId?: string
}

// ─── Translation provider ────────────────────────────────────────────────────

export interface TranslationRequest {
  text: string
  sourceLang: LangCode
  targetLang: LangCode
}

export interface TranslationResult {
  translatedText: string
  provider: 'deepl' | 'google'
  confidence?: number
}

// ─── BroadcastChannel protocol ───────────────────────────────────────────────
// Full discriminated union lives in @elegant-tide/broadcast-protocol.
// Here we only export the envelope shape so core-types stays dep-free.

export interface BroadcastEnvelope<T = unknown> {
  v: 1
  id: string              // ULID — used for dedup
  ts: number              // sender epoch ms
  from: { role: 'control' | 'projector'; windowId: string }
  to?: { windowId: string } // omit = broadcast to all
  msg: T
}
