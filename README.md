# Huayu 画语

English · [简体中文](./README_CN.md)

Huayu is a local AI canvas. Connect notes and images to instructions, generate text, images, or web pages, and edit the results on the same canvas.

## Quick start

Install [Vite+, Node.js, and Rust](./docs/en/GETTING_STARTED.md#install-and-run), then run these commands from the repository root.

```sh
vp install --frozen-lockfile
vp run build
vp run start
```

Open <http://127.0.0.1:5858> and try a built-in example. You can draw, edit, and export without a model connection. For AI generation or transcription, add a service in **Settings → Models and tools**.

To import PDFs, DOCX files or workbooks, [install the document parsing dependencies](./docs/en/DEPLOYMENT.md#document-parsing) on the machine running Huayu.

Projects and recordings are saved on the machine running Huayu. Model settings and API keys are stored only in your browser. When you use a remote model, the browser sends the selected inputs directly to that service.

## What you can do

- **Canvas workflows.** Draw and arrange materials on a blank canvas or start from a template. Run a single step or a connected workflow.
- **Work from recordings.** Record your screen or import audio or video. Transcribe recordings and bring excerpts onto the canvas with links to their timestamps.
- **Collaborate and export.** Invite others on your local network to edit a canvas together. Export a complete project with attachments, or save the canvas as PNG or SVG.

## Guides

[Canvas](./docs/en/USER_GUIDE.md) · [Model connections](./docs/en/MODEL_SETUP.md) · [Recordings](./docs/en/RECORDING_GUIDE.md) · [Deployment and backups](./docs/en/DEPLOYMENT.md) · [Troubleshooting](./docs/en/TROUBLESHOOTING.md) · [Contributing](./docs/en/CONTRIBUTING.md)

## License

Huayu’s own code and documentation use the [MIT License](./LICENSE). See [Licensing](./docs/en/LICENSING.md) and [Third-party notices](./docs/en/THIRD_PARTY_NOTICES.md) for the applicable terms and acknowledgments.
