# Architecture and migration scope

## Layout

```text
apps/
  web/                     React, Vite, shadcn/Base UI, Excalidraw, React Flow
    src/ai/                Browser model connections, clients and prompts
    src/pages/             Route entries, page requests and page state
    src/features/          Business components, state, pure logic and tests
      canvas/              Canvas UI, engine, Excalidraw bridge, sync and transfer
      recording/           Capture, audio processing, transcription and analysis
      projects/            Project menus and previews
      asset-library/       Asset management and insertion
      library/             Cross-project library browsing
      results/             Work previews and editing
    src/i18n/              Locale detection, preferences and English catalog
    src/workflow/          Dependency planning and execution
    src/components/        Application chrome and shared components
      ui/                  shadcn Base UI source components
  api-rust/
    crates/huayu-core/     Pure domain types, record validation and merge
    crates/huayu-store/    SQLite, SeaORM entities and migrations
    crates/huayu-server/   Axum routes, files, WebSockets and startup
scripts/                Development, Cargo entry point, security/release checks, Git source archives and dependency notices
templates/                 Bilingual presets and a generated lightweight index
var/dev/                   Ignored runtime data
```

Rust follows a workspace with a thin binary entry point, business modules, extractors and structured errors. See [Rust code style](./CODE_STYLE.md). The database is independent of the original projects.

## Migration boundaries

`templates/catalog.json` is the shared catalog for 20 additional bilingual templates, including source material, instructions and graph connections. Rust seeds missing metadata by ID at startup; the browser instantiates a canvas in the current language. Lightweight templates use transparent workflow covers; six complete examples show original artwork. Existing templates, fork counts and projects are retained. Templates contain no service URLs, API keys or model selections.

The project list loads metadata and local cover addresses from `templates/index.json`. Workflow covers are generated ahead of time; full materials, instructions and authored outputs load with the canvas module. Editable SVGs live in `templates/art/`, with bundled PNGs for canvas and model image inputs. After editing the catalog, run `node scripts/generate-template-index.ts`, then format the template files. The Web build checks the index and generated covers.

MenteX AI cards, ports and chart editors were adapted. MIT-licensed Excalidraw replaces tldraw. Application records retain legacy import compatibility; native shapes, bindings, groups, pages, images, pressure and path data round-trip through the scene adapter. React card content overlays native geometry. Excalidraw owns selection, movement, resizing, bindings and undo history. Workflow execution is centralized to avoid recursive or duplicate runs. Necessary tpk-admin behavior moved to Rust, with prompts and model orchestration in the browser.

| Original capability | Local implementation |
| --- | --- |
| Project proxies/storage | Rust API and SQLite |
| Cloud rooms/authenticated synchronization | Record patches and Axum WebSockets |
| Templates, tags and copies | Local library with 24 built-in templates |
| Text, images, audio, pages, charts and files | Browser model clients and prompts |
| Cloud file storage | Local UUID-named attachments |
| Document parsing | Rust text, PDF, DOCX and workbook parsing |
| Cloud recording queues | Browser capture, local FFmpeg, browser requests and resumable checkpoints |
| Accounts, memberships, points and payment | Removed |
| Unrelated education administration | Excluded |

Original production databases are not included or automatically migrated. Existing compatible canvas JSON can be imported without accessing those databases.

## Saving and concurrency

Only document, page, shape, binding and asset records synchronize. Session and model settings never enter document requests. Edits are journaled in IndexedDB before batched patches. Failed submission keeps the journal, overlays it on reload, and retries after reconnection.

The server serializes mutations and merges records. Concurrent edits to distinct records survive; edits to the same record use the last received patch. WebSockets distribute initial snapshots and patches, with snapshot recovery for lagging clients. This is not the tldraw Sync CRDT protocol and requires no Node sync service.

Unacknowledged local changes temporarily overlay their remote records. After the save acknowledgement, revision ordering applies any later remote edit or deletion while retaining newer unsent typing. Before capturing a local native-history entry, the adapter rebases unrelated elements without recording them, keeping first-edit metadata changes out of other cards' undo history.

Closing a collaboration link rejects its old token and disconnects linked pages while the original local page remains editable. This is not user or tenant isolation.

Workflows check reachable cycles before execution. Independent nodes at the same depth run concurrently; joins wait for reachable parents. AbortController cancels model requests and prevents canceled results from overwriting the canvas.

## Data boundaries

Browser model requests and SSE decoding use the official `openai` TypeScript SDK (Apache-2.0), still targeting the user's OpenAI-compatible service. Each operation checks its required capability; default remote URLs and model names do not count as configured. Keyless services receive no placeholder authorization header. SDK diagnostic headers are removed for services that only allow standard CORS headers. Tests time out after 15 seconds; ordinary generation after 180 seconds and images after 300 seconds, including response reading. User cancellation is preserved and automatic retries are disabled. Localized errors avoid displaying raw provider bodies or credentials.

- Browser-only model settings have no backend type or persistence endpoint.
- Generated pages use iframes without same-origin permission, with the same isolation in larger previews.
- Attachment paths use server-generated UUIDs, never supplied filenames.
- Host and Origin checks restrict local API access.
- Page fetching restricts protocol, resolved destinations, redirects, time and size.
- Clients receive business errors; internal file/database diagnostics stay in local logs.

## Canvas and licensing

CanvasStore batches document changes and rolls back failed commands. All interaction uses one canvas; remote updates do not enter local undo. Camera and selection remain in IndexedDB. Legacy multi-page documents are merged through ordinary document patches, retaining content, relative layout and connections. Completed results remain fresh after layout migration, while genuinely stale results stay stale.

The left palette supports click and drag creation, and modifier-wheel gestures over cards are handled by the canvas. Native elements use Excalidraw export. AI cards become local high-resolution snapshots combined with PNG, SVG and native files. Fonts are local. `.huayu.json` retains the complete canvas and attachments; Excalidraw export includes images, card snapshots and recoverable content. React Flow remains the chart editor.

Own application code uses MIT. Excalidraw and React Flow use MIT without production license keys. No tldraw SDK, asset package, license check or trial service is shipped. Other dependencies retain their own licenses; see [Dependency licenses](./DEPENDENCY_LICENSES.md).

## Recording analysis

`media.rs` reads only UUID-resolved local attachments. Audio reads are limited to five minutes, with at most two concurrent decoding processes. Model credentials do not participate. Browser decoding is the fallback without FFmpeg.

Each recognized segment is saved immediately. Long transcripts are organized in batches and combined into notes, chapters and source-grounded Q&A. Checkpoints record source, completed chunks, transcript fingerprint and report parts. A failed replacement does not erase the previous report. Transcript corrections clear the old report to avoid stale analysis.

## Languages

The application subscribes to a browser locale store without remounting editing surfaces. UI labels, validation messages, dates, example metadata, new example prompts and output headings follow the chosen language. Existing user content is never translated in place. Local API errors use stable codes and named parameters; clients translate those codes without matching message text. Requests explicitly send the selected language, and Rust renders error wording at a shared response boundary using `Accept-Language` and returns `Content-Language`. Language is never persisted with application data.
