# Third-party code, assets and licenses

The repository’s MIT license covers only application content it may license. It does not relicense third-party software or assets.

## Source projects

AI cards and chart editors derive from MenteX; prompts and business behavior reference the MenteX modules in tpk-admin. Application records, adapters, card integration and exports were implemented in this project. Fixed commits and authorization limits are in [Open-source licensing](./LICENSING.md). Original brand PNG, ICO and site assets are excluded from distribution; the current SVG icon is original and screenshots use local test materials.

MenteX metadata names `flowerdance` and MIT. tpk-admin’s MIT Composer declaration still describes the Laravel skeleton. Neither checked commit had an independent license file; the latter does not independently establish redistribution rights for custom business code and prompts. Preserve rightsholders’ interests and [source notices](../../licenses/SOURCE-NOTICES.txt).

## Excalidraw

The canvas uses [Excalidraw 0.18.1](https://github.com/excalidraw/excalidraw/tree/v0.18.1), under MIT without a license-key requirement. See [retained license](../../licenses/excalidraw-MIT.txt). This project uses the open-source editor library, not its hosted rooms, accounts, analytics or paid services.

A [local patch](../../patches/@excalidraw__excalidraw@0.18.1.patch) moves the editor's interaction reset from `unload` to `pagehide`, preserving the callback and listener cleanup in both development and production builds. Recheck the patch and editing after page navigation when upgrading the dependency.

Bundled fonts are served locally and remain unmodified. See [font notices](../../licenses/excalidraw-fonts-NOTICE.md) and adjacent OFL texts. Comic Shanns uses MIT; other bundled fonts use SIL OFL. Helvetica and Segoe UI Emoji are system fonts and are not distributed.

## React Flow and drawing

`@xyflow/react` 12.12.0 and `@xyflow/system` 0.0.83 use MIT; see [retained license](../../licenses/xyflow-MIT.txt) and [upstream](https://github.com/xyflow/xyflow). No React Flow Pro examples, paid templates or cloud services are used. React Flow edits charts; application integration is local.

Pressure-sensitive stroke outlines use `perfect-freehand` 1.2.3 under [MIT](../../licenses/perfect-freehand-MIT.txt). The application does not ship tldraw, its assets or dedicated dependencies. Legacy schema markers are input data and do not load the original SDK.

## UI and fonts

- UI components derive from the official [shadcn/ui](https://github.com/shadcn-ui/ui) Base Nova registry, adapted for Base UI primitives, Lucide icons and local import aliases.
- Base UI, React, Lucide and other packages retain their licenses, with versions fixed by lockfiles.
- Noto Sans SC is from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/notosanssc), under the retained [SIL OFL](../../apps/web/public/fonts/OFL.txt).
- Geist is bundled locally through Fontsource with its original notices.

## Other dependencies

See [Dependency licenses](./DEPENDENCY_LICENSES.md) for production package metadata and [npm notices](../../licenses/npm-NOTICES.txt) for complete retained texts. Multi-license packages use a permissive branch when available; `MIT AND Zlib` requires both. External FFmpeg tools are not bundled and follow the terms of the user’s installed build.

Builds copy notices to `assets/licenses/` for distribution alongside the frontend.

## BeautifulRust

Rust development guidance and additional Clippy configuration are adapted from [BeautifulRust](https://github.com/morganlinton/BeautifulRust/tree/40db61c6fee84bd121cf288755f0e2f22a50e995), copyright Morgan Linton, under MIT. The project selects checks suited to its application code. See the [retained copyright and license](../../licenses/BeautifulRust-MIT.txt).

## Rust

Rust crates retain their own terms. `cssparser` 0.36.0, `cssparser-macros` 0.6.1, `dtoa-short` 0.3.5 and `selectors` 0.33.0 use MPL-2.0 and are unmodified. Binary distribution must retain notices and inform recipients of covered-source locations. See [source notices](../../licenses/SOURCE-NOTICES.txt) and [MPL](../../licenses/MPL-2.0.txt). Preserve applicable notices for other crates as well.
