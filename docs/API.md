# 本地 API

默认地址为 `http://127.0.0.1:5858`，开发页面通过 Vite 的同源 `/api` 代理访问。没有账号或访问令牌。请求需要来自本实例允许的地址和来源。

成功响应直接返回 JSON 对象或数组。创建项目、模板和录屏返回 `201`；删除返回 `204`。错误结构为：

```json
{"code":"VALIDATION_FAILED","message":"请求数据格式有误"}
```

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/health` | 本地服务状态 |
| GET | `/api/projects?search=` | 项目列表，不返回画布文档 |
| POST | `/api/projects` | 创建项目：`name`、可选 `document` |
| GET/PATCH/DELETE | `/api/projects/{id}` | 读取、改名/封面、删除项目 |
| PATCH | `/api/projects/{id}/document` | 合并文档记录补丁 |
| GET (WebSocket) | `/api/projects/{id}/events` | 初始快照、补丁和项目删除事件 |
| POST | `/api/projects/{id}/collaboration` | 设置协作状态：`enabled` |
| POST | `/api/projects/{id}/template` | 保存为模板：`name`、`description`、`tags` |
| GET | `/api/templates` | 模板列表及标签 |
| POST | `/api/templates/{id}/fork` | 从模板创建独立项目 |
| DELETE | `/api/templates/{id}` | 删除自建模板 |
| POST | `/api/assets` | multipart `file`，返回本地附件 URL |
| GET | `/api/assets/{id}` | 读取附件，支持 Range |
| GET | `/api/library/assets` | 素材列表及总数；支持分组、搜索、排序、回收站和分批加载 |
| POST | `/api/library/assets` | 将已上传图片加入素材库：`asset_id`、`width`、`height`、`name`、`folder_id`、`trashed`；返回 `204` |
| GET/PATCH | `/api/library/assets/{id}` | 读取素材 / 更新完整的 `name`、`folder_id`、`trashed`；更新返回 `204` |
| GET/POST | `/api/library/folders` | 读取文件夹与数量 / 创建：`name`、`parent_id`；创建返回文件夹对象 |
| PATCH/DELETE | `/api/library/folders/{id}` | 重命名：`name` / 删除文件夹并将内容移到上一级 |
| POST | `/api/documents/parse` | multipart `file`，返回本地附件与解析文本 |
| GET | `/api/unfurl?url=&includeHtml=true` | 读取外部网页元信息和可选 HTML |
| GET/POST | `/api/recordings` | 列表/创建录屏元数据 |
| GET/PATCH/DELETE | `/api/recordings/{id}` | 读取/更新名称、转写、分析/删除录屏 |
| GET | `/api/recordings/{id}/media` | 读取本地音视频时长、尺寸与音轨信息 |
| GET | `/api/recordings/{id}/cover` | 本地提取真实视频封面，返回 JPEG；纯音频返回 `204` |
| GET | `/api/recordings/{id}/audio?start=0&duration=300` | 提取一段 16 kHz 单声道 WAV 音轨 |

素材列表返回 `{ "assets": [], "total": 0 }`。查询参数为 `search`、`folder_id`、`unfiled`、`trash`、`sort`（`newest` 或 `oldest`）、`offset` 和 `limit`（默认 50，上限 100）。不指定分组时返回全部素材；`unfiled=true` 仅返回未分组素材，并优先于 `folder_id`。`trash=true` 读取回收站。前端切换到回收站时不传分组过滤。文件夹以平铺数组返回，每项包含 `id`、`name`、`parent_id` 和当前文件夹内未移入回收站的图片数量 `asset_count`。

将素材的 `trashed` 更新为 `true` 会移入回收站，改回 `false` 会恢复。回收站素材不通过素材详情接口用于新插入；原附件接口仍可读取，保证已有画布中的图片可用。

文档补丁示例：

```json
{
  "upsert": [],
  "remove": [],
  "client_id": "当前编辑会话的随机标识"
}
```

`upsert` 必须包含完整记录，而非局部属性。新文档使用应用自有记录模型，兼容历史画布记录和 schema。`schema` 可省略以沿用现有 schema。同一 ID 多次出现在 `upsert` 中时，以最后一条记录为准；同时出现在 `remove` 和 `upsert` 中时，保留 `upsert` 的记录。按最终文档判断是否变化；实际记录或 schema 没有变化时，不增加文档修订号。无效或超限补丁不会修改已有文档。会话记录会被拒绝。

更新项目时，省略 `cover` 保留原封面，传入 `"cover": null` 清除封面。单独更新封面不改变文档修订号或编辑时间。

文档解析上传限于 10 MB。只有成功提取文本后才保存附件；解析失败或上传超限时不保留文件或附件记录。

通过协作链接打开时，项目读取、文档补丁及 WebSocket 请求携带 `?share={share_token}`。关闭协作后，该链接返回 `403 COLLABORATION_CLOSED`，已连接的协作页面停止同步；重新开启会生成新链接。本地实例没有用户身份隔离，能访问实例的人也能进入项目列表；此开关用于管理协作链接。

录屏创建参数为 `name`、已经上传的 `asset_id` 和以秒计的 `duration`。`transcript` 和 `analysis` 是本地保存的文本字段；前端以带版本的 JSON 表达时间段、章节和问答，同时兼容纯文本记录。

本服务没有 AI 推理、模型连接保存、用户、会员或积分接口。模型调用由浏览器向用户配置的服务发起。

封面接口返回不超过 640 × 360 的等比例 JPEG，并设置 `private, max-age=86400` 缓存。缺少本地解码工具时返回 `503 COVER_DECODER_UNAVAILABLE`，前端改用浏览器从原文件读取画面；无法提取视频画面时返回 `422 RECORDING_COVER_UNAVAILABLE`。封面读取不修改录屏或原文件。

音轨 `start` 与 `duration` 单位为秒；`start >= 0`，`0 < duration <= 300`。接口只处理本地附件，不接受任意文件路径或外部媒体 URL。未安装 FFmpeg/ffprobe 时返回 `503 AUDIO_DECODER_UNAVAILABLE`，前端据此回退浏览器解码。无效范围、格式或缺少音轨返回 `422`；解码排队超时返回 `503 MEDIA_BUSY`，处理超时返回 `504 MEDIA_TIMEOUT`。

转写 JSON 可包含 `complete`、`processedChunks`、`totalChunks`、`chunkSeconds` 和来源附件标识。分析结果可为报告，或 `kind: "analysis-checkpoint"` 的检查点；检查点带有已完成的报告片段及可读的上一份报告。它们都不包含模型设置。
