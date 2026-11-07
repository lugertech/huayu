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

## 代码审查

- 执行代码审查或提交前自查时，先阅读 [REVIEW.md](./REVIEW.md)，并遵守修改目录的局部约定。
- 交付时说明实际执行的检查、结果和未覆盖的风险；PR 使用仓库模板记录验证证据、风险和回滚方式。
