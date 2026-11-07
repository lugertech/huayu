# Contributing to Huayu

Read [Getting started](./GETTING_STARTED.md) and [Architecture](./ARCHITECTURE.md). Describe the real task behind a feature request. Bug reports should include version, browser, minimal steps and redacted errors.

## Local development

Install Vite+ and a supported Node.js version as described in [Getting started](./GETTING_STARTED.md). `vp run check` combines frontend formatting, lint, type checks and Rust checks. `vp run test` runs release-tool, frontend and Rust tests.

Node.js helper scripts use TypeScript and run directly on the required Node.js version. `vp run check:scripts` checks their types and is included in `vp run check`. Use erasable type syntax and explicit `.ts` imports. Generators that need JSX or browser modules continue to build through Vite before running.

```sh
vp install --frozen-lockfile
vp run dev
```

The interface uses `http://127.0.0.1:5173`, the API uses port 5858, and `vp run dev:site` serves independent docs on port 5863. Use isolated data directories and test connections for recording and model work; do not use another person’s projects or real keys as fixtures.

## Contribution requirements

- Model URLs, keys and selections stay in the browser. Never add them to environment variables, backend settings, projects, examples or exports.
- User-facing text explains actions and outcomes, without internal specifications, migration jargon or debugging fields.
- Use Axum handlers/extractors organized by capability, and Result for recoverable failures. Follow [Rust code style](./CODE_STYLE.md).
- Format frontend code with Oxfmt bundled in Vite+: two-space indentation, double quotes, semicolons and a target width of 80 columns. Run `vp run format` to format code and `vp run lint` to check basic code errors, unused variables, React Hooks calls and hook dependencies. Declare one variable per statement; extract complex JSX conditions and event handlers into clearly named variables or functions.
- Add meaningful regressions for data conversion, saving, cancellation and recovery. Low-risk layout changes do not need mechanical tests.
- Add both Chinese and English UI copy and preserve interpolation parameters. Keep machine identifiers and user content independent of translated labels. Update both language versions of affected user docs.
- Use semantic translation keys organized by capability, such as `t("canvas.share.title")`. The application and site each keep Chinese and English copy in their own `locales/zh-CN.ts` and `locales/en.ts` files. Add each key to both catalogs and preserve matching interpolation parameters. Do not pass Chinese source text, user content or arbitrary API messages directly to `t()`.
- Retain third-party copyrights and licenses. Submit only code, prompts, fonts and assets you may license. New contributions use MIT unless explicitly agreed otherwise.

Before submitting:

```sh
vp run check:security
vp run check:release
vp run check
vp run test
vp run build:web
vp run build:site
sh scripts/cargo.sh fmt --all -- --check
vp run lint:rust
```

Explain the problem, resulting behavior, actual validation and remaining limits. Include real screenshots for UI changes. Exclude runtime data, output, `.env`, browser storage, recordings and build caches.
