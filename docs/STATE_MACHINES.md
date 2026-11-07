# 状态生命周期清单

本清单记录本轮排查的 56 组状态及处理结果，覆盖主应用、官网、Rust 服务端和开发进程。范围包含相互约束的标志、异步请求、资源所有权及持久化检查点。

“已调整”表示本轮修改了状态表达或转换边界；“保留”表示已有枚举、派生值、单一开关或资源所有权能表达当前行为，核对后保留。保留项不代表完成了所有运行时场景的穷举验证。

状态按各自的业务边界维护，不引入统一状态机框架。新增的执行阶段在内存中维护，不改变项目、模板或导出的格式。模型连接地址、API 密钥和模型选择继续仅保存在浏览器。

## 画布与协作

| 编号 | 流程与源码 | 处理 | 状态与约束 |
| --- | --- | --- | --- |
| 1 | [画布加载与恢复](../apps/web/src/pages/DrawingPage.tsx) | 已调整 | `loading → ready / error`；状态绑定项目和分享令牌，旧页面的失败不显示到新页面。草稿与模板初始化仍在 ready 之前完成。 |
| 2 | [自动保存](../apps/web/src/canvas/sync.ts) | 已调整 | 明确 `clean / waiting / sending / sending-dirty / retrying / blocked`。在途补丁与后续编辑分开持有；撤销访问后保留未确认编辑，迟到确认不能清除终止状态。 |
| 3 | [版本与远端合并](../apps/web/src/canvas/sync.ts) | 保留 | `pending / inFlight / deferredRemote` 的集合及 revision 决定合并顺序；这些集合表达并存的工作，不能合并为一个互斥阶段。 |
| 4 | [客户端连接](../apps/web/src/canvas/sync.ts)、[服务端房间](../apps/api-rust/crates/huayu-server/src/projects.rs) | 已调整 | 客户端连接阶段为 `disconnected / connecting / connected / reconnecting`，`connected` 从阶段派生。服务端心跳、落后事件后的快照恢复保留现有处理。 |
| 5 | [协作链接](../apps/api-rust/crates/huayu-server/src/projects.rs) | 保留 | 链接开放、关闭、轮换由分享令牌及持久化配置表示；已有集成测试覆盖轮换后的旧连接失效，不修改协议。 |
| 6 | [访问生命周期](../apps/web/src/canvas/sync.ts)、[服务端访问校验](../apps/api-rust/crates/huayu-server/src/access.rs) | 已调整 | 客户端使用 `stopped / active / deleted / revoked`，撤销原因由 revoked 持有；deleted、revoked 不能被 connect 重新激活。服务端访问类型保留。 |
| 7 | [在线成员与即时广播](../apps/web/src/canvas/sync.ts) | 保留 | 成员集合、待广播 presence 和场景补丁是独立维度；现有定时器负责合并发送，断开时清理资源。 |
| 8 | [浏览器恢复库](../apps/web/src/canvas/drafts.ts) | 已调整 | `closed / opening / open` 分别持有打开 Promise 或连接。打开失败后回到 closed，后续操作可重试；连接关闭后不复用失效句柄。 |
| 9 | [事务与撤销](../apps/web/src/canvas/engine/store.ts) | 已调整 | 撤销组为 `none / open / recorded`，回放为 `idle / undo / redo`；事务嵌套深度及 finally 收尾保留。 |
| 10 | [Excalidraw 双向桥接](../apps/web/src/canvas/excalidraw/ExcalidrawSurface.tsx) | 已调整 | `initializing / ready / applying-store / applying-native` 替代初始化和写入标志的组合；原有异步代次检查继续阻止旧场景覆盖。 |
| 11 | [画布缩略图](../apps/web/src/pages/DrawingCanvas.tsx) | 已调整 | 任务经历等待、保存画布、渲染、上传、完成或失败；任务身份决定回调是否仍有效，卸载或新任务使旧任务失效。 |

## 工作流与结果

| 编号 | 流程与源码 | 处理 | 状态与约束 |
| --- | --- | --- | --- |
| 12 | [整图执行](../apps/web/src/workflow/execute.ts) | 已调整 | 运行持有 `running / cancelling` 和 AbortController；取消先发布阶段再中止请求，finally 按运行身份释放节点。 |
| 13 | [节点执行与占用](../apps/web/src/workflow/execute.ts) | 已调整 | 保留节点的 queued、running、success、error、cancelled 状态；增加统一 `nodeIsBusy` / `useNodeBusy`，成功节点在整个计划结束前仍受占用保护。 |
| 14 | [结果新鲜度](../apps/web/src/workflow/freshness.ts)、[编辑守卫](../apps/web/src/workflow/results.ts) | 已调整 | 新鲜度继续由输入指纹派生；结果编辑、素材附加和上传提交统一使用运行占用与锁定约束。 |
| 15 | [模型连接测试](../apps/web/src/Components/ModelSettings.tsx) | 已调整 | `idle / testing / complete`；仅完成状态携带结果。修改配置会取消旧测试，结果只由当前请求提交。 |
| 16 | [模型请求与流](../apps/web/src/ai/provider.ts) | 保留 | 请求以 AbortSignal 和异步迭代的终止、异常表示生命周期，SDK 重试配置与取消边界已有测试；不额外复制 SDK 状态。 |
| 17 | [Agent 流解析与画布写入](../apps/web/src/utils/agentSSE.ts) | 已调整 | JSON 扫描采用 `object / string / escape`，避免 quoted 与 escaped 组合；画布事务及执行身份边界沿用既有实现。 |
| 18 | [结果草稿](../apps/web/src/Components/results/ResultWorkbench.tsx) | 已调整 | `clean / dirty / conflict` 从 base、content、live 推导；外部更新和本地未提交编辑的冲突保持可见。 |
| 19 | [图片编辑](../apps/web/src/Components/results/ImageViewer.tsx) | 已调整 | `viewing / decoding / editing / saving` 替代 editing 与 busy 组合；手势类型明确为 crop 或 pan。版本生成规则保留。 |
| 20 | [网页抓取与预览](../apps/web/src/Components/shapes/InteractiveWebShape/InteractiveWebComponent.tsx) | 已调整 | 每次抓取拥有独立控制器；替换、卸载时取消，迟到结果不能提交。重载时持久化的 loading 若没有实际请求，会重新启动加载。 |

## 录制与分析

| 编号 | 流程与源码 | 处理 | 状态与约束 |
| --- | --- | --- | --- |
| 21 | [录制捕获](../apps/web/src/recording/capture-state.ts)、[录制界面](../apps/web/src/recording/Recorder.tsx) | 已调整 | 显式转换覆盖 idle、starting、recording、paused、stopping；同步状态引用阻止重复启动。Native MediaRecorder 仍负责实际媒体资源。 |
| 22 | [录制确认、保存与重试](../apps/web/src/recording/capture-state.ts) | 已调整 | pending 持有 Blob、已上传资产及错误；saving 区分 uploading / creating。创建录制记录失败可复用已上传资产，保存或放弃才释放捕获数据。 |
| 23 | [分析任务](../apps/web/src/recording/analysis-task.ts)、[执行与恢复](../apps/web/src/recording/analysis.ts) | 已调整 | preparing、transcribing、analyzing、summarizing、saving、cancelling 及三种结束结果决定 busy；运行阶段与持久化进度文案分开。 |
| 24 | [逐段转写检查点](../apps/web/src/recording/report.ts) | 保留 | 已完成分段、总段数及 complete 已能表示可恢复位置；保留现有序列化格式和逐段保存顺序。 |
| 25 | [分析分批与最终报告](../apps/web/src/recording/analysis.ts) | 已调整 | 运行阶段显式化，持久化的 parts、checkpoint、最终报告格式保留；取消恢复继续使用已经完成的部分。 |
| 26 | [播放、定位和跟随](../apps/web/src/pages/RecordingAnalysisPage.tsx)、[播放位置计算](../apps/web/src/recording/playback.ts) | 保留 | 原生媒体元素是播放状态来源；时间、倍速和跟随为独立维度。分段定位与偏好恢复沿用既有测试覆盖。 |
| 27 | [转写编辑与录制元数据](../apps/web/src/pages/RecordingAnalysisPage.tsx)、[录制 API](../apps/api-rust/crates/huayu-server/src/recordings.rs) | 已调整 | `closed / editing / saving` 让草稿只由编辑会话持有；保存期间禁用取消。后端补齐 duration 更新契约，拒绝非法时长且保留其他字段。 |
| 28 | [封面资源](../apps/web/src/recording/RecordingCover.tsx)、[浏览器封面回退](../apps/web/src/recording/cover.ts) | 已调整 | 图片状态才持有 URL；资源变化先回到 loading。回退提取采用 loading、seeking、capturing、settled，完成后清理事件及定时器。 |
| 29 | [媒体队列与解码](../apps/api-rust/crates/huayu-server/src/media.rs)、[浏览器音频提取](../apps/web/src/recording/audio.ts) | 保留 | Semaphore 许可、子进程及超时负责服务器资源生命周期；浏览器 AudioContext 在 finally 关闭。保留原有所有权表达。 |

## 素材与上传

| 编号 | 流程与源码 | 处理 | 状态与约束 |
| --- | --- | --- | --- |
| 30 | [素材查询与分页](../apps/web/src/features/asset-library/AssetBrowser.tsx) | 已调整 | `loading / appending / ready / error`；只接收当前未中止请求的结果，文件夹请求也校验当前身份。 |
| 31 | [上传队列](../apps/web/src/features/asset-library/AssetBrowser.tsx) | 已调整 | `staging / uploading / confirm-close` 互斥，同步引用防止重复提交；每个上传项继续保留独立结果。 |
| 32 | [素材操作对话框](../apps/web/src/features/asset-library/AssetBrowser.tsx) | 已调整 | 请求阶段为 editing、submitting 或携带 message 的 error；finally 不再清除刚产生的错误。 |
| 33 | [素材拖拽移动](../apps/web/src/features/asset-library/AssetBrowser.tsx) | 已调整 | `idle / dragging / returning / submitting`，活动阶段持有资产 ID；dragend 不再抹除进行中的移动请求。 |
| 34 | [目录与回收站](../apps/api-rust/crates/huayu-store/src/library.rs) | 保留 | folder 与 trashed 是可并存的数据维度；持久化事务处理移动、删除、恢复，不引入重复状态列或迁移。 |
| 35 | [上传暂存文件](../apps/api-rust/crates/huayu-server/src/files.rs) | 保留 | PendingAsset 的提交与丢弃消费资源所有权；读取、写入失败路径已有清理逻辑与集成测试。 |
| 36 | [节点附件提交](../apps/web/src/workflow/uploads.ts) | 已调整 | 文件处理成功后，提交前重新确认目标存在、属于当前页面、未锁定且未被执行占用；失败不替换旧附件。 |
| 37 | [图片加载、上传与去重](../apps/web/src/canvas/excalidraw/ExcalidrawSurface.tsx) | 保留 | loadingFiles、uploaded 等 Promise 集合分别持有进行中的资源任务；已有加载去重及失败处理，不额外增加并行标志。 |
| 38 | [项目素材预览](../apps/web/src/features/library/LibraryPreview.tsx) | 已调整 | `loading / ready / error`，ready 持有详情，error 持有错误；中止请求不能覆盖当前预览。 |

## 编辑手势

| 编号 | 流程与源码 | 处理 | 状态与约束 |
| --- | --- | --- | --- |
| 39 | [工具与编辑目标](../apps/web/src/canvas/engine/editor.ts) | 已调整 | tool 与 editing 互斥，编辑态持有形状 ID；切换工具退出编辑。选择集合保持独立。 |
| 40 | [拖入组件](../apps/web/src/canvas/component-creation.ts) | 已调整 | `pressed / dragging / finished / cancelled`，dragging 持有预览编辑器与形状 ID，结束后不再创建组件。 |
| 41 | [连接与组件选择](../apps/web/src/canvas/excalidraw/BoardConnections.tsx) | 已调整 | idle、dragging、choosing 互斥，当前状态携带拖线数据或选择器数据。 |
| 42 | [流程图编辑和平移](../apps/web/src/Components/shapes/ChartShape/FlowchartRenderer.tsx) | 已调整 | 编辑目标与草稿作为同一值创建、更新、清除；平移由可空起点表达。 |
| 43 | [思维导图编辑和平移](../apps/web/src/Components/shapes/ChartShape/MindmapRenderer.tsx) | 已调整 | 编辑目标持有输入草稿，平移由可空起点表达；独立节点移动交互保持既有数据结构。 |
| 44 | [检查器与焦点](../apps/web/src/canvas/excalidraw/NodeInspector.tsx) | 保留 | 可空目标 ID 已表达打开和关闭；模型设置交接使用 Shell 的互斥覆盖层。 |
| 45 | [原生工具、样式和缩放](../apps/web/src/canvas/excalidraw/ToolbarTools.tsx)、[样式面板](../apps/web/src/canvas/excalidraw/StylesPanel.tsx)、[缩放菜单](../apps/web/src/canvas/excalidraw/ZoomMenu.tsx) | 保留 | 工具选择、弹层开关、DOM 焦点是独立维度，由原生编辑器状态及菜单组件负责。 |

## 应用外壳、列表与官网

| 编号 | 流程与源码 | 处理 | 状态与约束 |
| --- | --- | --- | --- |
| 46 | [项目列表](../apps/web/src/pages/ProjectsPage.tsx)、[录制列表](../apps/web/src/pages/RecordingsPage.tsx)、[素材列表](../apps/web/src/pages/LibraryPage.tsx) | 保留 | 首次加载、保留旧数据的刷新以及部分请求失败可以并存；不把数据与请求强行变成单个互斥状态。 |
| 47 | [项目创建、导入、导出](../apps/web/src/canvas/transfer.ts)、[模板操作](../apps/web/src/pages/DrawingCanvas.tsx) | 保留 | 顺序 await、单次提交锁和异常收尾已表达流程；导出前 flush 继续受同步终止状态约束。 |
| 48 | [项目操作](../apps/web/src/pages/ProjectCardMenu.tsx)、[录制操作](../apps/web/src/pages/RecordingCardMenu.tsx)、[成员管理](../apps/web/src/Components/canvas/Collaborators.tsx) | 保留 | 已有对话框种类、单次请求锁和目标 ID；素材 CRUD 的组合状态单独在第 32 项调整。 |
| 49 | [搜索与设置交接](../apps/web/src/Components/Shell.tsx) | 已调整 | `none / search / settings` 互斥；旧弹层的关闭回调只能关闭自身，不能关闭已打开的新弹层。 |
| 50 | [工作区访问加载](../apps/web/src/Components/WorkspaceAccess.tsx) | 已调整 | checking、owner、denied、error；错误状态才持有错误，中止后的响应不提交。 |
| 51 | [延迟加载](../apps/web/src/ui/loading-region.tsx)、[错误边界](../apps/web/src/Components/common/ErrorBoundary.tsx) | 保留 | 显示延迟由清理过的定时器管理；React 错误边界已有正常与失败分支。 |
| 52 | [主题](../apps/web/src/lib/theme.tsx)、[语言](../apps/web/src/i18n/index.ts)、[设置](../apps/web/src/Components/SettingsDialog.tsx) | 保留 | 用户偏好与解析后的有效值是不同维度，保留现有枚举和派生逻辑。 |
| 53 | [侧栏动画](../apps/web/src/Components/SidebarProjectHighlight.tsx) | 保留 | 动画句柄、当前目标和卸载清理承担生命周期；展开与移动端可见性仍为独立开关。 |
| 54 | [官网导航](../apps/site/src/SiteChrome.tsx)、[示例预览](../apps/site/src/CanvasPreview.tsx) | 保留 | 菜单和示例由现有选择值或单一开关表示，保留焦点、事件与卸载清理。 |
| 55 | [官网复制反馈](../apps/site/src/Docs.tsx) | 已调整 | `idle / copying / copied / failed`；复制期间禁止重复操作，结果文案从当前语言派生。其他示例选择和滚动显现保留。 |
| 56 | [数据库迁移](../apps/api-rust/crates/huayu-store/src/lib.rs)、[开发进程](../scripts/dev.ts) | 保留 | 迁移版本与数据库事务、子进程句柄与单向停止标志已表达生命周期；本轮不新增迁移。 |

## 回归验证重点

- [同步测试](../apps/web/src/canvas/sync.test.ts)：发送期间新增编辑；权限撤销后的迟到保存响应；禁止重新连接。
- [本地恢复测试](../apps/web/src/canvas/drafts.test.ts)：首次打开失败后可以重新打开，不缓存失败 Promise。
- [工作流测试](../apps/web/src/workflow/execute.test.ts)：已成功的上游节点在整个计划结束前仍不可编辑；既有测试继续覆盖取消、分支失败和锁定结果。
- [录制状态测试](../apps/web/src/recording/capture-state.test.ts)：数据所有权、保存重试、终态后的无效事件。
- [分析测试](../apps/web/src/recording/analysis.test.ts)：取消任务并使用已有分析部分恢复。
- [附件测试](../apps/web/src/workflow/uploads.test.ts)：上传处理结束后目标已锁定或删除，不覆盖原附件。
- [本地 API 测试](../apps/api-rust/crates/huayu-server/tests/local_api.rs)：duration 更新保留转写及分析结果；负值返回 422，持久化值不变。

浏览器回归使用独立临时数据库与合成文件，实际覆盖文本节点执行、结果编辑与重载恢复、搜索到模型设置的交接及必填校验、文件夹创建、上传关闭确认与继续、上传后移动素材。未保存模型配置，未调用真实模型服务。

本轮未实测操作系统录屏与麦克风授权、真实模型服务的长连接中断，也未穷举所有多客户端消息交错；相应自动测试和源码复查不替代这些环境验证。
