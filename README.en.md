# Huayu 画语

[简体中文](./README.md) · English

Your local AI canvas. Bring words, images and recordings together, read and edit the result, then build on it.

Huayu combines an Excalidraw canvas with connected AI steps and recording analysis. The frontend uses React and shadcn/Base UI; the local API uses Rust, Axum and Tokio. Projects, attachments and recordings stay in local SQLite and files. Model connections stay only in your browser.

## Start locally

Install `vp` using the [Vite+ guide](https://viteplus.dev/guide/). The project uses Vite+ 1.5.1 and requires Node.js 22.x starting at 22.18, 24.x starting at 24.11, or 26 and later, plus Rust 1.95. `vp install` uses the pinned pnpm 12.11.2. On Windows, use Git Bash. FFmpeg and ffprobe on PATH are recommended for long recordings.

```sh
vp install --frozen-lockfile
vp run dev
```

Open [Huayu](http://127.0.0.1:5173). Development also needs the API on port 5858. For a built version:

```sh
vp run build
vp run start
```

Open [the production build](http://127.0.0.1:5858). Optional local configuration is in [.env.example](./.env.example). Never store model keys there. Default runtime data is ignored under `var/dev/`; back up the database and attachments together.

Each room supports up to 15 collaborators, excluding the host. The avatar group opens the full online list; the host can remove a member after confirmation.

To edit together, see [Multiplayer collaboration](./docs/en/USER_GUIDE.md#multiplayer-collaboration) and [Local-network collaboration](./docs/en/DEPLOYMENT.md#local-network-collaboration). The service computer manages the workspace. Link visitors get a separate canvas interface and access only to that canvas and its attachments; project lists, the global asset library and recordings remain private. No account system is required.

## Create, refine and continue

- Draw and organize on one infinite canvas with native selection, shapes, connections, groups and undo/redo. Click a component on the left or drag it onto the canvas. Ctrl + wheel also zooms while hovering over cards.
- Connect materials to text, image, page, speech, document and chart steps. Inspect execution, stop, retry and update affected branches.
- Read and edit text, zoom/crop/rotate images, interact with pages and edit HTML. Copy or download works, preserve originals when cropping images and view existing versions.
- Record or import audio/video, transcribe in segments, correct text, review timestamps, organize notes/chapters/Q&A, and turn excerpts into editable canvas materials.
- Search, duplicate and rename projects; reuse examples; export complete `.huayu.json`, PNG, SVG, Excalidraw or individual works.
- Use English or Simplified Chinese, automatic browser-language detection, remembered language choices, light/dark appearance and responsive layouts.

Open **Settings → Model connections** to configure your own services. Drawing and editing work without models. Remote model calls send selected materials directly to that service; use a local model if inference must stay on your device too. The API has no accounts, memberships, points or backend model-configuration endpoint.

## Documentation

| Guide | Purpose |
| --- | --- |
| [Getting started](./docs/en/GETTING_STARTED.md) | Install, language settings and first creation |
| [Model connections](./docs/en/MODEL_SETUP.md) | Capabilities, local services and tests |
| [Canvas and works](./docs/en/USER_GUIDE.md) | Connections, editing, versions and transfer |
| [Recordings and analysis](./docs/en/RECORDING_GUIDE.md) | Capture, transcribe, review and create |
| [Deployment and backups](./docs/en/DEPLOYMENT.md) | Local configuration, backups and static site |
| [Troubleshooting](./docs/en/TROUBLESHOOTING.md) | Connection, audio, saving and language issues |
| [Architecture](./docs/en/ARCHITECTURE.md) | Components and data boundaries |
| [Local API](./docs/en/API.md) | Routes and response contracts |
| [Contributing](./docs/en/CONTRIBUTING.md) | Development and bilingual contributions |
| [Security](./docs/en/SECURITY.md) | Access boundaries and reporting status |
| [Release checklist](./docs/en/RELEASE.md) | Remaining gates before publication |

## Site and release tools

```sh
vp run dev:site
vp run build:site
vp run preview:site
vp run check:security
vp run check:release
vp run licenses:check
vp run package:source
```

The independent static site previews at [port 5863](http://127.0.0.1:5863). Both languages and docs are prerendered. Configure actual public repository and site URLs before deployment. Security checks run independently of packaging. Source archives use `git archive`, defaulting to committed `HEAD`; use `vp run package:source <tag-or-commit>` to select another version. Uncommitted and untracked changes are excluded. The selected commit's `.gitattributes` excludes runtime data, environment files and caches. Archives and SHA-256 files go to `var/releases/`. Run checks in a clean checkout of the selected commit before releasing.

Vite+ drives frontend development, builds, tests and static checks through the root and application `vite.config.ts` files. `vp run dev` starts both the Web interface and Rust API. `vp run check` and `vp run test` include Rust checks and tests; `vp check` and `vp test` run frontend checks alone. Without a global `vp`, use `pnpm install --frozen-lockfile` followed by `pnpm exec vp run <task>`.

See [Build chunks and font assets](./docs/en/BUILD_PERFORMANCE.md) for chunking, font resources and enforced size budgets.

For development validation, run `vp run check`, `vp run lint:rust`, `vp run test` and the build commands. Rust tests use independent temporary directories. See [Verification](./docs/en/VERIFICATION.md).

## Source and license

Source integration references [MenteX](https://codeup.aliyun.com/65b0683c6cfbead1a8f73587/MenteX), commit `8d9da964571dd26ea80056936ea8829804be07cf`, and [tpk-admin](https://codeup.aliyun.com/65b0683c6cfbead1a8f73587/edu/tpk-admin), commit `2d2c1bd8397712b81933b9380f9178a72d70af58`.

Own authorized application code uses [MIT](./LICENSE). Excalidraw 0.18.1 and React Flow 12.12.0 use MIT without license keys or subscriptions. No tldraw SDK or asset package is shipped; legacy JSON is only an import format. Dependencies and fonts retain their own terms.

This remains a local release candidate. Redistribution authorization for tpk-admin custom business code, prompts and assets is unresolved; generic Laravel skeleton metadata does not settle it. Real-model, system-recording and remote platform checks also remain release gates. See [Licensing](./docs/en/LICENSING.md), [Third-party notices](./docs/en/THIRD_PARTY_NOTICES.md) and [Release checklist](./docs/en/RELEASE.md).
