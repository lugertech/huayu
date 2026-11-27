# 第三方代码、素材和许可

本仓库的 MIT 许可仅覆盖有权按 MIT 提供的应用代码，不重新许可任何第三方依赖或素材。

## Excalidraw

白板使用 [`@excalidraw/excalidraw` 0.18.1](https://github.com/excalidraw/excalidraw/tree/v0.18.1)，采用 MIT 许可，允许免费商用，无许可证密钥要求。完整原版权与许可保存在 [excalidraw-MIT.txt](./licenses/excalidraw-MIT.txt)。本项目使用开源编辑器库，不接入 Excalidraw 的云端房间、账号、分析统计或付费服务。

[本地补丁](./patches/@excalidraw__excalidraw@0.18.1.patch) 将拖框选择设为重叠选中，并将编辑器的交互状态重置事件由 `unload` 改为 `pagehide`，保留原回调及卸载清理逻辑。开发与生产构建均应用该补丁。升级依赖时需重新验证部分重叠的框选，以及离开并返回页面后的编辑行为。

随包字体保持原文件，全部从本机提供。各字体原版权与许可见 [excalidraw-fonts-NOTICE.md](./licenses/excalidraw-fonts-NOTICE.md) 及同目录 OFL 正文；Comic Shanns 使用 MIT，其余随包字体使用 SIL Open Font License。Helvetica 与 Segoe UI Emoji 仅使用系统字体，不分发对应商业字体文件。

## 图表与笔迹

早期版本分发过 React Flow 的样式，原版权与 MIT 许可见 [xyflow-MIT.txt](./licenses/xyflow-MIT.txt)。流程图使用与 React Flow 兼容的节点和边数据，由应用的 SVG 组件渲染。

平滑及压感笔迹轮廓使用 `perfect-freehand` 1.2.3（MIT），完整原版权与许可见 [perfect-freehand-MIT.txt](./licenses/perfect-freehand-MIT.txt)。界面组件延续 shadcn/Base UI 样式。

`tldraw`、`@tldraw/assets` 及其专用依赖已从项目依赖和构建产物移除。兼容历史文件的记录字段与 schema 标识属于输入数据，不加载或执行原 SDK。

## UI 和字体

- `src/ui` 中的组件基于 [shadcn/ui](https://github.com/shadcn-ui/ui) 官方 Base Nova 注册表源码，使用 Base UI 原语和 Lucide 图标；应用接入时替换了注册表图标占位符与导入别名。
- Base UI、React、Lucide 及其他依赖保留各自软件包的许可。完整版本由 `pnpm-lock.yaml` 和 `Cargo.lock` 固定。
- `public/fonts/NotoSansSC.ttf` 来自 [Google Fonts Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc)，使用 SIL Open Font License。完整许可保存在 [OFL.txt](./apps/web/public/fonts/OFL.txt)。
- Geist 字体通过 `@fontsource-variable/geist` 本地打包，保留字体及软件包的原许可。

## 其余生产依赖

React Markdown、remark-gfm、Excalidraw 的间接依赖及其他运行包的固定版本和许可元数据见 [DEPENDENCY_LICENSES.md](./docs/DEPENDENCY_LICENSES.md)。安装包内的许可与版权文本汇集于 [npm-NOTICES.txt](./licenses/npm-NOTICES.txt)；缺失的核心库许可单独保存在本目录。多重许可包选择 MIT 或 Apache-2.0 等宽松分支；`MIT AND Zlib` 同时遵守两项条件。外部 FFmpeg 工具不随本仓库分发，遵守用户安装版本自身的许可。

生产构建会将本目录的许可正文复制到 `assets/licenses/`，使单独分发构建产物时仍携带版权与许可说明。

文档解析的 Python 依赖由部署者单独安装。直接依赖包括 [MarkItDown（MIT）](https://github.com/microsoft/markitdown/blob/v0.1.9/LICENSE) 和用于读取 ODS 的 [odfpy（含 Apache-2.0 许可选项）](https://pypi.org/project/odfpy/1.4.1/)。版本见 [requirements-documents.txt](./apps/api-rust/requirements-documents.txt)。

## BeautifulRust

Rust 开发约定与附加 Clippy 配置参考 [BeautifulRust](https://github.com/morganlinton/BeautifulRust/tree/40db61c6fee84bd121cf288755f0e2f22a50e995)，版权归 Morgan Linton，采用 MIT 许可。项目按应用代码的需要选取检查项，完整版权和许可保存在 [BeautifulRust-MIT.txt](./licenses/BeautifulRust-MIT.txt)。

## Rust 依赖

Rust crate 继续遵守自身许可，根目录 MIT 不替换这些许可。当前本机解析中，`cssparser` 0.36.0、`cssparser-macros` 0.6.1、`dtoa-short` 0.3.5 和 `selectors` 0.33.0 使用 MPL-2.0；本项目没有修改其源码。分发包含这些组件的服务端二进制时，应保留相应声明并告知接收者获取对应 MPL 源码的位置，见 [SOURCE-NOTICES.txt](./licenses/SOURCE-NOTICES.txt) 与 [MPL-2.0.txt](./licenses/MPL-2.0.txt)。其他 crate 的版本及许可以锁文件和发布包为准；分发二进制时需一并保留适用的依赖声明。
