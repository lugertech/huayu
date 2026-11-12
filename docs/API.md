# 本地 API

默认地址为 `http://127.0.0.1:5858`，开发页面通过 Vite 的同源 `/api` 代理访问。本机管理端具有工作区权限；远端请求需要有效协作链接，且仅限对应画布和附件。请求同时校验连接来源、Host 和 Origin。

成功响应直接返回 JSON 对象或数组。创建项目、模板和录屏返回 `201`；删除返回 `204`。错误使用稳定、具体的 `code`、用于显示的 `message` 和命名参数 `params`：

```json
{"code":"INVALID_NAME","message":"Names must contain 1–120 characters","params":{"min":1,"max":120}}
```

请求通过 `Accept-Language` 选择错误文案，支持 `zh-CN` 和 `en`，兼容 `zh-*`、`en-*` 区域标签及 `q` 权重；未提供或没有匹配语言时默认使用 `zh-CN`。错误响应包含 `Content-Language`、`Vary: Accept-Language` 和 `Cache-Control: no-store`。语言只在当前请求中使用，不写入项目、模板或数据库；用户输入、文件正文和成功响应不随界面语言改写。

客户端依据 `code` 和 `params` 翻译错误，不依赖 `message` 的字面内容。名称校验使用 `INVALID_NAME`，画布格式使用 `INVALID_DOCUMENT`，上传大小使用 `FILE_TOO_LARGE` 或 `DOCUMENT_UPLOAD_TOO_LARGE`，不再统一使用 `VALIDATION_FAILED`。既有协作权限码和音轨解码不可用码保持稳定。未知错误码可回退显示服务端的 `message`。错误码与后端文案集中在 [error.rs](../apps/api-rust/crates/huayu-server/src/error.rs)，前端映射见 [errors.ts](../apps/web/src/api/errors.ts)。

JSON、查询参数、multipart 和请求方法等入口拒绝也返回相同的 JSON 错误结构，并保留对应 HTTP 状态及 `Allow` 等响应头。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/health` | 本地服务状态 |
| GET | `/api/access` | 本机工作区权限检查，远端返回 `403 WORKSPACE_PRIVATE` |
| GET | `/api/projects?search=` | 项目列表，不返回画布文档 |
| POST | `/api/projects` | 创建项目：`name`、可选 `document` |
| GET/PATCH/DELETE | `/api/projects/{id}` | 读取、改名/封面、删除项目 |
| PATCH | `/api/projects/{id}/document` | 合并文档记录补丁 |
| GET (WebSocket) | `/api/projects/{id}/events` | 初始快照、补丁和项目删除事件 |
| POST | `/api/projects/{id}/collaboration` | 设置协作状态：`enabled` |
| DELETE | `/api/projects/{id}/collaborators/{member_id}` | 房主移出成员，返回 204 |
| POST | `/api/projects/{id}/template` | 保存为模板：`name`、`description`、`tags` |
| GET | `/api/library` | 项目附件汇总，不包含完整正文 |
| GET | `/api/projects/{id}/attachments/{shape_id}` | 当前资料详情，已移除的组件或项目返回 `404` |
| GET | `/api/templates` | 模板列表及标签 |
| POST | `/api/templates/{id}/fork` | 从模板创建独立项目 |
| DELETE | `/api/templates/{id}` | 删除自建模板 |
| POST | `/api/assets` | multipart `file`，返回本地附件 URL |
| GET | `/api/assets/{id}` | 读取附件，支持 Range |
| GET | `/api/library/assets` | 素材列表及总数；支持分组、搜索、排序、回收站和分批加载 |
| POST | `/api/library/assets` | 将已上传文件加入素材库：`asset_id`、`width`、`height`、`name`、`folder_id`、`trashed`；非图片的宽高为 `0`；返回 `204` |
| GET/PATCH | `/api/library/assets/{id}` | 读取素材 / 更新完整的 `name`、`folder_id`、`trashed`；更新返回 `204` |
| GET/POST | `/api/library/folders` | 读取文件夹与数量 / 创建：`name`、`parent_id`；创建返回文件夹对象 |
| PATCH/DELETE | `/api/library/folders/{id}` | 重命名：`name` / 删除文件夹并将内容移到上一级 |
| POST | `/api/documents/parse` | multipart `file`，返回本地附件与解析文本 |
| GET | `/api/unfurl?url=&includeHtml=true` | 读取外部网页元信息和可选 HTML |
| GET/POST | `/api/recordings` | 列表/创建录屏元数据。创建时可通过 `project_id` 关联画板 |
| GET/PATCH/DELETE | `/api/recordings/{id}` | 读取/更新名称、时长、转写、分析/删除录屏 |
| GET | `/api/recordings/{id}/media` | 读取本地音视频时长、尺寸与音轨信息 |
| GET | `/api/recordings/{id}/cover` | 本地提取真实视频封面，返回 JPEG；纯音频返回 `204` |
| GET | `/api/recordings/{id}/audio?start=0&duration=300` | 提取一段 16 kHz 单声道 WAV 音轨 |

素材列表返回 `{ "assets": [], "total": 0 }`。查询参数为 `search`、`folder_id`、`unfiled`、`trash`、`sort`（`newest` 或 `oldest`）、`offset` 和 `limit`（默认 50，上限 100）。不指定分组时返回全部素材；`unfiled=true` 仅返回未分组素材，并优先于 `folder_id`。`trash=true` 读取回收站。前端切换到回收站时不传分组过滤。文件夹以平铺数组返回，每项包含 `id`、`name`、`parent_id` 和当前文件夹内未移入回收站的文件数量 `asset_count`。

将素材的 `trashed` 更新为 `true` 会移入回收站，改回 `false` 会恢复。回收站素材不通过素材详情接口用于新插入；原附件接口仍可读取，保证已有画布中的图片可用。

素材库仅管理用户上传的文件，不关联项目，响应不再返回 `source_project`。重复加入同一个 `asset_id` 不创建新条目，也不修改已有条目的名称或文件夹；已在回收站的条目会恢复到请求指定的文件夹。删除项目不影响素材库文件。旧迁移中的来源字段保留以兼容现有数据库，但应用不再读写来源信息。

`/api/library` 接口汇总各项目「项目附件」中的文件、生成网页、图片和语音音频，包含所有画布页面。对应 `kind` 为 `document`、`website`、`image` 和 `audio`；普通文字、创作指令结果、图表、外部链接、空组件和未使用的素材记录不进入列表，详情接口也不返回这些内容。列表返回 `project_id`、`project_name`、`shape_id`、`name`、`kind`、`extension`、`size`、`updated_at`、`url` 和 `excerpt`（最多 240 个字符），不返回完整正文；详情接口另含 `content`。`updated_at` 为所属项目的更新时间。项目重命名、附件替换、组件删除和项目删除均以原项目为准，不维护独立副本。两个资料接口仅允许工作区所有者访问，协作链接不能读取。

文档补丁示例：

补丁可携带 `sequence`，表示 `client_id` 所属浏览器编辑会话内递增的修改序号。实时预览与持久化通知保留相同序号，用于避免较早的保存结果覆盖较新的预览；未涉及该预览的记录仍正常合并。该字段可省略，不写入项目文档。新编辑会话使用新的 `client_id`，同一编辑会话的 WebSocket 重连沿用原标识。

```json
{
  "upsert": [],
  "remove": [],
  "client_id": "当前编辑会话的随机标识"
}
```

`upsert` 必须包含完整记录，而非局部属性。新文档使用应用自有记录模型，兼容历史画布记录和 schema。`schema` 可省略以沿用现有 schema。同一 ID 多次出现在 `upsert` 中时，以最后一条记录为准；同时出现在 `remove` 和 `upsert` 中时，保留 `upsert` 的记录。按最终文档判断是否变化；实际记录或 schema 没有变化时，不增加文档修订号。无效或超限补丁不会修改已有文档。会话记录会被拒绝。

更新项目时，省略 `cover` 保留原封面，传入 `"cover": null` 清除封面。单独更新封面不改变文档修订号或编辑时间。

普通附件的文件内容上限为 512 MiB，上传请求额外预留 64 KiB 容纳 multipart 边界和字段头，不占用文件内容额度。文档解析上传限于 10 MiB。只有成功提取文本后才保存附件；解析失败或上传超限时不保留文件或附件记录。

通过协作链接打开时，项目读取、文档补丁及 WebSocket 请求携带 `?share={share_token}`。关闭协作后，该链接返回 `403 COLLABORATION_CLOSED`，已连接的协作页面停止同步；重新开启会生成新链接。分享令牌更新后，使用旧令牌的 WebSocket 连接同样停止同步。协作者不能访问项目列表、其他项目、模板管理、全局素材库、录屏或分享管理接口；超出范围返回 `403 SHARED_SCOPE_FORBIDDEN`。

浏览器的本地 API 请求使用 `X-Huayu-Canvas` 标明当前画布，协作请求还携带 `X-Huayu-Share`。项目读取成功后设置仅对 `/api/assets/` 生效的 HttpOnly、SameSite=Strict 会话 Cookie，供图片和音视频元素读取已授权附件。上传附件通过版本迁移新增的 `project_assets` 关联到当前画布；已有文档中的附件引用保持可用。附件及画布关联在同一事务中保存；目标画布不存在时返回 `404` 并丢弃上传。被拒绝的文档补丁不会新增附件访问权限。陌生附件引用返回 `403 SHARED_RESOURCE_FORBIDDEN`，协作 Cookie 不授予工作区或管理接口权限。模型连接和密钥不使用这些接口或 Cookie。

房间默认上限为 15 位在线协作者，不含房主。项目读取会设置 `huayu_member_{project_id}`（HttpOnly、SameSite=Strict、Path=/api/，有效期 30 天）用于识别同一浏览器；后续 HTTP 与 WebSocket 请求应保留 Cookie。相同成员的多个连接合并计数，WebSocket 接纳在房间锁内再次核对容量。满员时 HTTP 返回 `409 ROOM_FULL`；握手后的容量竞争通过 `room_full` 消息结束连接。

移出接口仅允许房主调用，按 `member_id` 移出该邀请下的成员；服务持久化移出状态、断开其全部连接，并广播 `member_removed`。后续协作请求返回 `403 COLLABORATOR_REMOVED`。浏览器应停止重连和保存，区分移出、满员和邀请关闭。成员身份独立于连接 ID，服务重启不会清除移出状态；匿名成员清除 Cookie 或更换浏览器仍可用有效链接申请新身份，需要完全撤销邀请时应关闭并重新开启协作。

WebSocket `/api/projects/{id}/events` 同时承载持久化通知和实时会话消息。连接后先收到 `snapshot`，再收到 `peers`（本连接的 `client_id`、所有在线连接与 `max_collaborators: 15`）。`peer_joined`、`presence`、`peer_left` 更新会话显示，连接标识由服务端生成，重连时重新分配。

- 成员字段：`id` 为连接 UUID，`member_id` 为浏览器成员标识，`role` 为 `host` 或 `collaborator`，`joined_at` 为加入时间（毫秒）。同一成员的多个连接在头像名单中合并，光标仍按连接同步。
- 服务端 `member_removed`：`{"type":"member_removed","member_id":"成员标识"}`。移出目标停止协作，其他成员从名单和光标中移除对应成员的全部连接。
- 服务端 `room_full`：`{"type":"room_full","max_collaborators":15}`，随后关闭连接。
- 客户端 `scene_update`：`{"type":"scene_update","patch":{"upsert":[],"remove":[],"client_id":"编辑会话标识"}}`。服务端转发为 `scene_update`，附带发送连接的 `client_id` 和为空的 `target`。消息只用于预览，不写数据库，不增加项目修订号。
- 客户端 `scene_init`：包含 `target`（新协作者的连接标识）与 `patch`，只补发本地尚未保存或等待保存确认的记录及删除通知；已保存内容由服务端初始 `snapshot` 提供，不经客户端重复发送。服务端以带 `target` 的 `scene_update` 仅转发给目标连接。
- 客户端 `presence`：`{"type":"presence","presence":{"pointer":{"x":0,"y":0,"tool":"pointer"},"button":"up","selectedElementIds":{}}}`。坐标使用画布坐标；`tool` 为 `pointer` 或 `laser`，`button` 为 `up` 或 `down`，`pointer: null` 隐藏光标。服务端转发为带 `peer` 的 `presence`。

单个文档补丁的序列化内容上限为 32 MiB；WebSocket 消息和帧另预留 1 KiB 容纳消息类型与目标连接等封装字段。

前端以约 33 毫秒的节流间隔广播变化；持久化仍通过 `PATCH /document` 独立完成。鼠标、选区和在线状态不写入恢复日志或导出文件；远端预览不会触发本地自动保存，接收到的画布变化以远端来源合并，不进入本人的撤销历史。原生元素预览使用 Excalidraw 的 `restoreElements`、`reconcileElements` 与 `CaptureUpdateAction.NEVER`，鼠标和选区通过 `updateScene({ collaborators })` 呈现。参考 [官方协作实现](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/collab/Collab.tsx)。

录屏创建参数为 `name`、已经上传的 `asset_id` 和以秒计的 `duration`。更新接口也接受非负的 `duration`，供媒体解码完成后补齐时长。`transcript` 和 `analysis` 是本地保存的文本字段；前端以带版本的 JSON 表达时间段、章节和问答，同时兼容纯文本记录。

本服务没有 AI 推理、模型连接保存、用户、会员或积分接口。模型调用由浏览器向用户配置的服务发起。

封面接口返回不超过 640 × 360 的等比例 JPEG，并设置 `private, max-age=86400` 缓存。缺少本地解码工具时返回 `503 COVER_DECODER_UNAVAILABLE`，前端改用浏览器从原文件读取画面；无法提取视频画面时返回 `422 RECORDING_COVER_UNAVAILABLE`。封面读取不修改录屏或原文件。

音轨 `start` 与 `duration` 单位为秒；`start >= 0`，`0 < duration <= 300`。接口只处理本地附件，不接受任意文件路径或外部媒体 URL。未安装 FFmpeg/ffprobe 时返回 `503 AUDIO_DECODER_UNAVAILABLE`，前端据此回退浏览器解码。无效范围、格式或缺少音轨返回 `422`；解码排队超时返回 `503 MEDIA_BUSY`，处理超时返回 `504 MEDIA_TIMEOUT`。

转写 JSON 可包含 `complete`、`processedChunks`、`totalChunks`、`chunkSeconds` 和来源附件标识。分析结果可为报告，或 `kind: "analysis-checkpoint"` 的检查点；检查点带有已完成的报告片段及可读的上一份报告。它们都不包含模型设置。
