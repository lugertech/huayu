# 第三方代码、素材和许可

本仓库的 MIT 许可仅覆盖有权按 MIT 提供的应用代码，不重新许可任何第三方依赖或素材。

## 原项目

AI 节点、图表编辑器来自 MenteX；提示词及业务行为参考 tpk-admin 的 MenteX 模块。应用记录存储、兼容转换、AI 卡片及导出接入由本项目实现。原仓库及固定版本见 [来源仓库与版本](./docs/LICENSING.md#两个来源仓库)。原品牌 PNG、ICO 和网页素材已移出分发目录；当前图标为本项目绘制的 SVG。

MenteX 的根包声明作者为 `flowerdance`、许可为 MIT。tpk-admin 的 `composer.json` 声明 MIT，但名称和描述仍是 Laravel 骨架项目。两个固定提交均未找到独立许可正文；后者的模板声明不能单独确认自有业务代码与提示词的公开再分发授权。保留原作者和权利人的权益，原项目包元数据也不重新许可其中的第三方 SDK、品牌或素材。完整核对范围见 [开源许可](./docs/LICENSING.md)，原始元数据摘要见 [SOURCE-NOTICES.txt](./licenses/SOURCE-NOTICES.txt)。

## Excalidraw

白板使用 [`@excalidraw/excalidraw` 0.18.1](https://github.com/excalidraw/excalidraw/tree/v0.18.1)，采用 MIT 许可，允许免费商用，无许可证密钥要求。完整原版权与许可保存在 [excalidraw-MIT.txt](./licenses/excalidraw-MIT.txt)。本项目使用开源编辑器库，不接入 Excalidraw 的云端房间、账号、分析统计或付费服务。

[本地补丁](./patches/@excalidraw__excalidraw@0.18.1.patch) 将编辑器的交互状态重置事件由 `unload` 改为 `pagehide`，保留原回调及卸载清理逻辑；开发与生产构建均应用该修改。升级依赖时需重新核对补丁及页面离开、返回后的编辑行为。

随包字体保持原文件，全部从本机提供。各字体原版权与许可见 [excalidraw-fonts-NOTICE.md](./licenses/excalidraw-fonts-NOTICE.md) 及同目录 OFL 正文；Comic Shanns 使用 MIT，其余随包字体使用 SIL Open Font License。Helvetica 与 Segoe UI Emoji 仅使用系统字体，不分发对应商业字体文件。

## React Flow / xyflow

本项目使用 `@xyflow/react` 12.12.0 和 `@xyflow/system` 0.0.83，采用 MIT 许可，允许免费商用。完整许可及原版权声明保存在 [xyflow-MIT.txt](./licenses/xyflow-MIT.txt)，上游源码与许可见 [xyflow](https://github.com/xyflow/xyflow)。

未使用 React Flow Pro 示例源码、付费模板或云服务。图表编辑器使用 React Flow；应用卡片、页面和历史记录兼容层由本项目接入。平滑及压感笔迹轮廓使用 `perfect-freehand` 1.2.3（MIT），完整原版权与许可见 [perfect-freehand-MIT.txt](./licenses/perfect-freehand-MIT.txt)。界面组件延续 shadcn/Base UI 样式。

`tldraw`、`@tldraw/assets` 及其专用依赖已从项目依赖和构建产物移除。兼容历史文件的记录字段与 schema 标识属于输入数据，不加载或执行原 SDK。

## UI 和字体

- `src/ui` 中的组件基于 [shadcn/ui](https://github.com/shadcn-ui/ui) 官方 Base Nova 注册表源码，使用 Base UI 原语和 Lucide 图标；应用接入时替换了注册表图标占位符与导入别名。
- Base UI、React、Lucide 及其他依赖保留各自软件包的许可。完整版本由 `pnpm-lock.yaml` 和 `Cargo.lock` 固定。
- `public/fonts/NotoSansSC.ttf` 来自 [Google Fonts Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc)，使用 SIL Open Font License。完整许可保存在 [OFL.txt](./apps/web/public/fonts/OFL.txt)。
- Geist 字体通过 `@fontsource-variable/geist` 本地打包，保留字体及软件包的原许可。

## 其余生产依赖

React Markdown、remark-gfm、Excalidraw 的间接依赖及其他运行包的固定版本和许可元数据见 [DEPENDENCY_LICENSES.md](./docs/DEPENDENCY_LICENSES.md)。安装包内的许可与版权文本汇集于 [npm-NOTICES.txt](./licenses/npm-NOTICES.txt)；缺失的核心库许可单独保存在本目录。多重许可包选择 MIT 或 Apache-2.0 等宽松分支；`MIT AND Zlib` 同时遵守两项条件。外部 FFmpeg 工具不随本仓库分发，遵守用户安装版本自身的许可。

生产构建会将本目录的许可正文复制到 `assets/licenses/`，使单独分发构建产物时仍携带版权与许可说明。

## BeautifulRust

Rust 开发约定与附加 Clippy 配置参考 [BeautifulRust](https://github.com/morganlinton/BeautifulRust/tree/40db61c6fee84bd121cf288755f0e2f22a50e995)，版权归 Morgan Linton，采用 MIT 许可。项目按应用代码的需要选取检查项，完整版权和许可保存在 [BeautifulRust-MIT.txt](./licenses/BeautifulRust-MIT.txt)。

## Rust 依赖

Rust crate 继续遵守自身许可，根目录 MIT 不替换这些许可。当前本机解析中，`cssparser` 0.36.0、`cssparser-macros` 0.6.1、`dtoa-short` 0.3.5 和 `selectors` 0.33.0 使用 MPL-2.0；本项目没有修改其源码。分发包含这些组件的服务端二进制时，应保留相应声明并告知接收者获取对应 MPL 源码的位置，见 [SOURCE-NOTICES.txt](./licenses/SOURCE-NOTICES.txt) 与 [MPL-2.0.txt](./licenses/MPL-2.0.txt)。其他 crate 的版本及许可以锁文件和发布包为准；分发二进制时需一并保留适用的依赖声明。
