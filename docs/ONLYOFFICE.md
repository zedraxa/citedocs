# ONLYOFFICE integration

My Documents opens `/editor?doc=…` in ONLYOFFICE by default. Collabora remains
opt-in via `VITE_EDITOR_BACKEND=collabora` or `?editor=collabora`, and its Docker
services remain in the `collabora` profile.

The config route requires an authenticated session outside tests. Repository
ownership and explicit shares (including email invitations) determine permissions:
owner/editor can edit, comment and review; viewer and unknown roles are read-only.
The editor user ID and name come from the session, not browser-supplied identity.

`ONLYOFFICE_JWT_SECRET` must match Document Server's JWT secret. Configs are signed
with HS256; inbound tokens enforce HS256, signature, expiration and not-before.
File links expire after 12 hours. Callback links bind the file, opener, email and
ONLYOFFICE document key. Save callbacks recheck the opener's current access and
use only JWT-authenticated fields, accepting either a body token or the Document
Server Authorization token's `payload`.

Statuses 2 and 6 write through the existing WopiStorage adapter (S3/MinIO in the
production compose setup) and update document size/time. Other recognized statuses
are acknowledged without downloading. Missing binaries are reported, never
replaced with blank documents. Failed downloads/storage writes return `{error:1}`.
Only the configured Document Server origin is fetched; redirects are refused.
Public `/oo` URLs are mapped to `ONLYOFFICE_INTERNAL_URL` using `PUBLIC_URL` and
`ONLYOFFICE_PUBLIC_URL`, never an arbitrary callback host.

Automatic force-save and periodic assembly are enabled in the editor and Document Server:
- `editorConfig.customization.autosave: true` continuously syncs in-memory changes.
- `editorConfig.customization.forcesave: true` exposes the Save button/Ctrl+S trigger
  and instructs Document Server to emit status 6 force-save callbacks periodically and on demand.
  This is appropriate and expected for CiteDocs' Google Docs-grade cloud persistence: users do not
  risk losing work if a browser crashes or network drops before the editing session closes.
- Session key stability is maintained by `OnlyofficeSessionManager`: status 6 force-saves update
  the file in MinIO/S3 without altering the active session key. Concurrent collaborators and page
  reloads continue to share the exact same key during a live session, preventing "document changed"
  errors. Only after status 2 (session closed) or status 4 is the session key rotated for the next session.
- Document Server periodic force-save is enabled via `services.CoAuthoring.autoAssembly`
  (`enable: true`, `interval: "1m"`, `step: "1m"`). This is baked into `deploy/onlyoffice.Dockerfile`
  via `deploy/docker-entrypoint-onlyoffice.sh`, updating `/etc/onlyoffice/documentserver/local.json`
  and `/etc/onlyoffice/documentserver/local-production-linux.json` at container boot while preserving
  all JWT settings. The interval is configurable via `OO_AUTOASSEMBLY_INTERVAL` (default `1m`).
- Status 6 deduplication: repeated callbacks with identical content (e.g. autoAssembly with no new edits)
  are SHA-256 hash-checked and acknowledged without writing redundant storage versions.
- Quota accounting: document saves check user storage quota using replacement semantics
  (`replacedDocBytes: doc.fileSize`), preventing double-counting while strictly enforcing user limits.

To verify `autoAssembly` in a running container:
```bash
docker exec citedocs-onlyoffice cat /etc/onlyoffice/documentserver/local.json | jq .services.CoAuthoring.autoAssembly
# or
docker exec citedocs-onlyoffice cat /etc/onlyoffice/documentserver/local-production-linux.json | jq .services.CoAuthoring.autoAssembly
```
Expected output:
```json
{
  "enable": true,
  "interval": "1m",
  "step": "1m"
}
```


The compose build installs the official Zotero plugin from a pinned source commit
on the same origin as `/oo`. `pluginsData` loads that copy and `autostart` opens its
inside-mode left panel for editable word documents. The upstream plugin does not
support viewer mode. A Zotero credential service outage does not prevent editing;
stale local plugin credentials are cleared before the editor starts.

Upstream contracts:
- https://api.onlyoffice.com/docs/docs-api/usage-api/config/editor/plugins/
- https://github.com/ONLYOFFICE/onlyoffice.github.io/blob/f3263c055c25875874004463b46c2e6a7000a9fd/sdkjs-plugins/content/zotero/config.json

Before a future rollout, close existing editor sessions: old callback link
signatures are intentionally incompatible. Build the custom Document Server image
along with the app. This change has unit coverage, but a live Document Server +
MinIO browser smoke test is still required to verify installation and panel layout;
no deployment is performed by the test suite.
