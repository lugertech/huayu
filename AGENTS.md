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

## 代码审查

- 执行代码审查或提交前自查时，先阅读 [REVIEW.md](./REVIEW.md)，并遵守修改目录的局部约定。
- 交付时说明实际执行的检查、结果和未覆盖的风险；PR 使用仓库模板记录验证证据、风险和回滚方式。
