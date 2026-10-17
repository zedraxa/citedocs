# CiteDocs kapasite planı — 17 Ekim 2026

## Karar ve kanıt sınırı

**20 kayıtlı öğrenciyle düşük eşzamanlı kullanım pilotu mümkün; 20 öğrencinin kotasını doldurması veya aynı anda editör açması için mevcut 4 GiB RAM / yaklaşık 100 GB disk güvenli kabul edilemez.** Kaynakların hiç tükenmeyeceği garantisi verilemez. Ders başlamadan 8 GiB RAM'e geçiş, nesnelerin S3'e taşınması veya yedekleme dahil hesaplanan EBS büyütmesi ve alarmın gerçek teslim testi gerekir. Hiçbir altyapı değişikliği bu çalışmada uygulanmadı.

Kanıt önceliği: kullanıcının güncel üretim bilgisi → `deploy/docker-compose.prod.onlyoffice.yml` → `deploy/backup/citedocs-backup.sh` → eski belgeler. `docs/DEPLOY.md` başındaki 40 GB / Collabora bilgisi tarihsel; kullanıcı yaklaşık 100 GB bildiriyor. `docs/ARCHITECTURE.md` içindeki <1 GB RAM ifadesi ONLYOFFICE yığınına uygulanamaz. Mevcut compose yedi servis içeriyor; RAM/CPU sınırı veya Docker log rotasyonu tanımlamıyor. `onlyoffice/documentserver:latest` değişken olduğundan sürüme bağlı davranış üretimde ayrıca doğrulanmalı. Resmi web Zotero eklentisi kullanılıyor; ayrı masaüstü Zotero servisi için RAM ayrılmıyor.

Yerel salt okunur ölçüm: `docker ps`, `docker stats --no-stream`, `df -h .`, `free -m`. CiteDocs veya ONLYOFFICE konteyneri yok; yalnızca başka projeler var. Geliştirme compose'u Collabora kullanıyor, üretimin ONLYOFFICE yükünü temsil etmiyor. Yerel host 15.39 GiB RAM, disk 233 GiB / %66 dolu; **bunlar üretim ölçümü değildir**. Konteyner oluşturulmadı. Aşağıdaki kullanım bütçeleri ölçüm değil, planlama tahminidir.

## Disk: kota kadar yedeği de hesaba katın

Birimler: kullanıcı kotası için GB; `df`, `du`, RAM eşiklerinde KiB/MiB. Muhafazakâr plan için 5 GB kotayı 5 GiB gibi bütçelemek uygundur. Belgeler ve PDF'ler MinIO nesneleri olduğundan tabloda tekrar toplanmaz. Kota uygulamasının bütün nesne yollarını kapsadığı ayrıca denetlenmeli; kota fiziksel rezervasyon değildir.

| Kalem | 20 öğrenci pilot bütçesi (tahmin) | Büyüme / denetim |
|---|---:|---|
| OS, paketler, checkout, 4 GiB swap | 10 GiB | Güncelleme ve build artıkları |
| Docker imajları ve build cache | 10 GiB | Deploy başına büyür; eski dangling imaj ve cache temizliği |
| Docker stdout/stderr + ONLYOFFICE dosya logları | 2 GiB | JSON logları ile `oo_logs` ayrı; ikisine de rotasyon gerekir |
| ONLYOFFICE cache / forgotten / geçici dönüşümler | 5 GiB | 5 GiB uyarı, 10 GiB kritik; kaydetme hatası büyümeyi hızlandırır |
| PostgreSQL, indeks, WAL ve OO dahili DB | 3 GiB | Uzun işlem/WAL artışı ayrıca izlenir |
| MinIO belge + PDF nesneleri | 1 GiB başlangıç; kota tavanı 100 GiB | Resim/PDF ağırlığı sınırsız büyüme varsayımını geçersiz kılar |
| Yerel yedekler ve çalışma alanı | Aşağıdaki formül | En büyük risk; yalnız arşivleri saymayın |

Sabit bütçe `B ≈ 30 GiB`. Bu bir üst sınır değil; özellikle cache ve loglar izlenmezse aşılır. `oo_data` ve `oo_logs` adlı volume'lar var. **Cache yolu `/var/lib/onlyoffice/documentserver/App_Data/cache/files`, compose'daki `/var/www/onlyoffice/Data` mount'u ile aynı yer değildir.** Cache writable layer veya imajın oluşturduğu anonim volume'da olabilir; `docker inspect` ile doğrulayın. Named volume listesine bakmak tek başına yeterli değil.

Yedek kodu her seferinde nesneleri staging'e kopyalıyor, ardından tam `.tar.gz` üretiyor; rotasyon arşiv tamamlandıktan sonra. 7 günlük + 4 haftalık politika için muhafazakâr zirve:

`kullanım ≈ B + D + 11A + S + A = B + D + 12A + S`

`D`: canlı nesneler; `S`: staging (nesneler + DB dump); `A`: bir tam arşiv. DOCX ve PDF zaten sıkışık olduğundan **A≈S≈D** varsayın: `B + 14D`. Eski/yarım staging veya restore doğrulaması için ek alan gerekir.

**Uygulanan Yedekleme Güçlendirmesi (`deploy/backup/citedocs-backup.sh`):**
1. **Ön Alan Kontrolü:** Staging öncesinde canlı nesneler ve DB dump boyutu taranarak staging $S$ ve arşiv $A$ boyutları tahmin edilir; dosya sisteminde en az $S + A + \%20\text{ disk rezervi}$ (yapılandırılabilir `DISK_RESERVE_PERCENT`) bulunması zorunlu tutulur. `MIN_FREE_DISK_MB=2048` başlangıç tabanı (floor) olarak korunur; alan yetersizse işlem temizce durdurulur (abort).
2. **Sınırlı (Bounded) Staging ve Trap:** Staging dizini arşiv biter bitmez hemen silinir; hata ve sinyallerde (`EXIT`, `INT`, `TERM`, `HUP`, `QUIT`) trap ile temizlenir. Başlangıçta ise önceki kesintilerden kalan `.staging_*` dizinleri ve kısmi `*.tmp` arşivleri otomatik temizlenir.
3. **Esnek Yerel Saklama (`KEEP_LOCAL_AFTER_UPLOAD`):** Uzak S3 yüklemesi (`BACKUP_S3_URI`) başarılı olduğunda yerelde 11 arşiv yerine isteğe bağlı olarak yalnız son 1 veya 2 arşiv tutulabilir; böylece yerel disk tüketimi $2.75\text{ GB}$'dan $\sim 500\text{ MB}$ seviyesine iner.
4. **Büyüme İzleme:** Her çalıştırmada arşiv boyutu ve işlem süresi loglanır; disk büyüme eğilimi takip edilebilir.

| Öğrenci | 5 GiB kota toplamı D | Mevcut tam yerel yedekle zirve B+14D | %80 altında kalmak için disk alt hesabı |
|---|---:|---:|---:|
| 20 | 100 GiB | 1.430 GiB | 1.788 GiB (yaklaşık 2 TiB) |
| 50 | 250 GiB | 3.530 GiB | 4.413 GiB |
| 100 | 500 GiB | 7.030 GiB | 8.788 GiB |

Bu büyüklükler önerilen satın alma değil, **mevcut yedek stratejisinin tam kota senaryosunda neden uygun olmadığının hesabıdır**. 100 GiB diskte `D=1 GiB` yaklaşık 44 GiB zirve; `D=5 GiB` yaklaşık 100 GiB zirve demektir. %80 sınırı için `D ≤ (80−30)/14 ≈ 3.6 GiB`. Bu nedenle ilk günlerden nesne büyümesini ve arşiv boyutunu günlük kaydedin. BACKUP.md'deki 150–350 MB arşiv ve yüksek sıkıştırma varsayımı tüm öğrenciler için garanti değildir.

Büyüme tahmini: haftada öğrenci başına 50 MiB yeni nesne → 20 öğrencide yaklaşık 1 GiB/hafta; yerel tam yedekler olgunlaşınca yaklaşık 14 GiB/hafta zirve artışı. 250 MiB/öğrenci/hafta → yaklaşık 5 GiB/hafta canlı veri. Bunlar senaryodur. Son 7 günün pozitif günlük disk artışından `%80'e kalan gün = (0.8×toplam−kullanılan)/günlük artış` hesaplayın; **14 gün altı** büyütme/taşıma işini başlatma eşiği. Bu eğilim hesabı betikte otomatik değildir.

## RAM, swap ve CPU

| Servis / host | 4 GiB üzerinde deneme bütçesi (MiB, tahmin) |
|---|---:|
| ONLYOFFICE (iç PostgreSQL/RabbitMQ vb. dahil) | 1.800–2.600 |
| CiteDocs server | 250–450 |
| PostgreSQL | 200–350 |
| MinIO | 150–350 |
| Zotero translation-server | 150–300 |
| web nginx | 20–50 |
| Caddy | 30–80 |
| OS + Docker | 400–600 |
| Toplam | **3.100–4.780** |

Alt toplamda bile güvenlik payı dar; dönüşüm, resimli tez ve eşzamanlı açılışta üst sınır aşılabilir. Bunlar cgroup limitleri değildir; ölçmeden sert limit koymak OOM ile kaydetmeyi kesebilir. Resmi [Linux gereksinimleri](https://helpcenter.onlyoffice.com/docs/installation/docs-community-sys-reqs-linux.aspx) ONLYOFFICE için en az 2 GB, kullanıcı tablosunda 4 GB RAM ve en az 4 GB swap belirtir; diğer CiteDocs servisleri bunun dışındadır (17 Ekim 2026 kontrolü).

DEPLOY.md 4 GB swapfile bildiriyor; operatör `swapon --show` ile doğrulamalı. 4 GiB swap ani tepeyi karşılayabilir, RAM yerine geçmez; disk bütçesine dahildir. `vmstat 1 60` ile sürekli si/so ve gecikme varsa RAM büyütün. `vm.swappiness=10` bakım penceresinde denenebilir, ölçümle değerlendirilir. `MemAvailable` ≤768 MiB uyarı / ≤384 MiB kritik; swap kullanım ≥%25 / ≥%50. OOM tek olayda kritik.

2 vCPU açılış, PDF/DOCX dönüşümü, bir dakikalık autoAssembly ve gzip yedeklemede paylaşılır. Build ve yedekleri ders saatleri dışında tutun. T3.medium tabanı vCPU başına %20, t3.large %30; large yine **2 vCPU**, RAM 8 GiB olur. Kredi azaldığında Standard mod kısılır; Unlimited ek maliyet oluşturabilir. [AWS kredi tablosu](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-credits-baseline-concepts.html).

Operatörün ayrı CloudWatch/host izlemesi: CPU >%70 15 dakika uyarı, >%90 5 dakika kritik; `CPUCreditBalance <48` uyarı / `<12` kritik; `CPUSurplusCreditsCharged >0` maliyet incelemesi. Bunlar betikte veya AWS hesabında kurulmuş değildir. Tek örnek docker stats yük testi değildir. Staging'de 5/10/15/20 editörle büyük tez açma, yazma, Zotero ekleme, kaydetme ve tekrar açma ölçülmeli. Kabul hedefi: OOM yok, RAM rezervi ≥768 MiB, başarılı callback/kayıt, açılış p95 <10 saniye (ürün hedefi, ölçülmüş sonuç değil).

## CE eşzamanlı bağlantı sınırı

20 hesap değil **20 eşzamanlı editör bağlantısı** sınırı var; bir öğrenci birden fazla belge/sekme açabilir, aynı belgeyi açan ortak yazarlar da bağlantı tüketir. 20 öğrenci + öğretmen veya ikinci sekmeler limiti aşabilir. Resmi [CE açıklaması](https://community.onlyoffice.com/t/what-exactly-is-document-server-20-connection-limit/4481/8) aşımda sonraki belgelerin salt okunur açıldığını belirtir. Öğrenci düzenleyemez; limit uyarısı/salt okunur mod görür. Uyarının tam Türkçe metni ve kullanılan `latest` imajdaki akış staging'de 21. bağlantıyla doğrulanmalı; mevcut uygulamada kuyruk veya özel kapasite ekranı varsayılmıyor.

[ONLYOFFICE destek açıklaması](https://community.onlyoffice.com/t/onlyoffice-docs-community-edition-is-the-simultaneous-connection-limit-for-editing-only-or-does-it-also-apply-to-viewing/18127) normal görüntüleme ile live viewer'ı ayırır: live viewer'ın ayrı 20 sınırı vardır. Operasyon politikası: 15 editörde uyarı, 18'de yeni ders/oturum kabulünü azaltma; 20'de yeni editör için boşalan bağlantıyı bekleme. Gereksiz sekmeleri kapatın, kayıt tamamlanınca tekrar açın; mevcut oturumları zorla öldürmeyin. Bu bağlantı sayıları **mevcut betikte ölçülmez**; sürüme uygun ONLYOFFICE bağlantı metriği entegre edilene kadar ders gruplarını 15 aktif editörle sınırlayın. RAM/EBS yükseltmek CE lisans sınırını artırmaz. 50/100 kayıtlı kullanıcıda aynı anda >20 editör gerekiyorsa uygun lisanslı sürüm ve ayrı kapasite testi gerekir.

## İzleme aracının kurulumu

`deploy/ops/check-capacity.sh` POSIX shell kullanır; Linux `df`, `awk`, Docker CLI ve isteğe bağlı `curl` gerekir. Çıkış: **0 sağlıklı, 1 uyarı, 2 kritik/ölçüm hatası**. Türkçe çıktı journald'a yazılır. Tüm Docker host'u raporlanır: disk ve inode, MemAvailable/swap, `docker system df -v` (volume adları, boyutları ve en büyük 10 volume dahil), konteynerlerin ömür boyu restart sayısı/durumu/OOM ve cache+forgotten toplamı. Restart sayısı son 5 dakika farkı değildir; eski olay çözülse bile alarm sürebilir. Betik volume tablosundan boyuta göre en büyük 10 volume’u ayrıca sıralar; container writable layer için Containers bölümüne bakın.

| Ortam değişkeni | Varsayılan |
|---|---|
| DISK_WARN / DISK_CRIT | 80 / 90 (%) |
| INODE_WARN / INODE_CRIT | 80 / 90 (%) |
| RAM_WARN_MB / RAM_CRIT_MB | 768 / 384 (MiB, alt eşik) |
| SWAP_WARN / SWAP_CRIT | 25 / 50 (% kullanılan) |
| CACHE_WARN_MB / CACHE_CRIT_MB | 5120 / 10240 (MiB) |
| RESTART_WARN / RESTART_CRIT | 1 / 3 (ömür boyu) |
| CHECK_PATHS | `/` (satır sonuyla ayrılmış yollar) |
| OO_CONTAINER | `citedocs-onlyoffice` |
| CAPACITY_WEBHOOK_URL | boş; genel JSON `{"text":"..."}` alıcısı |

Aşağıdaki kurulum **operatör içindir; uygulanmadı**:

```sh
cd /opt/citedocs
sudo install -m 644 deploy/ops/citedocs-capacity.service deploy/ops/citedocs-capacity.timer /etc/systemd/system/
sudo install -m 600 /dev/null /etc/citedocs-capacity.env
sudoedit /etc/citedocs-capacity.env
# DISK_WARN=80
# DISK_CRIT=90
# CAPACITY_WEBHOOK_URL=https://... (gerçek gizli URL yalnız burada)
sudo systemctl daemon-reload
sudo systemctl start citedocs-capacity.service
sudo journalctl -u citedocs-capacity.service -n 100
sudo systemctl enable --now citedocs-capacity.timer
systemctl list-timers citedocs-capacity.timer
```

Git checkout içindeki betik executable olmalıdır. Docker socket root yetkisi verir; env dosyası root:root 0600 kalmalı. Docker root/volume/yedek başka diskteyse `CHECK_PATHS` içine onları da ekleyin; systemd EnvironmentFile çok satırlı çift tırnaklı değer destekler. Varsayılan `/` ayrı mount'ları kapsamaz. `MEMINFO_PATH` yalnız test girdisi içindir, üretimde değiştirmeyin.

Webhook sadece uyarıda gönderilir; timeout 15 saniye, URL ve yanıt loglanmaz. Servis her 5 dakikada tekrar bildirir; dedup alıcıda yapılır. Kurulumda geçici düşük eşikle gerçek teslimi test edip eşikleri geri alın. HTTP hata kodu kritik olur. Alarmın sahibi belirlenmeden timer yeterli değildir: uyarıyı aynı gün inceleyin; kritik durumda hemen yeni yükü durdurup boş alan/kayıt hatalarını değerlendirin. Host tamamen kapanırsa bu araç bildiremez; dış uptime kontrolü gerekir. Timer servisinin timeout'u veya çalışmaması da dış izlemeye eklenmeli.

## Güvenli temizlik ve log rotasyonu

```sh
# Salt okunur varsayılan; 30 günden yaşlı oturum dosyalarının önizlemesi
sudo deploy/ops/cleanup.sh
sudo env DAYS=14 deploy/ops/cleanup.sh --dry-run
```

Cache konumu bilinçli olarak sabit ve `data` / `forgotten` ile sınırlıdır; sürümde farklıysa önce konfigürasyonu doğrulayıp aracı uyarlayın. Kök altındaki oturum dizininin **tüm girdileri** `find -mtime +N` şartını sağlamalı; yeni girdisi veya symlink'i olan ağaç atlanır. Gün eşiği tam 24 saatlik dilimlere yuvarlanır. Tek başına eski mtime, oturumun kapandığının kanıtı değildir.

Uygulama için bakım penceresi: yeni editör girişlerini operatör kapatır, öğrenciler kaydeder ve çıkar, callback'lerin başarılı olduğu ve geri yüklenebilir yedek doğrulanır. Container çalışır kalırken `ds:docservice` ve `ds:converter` supervisor servisleri operatör tarafından durdurulur. Betik bu iki servisin STOPPED olduğunu kontrol eder, kendisi durdurmaz/başlatmaz. Başka bir otomasyon servisleri yeniden başlatmamalı. `forgotten` başarısız kayıtların tek kurtarma kopyası olabilir; önce dışarı kopyalayıp ilgili belgeleri kurtarın ve açarak doğrulayın.

```sh
sudo env MAINTENANCE_CONFIRMED=yes DAYS=30 deploy/ops/cleanup.sh --apply
# Yalnız kurtarma doğrulandıktan sonra forgotten dahil:
sudo env MAINTENANCE_CONFIRMED=yes FORGOTTEN_RECOVERY_CONFIRMED=yes DAYS=30 \
  deploy/ops/cleanup.sh --apply --include-forgotten
```

Sonra servisleri operatör yeniden başlatır, kaydetme/tekrar açma kontrolü yapar ve erişimi açar. Betik volume, MinIO, PostgreSQL, yedek veya tüm Docker sistemini prune etmez. Yalnız yaş filtresiyle dangling imajlar ve kullanılmayan build cache temizlenir; bu **host genelindeki** Docker cache'ini etkiler. Tagged geri dönüş imajları korunur. Dry-run imaj ön listesi yaş filtresizdir; build cache uygunluğunu Docker ancak prune anında hesaplar, tahmini kazanım garanti edilmez. Otomatik temizlik timer'ı yoktur.

`deploy/ops/daemon.json` örneğini mevcut `/etc/docker/daemon.json` ile **birleştirin**, dosyayı körlemesine ezmeyin. `json-file` için 10m × 3 dosya ≈30 MB/konteyner (7 konteyner ≈210 MB). `dockerd --validate --config-file=/etc/docker/daemon.json` ile kontrol edin. Docker yeniden başlatılması ve mevcut konteynerlerin yeni log ayarıyla yeniden oluşturulması bakım/deploy sahibinin işidir. Bu değişiklik `oo_logs` içindeki dosyaları veya journald'ı döndürmez; OO imajının logrotate çalışmasını doğrulayın, host journal için örneğin 200 MiB sınır planlayın. Canlı log dosyalarını elle silmeyin.

## Büyütme yolu ve açık işler

1. **20 öğrenci:** ders öncesi t3.large / 8 GiB önerilir. Yerel MinIO kalacaksa tam kota + yedek formülüyle EBS seçin; yalnız 100→200 GiB büyütmek 100 GiB kotayı ve mevcut 11 tam yedeği karşılamaz. S3 + uzak/incremental yedek akışına geçiş daha sürdürülebilirdir.
2. **50 öğrenci:** S3, bounded yerel staging, 8 GiB başlangıç; 15–18 aktif editör alarmı ve >20 için lisans kararı. Ders zamanlarını ayırın. CPU sürekli yüksekse large yeterli olmaz.
3. **100 öğrenci:** S3 ve ayrı ONLYOFFICE host'u; başlangıç inceleme adayı 4 vCPU/16 GiB (tahmin). DB/uygulama ve editör yükünü ayrı ölçün. 100 kayıtlı kullanıcı otomatik olarak 100 eşzamanlı kullanıcı değildir.
4. **EBS:** yedek doğrulama → yeni boyut hesabı → yetkili operatörün volume büyütmesi → partition ve dosya sistemi büyütmesi → `df -h`/`df -i` teyidi. Volume büyümek dosya sistemini otomatik büyütmeyebilir. Bu çalışma AWS çağrısı yapmadı.
5. **S3:** uygulamanın endpoint/region/kimlik bilgisi ve bucket varsayımlarını doğrulayın; iki kovayı kopyalayın, nesne sayısı/boyut/checksum ile doğrulayın, kısa yazma duraklamasında son farkı aktarın, endpoint'i değiştirin ve kaydetme/indirme/restore test edin. Eski MinIO'yu doğrulama ve geri dönüş süresi bitmeden kaldırmayın. Mevcut compose MinIO endpoint'ini sabitliyor; uygulama ve deploy sahibi ayrı değişiklik yapmalı.

Açık işler: üretim gerçek disk/mount/RAM ölçümü; 21. bağlantı davranışı; otomatik bağlantı/CPU/kredi ve disk büyüme metriği; alarm teslimi ve dış uptime; cache yolunun imaj sürümüyle doğrulanması (büyük yedekler için ön alan kontrolü, bounded staging ve yerel retention güçlendirmesi `deploy/backup/citedocs-backup.sh` üzerinde tamamlanmıştır). [BACKUP.md](BACKUP.md) kurtarma prosedürü korunur; bu plan oradaki küçük veri/sıkıştırma varsayımını tam kota için kullanmaz.

## Test

```sh
pnpm exec vitest run apps/server/test/capacity-ops.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

Testler PATH üzerinden sahte Docker/df/curl, geçici meminfo ve dosya ağaçları kullanır; gerçek Docker'a veya sunucuya dokunmaz. Eşik sınırları, ölçüm hatası, webhook hatası, varsayılan dry-run ve bakım korumaları doğrulanır.
