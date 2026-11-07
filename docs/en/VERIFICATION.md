# Local verification

## Canvas component language (pending manual verification) — 2026-11-05

Native menus followed the English canvas language while Huayu cards still read the application language, leaving default titles and input hints in Chinese. The canvas now provides a scoped locale shared by cards, the component palette, connection actions, zoom/style menus, expanded editors, web previews and chart controls. Default component names, help, placeholders, execution labels and editing controls follow this locale; screens without an override retain the application language.

Language changes update interface copy without rewriting content, custom names, generated results or existing frame names, remounting cards, or modifying project snapshots. Web-card address drafts update independently of translated callbacks so changing language preserves unsubmitted input. Application-owned component translations currently support Chinese and English, with English fallback for other native canvas languages; native tools retain the SDK's selected language pack.

Only source and call relationships were inspected. As requested, no tests, builds or browser verification were run. Default card labels/hints, switching between Chinese and English, expanded editing, unsubmitted drafts and content preservation remain pending user verification.

## Restore the native canvas menu (pending manual verification) — 2026-11-05

Following the native-first preference, removed `CanvasMenu.tsx`, which had been added to unify animations, and restored Excalidraw's `MainMenu`, Help and canvas background controls. Open, Sticky note, Command palette, Search, theme choices and Reset canvas remain removed. Export retains the project's complete-canvas export path through native menu items.

Removed the added popover animations, recreated preferences and their extra state adapters. The website's native preferences shown in the reference are not part of the installed 0.18.1 SDK; npm's current latest stable release is also 0.18.1. No dependency upgrade or website implementation copy was made.

Subsequently added CSS entrance motion only to the native main menu, reusing the zoom menu's `enter` keyframes: 100ms duration, opacity starting at zero, 95% initial scale and an 8px slide relative to the trigger. Motion targets the inner content while preserving the outer position and existing width, with RTL transform origins and reduced-motion support. Closing retains the SDK's native unmount behavior, without another component or DOM-retention logic.

Language uses the SDK's supported `MainMenu.ItemCustom` extension with a browser-native select, without a redundant visible Language label; its accessible name remains. Options come directly from the SDK's public language list, excluding development test entries. System default follows an explicit application language, or matches browser language preferences when the application uses automatic detection, including regional fallback and Simplified/Traditional Chinese matching. The automatic mode listens for `languagechange`. Manual canvas choices are stored only in the browser under `huayu:board-language`, synchronized across tabs and cleared when returning to automatic mode. Application-owned copy retains its existing Chinese and English catalogs.

The main menu now uses 15rem instead of 18rem (240px instead of 288px at the default root size). Rows can grow and wrap so Chinese, English and longer translations remain readable. Export labels previously used application translations and did not follow the canvas language; their native menu-item content now lives inside the SDK language provider and uses `useI18n` to subscribe to completed language loads, using the SDK's file, PNG and SVG export translations. The language control's accessible name and automatic option also follow the canvas language; the latter retains accurate existing Chinese/English copy and uses SDK translations with its English fallback for other locales. Native menus, Help, background controls and export execution remain in place.

Restored native menu placement in the top-right toolbar while retaining the earlier responsive bottom-tool layout and zoom-menu adjustments. Only source, installed dependency types and official menu documentation were read, and npm version metadata was queried. As requested, no tests, builds or browser verification were run. Menu placement, language changes and popover interaction remain pending manual verification.

## Bottom-control sizing (pending manual verification) — 2026-11-05

Bottom-left zoom and Undo/Redo now match the top controls' 36px frames, 28px button heights and 16px icons, with their vertical centers aligned to the drawing toolbar. The bottom-right Help entry and its reserved space were removed; layout now uses the canvas's right edge.

The zoom menu is now 200px wide with more space around items and separators. Narrow layouts measure both drawing tools and auxiliary actions: when one row fits but centering would overlap actions, drawing tools align right; otherwise, drawing tools stay centered at the bottom with auxiliary actions above their left edge. Native mobile lock and Hand controls sit beside Undo/Redo and other actions instead of occupying a detached bottom-right corner. The native menu anchor follows action-row movement, while open phone properties retain their original in-panel actions.

As requested, no tests, builds or browser regression were run for this adjustment. Manual verification is left to the user. The records below describe the preceding version.

## Bottom-toolbar alignment and narrow layouts — 2026-11-05

Fixed drawing tools overlapping Undo/Redo in a 1181 × 843 window with the sidebar expanded, together with mismatched heights and positions across the bottom controls. Layout uses actual canvas and control measurements and updates when the window or sidebar changes.

- Desktop zoom, Undo/Redo, drawing and Help groups share a 44px height and bottom baseline. Drawing tools remain centered where possible, clear the side groups when space is constrained, and use a separate row when necessary, retaining at least 12px gaps.
- Production checks covered 15 viewport sizes and another 9 collapsed-sidebar cases. These include widths from 320 to 1440px, short landscape windows and the default-font row boundary at canvas widths of 842px and 841px. Controls and the component palette have no overlap, out-of-bounds positions or page-level horizontal overflow.
- Hand/lock controls now occupy the bottom action row beside Undo/Redo on narrow mobile layouts. At 320 × 568 they are no longer covered by the component palette. Opening native properties hides these auxiliary controls; closing properties restores them.
- Actual clicks checked lock, Hand, More tools, the zoom menu, Help and properties. Drawing, undo, redo and a final undo produced shape counts of 3/2/3/2 while preserving the original shapes' positions, dimensions and contents. Popovers close with Escape.
- Seven layout regressions were added. Full `vp run check`, `vp run test` and the Web build passed: 12 script tests, 282 frontend tests and 22 Rust tests. Security and release checks passed.

Tests reused independent data under `var/dev/radix-react19-pODlkV/` without writing to the main instance. Screenshots, geometry results and logs are under `output/playwright/bottom-tools/`. Browser coverage used Chromium development and production builds; Firefox, WebKit and physical touch devices were not checked.

## React 19-compatible Excalidraw dependencies — 2026-11-05

Scoped overrides for Excalidraw 0.18.1 now select Radix Tabs 1.2.1 and Popover 1.3.1, replacing the older transitive dependencies. React and React DOM remain at 19.3.1. Dependency notices were regenerated.

- `vp install --frozen-lockfile` passed. `pnpm peers check` reports `No peer dependency issues found`; no React peer-ignore rules were added.
- Real Chromium checks covered the native Search/Library tabs with pointer selection, arrow-key looping, Home/End, Tab/Shift+Tab and Enter. Search receives focus automatically, preserves the query across tab switches and displays matching text.
- With shapes selected, tab arrow keys previously also nudged shapes, and letter keys changed canvas tools. A versioned pnpm patch contains tab key events inside Excalidraw while retaining Radix navigation and existing Escape behavior. Saved positions, dimensions, colors, text and fonts remain equal after the regression sequence.
- Stroke, background and font popovers passed pointer selection, Tab/Shift+Tab, arrows, font search followed by Enter, Escape and outside-click checks. Closing a properties popover returns focus to the canvas by Excalidraw's existing design. Canvas nudging, the text tool and undo/redo of color edits work. Development and production pages produced no React/Radix console warnings or errors.
- Full `vp run check`, `vp run test`, Web and website builds passed: 12 script tests, 275 frontend tests and 22 Rust tests. The website prerendered 46 pages. Security, release and license checks for 384 production package versions passed.

Future Excalidraw or Radix upgrades must retain the regression sequence: select existing shapes, navigate tabs by keyboard, then confirm shapes and the canvas tool are unchanged. Once upstream contains these events, remove `patches/@radix-ui__react-tabs@1.2.1.patch` and its `patchedDependencies` entry. The patch changes event handling in the dependency's two module entries and adds no helper scripts.

Tests used independent data under `var/dev/radix-react19-pODlkV/`, without writing to the main instance. Logs and screenshots are under `output/playwright/radix-react19/`. Browser coverage is desktop Chromium with development and production builds; Firefox, WebKit and a second device were not checked. Test processes still emit Node.js 26's experimental `localStorage` notice, unrelated to the React/Radix peer issue.

## Vite+ 1.5.0 — 2026-11-05

The workspace's Vite+ and `@voidzero-dev/vite-plus-core` moved from 1.4.0 to 1.5.0, with Vitest pinned to the bundled 5.1.0. Both CI installation steps and the Chinese and English setup instructions now use 1.5.0. Existing application dependency declarations, Vite configuration and bundle budgets were retained.

- Frozen-lockfile installation and full `vp run check` passed, including script types and Rust compilation.
- `vp run test` passed: 12 script tests, 275 frontend tests and 22 Rust tests, with no reduction in test count.
- Web and site builds passed within the existing bundle budgets; the site prerendered 46 pages.
- Security, release and license checks for 394 frontend production dependency versions passed.
- The migrator generated exact-version `minimumReleaseAgeExclude` entries for Vite+ 1.5.0 and its native packages. Existing transitive Radix packages declare React 16–18 support, so `pnpm peers check` still reports the React 19 range mismatch. React and React DOM versions were unchanged by this upgrade.

## TypeScript helper scripts and Git source archives — 2026-11-05

Node.js helper scripts now use TypeScript. Security scanning, release structure checks and source archiving run independently. Archives use the selected commit's contents, version and `.gitattributes`, with a SHA-256 file for the archive.

- Script type checks and scoped formatting, lint and type checks passed. Security, release and production-license checks passed. Working-tree deletions no longer block project checks.
- `vp run test` passed: 12 script tests, 275 frontend tests and 22 Rust tests. Script coverage includes deletions, new files, secret-safe diagnostics, selected commits, export rules, checksums and the TypeScript command-line entry point.
- Web and site builds passed; TypeScript prerendering produced 46 pages. The quick-start generator produced eight SVG covers in an isolated temporary directory.
- The current 465 project files were copied into an independent temporary Git repository, committed there, archived with `git archive` and extracted. The archive contained no `.mjs` files, and security and release checks passed in the extracted directory. The main repository was not committed for this verification.
- The project page now uses `useEffectEvent` for its initial refresh on mount, retaining manual retries and cancellation on unmount. Full `vp run check` passed, including formatting, lint, types, script types and Rust compilation. The complete tests, security checks, release checks and Web build passed again.

## Manus-style collapsed sidebar — 2026-11-03

The desktop sidebar now collapses to a 56px icon rail with expand, creation, main navigation, quick search, recent projects and bottom Settings. Hover and keyboard focus reveal labels; the active destination uses a muted background. Mobile retains the full navigation drawer.

- An independent temporary instance checked project creation, a text card, the canvas asset panel, returning through the recent-project menu with Enter, quick search, Settings and expand/collapse. The saved card survived navigation; reloading preserved collapse state.
- Checked English, Chinese, dark mode, pointer tooltips and real Tab navigation. At 320 × 568 there is no desktop rail, the drawer opens and closes after navigation, and the page has no horizontal overflow. Test language and appearance preferences were restored.
- All 241 existing frontend tests, formatting, lint, types and the Web build passed. Rail and tooltip code loads on demand within the existing initial-script budget. Only local web files were updated; the API stayed running and no main-instance projects, assets or recordings were written.

Backups: `var/backups/sidebar-rail-20261103/`. Tests: `var/tests/sidebar-rail/`. Screenshots: `output/design/sidebar-rail/`.

## Real recording covers — 2026-11-03

The list now shows real video frames, loads visible covers on demand and uses private browser caching. Without local FFmpeg, it reads frames in the browser. Audio-only and unreadable files have clear separate states. Existing recordings require no reimport; originals and recording metadata are unchanged.

- Independent temporary services checked landscape, very short portrait, audio and damaged media, including a service without FFmpeg. A new native file import received a cover; Enter opened playback.
- Six frontend and two API regressions were added. All 241 frontend and 19 Rust tests passed, as did types, formatting, lint, Clippy and the Web build. JPEG decoding, dimensions, cache headers and unchanged metadata were checked. Fallback checks cover proportions, short duration, cancellation and resource release.
- Runtime data and the previous build were backed up before updating the local service; every database table matched after restart. Test artifacts are in `var/tests/recording-covers/`; backups are in `var/backups/recording-covers-20261103/`.

## Asset-library interaction migration — 2026-11-03

The explorer, folder tree and picker interactions were copied from the user-supplied pure-design workspace and adapted to local APIs. See [feature parity](./FEATURE_PARITY.md). An independent temporary database and service on port 5864 kept test assets, folders, projects and settings away from the main instance on 5858.

- Browser checks covered folders and subfolders, directory cards, breadcrumbs, folder context menus, asset renaming and menu moves. Real browser drag events moved images to tree nodes and directory cards, with full-card/compact previews, destination highlighting and updated counts.
- Five files entered the upload queue; one was cancelled and four uploaded successfully. Preview navigation, rotation, zoom, Escape and original-file download worked. Trash/restore returned the asset to its original folder. Shift+F10 opened a menu and Escape restored focus.
- The canvas drawer passed folder filtering, search, single selection, button insertion, double-click insertion, drop-position insertion and single undo. A drop inside the drawer did not add a canvas image. Fixed canvas capture intercepting asset UI drops and masonry cards collapsing to almost zero width.
- A 55-image folder loaded 50 initially and all 55 after scrolling. Checked Chinese, English, dark mode and the 320 × 568 folder drawer, insertion panel and upload queue. Narrow file names truncate while actions retain accessible labels.
- All 235 frontend tests in 35 files passed, including eight asset-specific checks. All 17 Rust tests passed, including unfiled filtering, folder counts after move/Trash/restore and retaining images and subfolders after a middle folder is deleted. SQLite COUNT is decoded as a signed integer before conversion. Formatting, types, lint and Clippy passed.
- Web and website builds passed existing budgets. ViewerJS MIT notices, guides and local API documentation were updated. No models were called.

Backups are in `var/backups/asset-parity-20261103/`; test artifacts are in `var/tests/asset-parity/` and screenshots in `output/design/asset-parity/`.

## Six complete examples and the website explorer — 2026-11-03

Upgraded six scenarios—meeting recap, product requirements, landing page, study notes, brand launch and story studio—into complete authored projects with 64 components and 95 connections. They include specific source material, traceable instructions, branching outputs, self-contained pages, a complete three-act story and an interactive board. The four quick starts and fourteen other templates remain available. No fabricated model history or timings are included.

- The website hero switches between brand, story and prototype projects. All six cards open an explorer with workflow zoom, card selection, instructions and upstream navigation. Checked all six English previews, Chinese entry points, both appearances, the default desktop, 390 × 720 and 320 × 568 layouts. No horizontal overflow; closing restores focus to the trigger.
- Opened and saved both languages of all six templates in an isolated temporary instance: twelve projects. Saved nodes, connections, text and output properties match the catalog. All fourteen PNG references load, and projects contain no model connections. Test projects and settings were not written to the main instance.
- Exercised the Flow prototype on the website and inside the actual app: add tasks, edit titles, move states, filter waiting replies and reset. Edits last within the current open page and reset when the prototype is reopened.
- All 230 frontend tests in 34 files pass, including 33 template checks for bilingual creation, connections, undo, existing templates, images, pages and preserving authored work without network requests when a connection is missing. Image and page generation now check their required connection before loading material.
- Metadata and work load separately, with workflow thumbnails generated ahead of time. Both Web and website builds pass their existing budgets without raising limits. The Rust built-in-template fork/restart test passes. Source package and guides are updated.

No real models were called. The original SVG illustrations have Chromium-rendered PNG counterparts bundled with the app. Actual model output still needs acceptance after the user configures connections.

## Site redesign and product presentation — 2026-11-03

The site now uses a split hero: a direct product introduction beside an interactive material-to-work example. Warm white, ink and muted green unify navigation, buttons, diagrams, documentation and dark mode. The page proceeds through creation, editing, templates, recordings, ownership, FAQs and getting started with tighter spacing.

- The hero's text, image and page examples support clicks and arrow keys; the continue action switches formats. The separate product gallery changes its own screenshots without changing the hero. Adding the 00:19 recording excerpt retained its original text and timestamp. Native FAQ disclosures work with clicks and Enter.
- Four template previews read names, descriptions and actual graph structure from the shared catalog and link to the full guide. No invented usage counts, generated results or provider endorsements were added.
- Authored bilingual example projects on an isolated port 5864 instance supplied 12 refreshed screenshots: two languages, three work types, desktop 1280 × 720 and mobile 390 × 844. Existing example imagery was reused. No real models, credentials or daily project contents were used.
- Checked the default desktop, 1024 × 768, 390 × 844 and 320 × 568 layouts, both languages and both appearances. Fixed narrow English actions wrapping, icon-only mobile appearance choices, and mismatched button/text transitions during theme changes. Checked pages have no horizontal overflow; tables and code retain internal scrolling.
- Mobile navigation opens, closes and reaches templates. Documentation search finds collaboration and resets when cleared. Language changes preserve the current guide. Original language, appearance and viewport preferences were restored. Selected body, secondary and selected-state color combinations reach at least 4.74:1, rather than constituting a full accessibility audit.
- Formatting, lint, type checking and the site build pass, retaining 46 prerendered bilingual routes and the existing bundle budget. Local links, fragments and image resources in every generated HTML file pass inspection.

Ignored backups are under `var/backups/site-redesign-20261103/`, logs and interaction evidence under `var/tests/site-redesign/`, and screenshots under `output/design/site-redesign/`. Application code and Rust APIs were unchanged; site examples do not connect to the daily project's database.

## Multiplayer collaboration and concurrent recovery — 2026-11-03

Checks used a separate temporary database and service on port 5864, without editing the main instance's data on 5858. Browser tests used independent origins (`127.0.0.1` and `localhost`) on one computer, isolating settings, recovery journals and views. Two real WebSocket clients separately checked service broadcasts.

- Created a link through **Share → Allow collaboration through a link** and joined the same canvas. Parallel edits to different cards survived in both directions. Creating a card changed both clients from 3 to 4 cards; undo returned both to 3. A drag moved the card from `(629.30, 253.93)` to `(689.30, 333.93)` in both views.
- Fixed first-edit native history capturing adapter metadata for untouched cards, which could undo another card's remote content. Actual undo, redo and undoing a new card retained remote edits to the other card. Uncached card content changes also produce corresponding native version identifiers.
- Fixed clients retaining an old same-card value when a later remote update arrived before the local save acknowledgement. Deferred remote edits/deletions now reconcile by service revision after acknowledgement while protecting newer unsent input. Actual simultaneous same-card edits converged. Eight sync regressions cover both acknowledgement orders, newer typing, reconnect snapshots, remote deletion, offline retry, stale patches and revoked access.
- Simulated the guest going offline and verified **Waiting to reconnect** and the browser-recovery message. The owner edited another card while the guest was offline. Recovery automatically submitted the draft, retained both changes in both clients, and returned to **Saved**. Network emulation was restored. Owner zoom at 92% left guest zoom at 82%.
- Disabling sharing immediately removed editing from an already-open shared page. Re-enabling sharing produced a new link; refreshing the old link still failed, while the new link loaded saved content.
- Six real HTTP/WebSocket scenario groups passed: initial snapshots, concurrent different-record broadcasts, same-record last writes, deletion/reconnect snapshots, revoked reads/writes, and rotated links. The original project remained accessible after shared access was revoked.
- All 223 frontend tests in 34 files, 13 API integration tests and 3 core tests pass, alongside formatting, lint, type checking and the Web build. Both languages now document invitations, joining, local-network addresses, recovery, model settings and access boundaries.

No real models, local-network listener exposure, second physical device, public deployment or high-concurrency capacity test was used. Collaboration merges whole card records; it does not provide character-level CRDT, member lists, remote cursors, read-only guests or user isolation. See [Multiplayer collaboration](./USER_GUIDE.md#multiplayer-collaboration). Ignored evidence is under `var/tests/collaboration/` and `output/design/collaboration/`.

## 20 bilingual presets and the local library — 2026-11-03

Added 20 templates across work, product design, learning, writing, visual creation and audio. Together with the original four examples, the library contains 24 templates. The additions have 73 source/step cards and 53 connections, with editable examples and instructions in both languages. No generated results or model connections are prefilled.

- All 26 template tests pass, covering both languages for every new preset, graph validity, acyclicity and reachability, non-overlapping cards, single-step undo/redo, transparent covers, original quick starts, and palette-aware desktop/narrow viewport fitting. The full frontend suite passes 212 tests in 33 files.
- API integration checks fork every new template without a key, then reopen the temporary data directory to verify all 24 templates and fork counts. All 13 API integration tests and 3 core tests pass, alongside Rust formatting, Clippy, check and release build.
- Browser checks on an isolated port 5864 instance created Chinese meeting notes, an event poster, and an English narration workflow. Source content, instructions, connections and saving were verified. New canvases fit beside the fixed palette: the meeting's leftmost card was x=452 versus the palette's right edge at x=412. Changing UI language leaves existing material intact. Original language preferences were restored.
- The updated main instance on port 5858 displays 24 templates, with all 20 transparent workflow covers loaded and the original four quick starts retained. SQLite backup preceded the update. Row-by-row comparisons confirm unchanged original projects (4), attachments (7), recordings (1), template rows and fork counts; only new template rows were added.
- Formatting, lint, type checking, Web build and all 6 source-release tests pass. Full prompts load with the canvas while the library uses a generated lightweight index, retaining the existing initial JavaScript budget.

No real model service or key was used. Provider-specific output, document contents and audio quality still require manual runs after configuration. See [User guide](./USER_GUIDE.md) for presets, outputs and required capabilities. Ignored evidence is under `var/tests/template-library/` and `output/design/template-library/`.

## Restore the original projects layout — 2026-11-03

Compared archived page code and original screenshots, restored the new-project card and four quick-start cards, then placed recent projects and templates below them. All three sections remain visible without switching tabs.

- Desktop checks confirmed section order, all four project covers and the project action menu. Cover areas now retain a consistent height regardless of an image's intrinsic proportions; project contents were not edited.
- Project search narrowed to one result without filtering templates. Independent template search and category filters worked and could be cleared.
- At 320 × 568 in English dark mode, all three sections remained in order without horizontal overflow. Document and scroll widths were both 320 pixels. Language, appearance and viewport preferences were restored.
- Formatting, lint, type checking and the Web build passed. This layout restoration adds no implementation-mirroring tests and changes neither model connections nor server code.

Ignored evidence is under `output/design/projects-layout/` and `var/tests/projects-layout/`.

## Model connections and partial configuration — 2026-11-03

Browser transport and SSE decoding now use the official OpenAI TypeScript SDK 7.47.0 (Apache-2.0). Model configuration remains browser-only and model requests bypass the data API. Checks used a separate temporary directory, port 5864 and a local model mock on 5865, without real model credentials.

- All six unconfigured capabilities reject related requests locally. Default remote URLs and names no longer appear ready. Instructions check required text, image-understanding and search connections before paying for planning.
- Configuring only a keyless local text service passed its test and completed both instruction requests with a visible result card. Missing image configuration produced a specific message and opened image settings, without an image request.
- Playback loaded and actually played a one-second fixture with `readyState=4` and no media error. Missing transcription settings did not block playback. Regressions cover transcription-only processing, organizing an existing transcript with text only, and preserving an existing report when preflight fails.
- A real local `401` response produced an actionable key message without raw provider details. Regressions also cover permission, missing model, quota/rate limits, unavailable service, test timeout, streams stalling after output starts, user cancellation, JSON fallback and SDK image-edit/speech/transcription payloads.
- At 320 × 568 in English dark mode, field errors were fully visible beside their inputs. Narrow category tabs fit; document width and scroll width were both 320 pixels. Language, appearance and viewport preferences were restored.
- The mock received four text requests: one connection test, two instruction requests and one authentication failure. Diagnostic headers were removed. The test database contained no model URL, model selection or key fields. All 186 tests in 32 files passed, alongside formatting, lint, type checking, Web build and license checks for 393 production package versions.

Ignored evidence is under `var/tests/model-reliability/` and `output/design/model-reliability/`. Real-provider CORS, capabilities and generation quality still require verification with each provider.

## Fixed left palette and pointer creation — 2026-11-03

Compared the original MenteX component panel and archived Huayu implementation before restoring the fixed left palette and pointer-based creation. Browser checks used a separate temporary data directory on port 5864.

- A full card follows the pointer without changing the document until release. Release creates one card; Esc and returning to the palette cancel it. Clicking, keyboard activation and native undo/redo work.
- After panning and zooming to 110%, pointer position `(900, 280)` produced preview bounds `(724, 258, 352, 242)`, retaining the horizontal-center and 20-world-unit header anchor. Frame previews also follow movement. Regressions cover all 11 component types, cancellation and single-step undo.
- Desktop palette position remained `(268, 72)`, with widths of 144 expanded and 44 collapsed. It does not reserve canvas space. Native shape properties appear beside it. At 320 × 568 the palette defaults to icons, scrolls internally and retains asset and attachment controls without horizontal page overflow. The desktop viewport was restored.
- All 165 frontend tests in 31 files passed, with Vite+ formatting, lint, type checking and the Web build. Rust, model settings and the original project's data were unchanged; no model requests were made.

Ignored evidence is under `var/tests/component-pointer/` and `output/design/component-pointer/`. Both language guides were updated.

## Manus reference palette — 2026-11-02

Samples from the supplied Manus screenshot confirmed the sidebar `#F0F0F0`, content `#F8F8F7`, selected navigation `#E5E5E5`, brand ink `#34322D` and text `#1A1A1A`. The dark palette is this project's neutral adaptation. See [THEME.md](./THEME.md).

- Applied semantic colors to pages, navigation, buttons, menus, focus, selected tools and the default canvas background. Static card chrome follows the palette, with preview renderer version 5 refreshing derived thumbnails.
- An independent temporary instance on port 5864 verified the canvas, asset drawer and settings in light, dark and 320 × 568 layouts. Document width remained 320 pixels; drawer width and scroll width both measured 250 pixels.
- Tested text-color combinations reach at least 4.53:1. Primary buttons measure 12.80:1 in light mode and 12.19:1 in dark mode. These checks cover body/secondary text, navigation, selected tools and text selection, rather than a full accessibility audit.
- Formatting, lint, type checking, 159 frontend tests and the Web build passed. Browser checks produced no errors or warnings. Rust and model configuration were unchanged; no model requests were made.

Ignored evidence is under `var/tests/manus-theme/` and `output/design/manus-theme/`. Appearance and viewport preferences were restored.

## Full-height canvas and asset library — 2026-11-02

Browser interactions used a separate temporary directory on port 5864. The original 5858 instance received a fresh backup before upgrading. Table fingerprints confirmed unchanged business data; only the new library migration and empty tables were added. Health, library lists, folders and the management page returned `200`.

- No global content header remains. The canvas measured from y=0 to 720 on desktop, and y=0 to 568 at 320 × 568. Project controls sit at the top left and creation actions at the top right. Mobile navigation remains accessible.
- Created a folder and uploaded three SVGs through the interface, preserving names and dimensions. Search narrowed the list to one image; trash and restore worked while existing canvas images remained visible.
- Created a canvas directly from a library image and verified immediate rendering. Fixed insertion before native scene readiness. Dragging to screen position `(940, 370)` placed the native image's center at that point; native undo removed the insertion.
- At 320 pixels, selection and insertion controls remained visible without horizontal overflow. The English dark-mode drawer's width and scroll width both measured 250 pixels. The original shape library opens on the left, retaining its browser-based storage.
- All 159 frontend tests and 12 API integration tests passed, including image placement, aspect ratio, visible-size fitting, shared local resources, folders, search, pagination, trash, restoration and restart persistence. Rust formatting, Clippy and release build passed. No real model or new system recording permissions were used.

Ignored evidence is under `output/design/asset-library-shell-20261102/` and `var/tests/asset-library-shell-20261102/`. Appearance, language and viewport preferences were restored.

## Component controls and a single canvas — 2026-11-02

Checks used a separate temporary data directory on local port 5864. The original runtime database was backed up with SQLite's backup API; browser interactions used test projects.

- Actual Ctrl-wheel input over text, image and webpage cards changed canvas zoom from 77% to 87%, 97% and 107%. Plain wheel input retained zoom while scrolling long text by 120 pixels.
- Dragging from the left component palette created exactly one card centered at the release point. Undo restored the previous card count. All 11 component types remained available in English and Chinese.
- Clearer card borders were checked in light and dark modes. At 390 × 844 and 320 × 568, the palette, selected cards, drawing tools and creation panel remained usable without horizontal page overflow. Click-created cards fit the available small-screen canvas.
- Opening a legacy multi-page project and reading it back through the API confirmed one remaining canvas, all four original component IDs and business content, and a saved area title from the former page name. Automated regressions also cover rotated frames, nested images, attachments, connections, empty pages, idempotence and fresh versus stale results.
- All 156 frontend tests in 29 files passed, along with Vite+ formatting, lint, type checking and the Web production build. The new interface checks produced no browser errors or warnings. Rust was unchanged; real models and OS recording permissions were not retested.

Ignored logs are under `var/tests/canvas-controls-20261102/` and screenshots under `output/design/canvas-controls-20261102/`. Appearance and language preferences were restored after verification.

## Vite+ toolchain migration — 2026-10-26

Validated on macOS with Node.js 24.22.1, pnpm 12.11.2 and Rust 1.95. The project pins Vite+ 1.4.0 with bundled Vite 8.3.5, Vitest 5.0.5, Oxlint and Oxfmt.

- Web and site development and builds use Vite+. Root `vp run dev`, `vp run check`, `vp run test` and `vp run build` retain the combined frontend and Rust workflows. The site retains SSR and prerenders 46 bilingual pages.
- Root tests load only the Web project, with its original alias, language setup and all 141 tests, excluding historical sources under `var/`. The generated `clearMocks: false` in `apps/web/vite.config.ts` passed validation before and after removal. The final config uses Vitest 5 defaults without changing assertions or retaining v4 compatibility settings. The whiteboard plugin runs in a referenced file project, so no inline-project shared-server compatibility setting is needed.
- Existing ESLint rules and formatter options moved into root `vite.config.ts`, retaining unused-variable, single-declaration, `prefer-const` and React Hooks checks. Documentation, static HTML, SVG and Rust files retain their existing workflows. Temporary probes confirmed root `vp check` detects TS2322 in both apps; the probe files were removed.
- `vp run check` and `vp run test` passed: 141 frontend tests, 7 Rust integration tests and 6 release-tool tests. Full Web/Rust release builds and site builds passed. Some JavaScript chunks still exceed the configured size warning thresholds.
- Source archives include the root config and exclude old tool configs and `.vitest` output. A clean extracted archive passed offline frozen installation, `vp check`, `vp test`, release-tool tests and source hygiene checks. Production license checks passed.
- Development used an independent temporary data directory. API health, Web responses and TSX transforms passed. Direct launcher shutdown and Ctrl+C through `vp run dev` closed both servers. The launcher cleans up child process groups; existing runtime data was not used for tests.
- GitHub CI uses `voidzero-dev/setup-vp@v1.22.0` with Vite+ 1.4.0 and Node.js 24.22.1. Remote runs on the three configured platforms remain pending.

## Brand and bilingual adaptation — 2026-10-26

- Brand fixed as Huayu 画语, preserving package names, file formats, browser model configuration and local data. English and Simplified Chinese use browser-language matching, English fallback, remembered explicit choice and a browser-default option. Preference uses only the browser’s `huayu:language` key.
- Settings, navigation, projects, built-in examples, Excalidraw, workflows, recordings and work windows are localized, along with dates, numbers, counts and known API errors. New examples and model prompts support English. Running analysis progress follows interface changes, while a report retains its starting output language.
- Actual cross-tab switching kept the open work window and unsaved text draft. Existing names, instructions, transcripts, reports and works were retained. Regressions verify independent model settings, unchanged documents/fingerprints, and localized export headings with original content.
- The site prerenders 46 bilingual pages with English guide routes, same-guide language switching, localized metadata and optional alternate-language links. Search, navigation and code controls use the selected language. English screenshots come from a separate synthetic project, on actual desktop and mobile layouts.
- Actual browser checks covered settings, model connections, native tools, reading/editing and recording review. At 360 × 568, long English controls were checked; shorter mobile tabs, wrapped model labels and wider preview options resolve truncation.
- 134 frontend tests, 7 Rust integration tests and 6 release-tool tests passed, with type checking, builds, formatting and license checks. Both languages’ local static links and anchors were checked. No real model or new OS recording permissions were used in this task.

The original runtime was independently backed up. All database tables and six attachment hashes matched their pre-change state. No remote publication occurred.

## Release preparation — 2026-10-24

Checked on macOS with Node.js 26.8.2, pnpm 12.11.2, Rust 1.95 and Chromium. Tests used independent instances, a clean extracted source directory and the local static site. No private project was sent to a real model.

- Original static site: 23 prerendered pages; local links and anchors passed. Desktop/mobile, light/dark, screenshots, docs search, empty states, code copying and direct refresh were checked. At 360 × 568, no horizontal overflow or broken title line remained.
- Clean source install: frozen dependency installation, release hygiene, license check, frontend, Rust release and static site builds passed, without runtime data, environment files, dependencies or build caches in the archive.
- Clean instance: create/rename, draw, undo/redo, reload, import text/images/pages/versions, restart and compare documents and attachment hashes passed.
- Transfer regression: attachment URL rewriting preserves genuinely fresh results across export/import, with multi-page coverage, shared resources, timestamps and failure immutability. Genuinely outdated results remain outdated.
- Packaging: controlled sources, manifests and SHA-256; excludes runtime, caches, environment files and AppleDouble metadata. Six tool tests include archive extraction inside a different Git repository and symlink boundaries.
- Production audit: zero known advisories after transitive dependency updates. 388 locked production package versions had notices regenerated and checked. This is not an exhaustive security audit.
- Original release checks: 120 frontend tests, 7 Rust integration tests and 6 release-tool tests passed, as did type checking, builds, formatting, Rust fmt and Clippy. Remote cross-platform CI was configured but not executed.

Original local data retained 15 document records, revision 2, the original editing time and all six attachment hashes; only derived covers could refresh. Nothing was published to an external repository or domain.

## Work viewing and iteration

An isolated local instance and model mock verified text edit/draft recovery/save/new version, original instructions, image zoom/copy/crop/rotate, interactive page previews, mobile sizes and live HTML editing. A 960 × 640 image was rotated and cropped into a checked 461 × 720 PNG, with the original retained.

Delayed requests, simulated 503 failure, stop, retry, close/reopen and version navigation retained source work and reused unfinished steps. Downloaded Markdown, HTML and complete projects preserved manual edits and excluded mock connection settings.

At 360 × 568, work controls, creation prompts and image-edit actions remained reachable without horizontal overflow. Escape restored canvas focus. Automated regressions cover conflicts, locking, empty output, freshness, lineage, crop reuse and preview policy ordering.

## Canvas, connections and recording journeys

Local mock checks covered port dragging, creating steps on empty space, combined undo/redo, keyboard menus, rotation/frame coordinates, collision avoidance and preventing independent card-layer scrolling. Branch updates reused independent outputs, preserved previous work after failure and retained execution information after refresh.

Recording checks cover import/save/review, transcript search, timestamp navigation, playback speed and position, multi-segment excerpt conversion, local source links, correction invalidation, export and resumable checkpoints. Actual OS screen-sharing permissions and real model quality were not established by synthetic fixtures.

## Current limits

The candidate still needs source redistribution authorization, real-model requests, actual OS recording-permission acceptance and remote target-platform CI. See the [Release checklist](./RELEASE.md). Historical Chinese verification records retain detailed stage-specific local logs; the results above state their relevant accepted scope without treating mock responses as real-model quality.
