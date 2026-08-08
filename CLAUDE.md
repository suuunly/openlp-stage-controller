# CLAUDE.md — FreeShow Stage Remote Controller

> Persistent project memory for Claude Code. Read this first every session.

> ## ⚠️ STATUS: MID-MIGRATION — OpenLP ➜ FreeShow
>
> Elim has **switched from OpenLP to FreeShow**. The UI layer (Phase 1) is built and good;
> the **integration layer still talks to OpenLP and does not work against FreeShow**.
>
> - The repo/folder is still named `openlp-stage-controller` — renaming is deferred, not forgotten.
> - **§10 is the migration brief.** If you are the agent doing the migration, start there.
> - Anything in §§2–9 marked 🔴 describes OpenLP behaviour that is now wrong.
> - **Before writing any code, read §10.0 — the scope of this project is under review and
>   may be cancelled.** Do not start the migration unless Jóhann has confirmed it goes ahead.

---

## 1. Project Summary

A **stage-facing remote controller** web app that lets singers and speakers on stage
directly control what appears on the church's big screens via FreeShow — without exposing
the full FreeShow interface. **Android Auto philosophy**: big tap targets, high contrast,
one action per screen, keyboard/HID (foot pedal / clicker) first. **iPad-first**, landscape.

Views (one active at a time):
- **🎤 Song Navigator** — inline list of the service's songs; the live song expands with
  tappable slide-number pills; PREV/NEXT roll across songs; foot-pedal + swipe. *(built)*
- **📖 Bible Verses** — stacked Book ▸ Chapter ▸ verse hierarchy, 30/70 split,
  live verse on the right with faded prev/next context. *(placeholder)*
- **🖼️ Images** — scrollable thumbnail grid, tap to show, "ON SCREEN" badge. *(placeholder)*
- **📊 Presentation** — current slide, speaker notes, next preview, big nav. *(placeholder)*
- **⚙️ Settings** — per-device FreeShow connection config. *(built)*

The tech operator keeps full control of FreeShow; this app is **additive**.

---

## 2. Tech Stack

- **React 18 + Vite 5 + TypeScript** (strict). Built to `dist/`, shipped via GitHub Releases.
- **Styling:** CSS Modules per component + a global design-token layer
  (`src/styles/tokens.css`, CSS custom properties — the Elim palette, spacing, type scale).
  No CSS framework.
- **Testing (from day one):** Vitest + React Testing Library (jsdom) for unit/component;
  Playwright (iPad landscape / WebKit) for e2e.
- **Icons:** inline SVG (`src/components/Icon.tsx`) — zero runtime CDN/font dependency
  (the church LAN is often offline).
- **Fonts:** self-hosted woff2 in `src/assets/fonts/` (Schibsted Grotesk = UI,
  Newsreader = scripture/lyrics serif), declared in `src/styles/fonts.css`.

> History: started as a vanilla HTML/CSS/JS plan (see old task ACs), pivoted to React+Vite.
> The behavioral acceptance criteria still apply; the "no bundler" wording in the older task
> fragments is superseded.
>
> 🔴 **Possible new dependency:** FreeShow's WebSocket transport is **socket.io**, not raw
> `WebSocket`. See §10.4 — REST + polling may be preferable to taking the dependency.

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
│   │                          #   service items, blanked + action helpers + the ONE socket
│   ├── lib/
│   │   ├── types.ts           # 🔴 Settings, ServiceItem, LiveItem, OpenLpEvent…
│   │   ├── storage.ts         # 🔴 localStorage load/save, STORAGE_KEYS, font-size body class
│   │   ├── api.ts             # 🔴 apiFetch() helper, typed actions, normalizers
│   │   └── websocket.ts       # 🔴 OpenLpSocket: reconnecting WS + parseMessage()
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

🔴 = contains OpenLP-specific integration code. **These four `src/lib` files are the whole
migration surface** — the views, hooks, components, and styles are protocol-agnostic and
should not need changing beyond type renames.

### Commands
`npm run dev` · `npm run build` · `npm run preview` · `npm run test` (Vitest) ·
`npm run test:e2e` (Playwright) · `npm run typecheck`

---

## 4. Deployment — 🔴 UNRESOLVED, was solved under OpenLP

**The old approach is gone.** OpenLP let you drop a static build into
`DataFolder/stages/elim-remote/` and serve it same-origin from OpenLP's own web server on
4316 — which killed CORS and mixed-content in one move. `vite base: './'` exists for exactly
that drop-in.

**No equivalent has been found in FreeShow.** StageShow layouts are configured inside the
app (menu-driven items, `?name=` / `?id=` query params) — they are not a folder of custom HTML.

Options, best first — see PRD §7:

| Option | Verdict |
|---|---|
| **A.** Local static server on the FreeShow PC (`python3 -m http.server`, Caddy, small binary) | Recommended for Elim. HTTP origin → no mixed content. Needs autostart. |
| **B.** Single-file `file://` HTML | Shareable fallback. Awkward updates; poor iPad Safari support. |
| **C.** GitHub Pages | **Docs only.** HTTPS → HTTP mixed content blocks every API call. |

Keep `base: './'` regardless — it serves A and B equally well.

> ⚠️ **CORS is an unvalidated blocking risk.** Under OpenLP the app was same-origin, so CORS
> never came up. With any of the options above the app is cross-origin to FreeShow's API.
> **Verify this before doing UI work** — see §10.1.

---

## 5. Usable Workspace

- **Workspace:** `Elim` — ID `cd1e08b9-4065-432f-ac03-d3e8f673f7fd` (pass `workspaceId` on every call).
- **PRD:** `8e8f34db-84bd-40ff-b162-5c4012307fde` — *PRD — FreeShow Stage Remote Controller* (v0.2, retargeted)
- **FreeShow format/API knowledge:**
  - `1c9a3d51-6aa9-4fa2-a6c1-32e757f611b8` — FreeShow Bible import: json-bible spec + local validation
  - `a6a85914-83f9-4eaa-acce-3f0e47f92e6b` — Converting an OpenLP SQLite Bible to `.fsb`
  - `d96b791f-229c-478d-a286-52622905c38f` — Gotcha: duplicated books in the Faroese Bible
- 🔴 **Superseded:** `7331ff8d-a3e7-47d6-a317-fb67c2354f67` — *OpenLP REST API Reference*.
  Historical only. **Do not integrate against it.**
- **Design source:** Claude Design bundle "OpenLP Stage Controller" (Elim green `#7ba451`,
  Schibsted Grotesk + Newsreader). Still the source of truth for **visual design** — the
  design intent is unaffected by the backend change.
- **Find tasks:**
  `list-memory-fragments({ workspaceId, query: "tags @> ARRAY['openlp','stage-remote'] AND title ILIKE '%TASK%'", orderBy: "title ASC" })`
- **Before a task:** read its full fragment. **On completion:** `update-memory-fragment`
  with a `replace` patchOperation: `**Status:** 🔲 Todo` → `**Status:** ✅ Done`.

---

## 6. Task Index

🔴 **All task fragments were written against OpenLP and still cite OpenLP endpoints.**
Their *behavioural* acceptance criteria (what the user sees and can do) remain valid; their
*API* sections do not. TASK-05 in particular specifies OpenLP Bible endpoints throughout.

| Task | Fragment ID | Phase | Status |
|------|-------------|-------|--------|
| TASK-01 — Project Setup & Settings View      | `28989691-96bb-40a2-9a77-7f0cb5e51599` | 1 | 🚧 Impl done — **needs rework for FreeShow conn settings** |
| TASK-02 — Home / Role Selector View          | `c16c86b1-9522-43c6-89f5-7414e2222da9` | 1 | 🚧 Impl done — protocol-agnostic, likely unaffected |
| TASK-03 — WebSocket Connection & Real-Time   | `073e880c-aa74-4460-bff4-fba49aaa3068` | 1 | 🚧 Impl done — **needs full rework (socket.io / polling)** |
| TASK-04 — Song Navigator View                | `2664c59e-4630-498e-af15-8ddacab134b4` | 1 | 🚧 Impl done — **data source changes** |
| TASK-05 — Bible Verse View                    | `bcbbab57-7104-4a33-a3fb-014dd1078956` | 2 | 🔲 Todo — **rewrite: `start_scripture` takes a plain reference string** |
| TASK-06 — Images View                         | `3eec9c67-a2aa-4317-ac8f-9cbf0f2142ab` | 2 | 🔲 Todo |
| TASK-07 — Presentation View                   | `2b983cc9-3840-43e7-8f31-4f9efbf72f0c` | 3 | 🔲 Todo |
| TASK-08 — Polish, Error States & UX           | `a1dac5cf-9720-42b0-93b1-3465c1ef2f02` | 4 | 🔲 Todo |
| TASK-09 — GitHub Distribution & Setup Guide   | `81eb34f2-2b2e-49b1-874a-5224db35364a` | 5 | 🔲 Todo — **rewrite: deployment story changed (§4)** |

Order: **§10 migration** → Phase 1 re-verification → Phase 2 (05→06) → Phase 3 (07) → Phase 4 (08) → Phase 5 (09).

---

## 7. Key Design Rules (PRD §5 + design spec)

*(Unaffected by the backend migration — keep all of this.)*

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

## 8. API Pattern — 🔴 CURRENT (OpenLP) vs TARGET (FreeShow)

### 🔴 Current implementation (OpenLP — being replaced)

All network calls go through **`apiFetch()`** (`src/lib/api.ts`), building
`http://<host>:<port>/api/v2/<endpoint>` (default port 4316) with optional HTTP Basic auth.
One app-wide raw `WebSocket` (`ws://<host>:<port>/ws`, `OpenLpSocket`) with exponential
backoff, handling `slidecontroller_changed` / `service_changed` / `blank_changed`.

**Keep these architectural rules** — they survive the migration intact:
- Every network call goes through one helper in `src/lib/api.ts`.
- **One** app-wide socket, started after the app is configured, reconnecting with
  exponential backoff (1→2→4…max 30s). Views read from `AppContext`; they must **NOT**
  open their own connection.
- Normalise defensively at the boundary; views consume clean typed domain objects
  (`LiveItem`, `ServiceItem`), never raw API shapes.

### ✅ Target (FreeShow)

Docs: <https://freeshow.app/api>. **The API server is OFF by default** — it must be enabled
under FreeShow → Settings → Connection. Expect this to be the #1 support question.

Three transports, one action vocabulary:

```js
// WebSocket (socket.io!) — port 5505
socket.emit("data", JSON.stringify({ action: ACTION_ID, ...data }))

// HTTP GET — port 5506
fetch(`http://<ip>:5506?action=${ACTION_ID}&data=${JSON.stringify(data)}`)

// REST POST — port 5506
fetch("http://<ip>:5506", { method: "POST", body: JSON.stringify({ action: ACTION_ID, ...data }) })
```

Note this is **action-based, not path-based** — `apiFetch(path)` becomes
`sendAction(action, data)`. That is the single biggest shape change.

### Endpoint → action mapping

| Purpose | 🔴 OpenLP (current code) | ✅ FreeShow action |
|---|---|---|
| Connectivity probe | `GET /api/v2/core/state` | `get_output` (no known dedicated ping) |
| Next slide | `POST /controller/next-item` | `next_slide` |
| Previous slide | `POST /controller/previous-item` | `previous_slide` |
| Jump to slide | `POST /controller/show {id, slide}` | `index_select_slide` — `index`, optional `showId`, `layoutId` |
| Service items | `GET /service/items` | `get_projects` |
| Activate item | `POST /service/show {id}` | `id_select_project` — `id` |
| Live item | `GET /controller/live-item` | `get_slide` — optional `showId` (`"active"`), `slideId` |
| **On-screen text** | *(scraped from live-item HTML)* | `get_output_slide_text` — **use this for the singer read-along** |
| Blank | `POST /controller/blank {display}` | `toggle_output` — `id` |
| Show a verse | `POST /bibles/verse` | `start_scripture` — `reference: string`, optional `id` |
| Verse navigation | *(unsupported)* | `scripture_next` / `scripture_previous` |

Also available, currently unused: `random_slide`, `name_select_slide`, `change_transition`,
`get_project`, `get_projects`, audio, timers, overlays, custom variables.

---

## 9. Hard Rules

- All network calls go through the single helper in `src/lib/api.ts`.
- One active view at a time (conditional render in `App.tsx`).
- One app-wide socket/poller, owned by `AppContext`.
- `localStorage` for settings; `sessionStorage` for ephemeral state (e.g. verse history).
- Every navigation action must be keyboard-triggerable.
- No `console.log` in committed code. Keep `npm run typecheck` + `npm run test` green.
- No runtime CDN/network dependencies (offline-LAN). Self-host fonts; inline SVG icons.
- Always read the full task fragment from Usable before implementing it.

---

## 10. 🚧 Migration Brief — OpenLP ➜ FreeShow

### 10.0 Confirm the project should proceed at all

**FreeShow ships remote apps that OpenLP did not** — RemoteShow (slide control, scripture
browsing across Bibles, project access, output preview) and StageShow (current/next slide
text for a performer). Between them they cover most of what this app was built to provide.

PRD §1.1 records the decision: **trial RemoteShow + StageShow for one real service first.**
If volunteers cope, this project is cancelled. What survives is only:
role-locked single-purpose screens · 80px+ tap targets · foot-pedal/HID · Faroese UI.

**Do not begin §10.2 until Jóhann confirms the project is going ahead.**

### 10.1 Validate the blockers first (cheap, do before any code)

1. **API reachable + enabled** — turn on the API server in FreeShow, then:
   `curl "http://<freeshow-ip>:5506?action=get_output"`
2. **CORS** — serve a scratch page on a different port and run
   `fetch("http://<ip>:5506?action=get_output")`. A CORS error here **blocks the whole
   browser-app approach** and needs solving (proxy? bundled local server?) before anything else.
3. **Auth** — determine whether the API requires a token/password. The current code has
   HTTP Basic support (`username`/`password` in Settings) that may become dead weight.
4. **Static hosting** — confirm against the FreeShow source whether custom files can be
   served from within FreeShow (an `elim-remote` equivalent). If yes, §4 gets much simpler.

Record the answers in PRD §9 (open questions 1–3).

### 10.2 Code changes, in order

The migration is confined to `src/lib/` plus the parts of `AppContext` that wire it up.

1. **`src/lib/api.ts`** — replace path-based `apiFetch(path, options)` with action-based
   `sendAction(action, data)` against port 5506. Rewrite the typed action wrappers per the
   §8 mapping table. Keep `stripHtml` only if FreeShow returns HTML — check
   `get_output_slide_text` first; it may return clean text, in which case delete it.
2. **`src/lib/websocket.ts`** — `OpenLpSocket` → `FreeShowSocket`. Either take the socket.io
   dependency or replace with a polling loop (see §10.4). **Keep the reconnect/backoff and
   status-callback contract identical** so `AppContext` barely changes.
3. **`src/lib/types.ts`** — `OpenLpEvent`/`OpenLpEventType` → FreeShow equivalents.
   `ServiceItem` becomes project-shaped. `LiveItem` should survive nearly as-is — it is a
   good domain abstraction, keep it.
4. **`src/lib/storage.ts`** — default port `4316` → `5506`; add a second port for the socket
   (5505) or derive it. Decide whether `username`/`password` stay (depends on §10.1.3).
   **Bump the storage-key version / migrate** so existing devices don't load an OpenLP host.
5. **`src/state/AppContext.tsx`** — rewire to the new lib functions. If the socket contract
   is preserved, this is a small diff.
6. **`src/views/SettingsView.tsx`** — relabel OpenLP → FreeShow, update port defaults and
   help text. Add the "is the API server enabled?" hint to the failure path.
7. **`src/components/ConnectionBanner.tsx`** — user-facing OpenLP strings.

### 10.3 Tests to update

`src/lib/api.test.ts` · `src/lib/websocket.test.ts` · `src/lib/storage.test.ts` ·
`src/views/SettingsView.test.tsx` · `e2e/smoke.spec.ts`.

These encode OpenLP request shapes and will fail loudly — that is intended, they are the
migration checklist. **Do not delete a test to make it pass**; port it to the FreeShow shape.
`src/test/setup.ts` mocks `WebSocket` — if you move to socket.io or polling, that mock must change too.

### 10.4 Decision needed: socket.io vs polling

FreeShow's real-time transport is socket.io, which conflicts with the "no runtime
dependencies, self-contained offline bundle" rule in §9 (it bundles fine, it is just weight).

- **socket.io** — true push, matches the current architecture, adds a dependency.
- **REST + polling** (`get_output_slide_text` / `get_slide` at ~1s) — keeps the bundle lean
  and vanilla, at the cost of up to 1s latency on *observing* operator-driven changes.
  Note the app's own actions are fire-and-forget POSTs and feel instant regardless.

PRD open question #7. Given the app mostly *sends* and only needs to *observe* when the tech
operator intervenes, **polling is likely good enough** — but confirm with Jóhann.

### 10.5 Cosmetic / naming (defer until the migration works)

Still say OpenLP: the repo + directory name, `package.json` `name`, `index.html` meta
description, `vite.config.ts` header comment, `src/styles/tokens.css` header comment,
`e2e/smoke.spec.ts` comment. Renaming the repo is Jóhann's call — **do not rename the
directory or git remote unilaterally.**
