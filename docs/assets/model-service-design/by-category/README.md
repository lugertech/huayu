# 画语模型与工具接入设计

「设置 → 模型与工具」按用途组织接入。用户可以在常驻分类栏查看语言模型、图片生成、语音合成、语音识别和联网搜索的状态。首次使用可以只配置当前任务所需的项目。

## 桌面设计稿

| 页面 | 交互 |
| --- | --- |
| [语言模型](./settings-language-models.png) | 从分类栏进入配置。可以添加多个模型，为每个模型选择接口类型，分别测试文字和图像理解。 |
| [图片生成](./settings-image-generation.png) | 同时查看 GPT Image 和 Seedream 的配置及启用状态。展开服务后可以编辑并测试。 |
| [画布选择器](./canvas-model-picker.png) | 「运行」旁显示当前模型。打开后可以按用途选择、搜索模型，或者前往相应的设置。 |

设置采用全高分栏、浅色选中底和紧凑行。选模菜单采用顶部搜索、按服务分组的列表和底部设置入口。画布示例内容、图标和服务状态用于展示。实现时使用画语现有品牌资源。接口路径和参数留在本文与帮助文档中。 [Cherry Studio 模型服务设置](https://cherryai.com/docs/en/pre-basic/settings/providers/)、[画布选模的参考界面](https://www.cherryai.com/docs/en/advanced-basic/chat/)。

## 配置、启用和验证

分类栏根据已保存的配置计算状态。语言模型显示默认模型的文字验证状态，图像理解状态显示在对应模型上。图片生成显示默认服务的文生图状态，详情保留每个服务及参考图能力的状态。

| 状态 | 含义 |
| --- | --- |
| 未配置 | 缺少必要字段。仅显示默认地址或预填模型名时仍需按服务要求配置。 |
| 已关闭 | 已保存配置，当前停用。重新开启可继续使用这份配置。 |
| 待验证 | 已保存并启用，当前配置还缺少该操作的成功记录。 |
| 已验证 | 当前配置已通过对应操作的实际请求。 |
| 验证失败 | 最近一次验证未通过。详情显示原因和可执行的处理方式。 |

编辑时可以先测试表单，保存后才更新分类栏和画布选择。接口类型、地址、密钥、模型或音色发生相关变化时，受影响的验证结果回到「待验证」。测试期间显示「测试中」。取消编辑后，画布继续使用已保存的设置。测试结果只应用于发出该请求时的配置。

图片生成可以同时启用 GPT Image 和 Seedream。只启用一个时，该服务成为默认。启用两个时，可以在设置中选默认，也可以在画布切换。生图要求至少一个已配置并启用的图片服务。没有启用项时，图片任务提供「配置图片生成」入口。语言、搜索、语音和手动编辑各自按需运行。

画布通过「语言模型」和「图片生成」两组入口记住文字创作、读图创作和图片生成的选择。普通文本任务可以使用已配置并启用的语言模型。需要读图的任务只提供通过图片测试的选项。当前模型无法读图时，提示选择图像理解模型或前往设置。模型、音色和工具在任务启动时确定。设置或选择的变化用于下一次运行。语音服务在设置中配置，联网搜索继续按指令开启。

## 官方接入方式

### 语言模型

每个模型填写接口类型、服务地址、API 密钥和模型 ID。允许直接填模型 ID。服务提供模型列表时，可用于选择模型。验证依据实际请求返回的内容。

| 接口类型 | 请求与返回 |
| --- | --- |
| Chat Completions | `POST /v1/chat/completions` 使用 `messages`。图片使用 `image_url` 内容项。流式响应读取 `choices[].delta.content`。 |
| Responses | `POST /v1/responses` 使用 `input`。图片使用 `input_image` 内容项。非流式读取文本输出，流式读取 `response.output_text.delta` 并处理完成与失败事件。按 OpenAI 规范使用 `store: false`。 |

表中的 `/v1` 是官方示例前缀。自定义连接填写服务商的 API 根地址，再按选定协议追加资源路径。每条连接使用用户选择的协议。适配器把文本、流式增量、结构化输出和失败结果交给现有调用方。 [OpenAI Responses 迁移指南](https://developers.openai.com/api/docs/guides/migrate-to-responses)、[图片输入格式](https://developers.openai.com/api/docs/guides/images-vision)。

「测试文字」发送一条短请求并检查回复。「测试图片」在本地生成带随机编号的小图，根据模型回复核对编号。提示词只包含问题。文字和图片测试独立记录。文字通过且服务明确拒绝图片输入时，模型显示「仅文本」。认证失败、请求超时或样图回答错误显示「验证失败」。首版验证画布直接发送的文字和图片。语音转写与生成分别走下方的独立服务。

### 图片生成

| 服务 | 设置 | 请求与返回 |
| --- | --- | --- |
| GPT Image | OpenAI API 密钥、模型 ID | 文生图使用 `POST /v1/images/generations`。带参考图使用 `POST /v1/images/edits`，沿用浏览器文件上传。将 `data[].b64_json` 解码为图片。 [OpenAI 图片生成](https://developers.openai.com/api/reference/resources/images/methods/generate)、[参考图编辑](https://developers.openai.com/api/reference/typescript/resources/images/methods/edit) |
| Seedream | 火山方舟 API 密钥、模型 ID 或推理接入点 ID | 使用 Bearer 鉴权调用 `POST https://ark.cn-beijing.volces.com/api/v3/images/generations`。带参考图时传入 `image`，可使用本地图片编码的 Data URL。单图请求使用相应模型的尺寸规则，并请求 `response_format: "b64_json"`。 [火山方舟图片生成 API](https://docs.volcengine.com/docs/ark/image-generation-api?lang=zh) |

两种适配器返回画布可直接保存的图片。文生图与参考图能力各自验证。测试使用示例提示词和内置参考图。用户点击测试时才发请求，测试可能产生费用。正常生成也可验证该操作的返回结果。请求失败后保留旧作品，供用户从原处重试或主动换服务。

### 语音合成与语音识别

两项使用阿里云百炼。设置填写地域、业务空间 ID 和同地域的 API 密钥。语音合成另选音色。使用同一个百炼业务空间时可以复用该连接，两项保留各自的启用和测试状态。

| 类别 | 首版接入 | 请求与返回 |
| --- | --- | --- |
| 语音合成 | `qwen-audio-3.1-tts-flash` | 向业务空间域名发送 `POST /api/v1/services/audio/tts/SpeechSynthesizer`。传入文字、音色与 MP3 格式，用 `X-DashScope-SSE: enable` 取回流式音频。解码每个 `output.audio.data` 音频块，按顺序合并成可播放文件。用固定短句测试音色。 [百炼语音合成 API](https://help.aliyun.com/zh/model-studio/qwen-audio-tts-http-api) |
| 语音识别 | `qwen-audio-3.1-asr-flash` | 向业务空间域名发送 `POST /api/v1/services/aigc/multimodal-generation/generation`。将 WAV 片段编码为 Base64 Data URL，放入 `input.messages[].content[].input_audio.data`，并指定 WAV 格式。以 SSE 读取最终文本和已确认的时间戳，将毫秒换算为秒并加上原片段偏移。用内置的多句样音验证文字和时间戳。 [百炼语音识别 API](https://help.aliyun.com/zh/model-studio/qwen-audio-asr-http-api)、[音频规格和时间戳](https://help.aliyun.com/zh/model-studio/non-realtime-speech-recognition-user-guide) |

按官方文档使用 `{WorkspaceId}.cn-beijing.maas.aliyuncs.com` 或 `{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`，并以 Bearer 方式鉴权。语音识别沿用五分钟以内的分段和检查点，已完成的转写可继续用。请求体直接携带当前音频段，录音无需先生成公网地址。

### 联网搜索

只填写 Tavily API 密钥。请求固定发往 `POST https://api.tavily.com/search`，使用 `Authorization: Bearer <key>`。在 JSON 请求体中传入 `query` 和 `max_results`，并指定 `search_depth: "basic"`。把 `results` 中的标题、链接和摘要作为资料传给当前任务。设置中的「测试搜索」执行一条短查询并验证返回结构。画布仅在指令开启联网搜索时发出该请求。 [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search)。

## 数据与迁移

类别决定需要哪些配置和可验证的操作。语言模型记录各自的接口类型，图片生成保存两个对应服务的配置，语音和联网搜索按服务保存。工作流在浏览器按任务用途读取选择与状态，服务适配器校验并转换各自的外部响应。设置、画布和录屏共用同一份浏览器配置。 [现有设置](../../../../apps/web/src/ai/settings.ts)、[现有模型调用](../../../../apps/web/src/ai/provider.ts)、[现有录屏分析](../../../../apps/web/src/features/recording/analysis.ts)。

浏览器直接向选中的服务发请求。地址、密钥、模型选择和验证状态只保存在浏览器。项目、模板、导入导出和画语服务只处理原有的内容与结果。保留现有跨标签同步以及中英文和画布语言的显示规则。

已有文本和图像理解连接按 Chat Completions 导入新设置，保留模型 ID 和各自的选择。已有官方 GPT Image、Tavily 配置也可带入。迁移后的验证从「待验证」开始。旧语音服务、Brave 和自定义图片或搜索网关的凭证留在原浏览器配置中，新类别引导配置对应的阿里云、图片生成服务或 Tavily 密钥。跨类别复用凭证要求目标地址相同，并由用户主动选择。

## 验证范围

本轮核对了官方接口文档。对开发站点来源 `http://127.0.0.1:5173` 发出无密钥的 `OPTIONS` 预检，OpenAI 的语言和图片端点、火山方舟图片端点、Tavily Search 端点，以及阿里云公共 DashScope 域名上的两条语音路径均返回允许预检所请求的跨域方法和请求头。百炼业务空间专属域名和各接口的真实授权及结果属于联调范围。

实现验收应覆盖输入、输出和状态三者。语言模型用两种协议分别跑通文字、图片、流式和结构化输出。图片分别验证两个服务的文生图、参考图和最后一个服务关闭的状态。语音合成实际试听，录屏跨多个片段时点击句子能定位并可从断点继续。联网搜索可归因到实际来源。验证更换密钥、从画布跳入设置、切换语言、跨标签页和项目导出时，状态与数据边界保持正确。
