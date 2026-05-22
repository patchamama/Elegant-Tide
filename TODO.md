# TODO — Elegant Tide

> Features derived from analysis of **Spectitular** (app.spectitular.com) and the exported
> project `Invulnerables_Kopie` (`.spectitular`, `.srt`, `.txt` files in `/Invulnerables/`).
> Compared against what is already implemented in this codebase.

---

## 🔴 High priority

### Import / Export

- [ ] **Export to SRT (mono-language)** — export one language column as a standard `.srt` file.
  Spectitular does this per-language; we have the import side but no export at all.
- [ ] **Export to SRT (bilingual)** — combine two language columns into one `.srt` file
  (e.g. ES+DE, each block showing both languages stacked). Spectitular exports this as
  `ES-DE_*.srt`.
- [ ] **Export to plain text / index** — numbered plain-text dump of one language column,
  one line per subtitle block. Spectitular exports `_index_*.txt`.
- [ ] **Import `.spectitular` format** — parse the proprietary JSON format so projects
  created in Spectitular can be migrated here. The format is documented by the file
  `Invulnerables/Invulnerables_Kopie@v207-*.spectitular`:
  - Top-level `meta` → project settings, projector config, collaborators
  - `data[]` rows → each row has `UID`, language columns (`ES`, `DE`, `EN`, `FR`…),
    `styleclasses`, `comments`, `show_*` performance logs
  - Special value `■` = blackout/separator cue
  - Multiple languages per row (import all at once instead of one-language-at-a-time)
- [ ] **Import current `Invulnerables` project** — one-off: parse
  `Invulnerables_Kopie@v207-*.spectitular` and seed it into the local DB so the team
  can work on it immediately.
- [ ] **Export to `.spectitular`** — round-trip back to Spectitular format for interop
  with teams still on that platform.

---

## 🟠 Medium priority

### Line-level features (missing from current schema / UI)

- [ ] **Skip flag** — boolean per line; skipped lines are never projected (operator can mark
  a line to omit without deleting it). Spectitular calls this column `skip`.
- [ ] **Blackout / separator line type** — a dedicated `LineType = 'blackout'` that sends a
  blank/black cue to the projector. Currently represented in Spectitular as `■` text.
  Useful as a scene break or fade-to-black cue.
- [ ] **Speaker / Role** — text field per line indicating which character speaks it.
  Helps translators and operators distinguish voices. Spectitular column: `role`.
- [ ] **Text style per line** — italic / bold / underline applied to a specific line
  without changing the global projection style. Spectitular column: `styleclasses`
  (e.g. `"italic"`). Stored as CSS class names.
- [ ] **Fade time / Fade type per line** — override the global fade setting for individual
  lines (e.g. instant cut for a fast joke, slow dissolve for a monologue).
  Spectitular columns: `fadeTime`, `fadeType`.
- [ ] **Marker / Bookmark** — navigation marker in the line list for quick jumping during
  rehearsal or performance. Spectitular column: `marker`.
- [ ] **Score reference** — optional field linking a line to a musical score page number.
  Relevant for opera/musical theatre. Spectitular column: `score`.
- [ ] **Page / Title reference (prNumber)** — a display text that can be shown on the
  projector instead of the translation (e.g. act/scene titles). Spectitular column:
  `prNumber`, also assignable to a projector box `lang`.

### Project structure

- [ ] **Act / Scene hierarchy** — allow lines to be grouped into Acts and Scenes. Spectitular
  stores these as columns (`act`, `scene`) on each row. In our model, could be a header
  `LineType = 'section'` or explicit fields on `SubtitleLine`.
- [ ] **Project meta fields** — title, copyright notice, production warning (displayed in
  the editor header). Spectitular has `metaInfo`, `metaWarning`, `metaCopyright`.
- [ ] **Custom CSS per project** — a text area in Settings where the operator can write
  raw CSS that is injected into the projector window. Allows per-production branding
  without touching code. Spectitular field: `customcss`.
- [ ] **Canvas / background style per line** — per-line background class override so a
  specific cue can have a different background color or image. Spectitular: `bgclasses`.

---

## 🟡 Lower priority

### Performance / Show tracking

- [ ] **Show session log** — record the exact timestamp when each line is projected during
  a live performance. Spectitular stores this per show instance as a column
  `show_YYYYMMDDHHMMSS` with `{ launched: [epochMs, …] }`. Enables:
  - Post-show review: replay the full projection timeline of any past performance.
  - Stats: which lines were double-triggered, how long each stayed on screen.
- [ ] **Multiple show instances** — a project can have many named shows (e.g.
  "Opening Night 2026-04-13", "Saturday matinée"). Each show is a separate log column.
- [ ] **Show replay viewer** — playback UI that re-renders what the audience saw, second
  by second, from the show log.

### Projector enhancements

- [ ] **Multiple text boxes per projector window** — Spectitular supports up to 4
  independent text boxes per projector, each showing a different language or field
  (e.g. box1 = DE, box2 = ES, box3 = prNumber). Our `ProjectorWindowConfig` currently
  has one language per window.
- [ ] **Per-box fading** — each projector text box has its own fade-in/out setting.
- [ ] **Brightness / light cue** — send a light level (0–100%) alongside a subtitle cue
  for integration with DMX-compatible lighting desks. Spectitular column: `brightness`.
- [ ] **Projector setup wizard** — guided flow for positioning and sizing projector windows
  on screen. Spectitular has a `setup: true/false` flag per projector.

### Collaborator enhancements

- [ ] **Column-level write permissions** — restrict a collaborator to editing only specific
  language columns (e.g. a German translator can only edit `DE`). Spectitular:
  `writeColumns: []` per collaborator.
- [ ] **Read-only collaborator role** — Spectitular has `accessType: "full"` vs implied
  read-only. Our schema has `viewer` role but it may not be fully enforced in the API.

### Import enhancements

- [ ] **Multi-language import in one pass** — when importing a `.spectitular` file, all
  language columns are imported simultaneously into the correct translation slots,
  instead of the current one-language-at-a-time flow.
- [ ] **Import with comments** — preserve the operator `comments` field from `.spectitular`
  rows as the `comment` field on the imported lines.
- [ ] **Import with timecodes** — `.spectitular` rows optionally carry a `timecode` column;
  preserve these during import so SRT-style playback sync works.

---

## ✅ Already implemented

- Import: SRT, VTT, DOCX, PDF, plain TXT (single-language)
- Multi-language translations per line
- Timecode per line (from SRT/VTT import)
- Comment / stage direction per line
- Media cue line type (YouTube, Vimeo, URL)
- Collaborators with author / translator / viewer roles
- Multiple projector windows (one language each)
- Projection style per window (font, color, size, shadow, etc.)
- Last-write-wins sync with conflict detection
- Offline-first with outbox + push/pull
- Auth (register, login, JWT, refresh)
- Projects list, create, delete (soft)
- i18n scaffold (locale setting)
