#!/bin/sh
set -eu
HUAYU_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$HUAYU_ROOT"
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi
# Cargo runs integration tests from their crate, so resolve repository-relative executables here.
case "${HUAYU_DOCUMENT_PYTHON:-}" in
  /*|[A-Za-z]:/*) ;;
  */*) export HUAYU_DOCUMENT_PYTHON="$HUAYU_ROOT/$HUAYU_DOCUMENT_PYTHON" ;;
esac
if [ -n "${HUAYU_RUST_TOOLCHAIN_DIR:-}" ]; then
  export CARGO_HOME="$HUAYU_RUST_TOOLCHAIN_DIR/.cargo"
  export RUSTUP_HOME="$HUAYU_RUST_TOOLCHAIN_DIR/.rustup"
  export PATH="$CARGO_HOME/bin:$PATH"
fi
if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust / Cargo is not available. Install Rust 1.95 or newer and reopen the terminal." >&2
  echo "For an existing custom installation, set HUAYU_RUST_TOOLCHAIN_DIR in .env. See docs/GETTING_STARTED.md." >&2
  exit 127
fi
case "${1:-}" in
  build|check|test|run|fmt|clippy|metadata|tree|clean|doc|update)
    HUAYU_CARGO_COMMAND=$1
    shift
    exec cargo "$HUAYU_CARGO_COMMAND" --manifest-path "$HUAYU_ROOT/apps/api-rust/Cargo.toml" "$@"
    ;;
  *) exec cargo "$@" ;;
esac
