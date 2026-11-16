# Feature coverage

This document covers the canvas, workflows, recordings, the asset library and compatibility with older files.

## Workflows and canvas

| Source capability | Local implementation |
| --- | --- |
| Node execution, forwarding and joins | Dependency planning, parallel branches, one execution per join, cycle validation, cancellation and failure propagation; whole-canvas run and node status |
| Upstream-driven instructions | Upstream materials work without manually written instructions; native images, text, notes and frames can be inputs |
| Terminal instruction results | Result cards are created without overlaps or duplicating previous output on rerun |
| Locked results and caching | Locked results are reused downstream; stopping cancels requests and blocks late writes |
| Procedure and execution | Browser planning followed by multimodal execution; optional search and six model capabilities in settings |
| Images | Text generation, reference editing, ratios, upload and download |
| Audio | Speech synthesis, upload, transcription, playback and download |
| Websites | Self-contained HTML, isolated interactive previews and download |
| Files | Local attachments, text/PDF/DOCX/workbook parsing, common document generation and attachment download |
| Charts | Editable mind maps and flowcharts with layout reuse in exports |
| Drawing agent | Streamed complete events applied atomically: create, update, move, delete, labels, pen, alignment, distribution, rotation, scaling and layers |
| Original native drawing | Excalidraw 0.18.1 interactions; legacy records, coordinates, text, bindings, pressure, groups and images retained |
| Transfer | Native image insertion; PNG/SVG with visible AI cards; complete single-canvas project; Excalidraw with images, snapshots and recoverable data; legacy pages merge without losing materials |
| Projects, examples and rooms | Search, tags, duplicate, rename, delete, four examples, save as example, automatic local saving, IndexedDB recovery, WebSockets and revocable collaboration links |

Migration fixes also cover zero-height horizontal lines, asynchronous resource cancellation, hidden internal embed links, double inversion in dark exports, native image insertion, overlapping cards and stale native labels after AI edits.

## Recordings

| Source capability | Local implementation |
| --- | --- |
| Screen/window/tab capture and microphone | MediaRecorder and audio mixing, pause/resume, local save/download and media import |
| Audio extraction | Local FFmpeg/ffprobe, up to five minutes of mono 16 kHz WAV per request, concurrency and timeout limits; browser fallback |
| Recognition and speaker/timing data | Direct browser service calls, saved segments, legacy transcript support |
| Detailed notes, chapters and Q&A | Batched long-transcript analysis, source-grounded timestamps and actual source Q&A |
| Task persistence | Tasks survive in-app navigation; completed chunks and report batches are checkpointed; continue after stop/failure/refresh; previous report remains readable |
| Playback and correction | Timestamp seeking, sentence navigation, speed, search, follow playback and editing that preserves times; stale analysis is cleared |
| Exports | Original media, TXT, SRT/VTT and Markdown, without internal processing checkpoints |
| Excerpts to canvas | Editable materials with individual source/time links; conversion makes no model call |

## Intentional changes

Accounts, registration, memberships, points, recharges and payment are removed. Projects, examples, assets, recordings and reports are local. There is no cloud storage, cloud analysis queue or backend model-configuration endpoint. Model URLs, names, keys, voices and search settings stay in the browser and never enter exports.

Remote models are contacted only for requested AI capabilities. Use a local service to keep inference local. Original cloud databases are not accessed automatically. Model-specific recognition, timestamps and OCR are not guaranteed by API compatibility. Scanned PDFs need separate OCR. See [Verification](./VERIFICATION.md).

## Interface

A Codex-style sidebar organizes recent projects and settings. The canvas uses a compact component menu and bottom toolbar; recordings pair playback/transcripts with a reading area. Neutral shadcn/Base UI styling supports light, dark and system appearance. English and Simplified Chinese follow browser preference or manual choice. Internal protocols, migration markers and checkpoints do not appear in user-facing flows.

## Asset-library interactions — 2026-11-03

The asset library supports nested folders, directory cards, breadcrumbs, asset and folder context menus, drag moves to tree nodes and directory cards, drag previews, drop highlighting, batch uploads and ViewerJS preview controls. The insertion drawer supports tree filtering, search, sorting and native-image insertion by selection, double-click or drag. Items in Trash can be restored. Deleting a folder moves its contents to the parent folder. Dropping an item inside the drawer leaves the canvas intact.

`features/asset-library/library-api.ts` adapts local UUIDs, query pagination and metadata. Images and folders remain in the local instance; accounts, quotas, public cloud galleries and moderation are outside the local version. Feature translations load on demand. ViewerJS 1.11.8 and its MIT notice are included in dependency and distribution records.
