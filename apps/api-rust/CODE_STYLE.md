# Rust 代码风格

适用于 `apps/api-rust` 内的 Rust 库、API、worker、工具和测试。本文参考 [Google Rust Style Guide](https://google.github.io/styleguide/rustguide.html)，结合本项目整理；具体要求以本文列出的规则和 [AGENTS.md](./AGENTS.md) 中的项目约定为准。

## 实现与抽象

- 应用代码优先简单直接的实现，避免为潜在复用提前抽象。
- trait 用于实际的泛型约束、动态分发或扩展方法，不单纯为组织代码而定义。
- 普通业务与持久化逻辑优先使用函数、类型和模块，不用自定义宏隐藏操作；保留 SeaORM、Serde 等框架的标准宏与派生。

## 类型与接口

- 请求、响应和业务状态使用结构体、枚举或具名常量，多个字段优先具名。
- 含义不清的布尔参数改用语义枚举；`is_active` 等含义明确的布尔字段保留。
- 容易混淆的业务标识或单位优先使用新类型（newtype），由编译器区分教师、班级、教室等不同 ID。仅在有实际混用风险的接口中逐步引入，不批量包装所有整数；在 HTTP 与持久化边界显式转换，保持既有序列化和数据库合约。
- 行为匹配标准 trait 时优先实现该 trait，能够使用 `#[derive(...)]` 时不手写等价实现。
- 配置与选项结构体在有合理默认值时实现 `Default`，不为满足形式引入无效默认状态。

## 所有权与集合

- 只读参数优先使用 `&str`、`&[T]`、`&T` 和 `Option<&T>`，避免不必要的 `&String`、`&Vec<T>`、`&Box<T>` 或 `&Option<T>`。
- 所有权优先通过独占和借用表达，深复制应有明确用途。
- 共享应用状态、缓存及跨任务数据可使用 `Arc`，克隆 `Arc` 不视为深复制。
- 自然需要持有、排序或索引的集合保留 `Vec`，不为通用性强行引入迭代器返回值或泛型参数。

## 错误处理

- 仅需表达有无且不需要失败原因时使用 `Option`；输入、数据库、网络等需携带原因的可恢复失败使用 `Result`，不以 `unwrap`、`expect` 或 `panic!` 处理。
- 优先用 `match`、`if let` 或 `let ... else` 代替先检查再取值。
- 确属无法用类型表达的程序不变量时，使用说明原因的 `expect` 或带上下文的断言。测试可使用 `unwrap` 和断言。

## 导入、命名与表达

- 业务代码显式导入所需项，避免通配符隐藏依赖；测试中的 `use super::*` 和 SeaORM 等框架约定的 prelude 保留例外。
- 命名完整清晰，分支、循环、校验和数据库操作独立成行，不压缩函数或 JSON 宏。
- 复杂迭代器链优先拆成具名步骤或清晰的循环；类型推断使结果难以判断时，补充局部类型标注。

## 文档注释

- 为库的公开入口和关键业务边界编写有信息量的 `///` 或 `//!` 文档。
- 按接口实际职责说明必要的输入约束、单位、索引、取消行为、失败或 panic 条件，以及事务、权限、ETag 与审计语义。
- 注释不重复函数名或 Rust 基础知识。

## 格式与静态检查

- 使用共享 rustfmt 配置，不引入自定义格式化器或语法改写适配。
- 修复改动代码的编译警告；各 crate 继承 workspace Clippy 规则，例外限定到函数并使用 `#[expect(..., reason = "...")]`，不做大范围抑制。

## BeautifulRust

Rust 编写、审查和语言迁移分别参考 [BeautifulRust](https://github.com/morganlinton/BeautifulRust) 的 `rust-best-practices`、`rust-review` 和 `rust-port` 技能。项目约定优先于外部建议。

workspace 的附加检查与 `clippy.toml` 改编自上游提交 `c6f56d27a01739d404da2a554daaea023d7ddcca`，保留 [MIT 许可](../../licenses/BeautifulRust-MIT.txt)。检查覆盖非测试代码的 `unwrap`、返回 `Result` 的函数中的显式 panic、未说明原因的 lint 抑制、未说明安全前提的 unsafe、无效克隆、字符串拼接、调试残留和可能丢失信息的类型转换。测试函数可使用 `unwrap`；测试辅助函数使用带上下文的 `expect`。

本项目的 crate 均不发布，按应用代码维护；不整体启用 `pedantic` 或面向通用库的全量公开项文档、布尔参数和共享指针写法限制。这些建议按实际接口与可读性逐项判断。

在仓库根目录运行 `vp run lint:rust`，对所有 workspace 成员、target 和 feature 执行 Clippy，并将警告视为错误。CI 使用同一命令。
