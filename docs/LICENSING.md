# 开源许可

## 选择：MIT

画语的自有应用代码和文档沿用 [MIT License](../LICENSE)，SPDX 标识为 `MIT`。根项目、React 包与 Rust workspace 的许可声明保持一致，不在标准许可正文中增加额外限制。

这个选择符合项目允许免费商用、方便部署和二次开发的目标。MIT 允许使用、修改、分发和销售，也允许下游以其他条款分发其修改或更大的作品，不要求公开所有新增代码。分发软件的副本或实质部分时，需要保留版权与完整许可声明。软件按现状提供，不附带担保。标准文本及说明见 [SPDX](https://spdx.org/licenses/MIT.html) 和 [GitHub Choose a License](https://choosealicense.com/licenses/mit/)。

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) 也是允许商用的选择，并明确规定贡献者专利许可与专利诉讼终止条款。本项目目前没有额外的专利许可要求，现有应用及主要白板依赖均已声明 MIT，因此保持 MIT 有利于沿用已有授权和降低采用成本。

## 授权范围

根目录的 MIT 仅适用于本项目有权许可的内容。第三方软件、字体、品牌素材和来源代码继续遵守各自许可，见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。软件的 MIT 许可不替导入资料、用户作品或模型输出授予权利。

项目接受的新增贡献原则上也以 MIT 提供，除非双方另有明确约定。贡献者保留自身版权，只应提交自己有权许可的内容，并保留第三方版权及许可声明。

## 两个来源仓库

核对日期：2026-10-24。核对对象为本地固定提交，不代表之后的仓库版本。

- **MenteX**：`8d9da964571dd26ea80056936ea8829804be07cf`。根 `package.json` 声明 `author: flowerdance`、`license: MIT`；该提交未找到独立的许可正文文件。保留作者、许可元数据及来源记录，不把第三方 SDK 或素材重新许可为 MIT。
- **tpk-admin**：`2d2c1bd8397712b81933b9380f9178a72d70af58`。`composer.json` 声明 MIT，但名称和描述仍是 Laravel 骨架项目；该提交未找到独立许可文件或覆盖自有业务模块的专门授权。这个字段不足以单独确认 MenteX 业务代码、提示词及素材的对外再分发授权。正式公开这些来源内容前，需要权利人已有的授权依据；本次协议选择不代替这项授权。

原始声明摘要随仓库保存在 [SOURCE-NOTICES.txt](../licenses/SOURCE-NOTICES.txt)。未向来源仓库写入许可或修改其历史声明。

## 依赖的不同许可

Excalidraw、React、Base UI、React Flow 等保留原有许可。字体继续使用 OFL 或各自声明的许可。前端版本清单见 [DEPENDENCY_LICENSES.md](./DEPENDENCY_LICENSES.md)。

本机 `aarch64-apple-darwin` 的锁定 Rust workspace 解析结果包含 353 个包，涵盖构建、开发和间接依赖；这些包均带许可元数据。其中以下四项为 MPL-2.0，不应表述为整个依赖树均采用 MIT：

| crate | 版本 | 对应源码 |
| --- | --- | --- |
| cssparser | 0.36.0 | [发布源码](https://docs.rs/crate/cssparser/0.36.0/source/) |
| cssparser-macros | 0.6.1 | [发布源码](https://docs.rs/crate/cssparser-macros/0.6.1/source/) |
| dtoa-short | 0.3.5 | [发布源码](https://docs.rs/crate/dtoa-short/0.3.5/source/) |
| selectors | 0.33.0 | [发布源码](https://docs.rs/crate/selectors/0.33.0/source/) |

MPL 允许商业使用和与其他许可的代码组合；分发自行编译的可执行文件时，需要告知接收者如何取得 MPL 覆盖部分的源码。对这些文件的修改仍应按 MPL 提供，不会因此要求独立的应用文件全部改用 MPL。详见 [Mozilla 官方 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/#using-and-distributing-software-under-the-license)。本项目未修改上述 crate 的源码，许可正文保存在 [MPL-2.0.txt](../licenses/MPL-2.0.txt)，源码位置记录在 [SOURCE-NOTICES.txt](../licenses/SOURCE-NOTICES.txt)。

本次完成的是项目许可选择与现有声明核对，不代表其他目标平台、未来依赖版本或所有素材的完整授权审计。分发源码、前端构建或服务端二进制时，应一并携带适用的许可与第三方声明；前端构建会自动复制 `licenses/` 中的文本和根目录 MIT 正文。
