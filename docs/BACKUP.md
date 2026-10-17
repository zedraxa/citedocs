# CiteDocs Yedekleme ve Kurtarma Kılavuzu (BACKUP.md)

CiteDocs (https://docs.sifirdanbire.com.tr), üniversite öğrencilerine yönelik web tabanlı akademik kelime işlemci (ONLYOFFICE Docs Community Edition + Zotero) platformudur. Bu kılavuz; sunucu arızası, disk bozulması veya veri merkezi felaketlerinde öğrencilerin tez, makale ve kaynakça verilerinin **asla kaybolmamasını** sağlayan üretim seviyesindeki yedekleme ve geri yükleme altyapısını açıklar.

---

## 1. Neler Yedeklenir?

CiteDocs yedekleme sistemi (`citedocs-backup.sh`), platformun durum (state) içeren iki temel katmanını atomik olarak arşivler:

### 1.1 PostgreSQL 16 İlişkisel Veritabanı
- **Kapsam:** Drizzle ORM şemasına ait tüm tablolar ve ilişkiler:
  - `users`: Öğrenci hesapları, kimlik doğrulama verileri ve profil kayıtları.
  - `documents`: Belge başlıkları, sahiplikler, Yjs CRDT ikili durumları, CSL stil seçimleri ve belge tercihleri.
  - `document_shares`: Ortak çalışma ve erişim yetkilendirme kayıtları.
  - `library_items`: Zotero uyumlu kütüphane kaynakları (DOI, başlık, yazar, meta veriler).
  - `pdf_annotations`: PDF okuyucu üzerindeki öğrenci vurguları ve notları.
- **Yedekleme Formatı:** `pg_dump -F c` (PostgreSQL Custom Format). Sıkıştırılmış, meta verileri içeren ve `pg_restore` ile hem tam hem seçici geri yüklemeye izin veren güvenli endüstri standardı format.

### 1.2 S3 / MinIO Nesne Depolama Kovaları (Buckets)
- **`citedocs-documents`:** ONLYOFFICE Docs Community Edition tarafından `autoAssembly` mekanizmasıyla periyodik olarak kaydedilen güncel öğrenci `.docx` dosyaları.
- **`citedocs-attachments`:** Öğrencilerin referans olarak kütüphanelerine ekledikleri akademik PDF dosyaları ve ekler.
- **Yedekleme Yöntemi:** Depolama API'si üzerinden (`aws s3 sync` veya `mc mirror`) doğrudan nesne düzeyinde yedekleme. MinIO dahili dosya formatlarından bağımsız, saf ve taşınabilir `.docx`/`.pdf` nesneleri olarak saklanır.

### 1.3 Arşiv Bütünlüğü ve Meta Veri
Her arşiv paketi (`citedocs-backup-YYYYMMDD_HHMMSS.tar.gz`) içinde şunlar yer alır:
- `postgres.dump`: Veritabanı dökümü.
- `storage/`: Kova ve nesne dizin ağacı.
- `metadata.json`: Zaman damgası, platform versiyonu, git commit hash'i, tablo ve nesne sayıları.
- `sha256sums.txt`: Arşiv içerisindeki tüm dosyaların kriptografik SHA-256 sağlama toplamı.
- `${archive}.sha256`: Dış tarball dosyasının doğrulanabilir SHA-256 özeti.

---

## 2. Sunucuya Kurulum (Production Server)

Üretim sunucusunda (`/opt/citedocs`), yedekleme süreci cron veya systemd timer üzerinden otomatik çalıştırılır.

### 2.1 Hazırlık ve Yetkiler
Yedekleme araçları `deploy/backup/` dizinindedir:
```bash
cd /opt/citedocs
chmod +x deploy/backup/citedocs-backup.sh deploy/backup/citedocs-restore.sh
sudo mkdir -p /opt/citedocs/backups
sudo chmod 700 /opt/citedocs/backups
```

### 2.2 Yöntem A: Cron ile Kurulum (Önerilen)
Her gün saat **03:30 (Europe/Istanbul - UTC+3)** çalışacak cron görevi:

1. Örnek cron dosyasını `/etc/cron.d/` dizinine kopyalayın:
   ```bash
   sudo cp deploy/backup/citedocs-backup.cron /etc/cron.d/citedocs-backup
   sudo chown root:root /etc/cron.d/citedocs-backup
   sudo chmod 0644 /etc/cron.d/citedocs-backup
   ```
2. Log dosyasını oluşturun:
   ```bash
   sudo touch /var/log/citedocs-backup.log
   sudo chmod 0640 /var/log/citedocs-backup.log
   ```
3. Log akışını izlemek için:
   ```bash
   tail -f /var/log/citedocs-backup.log
   ```

### 2.3 Yöntem B: Systemd Timer ile Kurulum (Alternatif)
Systemd timer kullanmak isterseniz:

1. Servis ve timer birimlerini kopyalayın:
   ```bash
   sudo cp deploy/backup/citedocs-backup.service /etc/systemd/system/
   sudo cp deploy/backup/citedocs-backup.timer /etc/systemd/system/
   ```
2. Servisi etkinleştirin ve başlatın:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now citedocs-backup.timer
   ```
3. Zamanlayıcı durumunu kontrol edin:
   ```bash
   systemctl list-timers citedocs-backup.timer
   sudo journalctl -u citedocs-backup.service -f
   ```

### 2.4 Ortam Değişkenleri ve Konfigürasyon
`/opt/citedocs/.env` dosyasında şu değişkenler yapılandırılabilir:

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `BACKUP_DIR` | `/opt/citedocs/backups` | Yedek arşivlerinin yazılacağı yerel dizin. |
| `MIN_FREE_DISK_MB` | `2048` | Yedek öncesi gereken minimum boş disk alanı (MB). Altına düşerse işlem reddedilir. |
| `RETENTION_DAILY` | `7` | Saklanacak günlük yedek sayısı. |
| `RETENTION_WEEKLY` | `4` | Saklanacak haftalık yedek sayısı. |
| `BACKUP_S3_URI` | *(boş)* | İsteğe bağlı uzak S3 hedefi (örn. `s3://citedocs-offsite-backup/production/`). Boşsa atlanır. |

---

## 3. Geri Yükleme Prosedürü (Restore)

### 3.1 Zararsız Önizleme (`--dry-run`)
Herhangi bir veriye dokunmadan yedeğin bütünlüğünü, içerdiği tabloları ve nesneleri incelemek için:
```bash
sudo /opt/citedocs/deploy/backup/citedocs-restore.sh --latest --dry-run
```
veya belirli bir arşiv için:
```bash
sudo /opt/citedocs/deploy/backup/citedocs-restore.sh --archive /opt/citedocs/backups/citedocs-backup-20261017_033000.tar.gz --dry-run
```

### 3.2 Canlı Sisteme Geri Yükleme
> [!WARNING]
> Geri yükleme işlemi, aktif PostgreSQL veritabanındaki ve depolama kovalarındaki mevcut verileri arşivdeki verilerle değiştirir.

1. **Etkileşimli Mod (Onay Sorarak):**
   ```bash
   sudo /opt/citedocs/deploy/backup/citedocs-restore.sh --latest
   ```
   Komut terminalde kırmızı bir uyarı basar ve sizden açıkça `yes` yazmanızı ister.
2. **Otomasyon Modu (`--yes` ile teyitli):**
   ```bash
   sudo /opt/citedocs/deploy/backup/citedocs-restore.sh --latest --yes
   ```

### 3.3 Sıfırdan Felaket Kurtarma (Disaster Recovery - Yeni Sunucuya Geçiş)
Sunucu donanımı tamamen yandığında veya yeni bir EC2 örneğine geçildiğinde:
1. Yeni sunucuyu ayağa kaldırın ve depoyu çekin:
   ```bash
   git clone https://github.com/.../citedocs.git /opt/citedocs
   cd /opt/citedocs
   ```
2. `.env` dosyasını oluşturun ve konteynerleri başlatın:
   ```bash
   sudo docker compose -f deploy/docker-compose.prod.onlyoffice.yml up -d
   ```
3. Uzak S3 veya güvenli harici konumdaki yedeği indirin:
   ```bash
   aws s3 cp s3://citedocs-offsite-backup/production/citedocs-backup-20261017_033000.tar.gz /opt/citedocs/backups/
   ```
4. Geri yüklemeyi başlatın:
   ```bash
   sudo /opt/citedocs/deploy/backup/citedocs-restore.sh --latest --yes
   ```
5. Servislerin ayağa kalktığını doğrulayın (`curl http://127.0.0.1:3000/health`).

---

## 4. Geri Yükleme Doğrulaması (Restore Verification)

### 4.1 İzolasyonlu Doğrulama Modu (`--verify`)
Canlı çalışan sisteme ve veritabanına **hiçbir zarar vermeden**, yedeğin gerçekten çalışıp çalışmadığını test etmek için `--verify` modu kullanılır.

Bu mod:
1. Geçici bir Docker köprü ağı (`citedocs-net-verify-...`) oluşturur.
2. İzole, geçici throwaway PostgreSQL ve MinIO konteynerleri ayağa kaldırır.
3. Arşivi bu geçici konteynerlere geri yükler.
4. Tablo sayılarını, öğrenci (`users`), doküman (`documents`) ve kaynakça (`library_items`) satır sayılarını sorgular.
5. Nesne depolamadaki dosya sayılarını sayar.
6. Ayrıntılı doğrulama tablosu basar.
7. Çıkışta tüm geçici konteynerleri, birimleri ve ağları otomatik temizler.

```bash
sudo /opt/citedocs/deploy/backup/citedocs-restore.sh --latest --verify
```

### 4.2 Otomatik Test Paketi
Geliştirme ortamında veya CI süreçlerinde uçtan uca yedekleme/geri yükleme testi çalıştırmak için:
```bash
# Bağımsız bash entegrasyon testi
deploy/backup/test/test-backup-restore.sh

# Vitest test paketi
pnpm --filter @citedocs/server test test/backup-restore.test.ts
```

---

## 5. Disk ve S3 Maliyet Analizi (~20 Öğrenci)

CiteDocs başlangıçta yaklaşık 20 öğrenci (Scientific Writing dersi) tarafından aktif olarak kullanılacaktır.

### 5.1 Veri Büyüme Tahminleri
- **Öğrenci Başına Doküman:** Ortalama 5-10 akademik ödev / tez taslağı.
- **Word `.docx` Dosya Boyutu:** Ortalama 500 KB - 2 MB (görsel ve grafikler dahil).
- **20 Öğrenci Toplam Doküman Hacmi:** 20 × 10 × 1.5 MB ≈ **300 MB**.
- **Akademik Kaynaklar (PDF Ekleri):** Öğrenci başına 15 PDF referansı (ortalama 1.5 MB) = 20 × 15 × 1.5 MB ≈ **450 MB**.
- **PostgreSQL Veritabanı:** 20 kullanıcı hesabı, atıflar, Yjs CRDT durumları ≈ **20 - 50 MB**.
- **Toplam Canlı Sistem Verisi:** ~**800 MB - 1.2 GB**.

### 5.2 Arşiv Boyutu ve Sıkıştırma
- `tar.gz` ve PostgreSQL custom format sıkıştırması metin tabanlı XML ve SQL verilerinde %60-70 tasarruf sağlar.
- **Tek Bir Günlük Arşiv Boyutu:** Yaklaşık **150 - 350 MB**.

### 5.3 Yerel Disk Tüketimi (EC2 100 GB gp3)
Saklama politikası: **7 Günlük + 4 Haftalık = En fazla 11 Arşiv**:
$$\text{Toplam Yerel Depolama} = 11 \times 250\text{ MB} \approx 2.75\text{ GB}$$
- 100 GB gp3 diskin yalnızca **%2.75**'i yedekler için kullanılır.
- `MIN_FREE_DISK_MB=2048` koruması sayesinde boş alan 2 GB altına inerse sistem yedeklemeyi reddederek ana uygulamanın disk yetersizliği nedeniyle çökmesini önler.

### 5.4 AWS S3 Off-Site Yedekleme Maliyeti (eu-central-1 Frankfurt)
Uzak kova (`BACKUP_S3_URI`) tanımlandığında AWS faturasına etkisi:
- **S3 Standard Depolama Birim Fiyatı:** $0.023 / GB / ay.
- **11 Adet Arşiv Depolama (yaklaşık 3 GB):**
  $$3\text{ GB} \times \$0.023 = \mathbf{\$0.07\text{ / ay}}\quad (\approx 2.50\text{ TL / ay})$$
- **PutObject API Çağrıları:** Günlük 1 yükleme × 30 gün = 30 istek ≈ **$0.00015**.
- **Toplam Aylık Maliyet:** **Yaklaşık 10 cent (3 TL)**.

> [!TIP]
> Ayda 3 TL gibi yok sayılabilecek bir maliyetle, AWS veri merkezi düzeyinde bir yangın veya felakette dahi tüm öğrencilerin aylarca emek verdiği tez ve makaleler %100 güvence altındadır.
