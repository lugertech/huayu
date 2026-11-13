# 0.1.0 release checklist

Initial release preparation was checked on 2026-10-24. The goal is an installable local preview; passing tests does not mean every model or platform is problem-free.

## Gates before public release

| Gate | Status | Completion criteria |
| --- | --- | --- |
| Source authorization | Pending | Establish redistribution rights for custom tpk-admin code, prompts and assets, or independently replace and revalidate them; see [Licensing](./LICENSING.md) |
| Core regression | Local checks passed; real models pending | Real requests for intended text, vision, image editing, speech and recognition services; check structured output, failure, stop and recovery |
| System recording | Real permission flow pending | Actual screen choice, microphone, system audio, pause/resume, save and review on the launch browser; document differences |
| Clean installation | Passed on this Mac | Frozen install, full builds, isolated startup, drawing, undo/redo, transfer and restart persistence |
| Target platforms | Local macOS checked; remote CI pending | Actual Linux/macOS/Windows CI completion; do not claim unverified platforms |
| Repository and reporting | Pending | Real public repository, feedback destination and private vulnerability reporting |

Do not treat a generic license declaration as resolved source authorization. See [Choose a License on missing permission](https://choosealicense.com/no-permission/).

## Local checks

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
vp pm audit --prod --audit-level high
vp run package:source
```

`check:security` independently scans the current working tree for obvious secrets, personal absolute paths and local model fixture markers. `check:release` checks required files, versions and local Markdown links. Both include untracked files, skip working-tree deletions and also work in extracted source without Git metadata. These quick checks do not replace a complete security or source-authorization audit.

`package:source` uses `git archive` to archive a committed version, defaulting to `HEAD`. Use `vp run package:source <tag-or-commit>` to select a tag or commit. The version, contents and `.gitattributes` export rules all come from that commit; uncommitted and untracked changes are excluded. Archives and SHA-256 files go to `var/releases/`; no custom per-file manifest is generated. Repackaging requires a Git checkout.

For a release, run security checks, release checks, builds and tests in a clean checkout of the selected commit before archiving it. Packaging does not trigger checks or publish the result.

Configured CI builds and tests on three desktop operating systems and checks production advisories separately. Until it actually runs remotely, status remains “configured, pending execution.” The original local release checks passed 120 frontend tests, 7 Rust integration tests and 6 release-tool tests. Localization adds its own regressions; current results belong in [Verification](./VERIFICATION.md).

Excalidraw's Radix Tabs and Popover dependencies now resolve to React 19-compatible versions 1.2.1 and 1.3.1. `pnpm peers check` reports no version-range issues. Native tabs, popovers and keyboard results are recorded in [Verification](./VERIFICATION.md). Future updates still require target-platform CI and real-browser regression. A zero-advisory dependency audit is not an exhaustive security audit.

## Manual acceptance path

1. Install from an empty directory, create and edit a project, reload and restart, and verify persistence.
2. Use real models for text, images, pages and files; edit and create again, keeping originals and lineage.
3. Run branches, stop and retry failures, and update only affected branches after material changes.
4. Actually record with system permissions; save, transcribe, correct, analyze, seek by time and move excerpts to canvas.
5. Transfer `.huayu.json` between instances, checking the complete canvas, attachments, charts and images, with no model connections; also verify legacy page merging preserves materials.
6. Check both languages and themes on desktop and mobile, including work windows, recording review and service recovery.

Record actual operating system, browser, model and commands; do not describe mock output as real model quality.

## Initial scope

Start with a `0.1.0` local preview: source, reproducible installation, guides and clear limits. Do not promise public multi-user hosting, cloud sync, universal model compatibility, mobile system recording or system audio on every platform.

Docker, prebuilt binaries, automatic updates and signing can follow. They need not delay an accepted source preview; authorization, data boundaries and core acceptance still matter.
