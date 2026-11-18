# Getting started

Huayu brings materials, generated work and your next edits onto one canvas. Start from a topic, build on an image, or turn a sentence from a recording into something new.

## Install and run

Install `vp` using the [Vite+ guide](https://viteplus.dev/guide/). Use Node.js 22.x starting at 22.18, 24.x starting at 24.11, or 26 and later, plus Rust 1.95. The project uses Vite+ 1.6.0. `vp install` uses the pinned pnpm 12.11.2. On Windows, run the repository commands in Git Bash. Install FFmpeg and ffprobe on PATH for efficient processing of long recordings.

Check `vp --version`, `node --version`, `rustc --version` and `cargo --version`. See the [official Rust installer](https://www.rust-lang.org/tools/install) if needed. An existing toolchain in a separate directory can be configured with `HUAYU_RUST_TOOLCHAIN_DIR` in a local `.env`; that directory contains `.cargo/` and `.rustup/`. Do not commit machine-specific paths.

From the source repository root:

```sh
vp install --frozen-lockfile
vp run dev
```

Open [Huayu locally](http://127.0.0.1:5173). The first startup creates the local database; no cloud storage or separate database server is required. Development uses port 5173 for the interface and 5858 for the API. Both processes must be running.

These are defaults. After changing `HUAYU_HOST` or `HUAYU_PORT` in the root `.env`, restart development processes; the frontend proxy follows the API configuration. See [deployment configuration](./DEPLOYMENT.md).

To use a production build:

```sh
vp run build
vp run start
```

Open [the built application](http://127.0.0.1:5858). Installing dependencies and the first Rust compilation require internet access. Once built, ordinary canvas editing does not need a model service.

PDF, DOCX, XLS, XLSX and ODS imports require the local document parsing dependencies. UTF-8 text imports work with the base installation. [Document parsing setup](./DEPLOYMENT.md#document-parsing)

## Choose a language

The application supports English and Simplified Chinese. On a first visit, the browser’s preferred languages determine the default; unsupported languages fall back to English. Choose a language in **Settings → General → Language**. A manual choice takes precedence and is remembered in the current browser. Choose **Browser default** to follow the browser again.

Changing language does not translate your existing projects, prompts, transcripts or generated works.

## Your first creation

1. If you have yet to set up a model, Huayu opens **Model connections** on your first workspace visit. Configure text generation, or choose **Set up later** to continue. Return anytime from **Settings → Model connections**.
2. On the Projects page, choose **Inspired writing**, or select **Create new project** to open a blank canvas and add text.
3. Add an instruction component, write your request and connect the text material to it.
4. Click Run at the instruction component's top right. The result appears in a connected text component.

Connections link creation steps to their source materials. After a failure or stop, update the instructions on the node and run it again.

## Use without a model

Drawing, organizing materials, importing images, editing existing works and project export work without model configuration. AI generation, transcription and analysis require the corresponding service. See [Model connections](./MODEL_SETUP.md).

## Save your work

Canvas edits save automatically to the local service in the background, without a persistent save label. Connection or saving problems appear at the bottom right with a retry action. Resolve those warnings before closing the page or stopping the service.

Choose **Export → Export project file** for a complete `.huayu.json` with the canvas and attachments. PNG and SVG are useful for sharing a view, but do not replace a full backup. See [Deployment and backups](./DEPLOYMENT.md).

Continue with [Canvas and works](./USER_GUIDE.md), [Recordings and analysis](./RECORDING_GUIDE.md), or [Troubleshooting](./TROUBLESHOOTING.md).
