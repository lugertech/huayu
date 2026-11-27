# Models and tools

Open **Settings → Models and tools** in the sidebar. Each category shows a status such as **Not configured**, **Off**, **To verify**, **Verified**, or **Verification failed**. The browser stores the configuration and uses it for new tasks after you select **Save settings**. You can continue editing in the dialog, and the footer shows **All changes saved**. Clearing site data removes the configuration.

Configure the categories your tasks use. Language models support text creation, web pages, files, charts, and analysis of existing transcripts. Transcription-only tasks need a speech recognition service. Drawing, manual editing, uploads, saving, exporting, recording, and playback are available without AI setup.

| Category | Settings |
| --- | --- |
| Language models | Select **Add model**, enter the API URL, and choose Chat Completions or Responses. Fill in the key and display name as needed. Choose **Fetch available models**, select the models you want, then choose **Update list**. You can also enter a model ID directly. |
| Image generation | Enter an API key and a model ID for GPT Image or Seedream. Seedream also accepts an Ark endpoint ID. Enable at least one service to generate images. If both are enabled, you can set a default. |
| Text to speech | Enter your Alibaba Cloud Model Studio region, workspace ID, API key, and voice. |
| Transcription | Enter your Alibaba Cloud Model Studio region, workspace ID, and API key. You can reuse the text-to-speech connection when both use the same workspace. |
| Web search | Enter a Tavily API key and enable the service. An instruction sends a search query when you turn on web search for that instruction. |

Enter the service's API root URL. Use `https://api.openai.com/v1` for the official OpenAI service or a URL such as `http://localhost:11434/v1` for a local service. Leave the key blank for a service that accepts requests without one.

You can add several models for one connection. When you reopen the catalog, previously added models are checked. Updates apply to the models returned by the service and keep models entered outside the catalog.

The canvas shows the selected model next to **Run**. Set separate choices for language models and image generation. Use the **Image understanding** filter to select a verified language model for tasks with reference images or canvas screenshots. If a task needs more configuration, its message links to the corresponding settings.

## Test a connection

You can test a draft before choosing **Save settings**. Verify the affected operations again after changing a protocol, URL, key, model, or voice.

- After completing the language model fields, expand **Test connection**. The text test sends a short request. The image understanding test sends a locally generated sample and checks the model's answer against the image.
- Image generation tests use sample prompts or reference images and check the returned image.
- The voice preview synthesizes a short sample. The transcription test uses a sample recording and checks its text and timestamps.
- The search test sends one short query and checks the results.

Tests make real requests and may use provider credit. If the service is unreachable, check the URL, network, and cross-origin access. For access or quota errors, check your provider account. After correcting the configuration, retry the failed operation.

## Migrate existing settings

Existing text generation and image understanding connections carry over as Chat Completions models with their selections. Existing official GPT Image and Tavily settings also carry over. Verify the operations you use.

The original browser data retains previous OpenAI-compatible voice, Brave Search, and custom image or search gateway configuration. Enter the corresponding Alibaba Cloud, GPT Image, Seedream, or Tavily credentials to use those categories.

## Browser connections

Your browser sends the selected materials to the chosen service. The service must allow requests from the page origin, usually `http://127.0.0.1:5173` in development or `http://127.0.0.1:5858` for a build. Each origin has its own settings. If an HTTPS page cannot reach an HTTP service, use a browser-supported local origin or configure HTTPS on the service.

Recording transcription submits audio in segments and supports seeking to individual sentences. You can resume from saved progress if processing fails. Huayu saves the resulting content with the project or recording. Service URLs, keys, and model selections stay in the browser. Changing the interface language preserves existing content in its original language.

See the official documentation for supported models, voices, and parameters. [OpenAI Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses), [GPT Image](https://developers.openai.com/api/docs/guides/image-generation), [Seedream](https://docs.volcengine.com/docs/ark/image-generation-api?lang=zh), [Alibaba Cloud text to speech](https://help.aliyun.com/zh/model-studio/qwen-audio-tts-http-api), [Alibaba Cloud speech recognition](https://help.aliyun.com/zh/model-studio/qwen-audio-asr-http-api), [Tavily](https://docs.tavily.com/documentation/api-reference/endpoint/search).
