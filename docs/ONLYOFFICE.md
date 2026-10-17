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

Automatic force-save is disabled in the editor config: a force-save changes the
storage version while the editing session is still active, which would give new
joiners a different document key. Normal editor autosave remains enabled and
status 2 persists the finished session. Status 6 is supported for explicit server
callbacks, but server-side periodic force-save should remain disabled until shared,
durable active-session key tracking is implemented.

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
