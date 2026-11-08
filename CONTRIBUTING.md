# 参与画语

先阅读 [快速开始](./docs/GETTING_STARTED.md) 与 [架构说明](./docs/ARCHITECTURE.md)。功能建议应说明要完成的实际任务；问题反馈应提供版本、浏览器、最短复现步骤和已脱敏的错误。

## 本地开发

按 [快速开始](./docs/GETTING_STARTED.md) 安装 Vite+ 与对应的 Node.js 版本。`vp run check` 统一执行前端格式、lint、类型检查及 Rust 检查；`vp run test` 执行发布工具、前端与 Rust 测试。

Node.js 辅助脚本使用 TypeScript，由项目要求的 Node.js 直接运行，类型检查使用 `vp run check:scripts`，并纳入 `vp run check`。修改脚本时使用可擦除的类型语法和显式 `.ts` 导入；需要 JSX 或浏览器模块的生成器继续由 Vite 构建后执行。

```sh
vp install --frozen-lockfile
vp run dev
```

前端为 `http://127.0.0.1:5173`，本地接口为 `http://127.0.0.1:5858`。文档和介绍页使用 `vp run dev:site`，独立监听 5863。开发录屏和模型调用时，优先使用独立数据目录与测试连接，不使用别人的项目或真实密钥作为测试样例。

## 提交要求

- 模型地址、密钥和选择只保存在浏览器；不加入环境变量、后端配置、项目、示例或导出文件。
- 面向用户的文案只解释操作和结果，避免内部规格、迁移术语与调试字段。
- Rust 按业务组织 Axum handler 与 extractor，使用 `Result` 处理可恢复错误。遵守 [代码样式](./apps/api-rust/CODE_STYLE.md)。
- 前端使用 Vite+ 内置的 Oxfmt 统一排版：每级 2 个空格、双引号、分号和 80 列目标行宽。运行 `vp run format` 自动格式化，运行 `vp run lint` 检查基础代码错误、未使用变量及 React Hooks 调用和依赖。每条变量声明只声明一个变量；复杂的 JSX 条件和事件处理应提取为含义明确的变量或函数。
- 前端目录、文件命名、组件边界和状态管理遵守 [AGENTS.md 的 React 前端约定](./AGENTS.md)。页面入口放在 `pages`，业务实现放在 `features`；共享工具不得通过大型 UI 文件导入。
- 为会影响行为的数据转换、保存、取消和恢复逻辑补充有意义的回归测试；低风险的排版调整无需机械地增加测试。
- 新增或修改界面文案时同时维护中英文；使用完整句子与命名插值，不把翻译后的文字作为状态标识。用户资料不进入界面翻译；相关使用文档同步更新两种语言。
- 翻译调用使用按业务命名的语义键，例如 `t("canvas.share.title")`。应用和官网的中英文文案分别保存在各自的 `locales/zh-CN.ts` 与 `locales/en.ts` 中；新增键需同时补齐两种语言，保留对应的插值参数。不要将中文原文、用户内容或接口返回的任意文字直接传给 `t()`。
- 保留第三方版权及许可。只提交你有权许可的代码、提示词、字体和素材；新增贡献默认按项目 MIT 许可提供。

提交前执行：

```sh
vp run check:security
vp run check:release
vp run check
vp run test
vp run build:web
vp run build:site
sh scripts/cargo.sh fmt --all -- --check
vp run lint:rust
```

说明修改解决的问题、用户可见的行为、实际验证和剩余限制。界面修改附真实截图。不要提交 `var/`、`output/`、`.env`、浏览器存储、录屏或构建缓存。
