# Project Conventions

- Do not explain internal specifications in the user-facing UI.
- Model service URLs, API keys, and model selections are stored only in the browser. Do not write them to the server, projects, templates, or exported files.
- Do not hardcode machine-specific absolute paths in repository files. Use relative paths for files within this repository. For external source code, use public links or paths relative to a stated base directory.
- Write Node.js helper scripts in TypeScript and run them directly with Node.js. Use erasable type syntax and explicit `.ts` import extensions.
- In Rust, use Axum handlers and extractors, and organize modules by feature. Use `Result` for recoverable failures instead of panicking.
- Follow the [Rust code style](./apps/api-rust/CODE_STYLE.md).
- Store runtime data in the ignored `var/dev/` directory. Use separate temporary directories for tests.

## General Principles

- Keep logic in one function unless parts can be composed or reused.
- Validate unknown values once at the boundary that owns them. Pass typed values inward instead of repeating `typeof value === "object"` or property existence checks. Do not revalidate values already guaranteed by a schema, constructor, or internal type.
- Do not extract single-use helpers preemptively. Inline the logic at the call site unless the helper is reused, hides a genuinely complex boundary, or has a clear independent name that improves the caller.
- Before adding complexity for a speculative or vanishingly unlikely race or security edge case, explain the concrete failure mode, likelihood, and complexity cost to the user and get their buy-in. Do not silently expand scope for theoretical robustness.
- Avoid `try`/`catch` where possible.

## UI Design Principles

Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.

## React Frontend Conventions

These conventions apply to `apps/web`. Follow React's official guidance on component responsibilities, state, and effects. The directory and filename conventions below are specific to this repository.

### Directories and Dependencies

- Put page entry points with their own URLs, matching tests, and page styles in `src/pages/`. A page may own route parameters, page-level requests, and interaction state. Put complex content, menus, and business logic for a page in the relevant feature directory. Keep internal components out of the top level of `src/pages/`.
- Organize components, hooks, state, pure computations, API adapters, and tests by feature under `src/features/<feature>/`. Keep features such as the canvas, recording, and asset library self-contained. Components can sit alongside feature logic or go in a `components/` subdirectory when there are many.
- Use `src/components/` for the app shell and components shared across features. Preserve the upstream shadcn / Base UI source, filenames, and organization in `src/components/ui/`; exclude it from general dead code removal and bulk style rewrites.
- Use `src/lib/` for shared foundations, `src/api/` for common API clients, and `src/i18n/` or `src/locales/` for language utilities and dictionaries. Keep feature-specific logic out of general utility directories.
- Pages compose feature modules. Feature modules must not import from `pages`. Use direct module imports to express dependencies. Do not add forwarding files or `index` re-exports solely to organize directories.
- Separate components, hooks, and pure utilities by their dependencies and responsibilities. Do not import large UI component files to access shared formatting functions, types, or task state, as this pulls recording, canvas, or editor UI into unrelated callers.
- Split modules only when reuse, a clearer boundary, or reduced complexity justifies it. Do not split components by line count or introduce layers before they are needed.

### Filenames and Exports

- Use lowercase kebab-case for directories, such as `asset-library` and `chart-shape`, and PascalCase for feature component files, such as `RecordingCover.tsx`. Use `*Page.tsx` for page entry points and descriptive `*Layout.tsx` and `*Provider.tsx` names for layouts and providers.
- Use kebab-case for logic modules, such as `capture-state.ts` and `agent-sse.ts`. A standalone module whose main export is a hook uses a `use-*.ts` filename and exports a function named `useXxx`.
- Use `.tsx` for files that contain JSX and `.ts` for ordinary logic without JSX. Core context modules and rendering adapters may be named for their domain. Do not capitalize filenames solely because of their extension.
- Put tests next to the modules they cover. Use the module's base name with a `.test.ts` or `.test.tsx` suffix. Name language dictionaries with BCP 47 tags, such as `zh-CN.ts`. Keep conventional names for entry points, configuration, and third-party source files.
- Prefer named exports for feature components. Match the filename to the main component or component family. Keep default exports required by existing `React.lazy` calls; do not add a wrapper solely to standardize exports.

### Components, State, and Effects

- Keep rendering pure. Do not mutate props, existing state, or external objects. Put business operations triggered by events in event handlers. Define components and hooks at module scope and follow the rules for hook calls and dependencies.
- Keep state with the component or module responsible for it. Compute values derived from props or existing state during render. Do not synchronize derived state with an effect. Lift shared state to the closest common owner that needs to coordinate changes.
- Use effects to synchronize with external systems such as network connections, browser events, media resources, and third-party editors. Clean up subscriptions and resources when the effect stops. After asynchronous work completes, check the cancellation signal and task identity so that stale work cannot overwrite newer state.
- Extract custom hooks for reusable React logic or logic with a distinct responsibility. Keep pure data transformations in ordinary functions. Add `memo`, `useMemo`, or `useCallback` only when there is evidence that the optimization helps.
- Preserve existing routes, lazy-loading boundaries, provider lifecycles, browser storage keys, and document formats. Directory reorganization must not change business rules or user data.
- When moving modules, update static and dynamic imports, test mocks, build constraints, helper scripts, and repository documentation links together. For each batch, run checks, tests, and builds for the affected apps. If a batch fails, revert it and keep earlier verified changes.

References: [Thinking in React](https://react.dev/learn/thinking-in-react), [Importing and Exporting Components](https://react.dev/learn/importing-and-exporting-components), [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect), and [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks).

## Internationalization

The app supports `zh-CN` and `en` through its own dictionaries and typed errors. It does not depend on UniFFI or Fluent.

### Locale Sources and Frontend Entry Points

- The web app's i18n entry point is [apps/web/src/i18n/index.ts](./apps/web/src/i18n/index.ts). Pure locale resolution, interpolation, and plural selection live in [locale.ts](./apps/web/src/i18n/locale.ts). The browser preference key is `huayu:language`. Its choices are `zh-CN`, `en`, and `system` (follow the browser). Selecting `system` removes the stored preference. An explicit choice takes priority; otherwise, match Chinese or English against the browser's language list and fall back to English if neither matches.
- The main dictionaries are [zh-CN.ts](./apps/web/src/i18n/locales/zh-CN.ts) and [en.ts](./apps/web/src/i18n/locales/en.ts). Give new copy a semantic `MessageKey` and add both translations with matching named interpolation parameters. For plurals, use `one`, `other`, and `count`. Missing translations fall back to Chinese, and unknown keys return an empty string. These fallbacks do not replace complete translations.
- In React components, use `useTranslations()` for the current scope's `{ locale, t }`. It reads `LocaleContext` first and subscribes to the app locale if no context is available. Use `useLocale()` when only the global locale is needed. Subscriptions respond to language selection, browser language changes, and storage changes from other tabs. Do not remount the editor to change its language.
- In non-React logic, use `getLocale()` for the app locale. Pass `locale` explicitly to logic that needs a scoped locale and bind the translator with `getTranslator(locale)` to avoid repeated placeholder arguments. An unbound `getTranslator()` reads the app locale each time its translator is called. Do not store translated strings at module initialization.
- The canvas's Excalidraw language is managed by [board-language.ts](./apps/web/src/features/canvas/excalidraw/board-language.ts) using the `huayu:board-language` preference key. In follow mode, it uses the app preference or browser language. The native canvas tools support their own set of languages; the app's card UI maps Chinese to `zh-CN` and all other languages to `en`. Attachments, exports, error messages, and default labels must use the canvas locale. `Editor.locale` is used only in the in-memory runtime and export context.
- The asset library has a scoped dictionary in [features/asset-library/messages.ts](./apps/web/src/features/asset-library/messages.ts). Access it through `at()` from `useAssetTranslations()`; `AssetMessageKey` constrains its keys. Its legacy Chinese keys are dictionary identifiers. Keep keys and interpolation parameters aligned across both languages.

### Rendering Copy, Status, and Errors

- Format dates and numbers with the effective `locale`. Use `formatDate()` or `formatNumber()` for global formatting. For scoped formatting, pass `locale` explicitly to `Intl` or `toLocale*`.
- Store business identifiers, translation keys, and parameters in state and translate them for display. This applies to model connection test results, form errors, upload status, and system folder labels. Do not keep the results of `t(...)` or `at(...)` in long-lived state, since they will not update when the language changes. Use the effective display locale when asynchronous operations finish.
- For system errors, use `LocalizedError` and `ErrorTranslation` from [i18n/errors.ts](./apps/web/src/i18n/errors.ts). For example, use `throw new LocalizedError({ key: "api.fileExceedsTheSizeLimit" })`. Do not use `new Error(t(...))`. Keep parameters that require translation, such as capability names, as nested translation references until display.
- Keep the error object or translation reference in memory. At render time, call `errorText(error, locale)` or `translatedErrorMessage(reference, locale)`. Do not read `error.message` and then store the string in state. A localized UI must pass its scoped `locale`. Error boundary UIs must also subscribe to locale changes.
- Persist a serializable `ErrorTranslation` in checkpoints and similar state. Validate it with `readErrorTranslation()` at the read boundary. Do not serialize `Error` objects directly. Existing read logic handles known literal messages from old checkpoints. New API errors must not depend on matching Chinese text. Keep unrecognized third-party details verbatim and do not treat them as translation keys.

### Rust API Error Contract

Business logic supplies an error code and parameters. Rust localizes the response for the request. The frontend maps the code to a translation reference and displays it in the UI's current locale.

- In business handlers, use `ErrorCode` and `ApiError` from [error.rs](./apps/api-rust/crates/huayu-server/src/error.rs). Do not write user-facing error copy in handlers. Maintain HTTP statuses, English and Chinese messages, and named parameters in the central error catalog. Use the actual business constants for limit values.
- The local API client [api/client.ts](./apps/web/src/api/client.ts) sends the app locale in `Accept-Language` by default and allows callers to override it. Direct requests for local API resources should also send an appropriate locale. Do not forward canvas or collaboration access headers from the local API to model services.
- [Rust i18n.rs](./apps/api-rust/crates/huayu-server/src/i18n.rs) handles business errors, early permission errors, and framework request rejections at the common response boundary. Preserve the original HTTP status and response headers such as `Allow`. Error bodies use `code`, `message`, and `params`; `code` and `params` are language-independent.

```json
{"code":"INVALID_NAME","message":"Names must contain 1–120 characters","params":{"min":1,"max":120}}
```

- The backend selects Chinese or English from each request's `Accept-Language`, including regional tags and `q` weights. When the header is missing or has no supported language, the backend defaults to Chinese. The web app's English fallback for unmatched browser languages is independent of this rule. Error responses include `Content-Language`, `Vary: Accept-Language`, and `Cache-Control: no-store`. Error responses to `HEAD` have no body.
- The frontend validates the error response once in [api/errors.ts](./apps/web/src/api/errors.ts) and converts `code` and `params` into a translation reference. Known errors do not rely on matching the literal `message`. For unknown codes, the frontend may display the server message. When adding or changing a backend error code, also update the frontend mapping, both dictionaries, contract tests, and the [API documentation](./docs/API.md). Keep internal diagnostics in logs and out of user-facing error responses.

### Content Boundaries and Verification

- Store language preferences in the browser. The API's negotiated locale applies only to the current request and is not written to server configuration, projects, templates, or databases. Changing the language does not rewrite user-supplied names, body text, code, references, existing work, or input being edited.
- Choose copy for built-in template metadata, new examples, and newly started generation tasks using the current locale. Preserve existing content in its original language. [modelPrompts()](./apps/web/src/ai/prompts/index.ts) selects prompts and appends a default output language instruction while honoring explicit language requests. Do not translate machine-readable identifiers such as JSON fields or action formats. Model connections and keys remain managed only by the browser.
- See [locale.test.ts](./apps/web/src/i18n/locale.test.ts), [errors.test.ts](./apps/web/src/i18n/errors.test.ts), [API error contract tests](./apps/web/src/api/errors.test.ts), and [Rust error localization tests](./apps/api-rust/crates/huayu-server/tests/error_localization.rs) for regression coverage. Keep checks passing for dictionary coverage, interpolation parameters, error code mappings, and prevention of premature translation of system errors.
- When changing display behavior, verify both languages, the scoped canvas locale, switching languages after an error appears, asynchronous completion, and checkpoint restoration. Confirm that user content stays unchanged. Follow [REVIEW.md](./REVIEW.md) for checks, relevant tests, and affected app builds. For API changes, also verify actual request headers, response headers, and error bodies.

## Code Review

- Before reviewing code or checking your own changes before a commit, read [REVIEW.md](./REVIEW.md) and follow any conventions specific to the directories being changed.
- Report which checks you ran, their results, and any risks they did not cover. Use the repository's PR template to record verification evidence, risks, and rollback steps.
