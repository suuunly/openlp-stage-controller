# CLAUDE.md — OpenLP Stage Remote Controller

> Persistent project memory for Claude Code. Read this first every session.

---

## 1. Project Summary

A **stage-facing remote controller** web app that lets singers and speakers on stage
directly control what appears on the church's big screens via OpenLP — without exposing
the full OpenLP interface. **Android Auto philosophy**: big tap targets, high contrast,
one action per screen, keyboard/HID (foot pedal / clicker) first. **iPad-first**, landscape.

Views (one active at a time):
- **🎤 Song Navigator** — inline list of the service's songs; the live song expands with
  tappable slide-number pills; PREV/NEXT roll across songs; foot-pedal + swipe.
- **📖 Bible Verses** — (Phase 2) stacked Book ▸ Chapter ▸ verse hierarchy, 30/70 split,
  live verse on the right with faded prev/next context.
- **🖼️ Images** — (Phase 2) scrollable thumbnail grid, tap to show, "ON SCREEN" badge.
- **📊 Presentation** — (Phase 3) current slide, speaker notes, next preview, big nav.
- **⚙️ Settings** — per-device OpenLP connection config.

The tech operator keeps full control of OpenLP; this app is **additive**.

---

## 2. Tech Stack

- **React 18 + Vite 5 + TypeScript** (strict). Built to `dist/`, shipped via GitHub Releases.
- **Styling:** CSS Modules per component + a global design-token layer
  (`src/styles/tokens.css`, CSS custom properties — the Elim palette, spacing, type scale).
  No CSS framework.
- **Testing (from day one):** Vitest + React Testing Library (jsdom) for unit/component;
  Playwright (iPad landscape / WebKit) for e2e.
- **Icons:** inline SVG (`src/components/Icon.tsx`) — replaces the design's Material Symbols
  webfont so there is **zero runtime CDN/font dependency** (the church LAN is often offline).
- **Fonts:** self-hosted woff2 in `src/assets/fonts/` (Schibsted Grotesk = UI,
  Newsreader = scripture/lyrics serif), declared in `src/styles/fonts.css`. Bundled +
  fingerprinted by Vite; they are variable fonts so identical-content weights dedupe.

> History: started as a vanilla HTML/CSS/JS plan (see old task ACs), pivoted to React+Vite.
> The behavioral acceptance criteria still apply; the "no bundler / index.html+styles.css+app.js"
> wording in the task fragments is superseded.

---

## 3. File Structure

```
/
├── index.html                 # Vite entry (mounts #root)
├── vite.config.ts             # base: './' (drop-in subpath), Vitest config
├── playwright.config.ts       # iPad-landscape e2e against the built bundle
├── tsconfig*.json
├── src/
│   ├── main.tsx               # React root; imports fonts.css, tokens.css, global.css
│   ├── App.tsx                # renders the single active view + ConnectionBanner
│   ├── state/AppContext.tsx   # app-wide state: settings, view, connection, live item,
│   │                          #   service items, blanked + action helpers + the ONE WebSocket
│   ├── lib/
│   │   ├── types.ts           # Settings, ServiceItem, LiveItem, events…
│   │   ├── storage.ts         # localStorage load/save, STORAGE_KEYS, font-size body class
│   │   ├── api.ts             # apiFetch() helper, typed actions, normalizers (stripHtml,
│   │   │                      #   normalizeLiveItem) — all network goes through here
│   │   └── websocket.ts       # OpenLpSocket: reconnecting WS + parseMessage()
│   ├── hooks/
│   │   ├── useTapGuard.ts     # direction-keyed debounce (iOS ghost double-fire fix)
│   │   └── useSwipe.ts        # swipe left=next / right=prev
│   ├── components/            # Icon, AppHeader, ConnectionBanner, Placeholder (+ .module.css)
│   ├── views/                 # SettingsView, HomeView, SongView (+ .module.css),
│   │                          #   BibleView / ImagesView / PresentationView (placeholders)
│   ├── styles/                # fonts.css, tokens.css, global.css
│   ├── assets/fonts/          # self-hosted woff2
│   └── test/setup.ts          # jest-dom, WebSocket mock, per-test storage reset
└── e2e/                       # Playwright specs (smoke.spec.ts)
```

Views render conditionally in `App.tsx` (the React equivalent of "one `.view` is `.active`").

### Commands
`npm run dev` · `npm run build` · `npm run preview` · `npm run test` (Vitest) ·
`npm run test:e2e` (Playwright) · `npm run typecheck`

---

## 4. Deployment (NOT GitHub Pages for the running app)

Build (`npm run build` → `dist/`) is served from OpenLP's own web server as a **Custom
Stage View** — same origin as the API, so zero CORS / mixed-content issues.
`vite base: './'` makes all asset URLs relative so the build drops in unmodified.

**On the OpenLP PC:** Tools → Open Data Folder → `stages/` → create `elim-remote/`, then
copy the **contents of `dist/`** in:

```
DataFolder/stages/elim-remote/   ← contents of dist/
├── index.html
└── assets/...
```

**Access from any LAN device:** `http://<openlp-ip>:4316/stage/elim-remote/`

GitHub = source control + distribution (Releases carry a built `dist` zip). Other churches
download the zip and drop it into their own `stages/` folder (TASK-09).

---

## 5. Usable Workspace

- **Workspace:** `Elim` — ID `cd1e08b9-4065-432f-ac03-d3e8f673f7fd` (pass `workspaceId` on every call).
- **PRD:** `8e8f34db-84bd-40ff-b162-5c4012307fde` · **API Reference:** `7331ff8d-a3e7-47d6-a317-fb67c2354f67`
- **Design source:** Claude Design bundle "OpenLP Stage Controller" (Elim green `#7ba451`,
  Schibsted Grotesk + Newsreader, redesigned inline song list, Bible hierarchy, touch fixes).
  The chat transcript in that bundle is the source of truth for design intent.
- **Find tasks:**
  `list-memory-fragments({ workspaceId, query: "tags @> ARRAY['openlp','stage-remote'] AND title ILIKE '%TASK%'", orderBy: "title ASC" })`
- **Before a task:** read its full fragment. **On completion:** `update-memory-fragment`
  with a `replace` patchOperation: `**Status:** 🔲 Todo` → `**Status:** ✅ Done`.

---

## 6. Task Index

| Task | Fragment ID | Phase | Status |
|------|-------------|-------|--------|
| TASK-01 — Project Setup & Settings View      | `28989691-96bb-40a2-9a77-7f0cb5e51599` | 1 | ✅ Done |
| TASK-02 — Home / Role Selector View          | `c16c86b1-9522-43c6-89f5-7414e2222da9` | 1 | ✅ Done |
| TASK-03 — WebSocket Connection & Real-Time   | `073e880c-aa74-4460-bff4-fba49aaa3068` | 1 | ✅ Done |
| TASK-04 — Song Navigator View                | `2664c59e-4630-498e-af15-8ddacab134b4` | 1 | ✅ Done |
| TASK-05 — Bible Verse View                    | `bcbbab57-7104-4a33-a3fb-014dd1078956` | 2 | 🔲 Todo |
| TASK-06 — Images View                         | `3eec9c67-a2aa-4317-ac8f-9cbf0f2142ab` | 2 | 🔲 Todo |
| TASK-07 — Presentation View                   | `2b983cc9-3840-43e7-8f31-4f9efbf72f0c` | 3 | 🔲 Todo |
| TASK-08 — Polish, Error States & UX           | `a1dac5cf-9720-42b0-93b1-3465c1ef2f02` | 4 | 🔲 Todo |
| TASK-09 — GitHub Distribution & Setup Guide   | `81eb34f2-2b2e-49b1-874a-5224db35364a` | 5 | 🔲 Todo |

Order: Phase 1 (01→04) → **pause for review** → Phase 2 (05→06) → Phase 3 (07) → Phase 4 (08) → Phase 5 (09).

---

## 7. Key Design Rules (PRD §5 + design spec)

- Accent = **Elim green `#7ba451`** (gradient `#8cbf60→#6e9a43`, glow on primary buttons).
  Green = live/connected; amber `#e0a23a` = reconnecting/blanked. Dark warm-charcoal surfaces.
- Big buttons: **≥80px** nav (we use 88px), **≥60px** secondary. Dark bg, bright text.
- One action per screen; **no confirmation dialogs** for display actions (tap = immediate).
- **Immediate visual feedback** on press (`transform: scale`).
- **Keyboard/HID first** — Next: `→ Space Enter PageDown`; Prev: `← Backspace PageUp`;
  Blank: `Esc`. Touch: swipe + **direction-keyed debounce** (`useTapGuard`) to kill iOS
  ghost double-fire (NEXT jumping +2).
- Font size small/medium/large → `body` class `font-small|font-medium|font-large`
  (drives `--reading-size`), persisted to localStorage.

---

## 8. API Pattern

All network calls go through **`apiFetch()`** (`src/lib/api.ts`). Base URL from settings:
`http://<host>:<port>/api/v2/<endpoint>` (default port 4316). Optional HTTP Basic auth.

- **One** app-wide WebSocket (`ws://<host>:<port>/ws`, `OpenLpSocket`), started after the
  app is configured; reconnects with exponential backoff (1→2→4…max 30s). Views read from
  `AppContext`; they must NOT open their own socket.
- Events handled: `slidecontroller_changed`, `service_changed`, `blank_changed`.
- OpenLP responses vary by version & may be wrapped in `results` — normalize defensively
  (`normalizeLiveItem`, `normalizeServiceItem` handle object + array-of-slides shapes).
- Settings "Test Connection" passes the in-progress (unsaved) connection to `fetchState`.

---

## 9. Hard Rules

- All network calls go through `apiFetch()`.
- One active view at a time (conditional render in `App.tsx`).
- `localStorage` for settings; `sessionStorage` for ephemeral state (e.g. verse history).
- Every navigation action must be keyboard-triggerable.
- No `console.log` in committed code. Keep `npm run typecheck` + `npm run test` green.
- No runtime CDN/network dependencies (offline-LAN). Self-host fonts; inline SVG icons.
- Always read the full task fragment from Usable before implementing it.
