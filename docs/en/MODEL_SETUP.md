# Model connections

Open **Settings → Model connections** at the bottom of the sidebar. Configuration stays in this browser and takes effect when you choose **Save settings**. Cancel retains the previous configuration. Clearing site data removes connections.

## Configure each capability

Configure only the capabilities you need. Missing AI connections do not prevent drawing, manual editing, uploads, project saving and export, recording or playback.

| Configuration | Available features |
| --- | --- |
| No AI connections | Canvas, existing work editing, assets, project import/export, recording and playback |
| Text generation only | Text-based creation, pages, documents, natural-language charts and organizing an existing transcript |
| Transcription only | Transcription-only processing of audio and recordings |
| Images or canvas screenshots as input | The relevant creation also needs image understanding; image generation uses its own connection |
| Web search enabled | That instruction also needs a search connection; ordinary creation works with search off |

“Filled in · Not tested” means the connection details are complete. Missing configuration identifies the required capability and links to its settings, without silently switching services. Recording processing checks its required connections before starting and preserves existing transcripts and reports.

| Capability | API | Purpose |
| --- | --- | --- |
| Text generation | OpenAI-compatible `chat/completions` | Writing, pages, charts, files and analysis |
| Image understanding | `chat/completions` with image messages | Reference images and canvas content |
| Image generation | `images/generations`; reference editing uses `images/edits` | New images and image revisions |
| Text to speech | `audio/speech` | Generate audio from text |
| Transcription | `audio/transcriptions` | Transcribe audio and recordings |
| Web search | Tavily or Brave Search | Research for tasks where search is explicitly enabled |

Enter only the API root URL, such as `http://localhost:11434/v1` for a local service. Use the model ID your service provides. Leave the API key blank for a local service that runs without one. Use your own valid key for remote services.

You can reuse the text service’s URL and key for other capabilities. Model IDs, voices and transcription formats remain separate. Supported editing operations, dimensions, voices and timestamps depend on the service; API compatibility does not guarantee every capability.

An OpenAI project API key with access to the relevant models can cover text generation, image understanding, image generation, text to speech and transcription. Set up **Text generation** and choose **Use the text generation service** in each of the other model tabs. Web search uses a separate provider key. For example, select Tavily and enter a Tavily API key.

## Local and remote services

Start your local model service and allow requests from the page’s origin: usually `http://127.0.0.1:5173` in development or `http://127.0.0.1:5858` for a build. Browser settings on different origins and ports are independent.

The browser sends selected materials directly to the configured model. Huayu’s data API does not proxy model requests. Remote models receive the selected text, images or audio. Use a local model when inference must remain on your device too.

New system-generated instructions and analysis use the current interface language by default. Explicit output-language requirements in your own instructions take precedence. Existing content is not automatically translated when you change the interface language.

## Test a connection

Test the currently entered connection before saving if needed. **Save settings** activates it for subsequent tasks. Changing fields or capabilities cancels the old test.

- Text generation sends a short text request. Image understanding uses the same text probe; image inputs still need a real test.
- Image generation, speech and transcription only check the service and model list without generating content. Finding a model still produces a reminder that its capability needs a real generation. An unsupported model list is not reported as success.
- Search runs one short query. Text and search tests may incur provider charges.

Connection tests time out after 15 seconds. Generation requests also have time limits and support cancellation. Failed generations are not silently repeated in the background. Retry the original step after correcting the connection.

- Connection failure: check that the service is running, the URL is correct and cross-origin requests are allowed.
- Model missing: verify the exact service model ID.
- Invalid or expired key: update the API key for that capability.
- Insufficient quota or request limits: check provider credit and usage, then try again later.
- Text works but images fail: check image understanding, image generation and reference editing separately.
- No sentence times: choose a model and format that supply timestamps. Text-only services cannot recover accurate sentence timing.
- HTTPS page cannot reach HTTP service: check mixed-content restrictions. Use a local page origin or HTTPS on the service.

Never paste keys or full browser storage into public feedback.
