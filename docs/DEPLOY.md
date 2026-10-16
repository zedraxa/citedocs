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
  - `deploy/Caddyfile`, `deploy/web.Dockerfile`, `deploy/server.Dockerfile`
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
| `/office/*` | wopi:8080 (file list, new/upload, editor iframe, Zotero panel) | basic auth |
| `/api/*`, `/health` | server:3000 | basic auth |
| `/collab*` | server:1234 (Hocuspocus WS) | basic auth |
| `/` | web (nginx, Vite production build) | basic auth |

Collabora: `aliasgroup1=http://wopi:8080`, `aliasgroup2=https://docs.sifirdanbire.com.tr:443`,
`server_name=docs.sifirdanbire.com.tr`, `ssl.enable=false`, `ssl.termination=true`, and caps `MKNOD, SYS_ADMIN`
(without them the jails fail and documents never load).

## Zotero
Collabora CODE 26.04 has a built-in Zotero plugin (References tab: Add/Edit Citation, Add/Edit Bibliography,
Refresh, Unlink, Citation style / Document preferences). It uses the zotero.org Web API key passed through WOPI
`CheckFileInfo.UserPrivateInfo.ZoteroAPIKey`. Enter the key once in the Zotero side panel on `/office/`; it is
stored server-side in the `office_files` volume. Then reopen the document.

## Known issues
- `zotero/translation-server:latest` on Docker Hub is arm64-only, so the container is stopped. Build it from source for amd64 if needed.
- The `minio/minio` image is no longer pullable, so the community build `pgsty/minio` is used instead.
- Stock CODE has no Python UNO (no pyuno, no `share/Scripts`), so the `apps/collabora-scripts` `CallPythonScript` macro cannot run in it.
- The repo Dockerfiles do not build workspace packages first. `deploy/*.Dockerfile` build `packages/*` first, and the web
  build falls back to `vite build` if `tsc` fails.
