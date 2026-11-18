# From tldraw computer to Huayu

Research and initial implementation: 2026-10-24.

## Product direction

Huayu is a local workspace that turns materials, sketches and recordings into works. The core journey is to add materials, express intent, see a result, edit directly, and build on it. The canvas provides working space, connections express dependencies, and recordings retain factual sources.

Text, images, pages, speech, files, charts and drawing already exist. Their connections matter more than another component type. A real task should flow from beginning to end without unnecessary learning.

## Research basis

The following separates team statements from Huayu’s design inferences. Research used public articles, talk pages, chapter descriptions and available demonstration text; it was not described as watching every full video.

| Primary material | Principle | Huayu inference |
| --- | --- | --- |
| Steve Ruiz, [tldraw computer at AI Engineer World’s Fair 2025](https://ai.engineer/talks/1C2TdPkj6aQ-tldraw-computer), [video](https://www.youtube.com/watch?v=1C2TdPkj6aQ), especially 3:26, 8:12, 13:23 and 15:43 | A canvas can contain working media that transforms through connected steps | Make material-to-work journeys natural and finite before adding programming loops |
| Steve Ruiz, [Make Real, the story so far](https://tldraw.substack.com/p/make-real-the-story-so-far), 2023-11-18 | Generated pages return to the canvas for annotation, comparison and iteration, retaining HTML and visual context | Existing work should be useful input for the next request |
| Steve Ruiz, [Text is not enough](https://tldraw.dev/blog/text-is-not-enough), 2026-03-30 | Visual adjustments and complex processes are difficult to express entirely through chat | Make selection a clear action target |
| Tim Gilboy, [Agents can’t point](https://tldraw.dev/blog/agents-cant-point), 2026-08-11 | “This” needs an explicit referent; turning every conversation into a shape produces clutter | Put creation near selected material; commit confirmed steps rather than every temporary question |
| Jessica Edwards, [A comment is not a shape](https://tldraw.dev/blog/a-comment-is-not-a-shape), 2026-08-06 | Discussion and work have different lifecycles | Future comments should anchor independently instead of entering work exports |
| Steve Ruiz, [Hover areas](https://tldraw.dev/blog/a-review-of-design-tool-hover-areas), 2026-04-07; Steve Ruiz and Ani Krishnan, [Back to Content](https://tldraw.dev/blog/back-to-content), 2026-01-10 | Hit targets, conventions and returning to content deserve careful attention | Preserve native Excalidraw behavior and remove misclicks, jumps and lost-content states |

## Implemented journeys

Add components and connect materials to an instruction, then run it from its header. Image, speech, website, file and chart components receive upstream outputs. Text components replace their body with upstream text. Websites generate and preview HTML, frames supply a single snapshot, and the drawing agent uses native shapes inside its own box.

Recording text, chapters and selected excerpts become editable canvas materials with original source/time links. Chapters use the matching transcript range. Conversion makes no model call, so facts can be checked before creating.

Compact headers leave room for content. Component tools stay visible inside their cards. Image upload and download sit at the bottom left, aspect ratio at the bottom right, and web search at the bottom left of instruction cards. The extra selection toolbar, external action bars and creation panel have been removed. Click a card’s plus button or open its menu with the keyboard to add a connected step or link an existing card. Adding a step keeps the current canvas view. The menu explains why duplicate, cyclic, or cross-page connections are unavailable. Ports account for rotation and frames.

Execution paths and per-card state show waiting, running, failure, and stopping. The top of the canvas shows **Running** and a stop button with a solid red square icon. Clicking the stop button changes the label to **Stopping** and disables the button until cancellation is complete, then the control disappears. Content fingerprints persist freshness after reload; changed material marks affected descendants and allows branch-only updates. Locked results remain reusable. Changed inputs during a request do not falsely mark old output as fresh. Existing works survive stopping and failure.

The neutral sidebar, appearance and browser-only model settings remain consistent.

## View and edit work

Text, image and page works share one work window, reachable by double-clicking component headers, pressing Enter on a selected component. Website full-screen buttons open a separate preview window. Closing restores focus to the current work; version changes locate the matching canvas object.

Text reads as Markdown and edits the generated body, retaining the original request. Pages support real interaction, desktop/mobile preview, direct HTML editing and live preview with existing isolation. Browser drafts are scoped to project, page and work; conflicts preserve drafts rather than silently replacing newer content.

Images support zoom, pan, original size, fit, crop and rotate. Cropping saves a new PNG without changing the original, with lineage and a suitable ratio for the next generation. Copy uses actual image pixels.

Existing version links remain available; ordinary edits use undo/redo.

## Scope and follow-up

This is an adaptation of interaction principles on Excalidraw, not a copy of the tldraw SDK or visual assets. Keep attention on content clarity, predictable connections, explicit progress, local ownership and usable results. Validate real models and actual system permissions before claiming production readiness; see [Release checklist](./RELEASE.md).

## Complete example projects — 2026-11-03

Reviewed [tldraw Computer](https://computer.tldraw.com/), particularly [Story Generator](https://computer.tldraw.com/t/m6rf2ckVFbRc7r7yZt9oGM) and [Invention Inventor](https://computer.tldraw.com/t/9sfvz9vrz5nUsFRspwTJXm). Each expands a concrete task into multiple inputs, branches and downstream work, making the purpose easier to understand than a list of output formats.

Huayu applies that approach to six complete scenarios: specific starting material, shared inputs and branching work, followed by text, illustrations and interactive pages. Content is authored and carries no fabricated execution timings or model history. The site and app share one catalog, so visitors can inspect work, trace its instructions and continue with the matching local template.
