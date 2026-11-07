# Local API

The default address is `http://127.0.0.1:5858`. Development requests use Vite’s same-origin `/api` proxy. The service computer has workspace management access. Remote requests need a valid collaboration link and are limited to its canvas and attachments. Connection source, Host and Origin are checked.

Successful responses return an object or array directly. Creation returns `201`; deletion returns `204`. Errors use stable codes with a message; the interface localizes known messages without changing API data:

```json
{"code":"VALIDATION_FAILED","message":"请求数据格式有误"}
```

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Service health |
| GET | `/api/access` | Local workspace access; remote visitors receive `403 WORKSPACE_PRIVATE` |
| GET | `/api/projects?search=` | List projects, without documents |
| POST | `/api/projects` | Create with `name` and optional `document` |
| GET/PATCH/DELETE | `/api/projects/{id}` | Read, rename/update cover, delete |
| PATCH | `/api/projects/{id}/document` | Merge document-record patches |
| GET (WebSocket) | `/api/projects/{id}/events` | Initial snapshot, patches, deletion events |
| POST | `/api/projects/{id}/collaboration` | Set `enabled` |
| DELETE | `/api/projects/{id}/collaborators/{member_id}` | Host removes a member; returns 204 |
| POST | `/api/projects/{id}/template` | Save example with `name`, `description`, `tags` |
| GET | `/api/library` | Current project attachments without full content |
| GET | `/api/projects/{id}/attachments/{shape_id}` | Current attachment details; removed components or projects return `404` |
| GET | `/api/templates` | List examples and tags |
| POST | `/api/templates/{id}/fork` | Create an independent project |
| DELETE | `/api/templates/{id}` | Delete a custom example |
| POST | `/api/assets` | Multipart `file`; return local attachment URL |
| GET | `/api/assets/{id}` | Read attachment with Range support |
| GET | `/api/library/assets` | Asset list and total; folder, search, sort, Trash and incremental loading |
| POST | `/api/library/assets` | Add an uploaded file with `asset_id`, `width`, `height`, `name`, `folder_id`, and `trashed`; use zero dimensions for non-image files; returns `204` |
| GET/PATCH | `/api/library/assets/{id}` | Read an asset / update complete `name`, `folder_id`, `trashed`; update returns `204` |
| GET/POST | `/api/library/folders` | List folders and counts / create with `name`, `parent_id`; creation returns the folder |
| PATCH/DELETE | `/api/library/folders/{id}` | Rename with `name` / remove folder and move its contents to the parent |
| POST | `/api/documents/parse` | Multipart `file`; return attachment and parsed text |
| GET | `/api/unfurl?url=&includeHtml=true` | External page metadata and optional HTML |
| GET/POST | `/api/recordings` | List/create recording metadata. Pass an optional `project_id` to link a board |
| GET/PATCH/DELETE | `/api/recordings/{id}` | Read/update name, duration, transcript, analysis/delete |
| GET | `/api/recordings/{id}/media` | Duration, dimensions and audio-track metadata |
| GET | `/api/recordings/{id}/cover` | Extract a real local video frame as JPEG; audio-only assets return `204` |
| GET | `/api/recordings/{id}/audio?start=0&duration=300` | Extract mono 16 kHz WAV audio |

Asset listing returns `{ "assets": [], "total": 0 }`. Parameters are `search`, `folder_id`, `unfiled`, `trash`, `sort` (`newest` or `oldest`), `offset` and `limit` (default 50, maximum 100). Without a folder filter it lists all assets. `unfiled=true` restricts results to root and takes precedence over `folder_id`. `trash=true` lists trashed assets; the UI omits folder filters in Trash. Folders are a flat array containing `id`, `name`, `parent_id` and `asset_count`, the number of active images directly in that folder.

Set an asset’s `trashed` field to `true` to move it to Trash, or `false` to restore it. Trashed assets cannot be read through the asset-detail endpoint for new insertion. The original attachment endpoint remains available to existing canvases.

## Documents and collaboration

The standalone asset library manages uploaded files without project associations and no longer returns `source_project`. Adding the same `asset_id` is idempotent; an active item keeps its name and folder, while a trashed item is restored to the requested folder. Deleting a project does not affect these files. Legacy source columns remain for database compatibility but are no longer used.

The project library at `/api/library` includes only files, generated web pages, images and speech audio shown in **Project attachments**, across all canvas pages. Their `kind` values are `document`, `website`, `image` and `audio`. Ordinary text, instruction results, charts, external links, empty components and detached asset records are excluded from both the list and detail endpoints. List items contain `project_id`, `project_name`, `shape_id`, `name`, `kind`, `extension`, `size`, `updated_at`, `url` and an `excerpt` of up to 240 characters. Full `content` is returned only by the detail endpoint. `updated_at` is the project modification time. Renaming projects, replacing attachments, removing components and deleting projects are reflected without independent copies. Both library endpoints require workspace owner access; canvas share links cannot read them.

```json
{"upsert":[],"remove":[],"client_id":"random-edit-session-id"}
```

`upsert` contains complete records, not partial properties. The application model supports legacy canvas records and schemas. Omit `schema` to retain it. If an ID appears more than once in `upsert`, the last record wins. If it appears in both `remove` and `upsert`, the upserted record is retained. Changes are determined from the final document; unchanged records or schemas do not increment revision. Invalid or oversized patches leave the existing document unchanged. Session records are rejected.

When updating a project, omit `cover` to preserve it or send `"cover": null` to clear it. Updating only the cover preserves the document revision and edit time.

Document parsing accepts uploads up to 10 MB. Attachments are saved only after text extraction succeeds. Failed parsing or oversized uploads retain neither the file nor an attachment record.

Collaboration reads, patches and WebSockets include `?share={share_token}`. Closing collaboration returns `403 COLLABORATION_CLOSED` for the old link and stops its connected pages. Reopening generates a new link. Updating the share token also stops WebSocket connections using the old token. Collaborators cannot access project lists, other projects, template management, the global asset library, recordings or share management. Out-of-scope requests return `403 SHARED_SCOPE_FORBIDDEN`.

Local API calls include `X-Huayu-Canvas`; shared calls also include `X-Huayu-Share`. Reading the project sets an HttpOnly, SameSite=Strict session cookie scoped to `/api/assets/`, allowing browser image and media elements to read authorized attachments. Uploads are associated with the canvas in the versioned `project_assets` migration, while existing document attachment references remain available. The attachment and its canvas association are saved in one transaction; a missing target canvas returns `404` and discards the upload. Rejected document patches grant no additional attachment access. Unrelated attachment references return `403 SHARED_RESOURCE_FORBIDDEN`. The cookie grants no workspace or management access. Model connections and keys do not use these APIs or cookies.

Rooms accept 15 online collaborators, excluding the host. Reading the project sets `huayu_member_{project_id}` (HttpOnly, SameSite=Strict, Path=/api/, 30 days) to identify a browser. Preserve cookies for subsequent HTTP and WebSocket requests. Multiple connections for one member count once. WebSocket admission checks capacity again under the room lock. HTTP returns `409 ROOM_FULL`; a capacity race after the handshake ends with a `room_full` event.

Only the host can remove a member by `member_id`. The service persists removal, disconnects all of that member's connections and broadcasts `member_removed`. Later shared requests return `403 COLLABORATOR_REMOVED`. Clients must stop reconnecting and saving, and distinguish removal, full rooms and closed invitations. Membership is independent of connection IDs; removal survives restarts. Anonymous visitors can obtain a new identity by clearing cookies or changing browsers, so close and reopen collaboration to invalidate the invitation completely.

WebSocket `/api/projects/{id}/events` carries both durable notifications and live session messages. A connection receives `snapshot`, followed by `peers` containing its server-assigned `client_id`, all online connections and `max_collaborators: 15`. `peer_joined`, `presence` and `peer_left` update the session display. A reconnect receives a new connection ID.

- Member fields: `id` is the connection UUID, `member_id` identifies the browser member, `role` is `host` or `collaborator`, and `joined_at` is the join time in milliseconds. The avatar list merges connections by member; cursors remain per connection.
- Server `member_removed`: `{"type":"member_removed","member_id":"member-id"}`. The target stops collaboration; others remove all of that member's connections from their list and cursors.
- Server `room_full`: `{"type":"room_full","max_collaborators":15}`, followed by connection closure.
- Client `scene_update`: `{"type":"scene_update","patch":{"upsert":[],"remove":[],"client_id":"edit-session-id"}}`. The server relays a `scene_update` with the source connection's `client_id` and a null `target`. This is a preview only: it neither writes the database nor increments the project revision.
- Client `scene_init`: contains a `target` connection ID and a `patch`, including current records and pending deletions. It is relayed only to that connection as a targeted `scene_update`, so a new participant can see work in progress.
- Client `presence`: `{"type":"presence","presence":{"pointer":{"x":0,"y":0,"tool":"pointer"},"button":"up","selectedElementIds":{}}}`. Coordinates are in scene space; `tool` is `pointer` or `laser`, `button` is `up` or `down`, and a null pointer hides the cursor. The server relays a `presence` event containing the `peer`.

Live changes are throttled to approximately 33 ms. Durable saves still use `PATCH /document` independently. Cursors, selections and presence are excluded from the recovery journal and exports. Remote previews do not trigger local autosave, and remote changes do not enter local undo history. Native element previews use Excalidraw's `restoreElements`, `reconcileElements` and `CaptureUpdateAction.NEVER`; cursors and selections use `updateScene({ collaborators })`. See the [official collaboration implementation](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/collab/Collab.tsx).

## Recordings

Create with `name`, an uploaded `asset_id`, and `duration` in seconds. Updates also accept a nonnegative `duration` once media metadata is available. `transcript` and `analysis` are text fields; the frontend stores versioned JSON for segments, chapters and Q&A and also reads legacy plain text.

Audio ranges use seconds: `start >= 0` and `0 < duration <= 300`. Only local attachments are read, never arbitrary paths or remote media URLs. Missing FFmpeg/ffprobe returns `503 AUDIO_DECODER_UNAVAILABLE` and enables browser decoding fallback. Invalid ranges, formats or missing audio return `422`; queue timeout returns `503 MEDIA_BUSY`; processing timeout returns `504 MEDIA_TIMEOUT`.

Transcript JSON may include completion state, processed and total chunks, chunk duration and source attachment ID. Analysis can be a report or `kind: "analysis-checkpoint"` containing completed parts and a previous readable report. Neither contains model settings.

There are no model inference, model configuration, user, membership or points APIs. The browser calls the model service directly. Language preferences are also browser-only.
