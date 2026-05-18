# Elegant Tide

> Theater subtitle projection system — offline-first, multi-language, multi-window.

Elegant Tide lets a stage operator manage subtitle scripts and project them live to N screens during a theater production. It works entirely offline; the backend is optional and only needed for team collaboration and cloud sync.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Monorepo structure](#monorepo-structure)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Development](#development)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Building for production](#building-for-production)
- [Deploy](#deploy)
  - [Web / PWA](#web--pwa)
  - [Desktop (Electron)](#desktop-electron)
  - [Android (Capacitor)](#android-capacitor)
  - [Backend API](#backend-api)
- [Testing](#testing)
- [Key technical decisions](#key-technical-decisions)
- [Pending / known limitations](#pending--known-limitations)

---

## Features

- **Subtitle editor** — create and edit scripts with one column per language; supports up to 6 languages (EN, ES, DE, FR, IT, PT)
- **Line operations** — insert before/after, split (two-color preview), join, delete, drag-and-drop reorder
- **Import** — SRT, WebVTT, DOCX (Word), PDF, plain text
- **Multi-window projection** — control panel + N projector windows via BroadcastChannel; each window configurable independently (language, font, colors, opacity, position)
- **Media cues** — embed YouTube, Vimeo, direct video/audio URLs as subtitle lines; plays in the projector window
- **Comment lines** — non-projected notes for the operator
- **Translation suggestions** — DeepL and Google Translate via backend proxy (API keys never reach the client)
- **Offline-first PWA** — full functionality without internet; 7-day connectivity grace window when a backend is configured
- **Electron desktop app** — native windows, multi-monitor projector assignment, secure token storage, native file dialogs, auto-update
- **Android app** — Capacitor wrapper for Google Play distribution

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Client (web/desktop/mobile)    │
│                                                  │
│  React 19  ──  TanStack Router  ──  Zustand      │
│                     │                            │
│              Dexie (IndexedDB)                   │
│         ┌───────────┴──────────┐                 │
│    Outbox queue          Live queries            │
│         └─────────┐           │                 │
│              Sync engine  Stores                 │
│                   │                              │
│         BroadcastChannel API                     │
│    (control ↔ projector windows, same origin)    │
└──────────────────────┬───────────────────────────┘
                       │ HTTPS (optional)
┌──────────────────────▼───────────────────────────┐
│                  Backend (servers/api)            │
│                                                  │
│  Fastify 5  ──  Prisma 6  ──  PostgreSQL         │
│  JWT (access + refresh)  ──  argon2 hashing      │
│  /sync/push  /sync/pull  /translate/deepl|google │
└──────────────────────────────────────────────────┘
```

### Data flow

| Write | Read |
|---|---|
| UI → Zustand store → Dexie | Dexie live queries → Zustand → React |
| Dexie write → OutboxEntry enqueued | Pull worker applies remote changes (LWW) |
| Flush worker sends outbox to `/sync/push` | BroadcastChannel delivers cues to projectors |

**Conflict resolution**: last-write-wins by `updatedAt`. Manual conflict drawer surfaces collisions from the server response.

---

## Monorepo structure

```
elegant-tide/
├── apps/
│   ├── web/              # Vite + React 19 — PWA (core app)
│   ├── desktop/          # Electron wrapper (electron-vite + electron-builder)
│   ├── mobile/           # Capacitor Android wrapper
│   └── e2e/              # Playwright end-to-end tests
├── packages/
│   ├── core-types/       # Shared TypeScript types (SubtitleLine, SubtitleProject, …)
│   ├── db/               # Dexie schema v1 + repositories
│   ├── importers/        # SRT, VTT, DOCX, PDF, plaintext parsers
│   ├── broadcast-protocol/ # Typed BroadcastChannel message contract
│   └── sync/             # Outbox + push/pull sync engine
└── servers/
    └── api/              # Fastify + Prisma + PostgreSQL
```

**Package manager**: pnpm 9+ with `workspace:*` references  
**Build orchestration**: Turborepo  
**Naming**: `@elegant-tide/<package>`

---

## Prerequisites

| Tool | Minimum version |
|---|---|
| Node.js | 20 |
| pnpm | 9 |
| PostgreSQL | 15 (only if using the backend) |

---

## Getting started

```bash
# 1. Clone and install all dependencies
git clone <repo-url> elegant-tide
cd elegant-tide
pnpm install

# 2. Start the web dev server (no backend needed)
./start-frontend.sh
# → http://localhost:5173
```

The app works fully offline. Skip to [Deploy → Web / PWA](#web--pwa) if you only need the PWA.

---

## Development

### Web app only

```bash
./start-frontend.sh
# or
pnpm --filter @elegant-tide/web dev
```

Routes available at `http://localhost:5173`:

| Route | Description |
|---|---|
| `/` | Project list |
| `/editor/:projectId` | Subtitle editor |
| `/control/:projectId` | Operator control panel |
| `/projector/:projectId` | Projection window |
| `/settings` | App settings (locale, backend URL) |

### Backend API (optional)

```bash
# 1. Create the env file
cp servers/api/.env.example servers/api/.env
# Edit servers/api/.env — see Environment variables below

# 2. Start (runs db push automatically on first run)
./start-backend.sh
# → http://localhost:3001
```

### Electron desktop (dev mode)

```bash
pnpm --filter @elegant-tide/desktop dev
```

### All packages — typecheck / lint

```bash
pnpm typecheck
pnpm lint
```

---

## Environment variables

Create `servers/api/.env` (copy from `.env.example`):

```env
# Required
DATABASE_URL="postgresql://user:password@localhost:5432/elegant_tide"
JWT_SECRET="change-me-at-least-32-chars"
JWT_REFRESH_SECRET="another-secret-at-least-32-chars"

# Optional
PORT=3001
CORS_ORIGIN="http://localhost:5173"

# Translation proxy — keys never reach the client
DEEPL_API_KEY=""
GOOGLE_TRANSLATE_API_KEY=""
```

The web app reads the backend URL from its own settings page (`/settings`). No `.env` is needed for the client in development.

---

## Database

Prisma manages the PostgreSQL schema under `servers/api/prisma/schema.prisma`.

```bash
cd servers/api

# First-time setup or after schema changes (dev only)
pnpm db:push

# Generate a migration file (production workflow)
pnpm db:migrate

# Regenerate the Prisma client after schema edits
pnpm db:generate
```

**Tables**: `User`, `Project`, `Collaborator`, `Line`, `RefreshToken`

---

## Building for production

### Web PWA

```bash
pnpm --filter @elegant-tide/web build
# Output: apps/web/dist/
```

### Desktop (Electron)

```bash
# Build web first, then package Electron
pnpm --filter @elegant-tide/web build
pnpm --filter @elegant-tide/desktop build
pnpm --filter @elegant-tide/desktop package

# Output: apps/desktop/dist/package/
# Produces: NSIS installer (Windows), DMG (macOS), AppImage (Linux)
```

### Android (Capacitor)

```bash
# Build web first, then sync to Android project
pnpm android:build

# Open in Android Studio to run on device / generate APK / AAB
pnpm android:open
```

> The Android project is generated under `apps/mobile/android/` after running `pnpm android:sync` for the first time. Add it to `.gitignore` or commit it — your choice.

### Backend API

```bash
cd servers/api
pnpm build          # tsc → dist/
pnpm start          # node dist/server.js
```

---

## Deploy

### Web / PWA

The build output is a static site — deploy `apps/web/dist/` to any CDN or static host.

**Vercel**
```bash
vercel --cwd apps/web
```

**Netlify** — set build command to `pnpm --filter @elegant-tide/web build`, publish dir to `apps/web/dist`.

**Nginx** — serve `dist/` and add a catch-all rewrite so the SPA router works:

```nginx
server {
    listen 80;
    root /var/www/elegant-tide;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

> The PWA service worker pre-caches the app shell at deploy time. Users can open the app after the first visit with no internet.

### Desktop (Electron)

Distribute the installer files from `apps/desktop/dist/package/`.

Auto-update is wired via `electron-updater`. It points to `https://releases.elegant-tide.com` (configured in `apps/desktop/package.json` → `build.publish`). Point that URL at a static host that serves the `latest.yml` / `latest-mac.yml` files generated by `electron-builder`.

### Android (Capacitor)

1. Run `pnpm android:open` to open the project in Android Studio.
2. Set the signing keystore in Android Studio (Build → Generate Signed Bundle / APK).
3. Upload the AAB to Google Play Console.

The app ID is `com.elegantTide.app` (set in `apps/mobile/capacitor.config.ts`).

### Backend API

Any Node 20 host works (Railway, Render, Fly.io, a plain VPS).

**Docker example**:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm && pnpm install --frozen-lockfile
RUN pnpm --filter @elegant-tide/api build
CMD ["node", "servers/api/dist/server.js"]
```

**Environment variables** must be set on the host (see [Environment variables](#environment-variables)).

Run `prisma migrate deploy` (not `db push`) on first deploy and after each schema change:

```bash
cd servers/api && npx prisma migrate deploy
```

---

## Testing

### End-to-end (Playwright)

```bash
# Install browsers once
pnpm --filter @elegant-tide/e2e exec playwright install chromium

# Run all e2e tests (starts Vite dev server automatically)
pnpm e2e

# Open Playwright UI
pnpm e2e:ui

# View last HTML report
pnpm --filter @elegant-tide/e2e test:report
```

**Test suites**:

| File | What it covers |
|---|---|
| `golden-path.spec.ts` | Create project → import SRT → edit line → control panel → projector BroadcastChannel update |
| `performance.spec.ts` | Seed 2000 lines via IndexedDB → scroll latency < 50ms → projector cue update < 100ms |

---

## Key technical decisions

| Concern | Choice | Reason |
|---|---|---|
| Router | TanStack Router (file-based) | Type-safe route params |
| State | Zustand (sliced stores) | No provider, multi-window friendly |
| Persistence | Dexie v4 (IndexedDB) | Mature, observable hooks, offline-first |
| Drag & drop | @dnd-kit/core | React 19 compatible, accessible |
| Virtualization | @tanstack/react-virtual | 1000+ line scripts without DOM bloat |
| Multi-window comms | BroadcastChannel API | Same-origin, works in PWA and Electron |
| Media | react-player | YouTube, Vimeo, HLS, direct files — one component |
| PWA | vite-plugin-pwa (`injectManifest`) | Custom service worker with IndexedDB-aware caching |
| Auth tokens | httpOnly cookie (web) / Electron safeStorage / Capacitor Preferences | Best practice per runtime |
| Translation keys | Proxied via backend | API keys never shipped to client |
| Conflict resolution | LWW by `updatedAt`; manual-resolve drawer for collisions | Simple default, escape hatch when needed |
| Line ordering | Fractional index (gaps of 1024, `midOrder()`) | O(1) reorder, compacts when gaps shrink |
| Desktop | Electron + electron-vite | IPC bridge for OS-level window management |
| Android | Capacitor | Wraps the same web build, no duplicate logic |

---

## Pending / known limitations

- **`apps/mobile/android/`** — the Android platform directory is generated by `cap add android` (a one-time command). It is not committed to the repo. Run `pnpm android:sync` after a clean clone to regenerate it.

- **Translation suggestions** require a running backend with `DEEPL_API_KEY` or `GOOGLE_TRANSLATE_API_KEY` set. The Sparkles button is hidden when no backend is configured.

- **7-day connectivity gate** — if a backend URL is configured and the app hasn't reached it for 7 days, it blocks the UI until reconnected. Pure-local mode (no backend URL set) is unaffected.

- **Electron code signing** — the `electron-builder` config has no signing certificates. Unsigned builds will trigger OS security warnings on Windows and macOS. Add your certificates to the CI environment and the `build` config in `apps/desktop/package.json`.

- **Electron auto-update URL** (`https://releases.elegant-tide.com`) is a placeholder. Point it at a real static host before distributing.

- **Capacitor plugins installed but Android platform not initialized** — `@capacitor/filesystem` and `@capacitor/preferences` are declared as dependencies but the platform directory doesn't exist until `cap add android` is run. The file import dialog falls back to the standard browser `<input type="file">` on mobile (which works in WebView) — no Capacitor-specific file picker is wired yet.

- **No unit tests** — the test suite is Playwright e2e only. Vitest unit tests for `packages/importers` and `packages/sync` are planned.

- **No CI pipeline** — a GitHub Actions workflow (typecheck → lint → e2e) is not yet defined.

- **Google Play signing** — the Android build requires a keystore. This is not automated; it must be done manually in Android Studio or via Fastlane.
