# CiteDocs production deployment (AWS)

Deployed 2026-10-16. **No secrets are stored in this repo.** All secrets live only in
`/opt/citedocs/.env` on the server (mode 600, root).

## Infrastructure (account 478170046831, eu-central-1)
| Resource | Value |
|---|---|
| Instance | `i-0c278b27cf7615305` (`citedocs-prod`), t3.medium, Ubuntu 24.04 x86_64, 40 GB gp3, 4 GB swapfile |
| Elastic IP | `63.186.117.58` |
| Security group | `sg-06481e4ccc389b006` (`citedocs-sg`): 22 from the admin IP only, 80/443 from anywhere |
| Key pair | `citedocs-key` (private key on the admin laptop: `~/.ssh/citedocs-key.pem`) |
| Hostname | `docs.sifirdanbire.com.tr` (Cloudflare, proxied, SSL mode **Full**) |

Rough cost: about $30/month for t3.medium on-demand, about $3.2 for 40 GB gp3, and $0 for the attached EIP (public IPv4 is about $3.6). Total: about $37/month plus traffic.

## Layout on the server
- `/opt/citedocs`: git checkout of `main`. Untracked deploy files are listed in `.git/info/exclude`:
  - `.env`: generated secrets (Postgres, MinIO, encryption key, WOPI secret, Collabora admin, basic auth)
  - `docker-compose.prod.yml`: override (secrets from .env, no host ports except Caddy, Collabora, WOPI, Caddy)
  - `deploy/Caddyfile` (the whole `deploy/` dir is mounted at /etc/caddy), `deploy/web.Dockerfile` (adds VITE_* build args)
- `/opt/citedocs-office`: minimal standalone WOPI host and file page (`deploy/office/` in this repo)

Copies of these files (secret-free) are in `deploy/` in this branch.

## Start / update
```bash
cd /opt/citedocs && git pull --ff-only
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Routing (Caddy, ports 80 and 443; 443 uses Caddy's internal CA, which is fine for Cloudflare "Full")
| Path | Upstream | Auth |
|---|---|---|
| `/browser/* /hosting/* /cool/* /lool/* /co/*` | collabora:9980 | none (WOPI access tokens protect documents) |
| `/wopi/*` | blocked (403); Collabora reaches WOPI internally at `http://wopi:8080` | |
| `/office/*` | wopi:8080 (standalone test page: file list, editor iframe, Zotero panel) | basic auth |
| `/api/*`, `/health` | server:3000 | public (app has its own signup/login, cookie sessions, CSRF) |
| `/collab*` | server:1234 (Hocuspocus WS) | public |
| `/` | web (nginx, Vite production build) | public |

Collabora: `aliasgroup1=http://wopi:8080`, `aliasgroup2=https://docs.sifirdanbire.com.tr:443`,
`server_name=docs.sifirdanbire.com.tr`, `ssl.enable=false`, `ssl.termination=true`, and caps `MKNOD, SYS_ADMIN`
(without them the jails fail and documents never load).

## Zotero
Collabora CODE 26.04 has a built-in Zotero plugin (References tab: Add/Edit Citation, Add/Edit Bibliography,
Refresh, Unlink, Citation style / Document preferences). It uses the zotero.org Web API key passed through WOPI
`CheckFileInfo.UserPrivateInfo.ZoteroAPIKey`. Enter the key once in the Zotero side panel on `/office/`; it is
stored server-side in the `office_files` volume. Then reopen the document.

## Auth / email
- Signup, login, sessions and CSRF come from the app (`/api/auth/*`). DB migrations run automatically when the server starts.
- **No SMTP is configured.** The server uses `ConsoleMailer`, so verification and reset links are only written to the server log:
  `sudo docker logs citedocs-server-1 2>&1 | grep -E "Verification URL|Reset URL"`
- `CLIENT_URL=https://docs.sifirdanbire.com.tr`, so the links point at the public host.

## Translation server
Built from source for amd64: `/opt/translation-server` (git clone --recurse-submodules) is used as the build context, giving image `citedocs/translation-server:local`.

## Known issues
- The `minio/minio` image is no longer pullable, so the community build `pgsty/minio` is used instead.
- Stock CODE has no Python UNO (no pyuno, no `share/Scripts`), so the `apps/collabora-scripts` `CallPythonScript` macro cannot run in it.
- SMTP has not been integrated yet (only the console mailer exists).

## Update 2026-10-17 (deployed main 99c938c)

### Routing / auth / cache
- `/` never renders the legacy TipTap demo: logged-out users are sent to `/login`, logged-in users to `/documents`.
- The documents page and the editor (`/editor?doc=<uuid>`) both require a login. Logged-out users go to `/login?next=...`, and after login or signup they are sent back to `next` (default `/documents`).
- The legacy TipTap demo is only at `/legacy-editor`, behind login.
- `public/sw.js` and `public/service-worker.js` are self-unregistering service workers, and `main.tsx` unregisters any existing service worker and clears CacheStorage.
- nginx sends `Cache-Control: no-cache, no-store, must-revalidate` for `index.html`, `sw.js` and SPA routes; `/assets/*` is cached as immutable.
- Cloudflare reports `cf-cache-status: DYNAMIC/BYPASS` for HTML, so no purge is needed (no Cloudflare API token on this host anyway).

### Signup
- There is no email verification step. Signup creates an already-verified account and logs the user straight in.

### Citations (real Zotero fields, no macros)
- `apps/web/src/collabora/zoteroUno.ts` drives Collabora through `Send_UNO_Command`, using the same UNO commands as Collabora's built-in Zotero support in .docx "Field" mode:
  - `.uno:TextFormField` inserts an `ADDIN ZOTERO_ITEM CSL_CITATION {json}` field.
  - `.uno:TextFormFields` with the prefix `ADDIN ZOTERO_ITEM CSL_CITATION` rewrites every citation in document order (restyle, edit, delete).
  - The `ADDIN ZOTERO_BIBL {...} CSL_BIBLIOGRAPHY` field is inserted at the end of the document and refreshed via `TextFormFields`.
  - Document prefs are stored as custom properties `ZOTERO_PREF_1..n` via `.uno:SetDocumentProperties`.
  - After every field insert or update, a `.uno:GoRight` moves the cursor out of the protected field result.
- `GET /api/documents/:id/citations` parses the saved .docx (fields and `ZOTERO_PREF`), so a reload restores the citation list, the bibliography and the style.
- Host messages:
  - `Host_PostmessageReady` is sent when Collabora reports `Frame_Ready`.
  - `Send_UNO_Command` arguments are passed unwrapped.
  - `Action_Save` sets `DontSaveIfUnmodified:false` and `Notify:true`.

### Collabora
- CODE ignores `welcome.enable=false`. The "Explore the new" dialog is suppressed by pre-seeding `localStorage.WSDWelcomeVersion` (Collabora runs on the same origin) from `/hosting/capabilities`.
- cool.html always gets an explicit `lang=` parameter. A browser with an unusable `navigator.language` used to make cool.html throw "Incorrect locale information provided" before it sent `load`. The document then only opened after Collabora's load timeout killed and retried the session; that was the ~128 s load. `per_document.limit_load_secs=20` is kept as a safety net.
- The editor sends the logged-in user's display name to Collabora.

---

## ONLYOFFICE Docs CE Production Variant (Without Collabora)

For deployments using ONLYOFFICE Docs Community Edition (AGPL v3) without Collabora CODE or WOPI containers:

### Files:
- Compose file: `deploy/docker-compose.prod.onlyoffice.yml`
- Caddy config: `deploy/Caddyfile.onlyoffice`
- Detailed guide: `docs/onlyoffice-production-and-e2e.md`

### To launch:
```bash
sudo docker compose -f deploy/docker-compose.prod.onlyoffice.yml up -d --build
```

### End-to-End Validation:
The student flow (signup, My Documents, create/open document in ONLYOFFICE, Zotero status, add by DOI, share as view/edit) can be verified automatically via Playwright:
```bash
BASE_URL=https://docs.sifirdanbire.com.tr pnpm test:e2e
```

### Verifying Periodic Force-Save (autoAssembly):
To confirm that Document Server has loaded the periodic force-save autoAssembly configuration in a running container:
```bash
docker exec citedocs-onlyoffice cat /etc/onlyoffice/documentserver/local.json | jq .services.CoAuthoring.autoAssembly
```
It should return:
```json
{
  "enable": true,
  "interval": "1m",
  "step": "1m"
}
```

### ONLYOFFICE Plugin & CDN Cache Control (Devir #049):
For ONLYOFFICE Zotero plugin and hook assets (`/oo/sdkjs-plugins/zotero/*`, `/oo/*/sdkjs-plugins/zotero/*`, `/oo/*zotero-sync-hook.js`, `api.js`, etc.), Caddy emits:
- `Cache-Control: no-cache, no-store, must-revalidate`
- `CDN-Cache-Control: no-store`
- `Cloudflare-CDN-Cache-Control: no-store`

This prevents Cloudflare Edge from caching plugin code or rewriting the downstream Cache-Control header via Cloudflare Browser Cache TTL (e.g. `max-age=14400`).

**Post-Deploy Cloudflare Cache Purge:**
Because Cloudflare edge may have cached older plugin versions under 1-year immutable TTL before deploy, the operator should purge Cloudflare edge cache after deploying #049:
- URL Purge: `https://docs.sifirdanbire.com.tr/oo/sdkjs-plugins/zotero/*`
- URL Purge: `https://docs.sifirdanbire.com.tr/oo/10.0.0-x/sdkjs-plugins/zotero/*`
- URL Purge: `https://docs.sifirdanbire.com.tr/oo/sdkjs-plugins/zotero/zotero-sync-hook.js`
- URL Purge: `https://docs.sifirdanbire.com.tr/oo/10.0.0-x/sdkjs-plugins/zotero/zotero-sync-hook.js`
*(or "Purge Everything" in the Cloudflare Dashboard under Caching -> Configuration).*


