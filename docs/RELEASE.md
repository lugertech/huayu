# 0.1.0 开源发布清单

检查日期：2026-10-24。目标是尽快发布可安装的个人本地预览版；通过测试不代表所有模型和平台都没有问题。

## 公开前必须完成

| 项目 | 当前状态 | 完成标准 |
| --- | --- | --- |
| 核心功能回归 | 已有本地验收，待真实模型 | 使用预期公开支持的文本、视觉、图片编辑、语音合成和识别服务，完成至少一次真实请求；核对结构化输出、失败、停止与恢复 |
| 系统录屏 | 待真实授权验收 | 至少在首发目标浏览器执行实际屏幕选择、麦克风、系统声音、暂停、继续、保存和回看；注明系统差异 |
| 全新安装 | 本机通过 | 干净源码安装、前后端完整构建、独立启动、新建绘图、撤销重做、导出导入与服务重启恢复均已检查；范围为当前 macOS 环境 |
| 目标平台 | 本机 macOS 已检查；其他待 CI | GitHub 的 Linux、macOS、Windows 检查实际通过；未验证的平台不写成已支持 |
| 仓库与报告入口 | 待建立 | 设置公开仓库、真实反馈入口与私密漏洞报告；同步文档与 SECURITY，不使用占位地址 |

## 本地发布检查

运行测试前按部署文档安装 Python 文档解析依赖，并设置 `HUAYU_DOCUMENT_PYTHON`。[文档解析安装步骤](./DEPLOYMENT.md#文档解析)

```sh
vp install --frozen-lockfile
vp run check:security
vp run check:release
vp run licenses:check
vp run test:release
vp run check
vp run test
sh scripts/cargo.sh fmt --all -- --check
sh scripts/cargo.sh clippy --workspace --all-targets --locked -- -D warnings
vp run build:web
vp pm audit -- --prod --audit-level high
sh scripts/cargo.sh audit --file apps/api-rust/Cargo.lock
vp run package:source
```

`check:security` 扫描当前工作区的明显密钥、本机绝对路径和本地模型测试标记。`check:release` 检查必要文件、版本与本地文档链接。两项检查都包含未跟踪的新文件，跳过已删除的文件，也可在解压后的源码包中运行。

`package:source` 通过 `git archive` 归档已提交版本，默认使用 `HEAD`，可通过 `vp run package:source <tag-or-commit>` 指定 tag 或提交。版本号、文件内容与 `.gitattributes` 排除规则均来自选定提交；未提交和未跟踪的改动不进入归档。压缩包与 SHA-256 校验文件输出到 `var/releases/`，不再生成自定义逐文件清单。重新打包需要 Git 检出目录。

正式发布时，先在目标提交的干净检出目录完成安全检查、发布检查和构建测试，再执行归档。打包命令不触发检查，也不自动发布。

CI 在三个桌面平台执行编译、测试、Rust 格式与 lint、前端构建。依赖检查分别审计前端生产依赖和 Rust 锁文件。本地运行 Rust 审计需安装 [cargo-audit](https://github.com/RustSec/rustsec/tree/main/cargo-audit#installation)。工作流尚未在远端运行时，应明确记为“已配置，待运行”。

初始发布检查通过前端 120 项、Rust 集成 7 项和发布工具 6 项测试；当时生产依赖审计为零条已知通告。Excalidraw 的 Radix Tabs 和 Popover 已分别升级至兼容 React 19 的 1.2.1 和 1.3.1，`pnpm peers check` 不再报告版本范围问题。原生标签、弹层及键盘回归结果见[本地验证记录](./VERIFICATION.md)。后续更新仍需保留目标平台 CI 与真实浏览器回归；此结果不等于完整安全审计或所有模型兼容性证明。

## 手工验收路径

1. 空目录安装并启动，创建项目，编辑、重载、重启后内容仍在。
2. 真实模型执行文字、图片、网页与文件；手工修改后再次创作，原作与来源关系保留。
3. 执行分支工作流，停止和失败后重试；修改素材只更新受影响分支。
4. 系统实际录制后保存，分段转写、校对、整理、定位时间，并把片段转为画布。
5. 导出 `.huayu.json` 并在新实例导入，核对完整画布、附件、图表和图片；确认不含模型连接，并核对旧多页文件合并后的内容完整性。
6. 检查桌面深浅色、手机回看与作品窗口。关闭服务时有可理解的错误，恢复后可重试。

结果按具体系统、浏览器、模型能力和命令写入 [验证记录](./VERIFICATION.md)，不把模拟模型结果写成真实生成质量。

## 首发范围

建议以 `0.1.0` 本地预览版开始：提供源码、明确安装路径、用户文档和已知限制。先不承诺公网多用户、云端同步、所有模型兼容、移动端系统录屏或所有系统音频采集。

首发前验证数据边界和核心使用流程。Docker、多平台预编译二进制、自动升级和应用签名可后续加入。
