# CLAUDE.md — FreeShow Stage Remote Controller

> Persistent project memory for Claude Code. Read this first every session.

> ## ✅ STATUS: WORKING AGAINST A LIVE FREESHOW (1.6.4), 2026-08-10
>
> Connects, lists real projects and shows, switches the live show, follows the operator,
> and renders real slide text, counters and notes. Verified from the production bundle
> against Jóhann's FreeShow.
>
> - **The transport is RemoteShow's protocol on port 5510**, not the documented API.
>   §8 explains why the documented one cannot work from a browser. Read it before touching
>   `src/lib/`.
> - Payload shapes are **verified, not guessed** — see the Usable fragment
>   `676e0d9c-7d01-4a03-8a0a-b50e5ba0f94f`.
> - Still to do: the Bible cascading picker, image thumbnails, the protocol compatibility
>   check, and TASK-08/09. §10.7 has the current state.
> - The repo/folder is still named `openlp-stage-controller` — renaming is deferred, not forgotten.

---

## 1. Project Summary

A **stage-facing remote controller** web app that lets singers and speakers on stage
directly control what appears on the church's big screens via FreeShow — without exposing
the full FreeShow interface. **Android Auto philosophy**: big tap targets, high contrast,
one action per screen, keyboard/HID (foot pedal / clicker) first. **iPad-first**, landscape.

Views (one active at a time):
- **🎤 Song Navigator** — inline list of the service's songs; the live song expands with
  tappable slide-number pills; PREV/NEXT roll across songs; foot-pedal + swipe. *(built)*
- **📖 Bible Verses** — 30/70 split; free-text reference on the left with a history strip,
  the live verse read back from the screens on the right. *(built — no browse API, so the
  Book ▸ Chapter ▸ verse hierarchy is not buildable; see §10.6)*
- **🖼️ Images** — titled cards, tap to show, "NOW SHOWING" badge. *(built — no thumbnail
  API, so the grid degrades to titles)*
- **📊 Presentation** — on-screen slide text, counter, deck picker, big nav. *(built — no
  notes or thumbnail API)*
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
> ✅ **Resolved (§10.4, revised 2026-08-10):** the transport is socket.io — but spoken over a
> **raw `WebSocket`** in `src/lib/socket.ts`, so it is still zero runtime dependencies.
> RemoteShow *pushes* state, so there is no polling loop at all (`realtime.ts` is gone).

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
│   │   ├── types.ts           # Settings, ItemKind, ServiceItem, Project, Slide, Bible…
│   │   ├── storage.ts         # localStorage load/save, STORAGE_KEYS, legacy-key migration
│   │   ├── socket.ts          # FreeShowSocket: socket.io v4 over a raw WebSocket
│   │   └── api.ts             # the one socket, typed commands, normalizers
│   ├── hooks/
│   │   ├── useTapGuard.ts     # direction-keyed debounce (iOS ghost double-fire fix)
│   │   └── useSwipe.ts        # swipe left=next / right=prev
│   ├── components/            # Icon, AppHeader, ConnectionBanner (+ .module.css)
│   ├── views/                 # SettingsView, HomeView, SongView, BibleView,
│   │                          #   ImagesView, PresentationView (+ .module.css)
│   ├── styles/                # fonts.css, tokens.css, global.css
│   ├── assets/fonts/          # self-hosted woff2
│   ├── test/setup.ts          # jest-dom, MockWebSocket install, storage reset
│   └── test/mockSocket.ts     # drives the RemoteShow handshake in tests
└── e2e/                       # Playwright specs (smoke.spec.ts)
```

**The whole FreeShow surface is those four `src/lib` files** plus the wiring in `AppContext`.
Views, hooks, components and styles are protocol-agnostic — keep them that way.

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

> ✅ **CORS is no longer a constraint** — it was the reason the REST API is unusable, and it
> is precisely why the app talks over a WebSocket instead (§8). WebSockets are exempt.
>
> ⚠️ **Mixed content still rules out HTTPS hosting.** An `https://` page cannot open a
> `ws://` socket, and FreeShow offers no `wss://`. So option C is dead for the app itself —
> not because of CORS, but because the page must be served over plain HTTP for the socket to
> open at all. Option A remains the recommendation.

---

## 5. Usable Workspace

- **Workspace:** `Elim` — ID `cd1e08b9-4065-432f-ac03-d3e8f673f7fd` (pass `workspaceId` on every call).
- **PRD:** `8e8f34db-84bd-40ff-b162-5c4012307fde` — *PRD — FreeShow Stage Remote Controller* (v0.2, retargeted)
- **FreeShow format/API knowledge:**
  - `676e0d9c-7d01-4a03-8a0a-b50e5ba0f94f` — ⭐ **RemoteShow protocol (5510) — VERIFIED LIVE.**
    The wire format, every payload shape, and why the documented API can't be used from a
    browser. **Read this before touching `src/lib/`.**
  - `7d28ea57-d588-4f2c-9672-4f59cca8b2a9` — TASK-10, contributing the findings upstream
  - `b3df35f0-490d-45f6-b50d-21596f12f889` — the docs-derived note the above corrects
    (carries a correction banner; several of its central claims are wrong)
  - `1c9a3d51-6aa9-4fa2-a6c1-32e757f611b8` — FreeShow Bible import: json-bible spec + local validation
  - `a6a85914-83f9-4eaa-acce-3f0e47f92e6b` — Converting an OpenLP SQLite Bible to `.fsb`
  - `d96b791f-229c-478d-a286-52622905c38f` — Gotcha: duplicated books in the Faroese Bible
- 🔴 **Superseded — do not integrate against either:**
  - `bcb97feb-f724-4f0e-bb7b-f7c7c0964135` — *OpenLP 3 REST/WebSocket API — VERIFIED Live*.
    The more accurate of the two, and the one the (missing) Phase 1 verification was based on.
  - `7331ff8d-a3e7-47d6-a317-fb67c2354f67` — *OpenLP REST API Reference*. Unverified and
    wrong on several points; corrected by the fragment above, then obsoleted entirely.
- **Design source:** Claude Design bundle "OpenLP Stage Controller" (Elim green `#7ba451`,
  Schibsted Grotesk + Newsreader). Still the source of truth for **visual design** — the
  design intent is unaffected by the backend change.
- **Find tasks:**
  `list-memory-fragments({ workspaceId, query: "tags @> ARRAY['openlp','stage-remote'] AND title ILIKE '%TASK%'", orderBy: "title ASC" })`
- **Before a task:** read its full fragment. **On completion:** `update-memory-fragment`
  with a `replace` patchOperation: `**Status:** 🔲 Todo` → `**Status:** ✅ Done`.

---

## 6. Task Index

All nine task fragments were **updated for FreeShow on 2026-08-08**. Each now opens with a
migration callout stating what survives and what changed, and their API sections cite
FreeShow actions. Their *behavioural* acceptance criteria were always protocol-agnostic and
still stand.

| Task | Fragment ID | Phase | Status |
|------|-------------|-------|--------|
| **TASK-00 — FreeShow viability spike** | `1b777be4-fb89-43f3-b50f-669c7bb04ca7` | 0 | ⏭️ **Skipped by decision.** Its unknowns are now assumptions in code — §10.1. Parts A and B4 are still worth doing |
| TASK-01 — Project Setup & Settings View       | `28989691-96bb-40a2-9a77-7f0cb5e51599` | 1 | ✅ Rebuilt for FreeShow — ports, probe, storage keys, live diagnostics |
| TASK-02 — Home / Role Selector View           | `c16c86b1-9522-43c6-89f5-7414e2222da9` | 1 | ✅ Done — protocol-agnostic |
| TASK-03 — Real-Time Connection & State        | `073e880c-aa74-4460-bff4-fba49aaa3068` | 1 | ✅ Reworked — 1s REST poll (`FreeShowLink`), no socket.io |
| TASK-04 — Song Navigator View                 | `2664c59e-4630-498e-af15-8ddacab134b4` | 1 | ✅ Remapped to projects/shows + `get_output_slide_text` |
| TASK-05 — Bible Verse View                     | `bcbbab57-7104-4a33-a3fb-014dd1078956` | 2 | ⚠️ Free-text entry works. **`GET_SCRIPTURE` makes the original Book ▸ Chapter ▸ Verse picker and preview-before-showing buildable — not yet wired into the view** |
| TASK-06 — Images View                          | `3eec9c67-a2aa-4317-ac8f-9cbf0f2142ab` | 2 | ⚠️ Titled list. **`API:get_thumbnail` exists and `fetchThumbnail()` is written — the view doesn't call it yet** |
| TASK-07 — Presentation View                    | `2b983cc9-3840-43e7-8f31-4f9efbf72f0c` | 3 | ✅ Done — notes, counter, deck picker. Notes came back via `get_show` |
| TASK-08 — Polish, Error States & UX            | `a1dac5cf-9720-42b0-93b1-3465c1ef2f02` | 4 | 🔲 Todo |
| TASK-09 — Distribution & Setup Guide           | `81eb34f2-2b2e-49b1-874a-5224db35364a` | 5 | 🔲 Todo — hosting must be plain HTTP (§4) |
| **TASK-10 — Upstream contributions to FreeShow** | `7d28ea57-d588-4f2c-9672-4f59cca8b2a9` | 6 | 🔲 Todo — draft only. **Do not file without Jóhann's review** |
| **TASK-11 — Visual slide previews & image thumbnails** | `d1cda773-bf98-4951-b07f-ee9ecda66d59` | 4 | 🔲 Todo — slides must be rendered client-side; FreeShow has no slide bitmap and no image downscale |
| **TASK-12 — Protocol compatibility check** | `cf69d076-dad1-40e7-9a88-d52e5a2019d6` | 4 | 🔲 Todo — makes a FreeShow update a deliberate check, not a Sunday surprise |
| **TASK-13 — On-device field test** | `791616de-cb33-4e0e-b3bd-59354e828ddc` | 4 | 🔲 Todo — **iPad, WiFi, foot pedal, real content. Everything so far is desktop-on-localhost** |

✅ TASK-05's picker and preview are built. Order from here: **TASK-13 field test** (it can
invalidate anything below) → TASK-12 compatibility check → TASK-08 → TASK-09 → TASK-10
upstream → TASK-11 previews.

### ⚠️ Phase 1's "verified live" status is unproven

TASK-01/02/03/04 were marked *"✅ Done — verified live against OpenLP 3 on 2026-06-28
(commit `66970dc`)"*, and recorded real corrections: probe `/core/state` → `/core/system`,
WS on port **4317** at root path (not the API port + `/ws`), **binary** WS frames delivered
as `Blob`, unnamed poll-state snapshots instead of `slidecontroller_changed` events, and
live slides from `/controller/live-items` (plural).

**None of that was ever in this repository.** Commit `66970dc` exists on neither `main` nor
`origin`, and no other clone on the machine contains it. That OpenLP code is gone now, so
only the lesson carries over:

**OpenLP's published docs were wrong about nearly every integration detail** — WS port, WS
protocol, live-item endpoint, connection probe, every control endpoint — and only live
testing caught it. The FreeShow code in this repo is in exactly that pre-verification state.
§10.1 lists what it assumes; Settings → Test Connection checks the checkable parts in
seconds. **Do that before a Sunday, not during one.**

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

## 8. API Pattern — RemoteShow over a raw WebSocket

> Verified live against FreeShow **1.6.4** on 2026-08-10. Full detail and raw payloads:
> Usable `676e0d9c-7d01-4a03-8a0a-b50e5ba0f94f`.

### Why not the documented API

**The REST API on 5506 cannot be used from a browser.** The documented
`GET /?action=…&data=…` form **404s** — the server is POST-and-JSON only, and it sends
**no `Access-Control-*` headers at all** (`OPTIONS` answers a bare `Allow: POST`), so the
preflight fails. There is no workaround: `mode:'no-cors'` downgrades the body to
`text/plain`, which the server ignores.

**The socket API on 5505 works but is not sufficient.** It cannot change *which* show is
live (`index_select_slide` silently does nothing unless FreeShow already has that show
open), has no scripture browsing, and never pushes state.

**WebSockets are exempt from CORS.** That is the whole reason a browser client is possible.

### What we use

`src/lib/socket.ts` speaks **socket.io v4 over a raw `WebSocket`** to **RemoteShow on
5510** — no dependency, and it satisfies the offline-LAN rule (§9).

```
ws://<ip>:5510/socket.io/?EIO=4&transport=websocket
  <- 0{"sid":…}                                  engine.io open
  -> 40                                          connect default namespace
  <- 40{"sid":…}                                 ready — sid is our client id
  -> 42["REMOTE",{id,channel:"PASSWORD"}]        <- {dictionary, password:true}
  -> 42["REMOTE",{id,channel:"ACCESS",data:"<4-digit code>"}]
  <- …PROJECTS, SHOWS, SCRIPTURE, CATEGORIES, OUT_DATA, SHOW…   (PUSHED)
  <- 2  -> 3                                     ping / pong
```

**Auth:** RemoteShow requires the 4-digit code from FreeShow → Settings → Connection →
click the RemoteShow row. Wrong code ⇒ `{channel:"ERROR", data:"wrongPass"}`, surfaced as
the `unauthorized` connection status.

**State is pushed** — there is no polling loop. Commands go through the `API:` proxy
(`API:next_slide`, `API:index_select_slide`, …); reads either arrive unprompted or are
requested on a channel.

### Two traps worth knowing before you debug anything

1. **`OUT` and `OUT_DATA` are different shapes.** `OUT.slide` is an *index*; `OUT_DATA.slide`
   is an *object*. Reading both overwrites good state with empty. We use `OUT_DATA` only.
2. **`OUT_DATA` itself has two shapes.** A show live gives a pointer
   (`{slide:{id, layout, index}}`); scripture live gives inline content
   (`{slide:{id:"temp", tempItems, nextSlides, customDynamicValues}}`), with the reference
   in `customDynamicValues.scripture_reference_full`. Relatedly `get_slide` returns `null`
   and `get_output_slide_text` returns `""` whenever scripture is up.
3. **Slides are hierarchical.** Layouts list *parent* slides, each with `children`; `index`
   counts the **flattened** sequence. `flattenShow()` in `api.ts` does this — don't
   reimplement it from `layouts[x].slides.length`.

### Capability map

| Purpose | Mechanism |
|---|---|
| Slide next / previous | `API:next_slide` / `API:previous_slide` |
| Jump to slide | `API:index_select_slide` — `{showId, index}` |
| **Switch the live show** | `SHOW <id>` **then** `API:index_select_slide` — the two-step is essential |
| Service items | `PROJECTS` (pushed) joined with `SHOWS` for names + categories |
| Slides, groups, **notes**, totals | `SHOW <id>` / `get_show` |
| What's on screen | `OUT_DATA` (pushed) |
| Show a verse | `API:start_scripture` — `{reference}` |
| Verse next / previous | `API:scripture_next` / `API:scripture_previous` |
| **Browse bibles** | `GET_SCRIPTURE` — `{id, bookKey?, chapterKey?, bookIndex?, chapterIndex?}` |
| Installed bibles | `SCRIPTURE` (pushed) |
| Thumbnails | `API:get_thumbnail` — `{path}` |

**Only `SHOW` and `GET_SCRIPTURE` are RemoteShow-exclusive.** Everything else — including
`get_show`, `get_thumbnail`, `get_plain_text`, `get_groups` — also works on the public API
on 5505; it is merely undocumented. See TASK-10.

### Architectural rules (unchanged since OpenLP)

- Every network call goes through `src/lib/api.ts`.
- **One** app-wide socket, owned by `AppContext`. Views read from context; they must
  **NOT** open their own.
- Normalise at the boundary; views consume `LiveItem` / `ServiceItem` / `Project` /
  `ShowDetail`, never raw payloads.

---

## 9. Hard Rules

- All network calls go through the single helper in `src/lib/api.ts`.
- One active view at a time (conditional render in `App.tsx`).
- One app-wide socket/poller, owned by `AppContext`.
- FreeShow payload shapes are **unverified**; normalise every one of them defensively.
- `localStorage` for settings; `sessionStorage` for ephemeral state (e.g. verse history).
- Every navigation action must be keyboard-triggerable.
- No `console.log` in committed code. Keep `npm run typecheck` + `npm run test` green.
- No runtime CDN/network dependencies (offline-LAN). Self-host fonts; inline SVG icons.
- Always read the full task fragment from Usable before implementing it.

---

## 10. Migration Record — OpenLP ➜ FreeShow

> **Done 2026-08-08.** §§10.2–10.5 are history now; §10.1 and §10.6 are live.
> Jóhann chose to build the full solution rather than run TASK-00 first, so the spike's
> unknowns became **assumptions in shipped code**. They are listed in §10.1 with what the
> code assumes — check each one on site.

### 10.0 Whether the project should exist at all — still open

**FreeShow ships remote apps that OpenLP did not** — RemoteShow (slide control, scripture
browsing across Bibles, project access, output preview) and StageShow (current/next slide
text for a performer). Between them they cover most of what this app was built to provide.

PRD §1.1 records the decision: **trial RemoteShow + StageShow for one real service first.**
If volunteers cope, this project is cancelled. What survives is only:
role-locked single-purpose screens · 80px+ tap targets · foot-pedal/HID · Faroese UI.

Building it did not settle this. **The RemoteShow + StageShow trial is still worth running**
— if volunteers cope with the built-in apps, this app is still the wrong thing to maintain.

### 10.1 The unverified assumptions now baked into the code

Every one of these is a guess the code makes. **Settings → Test Connection probes 1, 2 and 5
live and prints what came back** — run it standing next to the FreeShow PC.

| # | Assumption in the code | If it's wrong |
|---|---|---|
| 1 | API server on, reachable at `<host>:5506` | Nothing works; Test Connection says so plainly |
| 2 | **CORS** allows reading responses | App drops to `send-only`: controls work, read-back dies. Banner + Settings both say so. Fixing it properly needs a proxy or packaged app |
| 3 | **No auth** — `username`/`password` removed from Settings and storage | Re-add auth to `sendAction`; the old Basic-auth code is in git history |
| 4 | **No static hosting** inside FreeShow — §4 still unresolved | If one exists, same-origin hosting moots #2 entirely |
| 5 | Payload shapes (`get_projects`, `get_slide`, `get_output_slide_text`) | Normalisers in `api.ts` accept several shapes each; a genuinely new one needs a case added there and nowhere else |
| 6 | A bare `show` in a project is a **song** (`classifyItem`) | Songs/images/presentations land in the wrong views — one function to fix |

Record the answers in PRD §9 (open questions 1–3).

### 10.2 What changed — ✅ done

- **`src/lib/api.ts`** — `apiFetch(path)` → `sendAction(action, data)` over GET on 5506,
  plus the no-cors command fallback, `runDiagnostics()`, and defensive normalisers
  (`normalizeProjects`, `normalizeLiveItem`, `extractSlideText`, `classifyItem`).
  `stripHtml` stayed: `get_output_slide_text`'s output is unverified, so HTML is still
  assumed possible.
- **`src/lib/websocket.ts` → `src/lib/realtime.ts`** — `OpenLpSocket` became `FreeShowLink`,
  a 1s poller. Same `start()`/`stop()`/status-callback contract, so `AppContext` barely moved.
- **`src/lib/types.ts`** — `OpenLpEvent` gone; `ItemKind`, `Project`, `OutputSnapshot` added;
  `ServiceItem.plugin` → `kind`. `LiveItem` survived nearly intact, as predicted.
- **`src/lib/storage.ts`** — keys re-prefixed `freeshow_*`, port `4316` → `5506`,
  `username`/`password` dropped. `migrateLegacyKeys()` carries preferences over and
  **deliberately discards the OpenLP host** so no device reads as configured against a dead
  server. It also deletes the stored credentials.
- **`AppContext`** — projects/active-project model, `outputText`, `send-only` status,
  scripture actions.
- **Views** — Settings rebuilt around FreeShow + live diagnostics; Bible, Images and
  Presentation built for real (§10.6); ConnectionBanner restrung.

### 10.3 Tests — ✅ ported, 48 passing (was 17)

`api.test.ts` (25) · `storage.test.ts` (10, incl. the legacy migration) ·
`realtime.test.ts` (4, replaces `websocket.test.ts`) · `BibleView.test.tsx` (5) ·
`SettingsView.test.tsx` (4) · `e2e/smoke.spec.ts` (3 specs, all five views).
`src/test/setup.ts` no longer mocks `WebSocket`; it stubs `fetch` to reject by default, so
every test starts "FreeShow is not there" and the poller never touches the network.

### 10.4 Transport — ✅ decided: polling, no socket.io

Confirmed the leaning in the original brief. socket.io would be a runtime dependency against
the offline-LAN rule (§9); 1s REST polling gives the same practical behaviour because the app
overwhelmingly *sends*. Swapping to socket.io later touches `realtime.ts` only.

### 10.5 Cosmetic / naming — still deferred

`package.json` `name` and the repo + directory name still say OpenLP. Renaming the repo is
Jóhann's call — **do not rename the directory or git remote unilaterally.** `index.html`,
`vite.config.ts` and the e2e comments were updated in passing; `tokens.css` still cites the
design bundle's filename, which is correct.

### 10.6 Where the three API gaps forced a design change

FreeShow exposes no action for browsing bibles, no thumbnails, and no speaker notes. Each
view degrades honestly and says so in the UI rather than faking it:

| View | Design called for | Built instead | Restore it by |
|---|---|---|---|
| Bible | Book ▸ Chapter ▸ verse pickers, preview *before* showing | Free-text reference + history strip; the reading pane shows what is **on screen now**, read back via `get_output_slide_text` | Bundling the Victor `.fsb` (~5.7 MB) — TASK-05 option B — or finding RemoteShow's private browse call |
| Images | 2-column thumbnail grid | Titled cards, same tap target and NOW SHOWING badge | A thumbnail action, if RemoteShow's traffic reveals one |
| Presentation | Slide thumbnails + speaker notes | On-screen slide text, counter, deck picker, big nav; an explicit "notes aren't available" line | A notes action — until then this view stays the weakest, and is the strongest cancellation candidate |

**RemoteShow browses Bibles and renders project items, so private mechanisms exist.**
Inspecting its network traffic (TASK-00 B4) is still the highest-value unfinished work.

### 10.7 The second rework — RemoteShow, verified live (2026-08-10)

TASK-00 B4 got done, and it invalidated §10.6 almost entirely. Reading
`http://<ip>:5510/client.js` gave RemoteShow's whole vocabulary; probing a running
FreeShow settled every shape. §8 is the result; the raw findings are in Usable
`676e0d9c-7d01-4a03-8a0a-b50e5ba0f94f`.

**Five of the six "impossible" gaps closed:**

| §10.6 said | Actually |
|---|---|
| No speaker notes | `get_show` → per-slide `notes` |
| No slide totals for non-live items | `layouts` give order and count |
| No next-slide preview | Falls out of the flattened slide sequence |
| No bible browsing; preview needs a 5.7 MB `.fsb` | `GET_SCRIPTURE` returns the whole tree **including verse text** — verified against the Faroese Victor bible |
| Songs vs presentations is guesswork | `SHOWS[id].category` is authoritative |
| No thumbnails | Still true on the public API, but `API:get_thumbnail` exists |

**What it cost:** the app now depends on a **private, undocumented protocol** and a
4-digit password. Narrower than it first looked — only `SHOW` and `GET_SCRIPTURE` are
RemoteShow-exclusive — but real. Mitigations:

1. The protocol is **re-derivable** from the `client.js` FreeShow itself serves. That is
   how it was obtained; it is a repeatable procedure, not a one-off.
2. **Build the compatibility check** (not yet done): fetch that file and assert the
   channels we rely on still exist. One command after any FreeShow update, rather than a
   discovery mid-service.
3. TASK-10 asks upstream for `select_show` and `get_scripture`. If they land, the private
   dependency and the password both go away.

**Still open:** the Bible picker and thumbnails are *possible* but not *built* — the data
layer supports both and is tested; the views don't use them yet.
