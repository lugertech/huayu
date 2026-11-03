# Local API

The default address is `http://127.0.0.1:5858`. Development requests use Vite’s same-origin `/api` proxy. There are no accounts or access tokens. Requests must use an allowed instance host and origin.

Successful responses return an object or array directly. Creation returns `201`; deletion returns `204`. Errors use stable codes with a message; the interface localizes known messages without changing API data:

```json
{"code":"VALIDATION_FAILED","message":"请求数据格式有误"}
```

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Service health |
| GET | `/api/projects?search=` | List projects, without documents |
| POST | `/api/projects` | Create with `name` and optional `document` |
| GET/PATCH/DELETE | `/api/projects/{id}` | Read, rename/update cover, delete |
| PATCH | `/api/projects/{id}/document` | Merge document-record patches |
| GET (WebSocket) | `/api/projects/{id}/events` | Initial snapshot, patches, deletion events |
| POST | `/api/projects/{id}/collaboration` | Set `enabled` |
| POST | `/api/projects/{id}/template` | Save example with `name`, `description`, `tags` |
| GET | `/api/templates` | List examples and tags |
| POST | `/api/templates/{id}/fork` | Create an independent project |
| DELETE | `/api/templates/{id}` | Delete a custom example |
| POST | `/api/assets` | Multipart `file`; return local attachment URL |
| GET | `/api/assets/{id}` | Read attachment with Range support |
| GET | `/api/library/assets` | Asset list and total; folder, search, sort, Trash and incremental loading |
| POST | `/api/library/assets` | Add an uploaded image with `asset_id`, `width`, `height`, `name`, `folder_id`, `trashed`; returns `204` |
| GET/PATCH | `/api/library/assets/{id}` | Read an asset / update complete `name`, `folder_id`, `trashed`; update returns `204` |
| GET/POST | `/api/library/folders` | List folders and counts / create with `name`, `parent_id`; creation returns the folder |
| PATCH/DELETE | `/api/library/folders/{id}` | Rename with `name` / remove folder and move its contents to the parent |
| POST | `/api/documents/parse` | Multipart `file`; return attachment and parsed text |
| GET | `/api/unfurl?url=&includeHtml=true` | External page metadata and optional HTML |
| GET/POST | `/api/recordings` | List/create recording metadata |
| GET/PATCH/DELETE | `/api/recordings/{id}` | Read/update name, transcript, analysis/delete |
| GET | `/api/recordings/{id}/media` | Duration, dimensions and audio-track metadata |
| GET | `/api/recordings/{id}/cover` | Extract a real local video frame as JPEG; audio-only assets return `204` |
| GET | `/api/recordings/{id}/audio?start=0&duration=300` | Extract mono 16 kHz WAV audio |

Asset listing returns `{ "assets": [], "total": 0 }`. Parameters are `search`, `folder_id`, `unfiled`, `trash`, `sort` (`newest` or `oldest`), `offset` and `limit` (default 50, maximum 100). Without a folder filter it lists all assets. `unfiled=true` restricts results to root and takes precedence over `folder_id`. `trash=true` lists trashed assets; the UI omits folder filters in Trash. Folders are a flat array containing `id`, `name`, `parent_id` and `asset_count`, the number of active images directly in that folder.

Set an asset’s `trashed` field to `true` to move it to Trash, or `false` to restore it. Trashed assets cannot be read through the asset-detail endpoint for new insertion. The original attachment endpoint remains available to existing canvases.

## Documents and collaboration

```json
{"upsert":[],"remove":[],"client_id":"random-edit-session-id"}
```

`upsert` contains complete records, not partial properties. The application model supports legacy canvas records and schemas. Omit `schema` to retain it. If an ID appears more than once in `upsert`, the last record wins. If it appears in both `remove` and `upsert`, the upserted record is retained. Changes are determined from the final document; unchanged records or schemas do not increment revision. Invalid or oversized patches leave the existing document unchanged. Session records are rejected.

When updating a project, omit `cover` to preserve it or send `"cover": null` to clear it. Updating only the cover preserves the document revision and edit time.

Document parsing accepts uploads up to 10 MB. Attachments are saved only after text extraction succeeds. Failed parsing or oversized uploads retain neither the file nor an attachment record.

Collaboration reads, patches and WebSockets include `?share={share_token}`. Closing collaboration returns `403 COLLABORATION_CLOSED` for the old link and stops its connected pages. Reopening generates a new link. The instance has no user isolation: access to the instance also permits entering the project list.

## Recordings

Create with `name`, an uploaded `asset_id`, and `duration` in seconds. `transcript` and `analysis` are text fields; the frontend stores versioned JSON for segments, chapters and Q&A and also reads legacy plain text.

Audio ranges use seconds: `start >= 0` and `0 < duration <= 300`. Only local attachments are read, never arbitrary paths or remote media URLs. Missing FFmpeg/ffprobe returns `503 AUDIO_DECODER_UNAVAILABLE` and enables browser decoding fallback. Invalid ranges, formats or missing audio return `422`; queue timeout returns `503 MEDIA_BUSY`; processing timeout returns `504 MEDIA_TIMEOUT`.

Transcript JSON may include completion state, processed and total chunks, chunk duration and source attachment ID. Analysis can be a report or `kind: "analysis-checkpoint"` containing completed parts and a previous readable report. Neither contains model settings.

There are no model inference, model configuration, user, membership or points APIs. The browser calls the model service directly. Language preferences are also browser-only.
