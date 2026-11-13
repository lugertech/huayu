# Rust API Conventions

- Follow the root [AGENTS.md](../../AGENTS.md) and this directory's [CODE_STYLE.md](./CODE_STYLE.md).
- Consult [BeautifulRust](https://github.com/morganlinton/BeautifulRust): `rust-best-practices` for writing Rust, `rust-review` for reviewing code, and `rust-port` for porting code. Follow this repository's conventions if external advice conflicts with them.
- `core` does not perform I/O, and `store` does not depend on HTTP. Keep model connections and keys out of server types and persistent storage.
- Binaries only handle startup. Use Axum handlers and extractors with typed requests and responses.
- Manage data structures with versioned migrations and keep entities in sync with those migrations.
- After changing Rust code, run formatting and the relevant compilation checks. Verify persistence and API behavior with separate temporary databases.
- Run commands from the repository root. Do not run tests against databases from the original repository or timetable.
