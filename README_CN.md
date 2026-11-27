# Huayu 画语

[English](./README.md) · 简体中文

画语是一个本地运行的 AI 创作画布。把笔记和图片连到创作指令，生成文字、图片或网页，再在同一张画布上编辑。

## 快速开始

准备 [Vite+、Node.js 和 Rust](./docs/GETTING_STARTED.md#安装与启动)，然后在仓库根目录运行以下命令。

```sh
vp install --frozen-lockfile
vp run build
vp run start
```

打开 <http://127.0.0.1:5858>，任选一个内置示例体验。绘图、编辑和导出无需配置模型。需要生成内容或转写录屏时，在「设置 → 模型与工具」中添加服务。

导入 PDF、DOCX 或工作簿前，请在运行画语的电脑上[安装文档解析依赖](./docs/DEPLOYMENT.md#文档解析)。

项目和录屏保存在运行画语的电脑上。模型设置和 API 密钥仅保存在浏览器中。使用远程模型时，浏览器会将选中的素材直接发送给该服务。

## 主要功能

- **画布工作流。** 从空白画布或模板开始绘图、整理素材，按需运行单个步骤或整套流程。
- **从录屏继续创作。** 录制屏幕或导入音视频，转写后将选段放到画布上，并从时间链接回看原片段。
- **协作与导出。** 邀请同一局域网内的人共同编辑画布。可导出含附件的完整项目，或将画布保存为 PNG 或 SVG。

## 使用文档

[白板与作品](./docs/USER_GUIDE.md) · [素材库](./docs/USER_GUIDE.md#素材库) · [模型连接](./docs/MODEL_SETUP.md) · [录屏与分析](./docs/RECORDING_GUIDE.md) · [部署与备份](./docs/DEPLOYMENT.md) · [常见问题](./docs/TROUBLESHOOTING.md) · [参与贡献](./CONTRIBUTING.md)

## 许可

画语自有代码和文档采用 [MIT 许可](./LICENSE)。适用范围和依赖许可见 [开源许可](./docs/LICENSING.md) 和 [第三方许可说明](./THIRD_PARTY_NOTICES.md)。
