# Rust API 约定

- 遵守根目录 AGENTS.md 和本目录 CODE_STYLE.md。
- Rust 编写参考 [BeautifulRust](https://github.com/morganlinton/BeautifulRust) 的 `rust-best-practices`；代码审查和语言迁移分别参考 `rust-review`、`rust-port`。外部建议与项目约定冲突时，以项目约定为准。
- core 不执行 I/O；store 不依赖 HTTP；模型连接和密钥不进入服务端类型或持久化。
- 二进制只负责启动，使用 Axum handler、extractor 和类型化请求、响应。
- 数据结构由版本迁移管理，实体与迁移保持一致。
- 修改 Rust 后执行格式化及相关编译检查；持久化和接口行为通过独立临时数据库验证。
- 运行目录为仓库根目录。不得用原仓库或 timetable 的数据库运行测试。
