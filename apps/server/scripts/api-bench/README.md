# Yerel API gecikme ölçümü

Depo kökünden:

```sh
pnpm install --frozen-lockfile
pnpm -r --filter './packages/*' build
pnpm --filter @citedocs/server exec tsx scripts/api-bench/run.mjs > /tmp/server-after.json
```

Node 22, 30 örnek, her yol için ilk istek ve üç ısınma isteği; ardından p50/p95.
`BENCH_SAMPLES` ve `BENCH_IO_MS` ile örnek sayısı ve depo gecikmesi değiştirilebilir.
Test/derleme ile aynı anda çalıştırmayın; sonuçlar makine yüküne duyarlıdır.

Gerçek Fastify rotaları `inject` ile çalışır (TCP/TLS/proxy yok). Gerçek bcrypt
ve bearer oturumu kullanılır; bellek depolarının dış çağrılarına 5 ms, sahte Zotero
isteğine 25 ms gecikme eklenir. 100 belge ve 10.800 yapay stil vardır. Kimlik bilgileri
yereldir, genel `fetch` beklenmeyen ağ erişimini reddeder. Enjekte edilen Zotero
proxy ve stil servisi ağa çıkmaz. Çağrı sayaçları ölçülen 30 isteğin toplamıdır;
bunlar gerçek SQL sorgu sayıları değildir. İlk istek (`coldMs`) o yolun ilk
isteğidir, tüm uygulamanın soğuk başlangıcı değildir.

Sunucuda atıf biçimlendirme rotası yoktur. `citation-engine-local-NOT-API` ortak
CSL motorunu yeni APA/tr-TR motoru + bir kaynak/atıf/kaynakça ile ölçer; ONLYOFFICE
iframe performansını temsil etmez. Bu motorda değişiklik yapılmadı.

Başlangıç sürümünü aynı ölçüm programıyla karşılaştırmak için ayrı bir geçici
kaynak ağacı kullanın (çalışma ağacındaki dosyalar değiştirilmez):

```sh
bench_base=$(mktemp -d)
git archive 514cffd apps/server/src apps/server/package.json | tar -x -C "$bench_base"
ln -s "$PWD/apps/server/node_modules" "$bench_base/apps/server/node_modules"
BENCH_SERVER_ENTRY="$bench_base/apps/server/src/index.ts" pnpm --filter @citedocs/server exec tsx scripts/api-bench/run.mjs > /tmp/server-before.json
pnpm --filter @citedocs/server exec tsx scripts/api-bench/run.mjs > /tmp/server-after.json
```

Ortak paketler değiştirilmediği için iki çalıştırma aynı ortak paket derlemelerini
kullanır. `before.json` ve `after.json` bu yöntemle kaydedilen örneklerdir.
CSL koşullu GET başlangıçta 200/tam gövde, sonrasında 304/boş gövde döner.

Bu deney PostgreSQL sorgu planını, gerçek Zotero/S3 gecikmesini, ağ aktarımını,
20 öğrencilik üretim kapasitesini veya canlı sitenin kök nedenini ölçmez.
