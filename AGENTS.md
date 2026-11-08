# 项目约定

- 请不要在面向用户的 UI 中加入内部规格的说明。
- 模型连接地址、API 密钥和模型选择仅保存于浏览器，不写入服务端、项目、模板或导出文件。
- 仓库文件不得硬编码本机绝对路径。本仓库文件引用使用相对路径；外部源码使用公开链接，或注明基准目录的相对路径。
- Node.js 辅助脚本使用 TypeScript，通过 Node.js 直接运行；使用可擦除的类型语法和显式的 `.ts` 导入扩展名。
- Rust 使用 Axum handler 和 extractor，按业务能力组织模块；错误使用 Result，不用 panic 处理可恢复失败。
- 代码样式见 apps/api-rust/CODE_STYLE.md。
- 运行数据保存在被忽略的 var/dev/ 下，测试使用独立临时目录。

## General Principles
- Keep things in one function unless composable or reusable
- Validate unknown values once at the boundary that owns them. Pass typed values inward instead of repeating and property-existence checks. Do not defensively revalidate values already guaranteed by a schema, constructor, or internal type.typeof value === "object"
- Do not extract single-use helpers preemptively. Inline the logic at the call site unless the helper is reused, hides a genuinely complex boundary, or has a clear independent name that improves the caller.
- Before adding complexity for a speculative or vanishingly unlikely race or security edge case, explain the concrete failure mode, likelihood, and complexity cost to the user and get their buy-in. Do not silently expand scope for theoretical robustness.
- Avoid / where possibletrycatch

## UI Design Principles
Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining

## React 前端约定

适用于 `apps/web` 和 `apps/site`。组件职责、状态与 Effect 遵循 React 官方原则；下面的目录和文件命名是本仓库约定，不代表 React 强制要求这些目录名。

### 目录与依赖

- `src/pages/` 放有独立 URL 的页面入口、同名测试和页面样式。页面可以持有路由参数、页面级请求和交互状态；页面专用的复杂内容、菜单与业务处理放入对应功能目录，避免在 `pages` 根目录平铺内部组件。
- `src/features/<feature>/` 按业务组织组件、Hook、状态、纯计算、接口适配和测试。画布、录制、素材库等功能各自内聚；功能内部的组件可以与逻辑放在同一目录，较多时使用 `components/` 子目录。
- `src/components/` 放应用外壳、跨功能共享组件；`src/components/ui/` 保留 shadcn / Base UI 上游源码、文件名和组织方式，不纳入通用死代码删减或批量风格改写。
- `src/lib/` 放跨业务的基础能力，`src/api/` 放公共 API 客户端，`src/i18n/` 或 `src/locales/` 放语言能力与词典。不要将业务专用逻辑堆入通用工具目录。
- 页面组装功能模块；功能模块不得反向导入 `pages`。通过直接模块导入表达依赖，不为目录整理新增转发文件或无实际用途的 `index` 聚合导出。
- 组件、Hook 与纯工具按依赖职责分离。共享格式化函数、类型或任务状态不得通过导入大型界面组件文件取得，避免把录制、画布或编辑器 UI 带入无关调用方。
- 仅在复用、职责边界或复杂度确有收益时拆分；不要按文件行数机械拆组件，也不要提前建立未被使用的分层。

### 文件与导出命名

- 目录使用小写 kebab-case，例如 `asset-library`、`chart-shape`；业务组件文件使用 PascalCase，例如 `RecordingCover.tsx`。页面入口使用 `*Page.tsx`，布局和 Provider 使用职责明确的 `*Layout.tsx`、`*Provider.tsx`。
- 普通逻辑模块使用 kebab-case，例如 `capture-state.ts`、`agent-sse.ts`；以 Hook 为主要导出的独立模块使用 `use-*.ts`，导出函数仍使用 `useXxx`。
- 含 JSX 的文件使用 `.tsx`，不含 JSX 的普通逻辑使用 `.ts`。基础上下文或渲染适配模块可以按领域命名；不要仅凭扩展名将所有文件改成大写。
- 测试与被测模块相邻，保留被测模块文件名并追加 `.test.ts` 或 `.test.tsx`。语言词典使用 BCP 47 标签，例如 `zh-CN.ts`；入口、配置和第三方上游文件保留工具约定的名字。
- 业务组件优先命名导出，文件名与主要组件或组件族一致。已有 `React.lazy` 所需的默认导出可以保留，不为统一写法增加一层包装组件。

### 组件、状态与副作用

- 渲染保持纯粹，不修改 props、已有 state 或外部对象；事件触发的业务操作放在事件处理函数中。组件和 Hook 在模块顶层定义，遵守 Hooks 调用与依赖规则。
- 状态由实际拥有它的组件或业务模块维护；可从 props、已有状态计算的值在渲染时计算，不用 Effect 同步派生状态。需要共同修改的状态提升到最近的共同拥有者。
- Effect 用于同步网络连接、浏览器事件、媒体资源、第三方编辑器等外部系统，并对称清理订阅与资源。异步完成后核对取消信号及任务身份，避免旧任务覆盖新状态。
- 自定义 Hook 提取可复用或有独立职责的 React 逻辑，纯数据转换保持普通函数。不要为了优化而无证据地增加 `memo`、`useMemo` 或 `useCallback`。
- 保持既有路由、懒加载边界、Provider 生命周期、浏览器存储键和文档格式；目录整理不得顺带改变业务规则或用户数据。
- 迁移必须同步静态导入、动态导入、测试 mock、构建约束、辅助脚本和当前仓库文档链接。每批运行检查、测试及受影响应用构建；失败时恢复该批，保留之前已经验证的改动。

参考：[Thinking in React](https://react.dev/learn/thinking-in-react)、[组件导入与导出](https://react.dev/learn/importing-and-exporting-components)、[不一定需要 Effect](https://react.dev/learn/you-might-not-need-an-effect)、[Hooks 规则](https://react.dev/reference/rules/rules-of-hooks)。

## 多语言系统

当前应用文案支持 `zh-CN` 和 `en`，使用项目内词典与类型化错误，不依赖 UniFFI 或 Fluent。

### 语言来源与前端入口

- Web 语言入口是 [apps/web/src/i18n/index.ts](./apps/web/src/i18n/index.ts)，纯语言解析、插值和单复数选择在 [locale.ts](./apps/web/src/i18n/locale.ts)。浏览器偏好使用 `huayu:language`，取值为 `zh-CN`、`en` 或跟随浏览器的 `system`；选择 `system` 时移除存储项。显式选择优先，否则按浏览器语言列表匹配中英文，无匹配时回退英文。
- 主词典为 [zh-CN.ts](./apps/web/src/i18n/locales/zh-CN.ts) 和 [en.ts](./apps/web/src/i18n/locales/en.ts)。新增文案使用语义化 `MessageKey`，同时补齐中英文及相同的命名插值参数；单复数文案使用 `one` / `other` 和 `count`。词条缺失时回退中文，未知键返回空串；这些回退不能代替完整翻译。
- React 组件使用 `useTranslations()` 获取当前作用域的 `{ locale, t }`。它优先读取 `LocaleContext`，否则订阅应用语言；仅需全局语言时使用 `useLocale()`。订阅同时响应语言选择、浏览器语言变化和其他标签页的存储变化，不通过重新挂载编辑器切换语言。
- 非 React 逻辑用 `getLocale()` 读取应用语言；需要局部语言的逻辑显式接收 `locale`，并通过 `getTranslator(locale)` 绑定翻译函数，避免反复传递空占位参数。未绑定语言的 `getTranslator()` 会在每次调用时读取应用语言。不要在模块初始化时保存翻译结果。
- 画布的 Excalidraw 语言由 [board-language.ts](./apps/web/src/features/canvas/excalidraw/board-language.ts) 管理，偏好键为 `huayu:board-language`。跟随模式使用应用语言偏好或浏览器语言；画布原生工具支持其自身语言列表，应用内卡片界面将中文映射为 `zh-CN`，其他语言映射为 `en`。附件、导出、错误提示及默认标签应使用画布作用域的语言，不能直接取全局语言替代；`Editor.locale` 只用于内存中的运行与导出上下文。
- 素材库现有局部词典在 [features/asset-library/messages.ts](./apps/web/src/features/asset-library/messages.ts)，通过 `useAssetTranslations()` 的 `at()` 使用，键由 `AssetMessageKey` 约束。其历史中文键属于词典标识，仍需保持中英文键和插值参数一致。
- 官网使用 [apps/site/src/i18n.ts](./apps/site/src/i18n.ts) 和自身的 [中文词典](./apps/site/src/locales/zh-CN.ts)、[英文词典](./apps/site/src/locales/en.ts)。默认路径为中文，`/en/` 路径为英文；组件使用 `useSiteI18n()`，站内链接使用语言路径工具。官网复用纯语言工具，不依赖 Web 应用的浏览器状态入口。

### 文案、状态与错误的显示时机

- 日期和数字按当前有效 `locale` 格式化。全局场景可以用 `formatDate()` / `formatNumber()`；局部语言场景向 `Intl` 或 `toLocale*` 显式传入 `locale`。
- 状态保存业务标识、翻译键和参数，显示时再翻译。模型连接测试结果、表单错误、上传状态和系统目录标签都遵循此规则；不要把 `t(...)` 或 `at(...)` 的结果长期放入 state，再期望语言切换自动更新它们。异步操作完成后也应使用有效的显示语言。
- 系统异常使用 [i18n/errors.ts](./apps/web/src/i18n/errors.ts) 中的 `LocalizedError` 与 `ErrorTranslation`。例如 `throw new LocalizedError({ key: "api.fileExceedsTheSizeLimit" })`；不要使用 `new Error(t(...))`。能力名称等需要翻译的参数也保留嵌套翻译引用，不提前转成某种语言的字符串。
- 内存中的错误状态保留错误对象或翻译引用，在渲染处调用 `errorText(error, locale)` 或 `translatedErrorMessage(reference, locale)`。不要先读取 `error.message` 再存入状态；局部语言界面须传入该作用域的 `locale`。错误边界的提示界面也应订阅语言变化。
- 检查点等持久化状态保存可序列化的 `ErrorTranslation`，在读取边界通过 `readErrorTranslation()` 校验，不直接序列化 `Error` 对象。旧检查点的已知原文兼容由现有读取逻辑处理；新的 API 错误不能再依赖中文原文匹配。未知第三方详情保留原文，不将其当作翻译键。

### Rust API 错误协议

错误链路为：业务错误码与参数 → Rust 按请求语言生成响应 → 前端按错误码映射翻译引用 → 界面按当前作用域语言显示。

- 业务 handler 使用 [error.rs](./apps/api-rust/crates/huayu-server/src/error.rs) 中的 `ErrorCode` 和 `ApiError`，不在 handler 中拼写用户可见错误文案。HTTP 状态、中英文文案及命名参数在错误目录集中维护；限制值从实际业务常量取得。
- 本地 API 客户端 [api/client.ts](./apps/web/src/api/client.ts) 默认发送当前应用语言的 `Accept-Language`，允许调用方显式覆盖。直接读取本地 API 资源的请求也应带上合适的语言；不要向模型服务转发本地 API 的画布或协作访问头。
- [Rust i18n.rs](./apps/api-rust/crates/huayu-server/src/i18n.rs) 在统一响应边界处理业务错误、提前返回的权限错误和框架入口拒绝，保留原 HTTP 状态及 `Allow` 等响应头。错误正文统一为 `code`、`message`、`params`；`code` 和 `params` 不因语言改变。

```json
{"code":"INVALID_NAME","message":"Names must contain 1–120 characters","params":{"min":1,"max":120}}
```

- 后端按每个请求的 `Accept-Language` 选择中英文，兼容区域标签和 `q` 权重；未提供或没有支持的语言时默认中文。这与 Web 浏览器语言无匹配时回退英文是两个独立规则。错误响应带有 `Content-Language`、`Vary: Accept-Language` 和 `Cache-Control: no-store`；`HEAD` 错误不返回正文。
- 前端在 [api/errors.ts](./apps/web/src/api/errors.ts) 一次校验错误响应，并将 `code` 和 `params` 转成翻译引用。已知错误不匹配 `message` 的字面内容；未知错误码可回退显示服务端消息。新增或修改后端错误码时，同步前端映射、双语词条、契约测试和 [API 文档](./docs/API.md)。内部诊断留在日志，不作为用户错误正文返回。

### 内容边界与验证

- 语言偏好保存在浏览器，API 的协商语言只属于当前请求，不写入服务端配置、项目、模板或数据库。切换语言不改写用户名称、正文、代码、引用、已有作品或编辑中的用户输入。
- 内置模板元数据、新建示例和新发起的生成操作按当前语言选择文案；已有内容保留原文。[modelPrompts()](./apps/web/src/ai/prompts/index.ts) 选择提示词并附加默认输出语言要求，同时遵循用户明确的语言要求；JSON 字段、动作格式等机器标识不翻译。模型连接和密钥仍只由浏览器管理。
- 多语言回归测试见 [locale.test.ts](./apps/web/src/i18n/locale.test.ts)、[errors.test.ts](./apps/web/src/i18n/errors.test.ts)、[API 错误契约测试](./apps/web/src/api/errors.test.ts) 和 [Rust 错误语言测试](./apps/api-rust/crates/huayu-server/tests/error_localization.rs)。保持词典覆盖、插值参数、错误码映射及禁止提前翻译系统异常的检查通过。
- 修改显示行为时验证中英文、局部画布语言、错误出现后再切换语言、异步完成和检查点恢复，并确认用户内容保持不变。按 `REVIEW.md` 运行检查、相关测试及受影响应用构建；API 改动同时验证实际请求头、响应头和错误正文。

## 代码审查

- 执行代码审查或提交前自查时，先阅读 [REVIEW.md](./REVIEW.md)，并遵守修改目录的局部约定。
- 交付时说明实际执行的检查、结果和未覆盖的风险；PR 使用仓库模板记录验证证据、风险和回滚方式。
