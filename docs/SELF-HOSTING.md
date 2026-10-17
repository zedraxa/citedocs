<p align="center">🇬🇧 English | <a href="SELF-HOSTING.tr.md">🇹🇷 Türkçe</a></p>

# Self-hosting CiteDocs

This guide runs the production stack (ONLYOFFICE variant) from `deploy/docker-compose.prod.onlyoffice.yml`.

## Requirements
- A Linux server with Docker and the Docker Compose plugin. 2 vCPU / 4 GB RAM is a workable minimum (add swap); ONLYOFFICE is the heaviest service.
- A domain name pointing to the server (ports 80 and 443 open).

## Services
| Service | Role |
|---|---|
| `caddy` | Reverse proxy and TLS (`deploy/Caddyfile.onlyoffice`) |
| `web` | Frontend (built with `VITE_EDITOR_BACKEND=onlyoffice`) |
| `server` | Fastify API, auth, document storage, Zotero proxy |
| `postgres` | Database |
| `minio` | S3-compatible document/attachment storage |
| `translation-server` | Zotero metadata lookup (DOI/ISBN/PMID/URL) |
| `onlyoffice` | ONLYOFFICE Docs CE with the Zotero plugin |

## 1. Configure
Create `deploy/.env` (never commit it; keep it `chmod 600`):

```bash
PUBLIC_HOST=docs.example.edu
POSTGRES_PASSWORD=<strong random password>
MINIO_ROOT_USER=<minio admin user>
MINIO_ROOT_PASSWORD=<strong random password>
ENCRYPTION_KEY=<64 hex characters, e.g. from: openssl rand -hex 32>
ONLYOFFICE_JWT_SECRET=<strong random secret>

# Optional: one-click "Connect Zotero" (register an app at https://www.zotero.org/oauth/apps)
ZOTERO_OAUTH_CLIENT_KEY=
ZOTERO_OAUTH_CLIENT_SECRET=
```

`deploy/Caddyfile.onlyoffice` uses `{$PUBLIC_HOST:docs.sifirdanbire.com.tr}` as its site address and `tls internal` (it expects Cloudflare in front, SSL mode *Full*). The Caddy container does not receive `PUBLIC_HOST`, so replace the default host with your domain. If you are **not** behind Cloudflare, remove the `tls internal` block so Caddy gets a Let's Encrypt certificate.

## 2. Start
```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.onlyoffice.yml up -d --build
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.onlyoffice.yml ps
```
The server exposes `GET /health`.

## 3. Update
```bash
git pull --ff-only
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.onlyoffice.yml up -d --build
```

## Backups and capacity
- Backup/restore scripts: [`deploy/backup/`](../deploy/backup) and [docs/BACKUP.md](BACKUP.md).
- ONLYOFFICE CE allows **20 simultaneous editors**. See [docs/CAPACITY.md](CAPACITY.md).

More ONLYOFFICE details: [docs/onlyoffice-production-and-e2e.md](onlyoffice-production-and-e2e.md).
