# Security

Huayu currently targets local personal use. It binds to `127.0.0.1` by default and has no accounts, tenant isolation or public access control. Collaboration links manage link access within one instance; they do not isolate the project list by user.

Do not expose the local API directly to the internet. Remote use requires a controlled network, external authentication, TLS, access restrictions and backups.

Model configuration stays in the current browser. Selected materials go directly to the configured service; choosing a remote model does not keep inference local. Use a local model service when necessary. Never include keys in projects, examples, screenshots, feedback or exports.

## Reporting a vulnerability

The public repository has not been established, and no private reporting destination has been verified yet. Before public release, maintainers must enable private vulnerability reporting and document its real destination here. Once enabled, use **Security → Report a vulnerability**. Do not publish immediately exploitable details, credentials or private content in a public issue.

Provide affected versions, minimal reproduction, impact and redacted evidence. Maintainers should reproduce, establish scope, and coordinate fixes and disclosure. No response SLA is promised before this process exists.
