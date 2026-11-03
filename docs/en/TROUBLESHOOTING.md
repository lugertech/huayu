# Troubleshooting

## The page opens, but projects do not load

Check that the Rust service is running and `http://127.0.0.1:5858/api/health` returns `status: ok`. Development needs both frontend and API processes. Identify the owner of an occupied port before stopping anything.

## A model will not connect

Check the running service, API root URL, exact model ID, capability and cross-origin access from the browser. Local services may allow an empty key; other services follow their provider’s requirements. See [Model connections](./MODEL_SETUP.md).

## Settings disappear after changing the port

Browser storage is per origin. `localhost`, `127.0.0.1` and different ports may have different settings. Return to the original address or configure the new origin. Do not share connection keys by exporting browser storage.

## Language does not match the browser

An explicit choice in **Settings → General → Language** overrides browser detection. Choose **Browser default** to follow the browser again. English and Simplified Chinese are supported; unmatched languages fall back to English. The official site has its own header control. Existing project names, prompts and results retain their original language.

## A recording has no audio or system audio is unavailable

Check the original audio track, the browser’s audio-sharing option and microphone permission. Availability depends on the operating system, browser and source. Try a tab with sound, or import an existing video or audio file.

## Screen recording is unavailable

Use a desktop browser supporting `getDisplayMedia` and `MediaRecorder`, on a local origin or HTTPS. Check operating-system screen-recording permissions; permission changes may require restarting the browser. Mobile devices usually cannot perform desktop screen capture, but can import recordings for playback and analysis.

## Sentence times or speaker labels are inaccurate

They come from the transcription service. Text-only output cannot provide accurate sentence times; speaker support varies. Check the audio and service settings, then correct the transcript. Huayu does not fabricate sentence times from plain paragraphs.

## Long recording analysis fails

Check FFmpeg and ffprobe on PATH and the 512 MB file limit. Inspect the error and resume completed segments. Recognition services may impose size, duration or rate limits. Browser decoding uses more memory without the local decoder.

## Work was not saved after closing the browser

Distinguish the top save status from a browser-only draft. A draft is not a committed project edit. Restore the local service and wait for submission; do not clear site data. Save or download unsaved recordings before refreshing, because in-memory recording data cannot be recovered afterward.

## A home-page thumbnail is outdated

Open the canvas and wait for resources and saving. The preview checks document revision and regenerates. Restore missing attachments first. Updating a cover does not change the work’s editing time.

## A collaborator cannot open the link or see updates

Confirm that both people use the same Huayu service. Links sent to another computer cannot use `127.0.0.1` or `localhost`. Use the host's actual IP as described in [Local-network collaboration](./DEPLOYMENT.md#local-network-collaboration), and check the port and firewall. If the link is disabled or invalid, ask the person who shared it to re-enable sharing and send the new link.

For **Waiting to reconnect**, restore access and wait for **Saved** without clearing browser data. A reverse proxy must support WebSocket upgrades on `/api/projects/*/events`. Concurrent edits to one card keep the last saved content rather than merging characters; work on separate cards when possible. See [Multiplayer collaboration](./USER_GUIDE.md#multiplayer-collaboration).

## Web preview differs from a standalone browser

The isolated preview restricts external scripts, network requests, fonts and form submission. Prefer self-contained pages. Download HTML for inspection in an appropriate environment. Never put model keys into a generated page.

## PDF text cannot be extracted

Local parsing reads existing text. Scans need OCR first; oversized or encrypted documents may also fail. Preserve the original and reproduce with a small, redacted file.

## Report a problem

Include version, operating system, browser, minimal steps and redacted errors. Exclude API keys, private recordings, full browser storage and projects you cannot redistribute. Follow [Security](./SECURITY.md) for vulnerabilities.
