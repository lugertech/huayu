# Build chunks and font assets

Validated on 2026-10-26 with Vite+ 1.4.0, Vite 8.3.5 and Rolldown 1.2.15, on macOS with Node.js 24.22.1.

## Implementation

The approach follows timetable's native chunking and build budgets, with separate settings for the Web application and site. Both use [Rolldown codeSplitting](https://rolldown.rs/reference/OutputOptions.codeSplitting) and retain existing dynamic imports.

- Web splits Excalidraw by consuming entry. `strictExecutionOrder` preserves dependency initialization across manual chunks.
- Web uses `$initial` to merge only existing static dependencies into application, React client runtime and UI chunks. Shared chunks exclude page and virtual Worker entries, preventing homepage execution inside a Worker. React server rendering stays on demand.
- Settings and quick search load on first use and retain their component instances afterward. Sidebar, keyboard shortcut and model-settings handoff paths are covered. The homepage imports a separate lightweight Tooltip Provider; canvas tooltip content stays on demand.
- One Excalidraw 0.18.1 bundle embeds two Base64 WebAssembly binaries. `apps/web/build/external-font-wasm.ts` emits their exact bytes as content-hashed `.wasm` assets and loads them concurrently when the font module needs them. Installed dependencies and binary source copies are not modified.
- The font Worker retains an executable entry. It queues early messages until its asynchronous font module installs the handler, then replays them. Worker imports skip DOM-based preload links, keeping font subsetting in the background.
- The site separates the React client runtime from application and document code, retaining SSR and 46 bilingual prerendered pages.
- `dist/bundle-budget.json` records final emitted sizes, gzip sizes and initial static dependencies. Oversized chunks, initial-size regressions and on-demand modules or Worker entries merged into homepage code fail the build.

## Sizes and tradeoffs

Values are decimal bytes. Initial gzip is the sum of gzip sizes in the HTML entry's static JavaScript import graph, excluding dynamic imports and the font Worker. It is not a browser rendering-time measurement.

| Metric | Before chunking | First pass | Current pass |
| --- | ---: | ---: | ---: |
| Largest Web JavaScript chunk | 1,821,003 | 712,716 | 712,716 |
| Largest site JavaScript chunk | 628,770 | 408,523 | 408,523 |
| Initial Web JavaScript gzip | 219,401 | 232,258 | 214,479 |
| Initial site JavaScript gzip | 208,458 | 209,314 | 209,314 |

The two font binaries are 727,190 and 590,665 bytes. Their SHA-256 hashes match the original decoded embedded assets. They remain on-demand font resources.

The first pass added 12,857 gzip bytes while preserving execution order. This pass retains `strictExecutionOrder` and removes 17,779 bytes by merging static dependencies and narrowing homepage imports. Initial JavaScript chunks decrease from 16 to 6. The result is 4,922 bytes smaller than the original baseline; these size measurements do not establish a faster first render.

## Budgets

| Scope | Limit |
| --- | ---: |
| Application and other JavaScript chunks | 500,000 bytes |
| Single-module `@pdf-lib/fontkit` distribution | 750,000 bytes |
| Single-module `@mermaid-js/parser` distribution | 700,000 bytes |
| Initial Web JavaScript gzip | 219,000 bytes |
| Initial site JavaScript gzip | 215,000 bytes |

Vendor exceptions require every module in a chunk to belong to that dependency; mixed application chunks keep the normal limit. Web's Vite warning threshold drops from 1,800 KB to 750 KB. The site keeps the default 500 KB threshold. Both builds complete without large-chunk warnings.

## Validation and upgrades

```sh
vp run check
vp run test
vp run build:web
vp run build:site
```

150 frontend tests, 6 release-tool tests and 7 Rust integration tests pass. Regressions cover binary contents, failed requests, concurrent loads, the Worker entry URL and messages received during initialization. This pass adds actual-build regressions: a standalone Worker is excluded from the homepage budget, and manually merging it into homepage code fails the build. Budget reports match the written files.

An isolated browser instance verified the homepage, first and subsequent settings opens, quick search and model-settings handoff, a cold canvas load, Chinese and English text, and handwritten SVG export. Site image tabs and documentation were checked in the previous pass; the site was rebuilt in this pass. The final font Worker reported no timeout or main-thread fallback. Four embedded WOFF2 subsets total 6,424 bytes and match the previous subset output byte for byte. Both binaries passed HTTP status, `application/wasm` MIME and WebAssembly compilation checks.

When upgrading Excalidraw, review its bundled font module, the `subset-worker.chunk.js` export and message protocol. Run the commands above and export an SVG containing handwritten and Chinese text. Prefer an upstream external-WebAssembly entry if one becomes available.
