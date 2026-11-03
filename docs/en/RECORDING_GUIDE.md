# Recordings and analysis

## Record or import

Open **Recordings** from the sidebar, or use the recording control above a canvas. Choose a screen, window or tab, and enable the microphone if needed. The browser and operating system request permissions. System audio availability depends on the operating system, browser and shared source.

Pause, resume and stop during recording. Review before downloading or saving. Closing the review window still lets you return to save; discarding requires confirmation. Unsaved recordings do not survive a browser refresh, so save or download first.

Import existing video or audio directly. After importing or saving, check playback, audio and duration before transcription.

The recording list shows real video frames as covers, including for existing recordings without reimporting them. Landscape and portrait previews retain their proportions. Audio-only files have an audio cover. If a frame cannot be read, **Preview unavailable** appears and you can still open playback. Covers are read locally and require no model connection.

## Transcribe, then organize

Configure transcription and text generation separately in settings. Choose **Transcribe only** to check recognition first; correct the text before organizing notes, chapters and Q&A. Recognition language, speaker labels and timestamps come from the model service and may need correction.

Long audio is preferably decoded in local FFmpeg segments. Without FFmpeg, browser decoding uses more memory. Each attachment is limited to 512 MB; practical duration also depends on device memory and service limits.

## Review and check

- Click sentence, chapter or Q&A times to jump to that moment.
- Search the transcript, move between sentences and change playback speed.
- Follow playback scrolls only the transcript list; turn it off to read freely.
- Transcript editing preserves timestamps. Saving invalidates the previous analysis so it can be regenerated from the corrected text.
- On mobile, switch between playback and organized content. Position and speed are remembered in the current browser.

## Stop and continue

Each completed transcription segment and analysis batch is saved. Tasks continue while you navigate within the application. After stopping, request failure or refresh, resume from completed work. Refresh ends unfinished browser requests; the local service does not keep calling models in the background.

The previous readable report remains available until a replacement is complete. Starting transcription again rebuilds intermediate results, so export transcripts and reports you want to keep first.

## Turn excerpts into works

Choose one or more transcript segments, a chapter, or the complete content, then choose **Create a canvas**. The new canvas contains editable text materials with source and time links. Check the text, then create an article, image or web page. Source links return to the original moment.

Conversion itself makes no model call. You choose when to use AI, which excerpts to send, and what to make. New analysis and report headings follow your interface language; changing it leaves existing transcripts and report content intact.

## Export

Download the original recording. Export transcripts as TXT, SRT or VTT, and organized analysis as Markdown. Text-only transcription services cannot supply accurate sentence times, limiting subtitles and navigation accordingly.
