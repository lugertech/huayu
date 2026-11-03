# Getting started

Huayu brings materials, generated work and your next edits onto one canvas. Start from a topic, build on an image, or turn a sentence from a recording into something new.

## Install and run

Install `vp` using the [Vite+ guide](https://viteplus.dev/guide/). Use Node.js 22.x starting at 22.18, 24.x starting at 24.11, or 26 and later, plus Rust 1.95. The project uses Vite+ 1.4.0; `vp install` uses the pinned pnpm 12.11.2. On Windows, run the repository commands in Git Bash. Install FFmpeg and ffprobe on PATH for efficient processing of long recordings.

Check `vp --version`, `node --version`, `rustc --version` and `cargo --version`. See the [official Rust installer](https://www.rust-lang.org/tools/install) if needed. An existing toolchain in a separate directory can be configured with `HUAYU_RUST_TOOLCHAIN_DIR` in a local `.env`; that directory contains `.cargo/` and `.rustup/`. Do not commit machine-specific paths.

From the source repository root:

```sh
vp install --frozen-lockfile
vp run dev
```

Open [Huayu locally](http://127.0.0.1:5173). The first startup creates the local database; no cloud storage or separate database server is required. Development uses port 5173 for the interface and 5858 for the API. Both processes must be running.

To use a production build:

```sh
vp run build
vp run start
```

Open [the built application](http://127.0.0.1:5858). Installing dependencies and the first Rust compilation require internet access. Once built, ordinary canvas editing does not need a model service.

## Choose a language

The application and official site support English and Simplified Chinese. On a first visit, the browser’s preferred languages determine the default; unsupported languages fall back to English. Choose a language in **Settings → General → Language**. A manual choice takes precedence and is remembered in the current browser. Choose **Browser default** to follow the browser again.

The site has its own language control in the header. Direct English documentation links remain in English. Settings on different origins or ports are independent. Changing language does not translate your existing projects, prompts, transcripts or generated works.

## Your first creation

1. Open the writing example, or create a blank project and add text.
2. In **Settings → Model connections**, configure text generation. Enter an API root URL such as `http://localhost:11434/v1` and the exact model ID provided by your service.
3. Select text on the canvas, choose **Create from this**, and describe what you want.
4. Choose **Start creating**. Open the finished work to read, edit, or describe a new version.

New versions retain the original and show their source through a connection. Use the previous-version control or version list to return. After a failure or stop, adjust your instructions and continue; existing work stays available.

## Use without a model

Drawing, organizing materials, importing images, editing existing works and project export work without model configuration. AI generation, transcription and analysis require the corresponding service. See [Model connections](./MODEL_SETUP.md).

## Save your work

Canvas edits save automatically to the local service. Check the save status before stopping the service. During interruptions, the browser keeps recovery edits and retries when the service returns.

Choose **Export → Export project file** for a complete `.huayu.json` with the canvas and attachments. PNG and SVG are useful for sharing a view, but do not replace a full backup. See [Deployment and backups](./DEPLOYMENT.md).

Continue with [Canvas and works](./USER_GUIDE.md), [Recordings and analysis](./RECORDING_GUIDE.md), or [Troubleshooting](./TROUBLESHOOTING.md).
