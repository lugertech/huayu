# Deployment and backups

## Run locally

The current version targets personal use on one local instance. See [Getting started](./GETTING_STARTED.md) and the verified scope in [Release checklist](./RELEASE.md). Unverified platforms are not a support promise.

```sh
vp install --frozen-lockfile
vp run build
vp run start
```

The Rust service serves both the API and frontend at `http://127.0.0.1:5858`. Stop the previous process and back up data before building and starting another version.

## Configuration

Copy `.env.example` to `.env` if needed. The startup scripts read the root `.env`. Never add model credentials there.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HUAYU_HOST` | `127.0.0.1` | Bind address |
| `HUAYU_PORT` | `5858` | Service port |
| `HUAYU_DATA_DIR` | `var/dev` | Database and attachments |
| `HUAYU_WEB_DIR` | `apps/web/dist` | Frontend build directory |
| `RUST_LOG` | `huayu_server=info,tower_http=warn` | Local logging |

Relative paths are based on the repository root. When launching the binary directly, set environment variables yourself and check the working directory or use appropriate paths.

The development launcher and Web proxy share `HUAYU_HOST` and `HUAYU_PORT`: values in the root `.env` take precedence, followed by the process environment and then the defaults above. Restart development processes after changing them; the `/api`, `/uploads` and WebSocket proxies follow automatically. Development requires a port from 1 to 65535. Wildcard bind addresses use the corresponding loopback address as the proxy target.

Browser connections, language choices and drafts belong to an origin. Moving files or changing ports does not transfer browser data. Configure connections again at the new origin.

## Local-network collaboration

The default `127.0.0.1` address only accepts local access. To let other computers on the same local network collaborate, use the computer hosting Huayu:

1. Build as above and stop the old service.
2. Set `HUAYU_HOST` in the root `.env` to that computer's specific local-network IP. Keep the existing data directory.
3. Run `vp run start`. Allow the port only for the intended trusted devices in the system firewall.
4. Both people open `http://192.168.1.20:5858`, replacing the example IP with the host's actual address. Open the original canvas at that address before copying its collaboration link.

```dotenv
HUAYU_HOST=192.168.1.20
HUAYU_PORT=5858
HUAYU_DATA_DIR=var/dev
HUAYU_WEB_DIR=apps/web/dist
```

Use a specific IP rather than `0.0.0.0`: the service validates the request address, and wildcard binding does not permit arbitrary hosts. Do not forward the service to the public internet. Participants share one instance; independently started services do not synchronize with each other. Update the configuration and link if the host's IP changes.

See [Multiplayer collaboration](./USER_GUIDE.md#multiplayer-collaboration) for invitations and editing. A model service must also be reachable from the browser running its steps; `localhost` on another computer does not point to the Huayu host. Local-network HTTP supports canvas collaboration, but screen capture and other secure-context browser features still require a local origin or an appropriate HTTPS deployment.

## Back up and restore

Keep both `HUAYU_DATA_DIR/huayu.sqlite3` and the entire `HUAYU_DATA_DIR/assets/` directory. The simplest backup is to stop the service and copy the complete data directory. For a running instance, use SQLite’s backup API and separately preserve attachments; do not copy a live database while ignoring its WAL.

Stop the service before restoring. Put the database and attachments back together and start the corresponding application version. Verify projects, recordings, attachments and exports in an independent directory before switching daily use to the restored data.

Project exports support individual project transfer. They do not replace a full-instance or recording-library backup. Browser model settings and unsaved drafts are separate.

## Official site and docs

The independent static site is in `apps/site`; it requires neither the application API nor a database.

```sh
vp run dev:site
vp run build:site
vp run preview:site
```

Development and preview use `http://127.0.0.1:5863`. Deploy `apps/site/dist/` to a static host. Home and documentation routes are prerendered HTML, including English under `/en/`; direct refresh does not need an SPA fallback. The first home-page visit detects browser language, and manual language choices are remembered. Links retain the selected language.

| Build variable | Purpose |
| --- | --- |
| `SITE_BASE` | Absolute path prefix ending in `/`; default `/`, for example `/huayu/` |
| `VITE_PUBLIC_REPOSITORY_URL` | Real public repository URL; unset hides the source link |
| `VITE_PUBLIC_SITE_URL` | Official site URL for canonical links, language alternates and sitemap |

Use real public URLs before publishing, then verify docs, images, metadata, language switching and mobile layouts. Never place local model URLs or private content in build variables.

## Access boundaries

The service computer manages the workspace. Other devices need a valid collaboration link and can edit only its canvas. The independent collaborator interface excludes project lists, the global asset library, recordings and project/share management. Management access is determined by the connection originating from the service computer, not by an account or tenant system; direct workspace access on that computer remains privileged.

The development proxy forwards the client address. Other reverse proxies must supply a trustworthy `X-Forwarded-For` instead of disguising remote requests as local traffic. Do not expose the API directly to the internet. Public deployments still need external authentication, TLS, access control and maintenance. Publishing the independent static site does not expose local projects.
