<p align="center"><a href="SELF-HOSTING.md">🇬🇧 English</a> | 🇹🇷 Türkçe</p>

# CiteDocs'u kendi sunucunda çalıştırma

Bu rehber, üretim yığınını (ONLYOFFICE sürümü) `deploy/docker-compose.prod.onlyoffice.yml` ile çalıştırır.

## Gereksinimler
- Docker ve Docker Compose eklentisi kurulu bir Linux sunucu. 2 vCPU / 4 GB RAM makul bir alt sınırdır (swap ekleyin); en ağır servis ONLYOFFICE'tir.
- Sunucuya yönlendirilmiş bir alan adı (80 ve 443 portları açık).

## Servisler
| Servis | Görevi |
|---|---|
| `caddy` | Ters vekil sunucu ve TLS (`deploy/Caddyfile.onlyoffice`) |
| `web` | Ön yüz (`VITE_EDITOR_BACKEND=onlyoffice` ile derlenir) |
| `server` | Fastify API, kimlik doğrulama, belge depolama, Zotero proxy |
| `postgres` | Veritabanı |
| `minio` | S3 uyumlu belge/ek depolama |
| `translation-server` | Zotero künye sorgulama (DOI/ISBN/PMID/URL) |
| `onlyoffice` | Zotero eklentili ONLYOFFICE Docs CE |

## 1. Yapılandırma
`deploy/.env` dosyasını oluşturun (asla commit'lemeyin; izinleri `chmod 600` olsun):

```bash
PUBLIC_HOST=docs.ornek.edu.tr
POSTGRES_PASSWORD=<güçlü rastgele parola>
MINIO_ROOT_USER=<minio yönetici kullanıcı adı>
MINIO_ROOT_PASSWORD=<güçlü rastgele parola>
ENCRYPTION_KEY=<64 onaltılık karakter, ör. openssl rand -hex 32>
ONLYOFFICE_JWT_SECRET=<güçlü rastgele anahtar>

# İsteğe bağlı: tek tıkla "Zotero'yu bağla" (https://www.zotero.org/oauth/apps adresinden uygulama kaydedin)
ZOTERO_OAUTH_CLIENT_KEY=
ZOTERO_OAUTH_CLIENT_SECRET=
```

`deploy/Caddyfile.onlyoffice`, site adresi olarak `{$PUBLIC_HOST:docs.sifirdanbire.com.tr}` ve `tls internal` kullanır (önünde Cloudflare, SSL modu *Full* olduğunu varsayar). Caddy konteynerine `PUBLIC_HOST` aktarılmadığı için varsayılan adresi kendi alan adınızla değiştirin. Cloudflare arkasında **değilseniz**, Caddy'nin Let's Encrypt sertifikası alması için `tls internal` bloğunu kaldırın.

## 2. Başlatma
```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.onlyoffice.yml up -d --build
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.onlyoffice.yml ps
```
Sunucu `GET /health` uç noktasını sunar.

## 3. Güncelleme
```bash
git pull --ff-only
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.onlyoffice.yml up -d --build
```

## Yedekleme ve kapasite
- Yedekleme/geri yükleme betikleri: [`deploy/backup/`](../deploy/backup) ve [docs/BACKUP.md](BACKUP.md).
- ONLYOFFICE CE aynı anda **20 editöre** izin verir. Bkz. [docs/CAPACITY.md](CAPACITY.md).

ONLYOFFICE ayrıntıları: [docs/onlyoffice-production-and-e2e.md](onlyoffice-production-and-e2e.md).
