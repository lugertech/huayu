# Canvas and works

## Add materials

Draw, write text, upload images and files. Click a component on the left to add instructions, web pages, audio or charts, or drag it to a position on the canvas. The bottom toolbar provides selection, hand, drawing, shapes and native connections.

The component palette sits at the canvas's left edge and shows icons by default. Hover to reveal names, then move away to collapse it. Keyboard focus also reveals names. Drag a component to see the full card follow your pointer, then release to place it. Press Esc or drag back to the palette to cancel. Each placement can be undone in one step.

The canvas fills the content area's height. The top-left back arrow returns directly to the project list, with a tooltip explaining the action. The canvas name sits beside it. Edits save automatically in the background, without a persistent save label. Connection or saving problems appear at the bottom right with a retry action. The top right provides online members, invitations, recording, export and the whiteboard menu. Hover over icons for their labels. Narrow windows place these controls on separate rows.

Click Run on any node to execute that node and its downstream steps in connection order. Nodes show progress while running. Click a node's Stop button to stop that run.

Text components replace their body with preceding outputs. Image, speech, website, file and chart components receive generation inputs through connected steps; website components preview the generated page. Audio uploads are transcribed immediately, and document uploads are parsed immediately. A run that reaches another Run node pauses there until it is clicked. Downstream components can still read materials connected before that node.

Use the button at the sidebar's top right to collapse it, then select the brand mark at the top to expand it again. Icons stay in place while labels appear as it opens. When collapsed, hover or focus an icon to read its name. Recent projects open in a menu and Settings stays at the bottom. On mobile, open the navigation drawer from the content area's top-left control.

Everything lives on one infinite canvas. When opening a legacy multi-page project, materials from its other pages are merged into the same canvas, preserving content, attachments and connections.

Ctrl + wheel zooms the canvas even while hovering over a card. Ordinary wheel scrolling still scrolls long text inside cards.

Connect materials to the component you want to run, and write requests in an instruction component. Image upload/download and ratio, web search, audio and file actions, page tools and chart type controls stay inside their components in the original MenteX positions. Text components have no extra action bar. Recording excerpts become editable text with source links.

### Whiteboard menu and keyboard shortcuts

- **Whiteboard menu**, at the end of the top-right icon group, provides import, export, search, commands, help, appearance and canvas background settings.
- Select a shape or drawing tool to adjust strokes, fills and line styles on the canvas's right side. Wide canvases show the full panel; narrow desktops and tablets show a compact icon rail. Click an icon to open its settings, then click the canvas or press Esc to close them. Long panels scroll. On phones, the bottom style button opens settings; component and drawing tools return when settings close.
- Click the zoom percentage at the bottom left to open the zoom menu, restore 100%, fit all content or focus the selection.
- Select a shape or click a card header, then press **Delete / Backspace** to remove it. The **⌫** key on Mac keyboards is Backspace.
- Use **Cmd / Ctrl + C, X, V** to copy, cut and paste selected content, or **Cmd / Ctrl + D** to duplicate it. Cards and native shapes can be selected together and copied to another canvas. Copies retain their content; the whiteboard handles bindings and groups.
- Use **Cmd / Ctrl + Z** to undo and **Cmd / Ctrl + Shift + Z** to redo. Delete keys inside text inputs edit text without removing the card.
- Right-click a card header, border or image to open the native whiteboard menu. Text inputs and reading areas keep the browser's text menu. Copy, paste, select all and undo inside text inputs only affect text.
- **Copy as PNG / SVG** in the context menu includes actual card content. Use **Alt / Option + Shift + C** to copy as PNG. Locking a card through the context menu also locks its content and controls; use the context menu to unlock it.
- Press **Enter** with a card selected, or double-click its header, to open its content. Native shapes, text and images retain the whiteboard's own editing and cropping interactions.
- With the canvas focused, use **Cmd / Ctrl + A** to select all, **Cmd / Ctrl + G** to group, **Cmd / Ctrl + Shift + G** to ungroup, arrow keys to move elements and **Cmd / Ctrl + K** to edit an element link. The sidebar search icon still opens project search.
- Open **Whiteboard menu → Help**, or the bottom-right help button, for the full shortcut list.

## Template library

The project home keeps the original four quick starts and adds 20 scenario templates, for 24 built-in templates. Search or filter the library, then create an independent project. Replace the sample material before running the steps you need.

Opening, editing and saving a template project do not need a model key. Text templates require text generation; image and narration workflows also need their respective connections. Run text branches separately if needed, then run the whole workflow once its connections are ready. Six complete examples include authored text, illustrations and pages to explore and edit. These are not measured outputs from a particular model.

| New template | Main output | Connections |
| --- | --- | --- |
| Friday launch · review to action | Timestamped recap, action list and review page | Text |
| Weekly update and next steps | Weekly update, next steps, DOCX | Text |
| Project proposal | Project proposal, PDF | Text |
| User interview guide | Interview guide and worksheet DOCX | Text |
| Flow · interviews to a prototype | PRD, knowledge map, working board and acceptance tasks | Text |
| User journey and opportunities | Journey flowchart and improvements | Text |
| Weekend Club · launch an experience | Recruitment copy, poster and self-contained event page | Text + image generation |
| Dashboard prototype | HTML prototype with filters and details | Text |
| Why cities hold heat · a research desk | Evidence notes, map, infographic and learning exhibit | Text + image generation |
| Four-week learning plan | Four-week plan, path map, PDF | Text |
| Interactive lesson quiz | Questions and interactive HTML | Text |
| Reading outline and questions | Article map and reflection questions | Text |
| Outline to article draft | Outline and editable article draft | Text |
| Multi-channel content pack | Copy for three channels, DOCX | Text |
| Customer email reply | Editable customer reply | Text |
| Release notes and upgrade notes | Release and upgrade notes in Markdown | Text |
| Pine Coffee · a spring launch | Positioning, copy, two posters, product page and release plan | Text + image generation |
| Product scene image | Product scene image | Text + image generation |
| Lighthouse Letters · a story studio | Complete three-act story, three illustrations and story page | Text + image generation |
| Two-minute narration and audio | Editable narration script and audio | Text + speech |

## Complete examples

Six projects marked **Complete example** open with source material, instructions, branching connections and authored work. No key is needed to read, view illustrations, try the prototype, edit or export the project. A model connection is needed when you actively generate new work.

- **Pine Coffee:** 11 components and 16 connections, from positioning to two posters, a product page and release checks.
- **Lighthouse Letters:** 12 components and 19 connections. Connected chapters and matching illustrations become a complete reading edition and introduction page.
- **Weekend Club:** 10 components and 15 connections. A practical itinerary, participation rules and unconfirmed details inform the launch materials.
- **Flow:** 10 components and 14 connections. Interview quotes lead to requirements, a journey and a working board. Add tasks, edit titles, move states and filter waiting replies. Prototype edits last while the current page remains open.
- **Why cities hold heat:** 10 components and 14 connections. Distinguish notes, illustrative observations and evidence limits before creating an explainer, map, infographic and exercises.
- **Friday launch:** 11 components and 17 connections. Timestamped transcript material branches into decisions, ownership, open questions and follow-up copy. The transcript is authored sample content without an attached real recording.

Open an example on the website to zoom its workflow, select a card, and switch between **Content & work** and **Creative instruction**. The Flow page is interactive in the preview. On the local website, **Use it in Huayu** opens the app filtered to the matching template; select the template to create an independent project. A public website links to the template instructions instead.

To continue, change source material and run the steps you need. Text and pages use text generation; reading image inputs requires vision, and creating new images requires image generation. Missing connections show the relevant setup guidance and preserve existing example work. The original four quick starts and fourteen other scenario templates remain available. Existing projects are not rewritten.

## Project library

Open **Library** (`/library`) from the sidebar to browse files, generated web pages, images and speech audio included in each project's **Project attachments**. Ordinary text, instruction results, charts and external links are excluded.

- **Find items:** search names, project names or text excerpts, and filter by type or project.
- **Change the view:** switch between list and grid. Use **View options** to group by project or change the sort order. Expand groups with **Show more**.
- **Preview and download:** click an attachment to preview it, or download it from its **…** menu. Document content, images and generated web pages have inline previews, speech audio can be played, and other files offer a download.
- **Return to the source:** choose **View in project** to locate the original canvas component. Edit or remove the content in that project.

Attachments are ungrouped by default. Enable **Group by project** in **View options** to group them; the selected setting is remembered.

The library reflects current project attachments. Project renames, replacement attachments and removed components appear when you return to the library. Deleting a project removes its entries. After editing in another window, return to this window or use Refresh.

## Standalone asset library

The asset library manages uploaded files independently of projects. Its sidebar entry is hidden; it remains available at `/assets`. It does not automatically collect project content or offer canvas insertion.

- **Organize folders:** use the folder tree or directory cards. Deleting a folder moves its files and subfolders to its parent without deleting them.
- **Move files:** drag a file onto a folder or the Assets root, or choose **Move to folder** from its **…** menu.
- **View and manage:** preview images or download other files. Menus support renaming, downloading, moving and Trash.
- **Upload a batch:** select or drop files, review the queue, and start the upload. Images, documents, audio, video and other files are supported.
- **Restore:** restore files from Trash. Deleting a project does not affect standalone library files.

## Connect and run

Drag a card’s left or right port to another card to connect an input or next step. Release on empty space to add a step. You can also click a port or use the keyboard menu. Direction expresses content flow; invalid cycles and duplicate connections explain why they cannot be created.

Run one step or the entire workflow. Watch status and elapsed time, and stop when needed. Changes to source material mark downstream results as outdated. Update only affected branches; locked results are reused.

## Multiplayer collaboration

Collaborators use the same Huayu service and project data. No sign-in or model key is required. Open the same collaboration link in each person's browser to edit one canvas together.

### Invite and join

1. Open the canvas and choose **Invite** at the top right.
2. Turn on **Allow collaboration through a link**, then choose **Copy link**.
3. Send the link to someone who can reach this Huayu service. They open it directly; no import or separate project copy is needed.
4. Strokes and shapes appear as they are being drawn. Card creation, movement, edits and deletion are also broadcast live, along with collaborator cursors and selection outlines. Edits save automatically without a manual save action.
5. To end collaboration, turn off the switch in the original canvas's invitation dialog. Open shared pages show **This collaboration link is disabled or no longer valid**. Turning it back on creates a new link; copy and send that link again. The previous link remains invalid.

Two browsers or tabs on one computer can try this locally. Other computers cannot use your `127.0.0.1` or `localhost` link: those addresses refer to their own computer. For multiple devices, follow [Local-network collaboration](./DEPLOYMENT.md#local-network-collaboration), open the original canvas through the local-network address, then copy its collaboration link.

### Online members and removal

- Each room accepts up to **15 simultaneous collaborators**, excluding the host. Multiple tabs in one browser count as one member; separate browsers or browser profiles count separately.
- Overlapping avatars appear at the top right. After the first three, **+N** represents the others. Click the group for the full online list, with the host and yourself marked. Avatar colors match collaborator cursors. Anonymous members use a color and short identifier without accounts or avatar uploads.
- The host can choose **⋯ → Remove from room** beside a collaborator and confirm. This disconnects all of that member's tabs, removes their cursors and selections, and frees their place. Saved canvas content stays intact; other members remain connected. Collaborators do not see removal or invitation management controls.
- A full room explains why joining failed and offers **Try joining again** when a place is free. Removed members see a separate message without automatic reconnection; they cannot keep saving or accessing the canvas's attachments.
- Membership is retained in the current browser. Removal survives a service restart, but is not an account ban: clearing site data, identity expiry or using another browser allows someone with a valid link to join as a new member. To invalidate the old invitation for everyone, turn collaboration off and back on, then send the new link only to the intended participants.

### Editing, saving and recovery

- Edits to different cards retain each person's work. When both people edit one card, the last save received by the service wins; text is not merged character by character. Take turns on the same card.
- Each person's zoom, pan and selection remain independent. Colored anonymous collaborator cursors and selection outlines show their activity without changing your selection or adding their edits to your undo history. Cursors hide when the pointer leaves the canvas or the window loses focus; collaborator indicators are removed when they leave or disconnect.
- Live previews and autosave run independently. Seeing another person's drawing does not mean it has been saved yet. Changes are submitted automatically in the background. Resolve any connection or saving warning before leaving. Cursor positions, selections and presence are not written into projects, templates or exports.
- A connection warning means unsubmitted changes remain in this browser. Huayu retries after recovery; you can also use **Retry** in the connection message. Wait for the warning to clear before leaving. Do not clear site data or switch browsers while those changes remain unsaved.
- Model URLs, keys and selections are not shared through the link. Anyone running AI steps configures the required capabilities in **Settings → Model connections** in their own browser. Others can edit and view saved results without a key. Have one person run a workflow to avoid duplicate generation.

### Collaborator interface and permissions

A link opens an independent canvas interface. Workspace navigation, recent projects, global search, the project library, global asset library and recording management are not rendered. The canvas name is plain text; rename, share management and publishing templates are unavailable.

| Action | Service computer | Collaborator |
| --- | --- | --- |
| View, draw, edit cards and connections | Allowed | Current canvas only |
| View results and export | Allowed | Current canvas only |
| Upload and download attachments | Allowed | Current canvas attachments only |
| Configure and use AI models | Own browser | Own browser |
| Browse projects, global assets or recordings | Allowed | No interface; API access denied |
| Rename/delete projects, manage sharing, publish templates, remove members | Allowed | No interface; API access denied |

The server enforces the scope even when a visitor changes project IDs or calls APIs directly. Closing collaboration revokes that link and its attachment access. Management access is determined by a connection from the service computer, not an account system; direct workspace access on that computer remains privileged. See [Deployment and backups](./DEPLOYMENT.md).

## Text works

Double-click a text component header, or select it and press Enter, to read Markdown. **Edit text** changes the result, keeping original creation instructions available. Save before using your edits for another creation. Unsaved edits remain as a draft in this browser and are restored when you reopen the work.

If the original changes elsewhere, Huayu reports the conflict and keeps your draft instead of silently overwriting the work. Check the current result before saving, or discard your draft to return to it.

## Image works

Open an image to zoom, return to original size or fit the window. Pan after zooming to inspect details. **Crop and rotate** saves a new image while preserving the original.

Copy places actual image data on the clipboard; download saves the file.

## Web works

Interact with a page preview and check desktop or mobile sizes. **Edit HTML** updates the code; wide screens show a live preview alongside it, and small screens can switch back to preview.

Download exports HTML. The isolated preview restricts access to the parent page, network requests and form submission, so pages requiring remote scripts, fonts or APIs may not run fully.

## Versions and undo

Use the previous-version button or version list to view existing versions. Cropping and rotation save a new image while preserving the original. Manual text and HTML edits use undo and redo.

## Export and import

| Format | Use |
| --- | --- |
| `.huayu.json` | Complete editable canvas and attachments |
| PNG / SVG | Share the current view without full editing structure |
| `.excalidraw` | Canvas and images; AI cards contain snapshots and recoverable data |
| Markdown / HTML / image | Take an individual work into other tools |

Import from the project page. Compatible Excalidraw and legacy tldraw JSON can also be read. Keep the original file; unsupported third-party extensions may not retain identical behavior.

Project imports and complete `.huayu.json` exports share a 128 MiB limit. An oversized export reports an error before creating a download; split the content before trying again.

Model connections are excluded from exports. Configure them again in another browser or origin. Switching the interface language does not modify existing work or user-defined names.
