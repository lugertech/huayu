# Rust code style

Applies to libraries, APIs, workers, tools and tests under `apps/api-rust`. Based on the [Google Rust Style Guide](https://google.github.io/styleguide/rustguide.html), with project rules taking precedence.

## Implementation and abstraction

- Prefer simple, direct application code; do not abstract for hypothetical reuse.
- Use traits for real generic bounds, dynamic dispatch or extension methods, not merely to group code.
- Prefer functions, types and modules for business and persistence logic. Do not hide behavior behind custom macros. Standard SeaORM, Serde and framework derives remain appropriate.

## Types and interfaces

- Use structs, enums or named constants for requests, responses and business states. Prefer named fields when there are several.
- Replace ambiguous boolean parameters with semantic enums; retain clear boolean fields such as `is_active`.
- Introduce newtypes for identifiers or units where interfaces face a real mix-up risk. Do not wrap all integers mechanically. Convert explicitly at HTTP and persistence boundaries while preserving serialization and database contracts.
- Implement standard traits when their behavior matches; derive equivalent implementations when possible.
- Provide Default only when there is a meaningful default state.

## Ownership and collections

- Read-only arguments prefer `&str`, `&[T]`, `&T` and `Option<&T>` over unnecessary references to owning containers.
- Express ownership through exclusive ownership and borrowing. Deep copies need a purpose.
- Arc is appropriate for shared state, caches and data across tasks. Cloning Arc is not a deep copy.
- Keep Vec when ownership, sorting or indexing naturally requires it; do not force generic iterators for their own sake.

## Errors

- Use Option when absence needs no reason. Recoverable input, database and network failures use Result, not unwrap, expect or panic.
- Prefer match, if let or let-else to checking then extracting.
- For a true invariant that cannot be encoded in types, explain an expect or contextual assertion. Tests may use unwrap and assertions.

## Imports, names and expression

- Import business dependencies explicitly. Test `use super::*` and framework preludes are exceptions.
- Use clear, complete names. Give branches, loops, validation and database operations room; do not compress functions or JSON macros.
- Break complicated iterator chains into named steps or readable loops. Add local type annotations when inference obscures the result.

## Documentation

Write informative `///` or `//!` comments for public library entry points and important business boundaries. Explain actual constraints, units, indices, cancellation, failure/panic cases, transactions, permissions, ETags or audit semantics when applicable. Do not restate the function name or Rust basics.

## Formatting and checks

Use the shared rustfmt configuration. Do not introduce custom formatters or syntax adapters. Fix warnings in modified code. Crates inherit workspace Clippy rules; any exception is scoped to the function and uses `#[expect(..., reason = "...")]`, without broad suppression.

## BeautifulRust

Use the [BeautifulRust v1.5.0](https://github.com/morganlinton/BeautifulRust/tree/v1.5.0) skills `rust-best-practices`, `rust-review` and `rust-port` for writing, reviewing and porting Rust respectively. Project rules take precedence over external advice.

The additional workspace checks and `clippy.toml` are adapted from upstream commit `40db61c6fee84bd121cf288755f0e2f22a50e995`, with the [MIT license](../../licenses/BeautifulRust-MIT.txt) retained. They check unwrap outside test functions, explicit panics in functions returning Result, unexplained lint suppressions, undocumented unsafe operations, redundant clones, string addition, debugging leftovers and potentially lossy conversions. Test functions may use unwrap; test helpers use expect with context.

Enable `missing_assert_message` to give assertions outside test functions failure context. Assertions inside test functions retain Clippy's exemption.

All project crates are unpublished and maintained as application code. Do not enable the entire pedantic group or blanket requirements for public-item documentation, exhaustive_enums, boolean parameters and shared-pointer cloning syntax. Apply that advice where it improves a real interface or readability.

Run `vp run lint:rust` from the repository root to check all workspace members, targets and features with warnings treated as errors. CI uses the same command.
