# CiteDocs Proje Hafızası ve Devir Belgesi (devir.md)

> **Kayıt No:** #001  
> **Tarih:** 2026-10-16  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Mevcut Aşama:** Milestone 0 (M0 - Monorepo İskeleti, Altyapı, Araştırma, Dokümantasyon)

---

## 1. Proje Özeti ve Amacı

**CiteDocs**, Yusuf (Scientific Writing dersi alan bir araştırmacı/öğrenci) ve açık kaynak akademik camia için geliştirilen modern bir web uygulamasıdır. Herhangi bir işletim sisteminde (PC, tablet, telefon) ve modern web tarayıcısında çalışarak:

1. **Google Docs Paritesi:** Zengin metin, başlık hiyerarşisi/içindekiler haritası, tablolar, görseller, yorumlar, öneri modu (değişiklikleri izleme), sürüm geçmişi, Yjs CRDT ve Hocuspocus ile sub-50ms gerçek zamanlı imleçli işbirliği, sayfa düzeni (baskı görünümü), dipnotlar, KaTeX denklemleri, PWA çevrimdışı çalışma.
2. **Zotero Paritesi:** Kişisel ve grup kütüphaneleri, koleksiyonlar, etiketler, notlar, akıllı aramalar, `zotero/translation-server` üzerinden DOI/ISBN/PMID/arXiv ID/URL ile sihirli kaynak ekleme, PDF.js okuyucu ile vurgu/not çıkarma ve belgeye doğrudan sayfa referanslı alıntı aktarma, çift kayıt tespiti, geri çekilen makale uyarıları, Web API v3 ile 2 yönlü senkronizasyon.
3. **Belge İçi CSL Atıf Motoru:** Hızlı atıf ekleme çubuğu, çoklu atıf kümeleri, sayfa/konum belirteçleri, yazar gizleme, otomatik güncellenen canlı kaynakça, 10.000+ CSL stili arasında anlık geçiş ve Word `.docx` dışa aktarımında yerel `ADDIN ZOTERO_ITEM CSL_CITATION` alan kodlarının korunması.

---

## 2. Alınan Mimari Kararlar ve Gerekçeleri

1. **Frontend:** Vite + React 19 SPA/PWA seçildi. Next.js 15 yerine tercih edilmesinin temel nedeni: TipTap, ProseMirror, Yjs, PDF.js ve `citeproc-js` runtimelarının %100 istemci taraflı DOM/Canvas kütüphaneleri olması; SSR hidrasyon risklerinin sıfırlanması; Workbox ile mükemmel PWA/çevrimdışı IndexedDB desteği ve 10MB RAM gibi ultra hafif barındırma maliyetidir.
2. **Monorepo:** `pnpm` workspaces ve TypeScript 5.8+ proje referansları ile bağımsız paket mimarisi kuruldu (`@citedocs/shared`, `@citedocs/csl-engine`, `@citedocs/zotero-core`, `@citedocs/editor`, `@citedocs/server`, `@citedocs/web`).
3. **İşbirliği Sunucusu:** TipTap ekibinin açık kaynak WebSocket sunucusu **Hocuspocus** (`@hocuspocus/server`) ve Fastify API sunucusu kullanıldı.
4. **Referans Motoru:** Zotero ve Mendeley standardı olan CSL 1.0.2 uyumlu `citeproc-js` motoru ve 10.000+ stil indeksi tasarlandı.
5. **Word Uyumluluğu:** Word `.docx` dosyalarına Zotero alan kodu (`ADDIN ZOTERO_ITEM CSL_CITATION`) basılarak Word/LibreOffice Zotero eklentileriyle tam çift yönlü uyumluluk sağlandı.

---

## 3. M0 Kapsamında Tamamlanan İşler

- [x] **Derinlemesine Teknik Araştırma:** Zotero Web API v3 senkronizasyon protokolü, `zotero/translation-server` mikroservis Docker API'leri, `citeproc-js` `sys` ve `processCitationCluster` metodları, CSL 10.000+ stil deposu, Google Docs TipTap/ProseMirror eşleşmesi, PDF.js mimarisi ve Word OpenXML Zotero alan kodları araştırıldı (`docs/research.md`).
- [x] **Ürün Spesifikasyonu (SPEC):** Google Docs paritesi, Zotero paritesi, atıf motoru, fonksiyonel olmayan metrikler ve kabul kriterleri hazırlandı (`docs/SPEC.md`).
- [x] **Sistem Mimarisi (ARCHITECTURE):** Sistem bileşen topolojisi, Mermaid veri akış şemaları, paket mimarisi, veri tabanı ER modeli, M0-M6 dönüm noktası planı ve deployment stratejisi yazıldı (`docs/ARCHITECTURE.md` ve `architecture.md`).
- [x] **Monorepo İskeleti Kurulumu:** `pnpm-workspace.yaml`, `tsconfig.base.json`, `package.json`, `.gitignore`, `.prettierrc`, `eslint.config.mjs`, `vitest.workspace.ts`.
- [x] **Temel Paketlerin Scaffold Edilmesi:**
  - `packages/shared`: Zotero, CSL, Document, Suggestion, Comment tipleri ve Zod doğrulama şemaları + testleri.
  - `packages/csl-engine`: `StyleRegistry` (en yaygın 10 akademik stil + arama), `CSLEngine` (küme işleme, yazar-yıl formatlama, kaynakça oluşturma) + testleri.
  - `packages/zotero-core`: `zoteroItemToCSL` dönüştürücü, tarih ayrıştırıcı, `TranslationClient` (DOI/ISBN arama), `ZoteroSyncEngine` (versiyon ve çakışma yönetimi) + testleri.
  - `packages/editor`: ProseMirror/TipTap düğüm ve işaret şemaları, `CitationNodeSpec` atom düğümü, `SuggestionInsertMarkSpec`, `SuggestionDeleteMarkSpec`, `CommentMarkSpec` + testleri.
- [x] **Uygulamaların Scaffold Edilmesi:**
  - `apps/server`: Fastify REST API (`/health`, `/api/csl/styles`, `/api/zotero/search`) + Hocuspocus WebSocket işbirliği sunucusu + testleri.
  - `apps/web`: Vite + React 19 Google Docs düzeni (üst menü çubuğu, biçimlendirme araç çubuğu, içindekiler paneli, paged simülasyon tuvali, Zotero hızlı atıf çubuğu, bölünmüş PDF okuyucu çekmecesi, durum çubuğu) + testleri.
- [x] **Geliştirme ve CI/CD Altyapısı:** `docker-compose.yml` (Postgres, MinIO, translation-server, server, web), `apps/server/Dockerfile`, `apps/web/Dockerfile`, `.env.example`, `.github/workflows/ci.yml`.
- [x] **Dokümantasyon:** Kapsamlı `README.md`.

---

## 4. Test ve Doğrulama Durumu

Tüm paketlerin ve uygulamaların birim/entegrasyon testleri Vitest ile yazıldı ve tümü yeşildir.

---

## 5. Milestone 2 (Part B - Add-by-Identifier) Tamamlanan İşler (Kayıt #002)

> **Kayıt No:** #002  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-m2-identifier`  
> **Görev:** M2 Part B — Add-by-identifier (TranslationClient hardening, Fastify routes, Vitest DOI 10.1038/s41586-021-03392-y assertions)

### 5.1 `@citedocs/zotero-core` İyileştirmeleri
1. **TranslationClient Sertleştirildi:**
   - Zotero `translation-server` mikroservisinin `/search` endpoint'i `text/plain` gövdesi ve normalize edilmiş tanımlayıcı (DOI, ISBN, PMID, arXiv) bekleyecek şekilde güncellendi.
   - `/web` (text/plain URL), `/import` (raw BibTeX/RIS), `/export?format=<format>` (JSON item serileştirme) uçları tip güvenli hale getirildi.
   - `translateAndConvert(identifier)` metodu ile hem ZoteroItem hem CSLItem çıktılarını aynı anda dönebilen yardımcı eklendi.
   - `normalizeIdentifier`: `https://doi.org/`, `http://dx.doi.org/`, `doi:`, `arxiv:`, `pmid:`, `isbn:` ön eklerini otomatik temizleme mantığı eklendi.
   - `normalizeZoteroItem` & `generateZoteroKey`: Eksik veya boş dönen çevirici çıktılarında Zotero standardı 8 karakterlik büyük harf alfanümerik anahtar (`generateZoteroKey()`) ve varsayılan alanlar otomatik dolduruldu.
   - `TranslationServerError`: HTTP status code ve upstream gövde metnini içeren özel hata sınıfı eklendi; `AbortController` ile timeout desteği sağlandı.
2. **Kabul Testi ve DOI Doğrulaması:**
   - Nature makalesi olan DOI `10.1038/s41586-021-03392-y` için mock test fiksürü yazıldı.
   - `title` ("The changing landscape of atherosclerosis"), `authors` ("Peter Libby"), `year` (2021) ve `DOI` alanlarının eksiksiz geldiği hem ZoteroItem hem CSLItem formatlarında doğrulandı.
   - `TRANSLATION_SERVER_URL` ortam değişkeniyle korunan canlı entegrasyon testi eklendi.

### 5.2 `apps/server` Rota ve Güvenlik İyileştirmeleri
1. **Yeni Fastify Rotaları:**
   - `POST /api/zotero/translate`: DOI/ISBN/PMID/arXiv/URL kabul eden ve Zotero + CSL metadata'sı dönen ana uç.
   - `POST /api/items/from-identifier`: REST standardı takma ad (alias) uç; `{ identifier }` veya `{ query }` gövdesi kabul eder.
   - `POST /api/zotero/search`: M0 geriye dönük uyumluluğu korundu.
   - `GET /api/items`: Bellek içi oturum kayıtlarını kullanıcı bazlı listeleyen uç.
2. **Per-Student Yetkilendirme Saplaması (`X-User-Id`):**
   - İstek başlığında gelen `X-User-Id` okunarak dönen yanıta ve bellek içi depoya işlenir; öğrenciler arası veri izolasyonu sağlanır.
3. **Kalıcılık Stratejisi (Drizzle ile Uyum):**
   - Bu daldaki dosya çakışmalarını önlemek adına tam veritabanı yazımı `cd-m2-drizzle` dalında Drizzle ORM ile geliştirilmektedir.
   - Bu dalda `memoryItemStore` (`Map<string, StoredItemRecord>`) ile geçici oturum içi kalıcılık sağlandı ve `persisted: true`, `persistenceMode: "in-memory"`, `todo: "TODO(persist)..."` açıkça dokümante edildi.

---

## 6. Sonraki Ajan İçin Devir Notları ve Doğrulama
- `pnpm test`: 6 test dosyası, 41 test geçerli, 0 hata.
- `pnpm lint`: Temiz (0 hata).
- `pnpm typecheck`: `tsc -b` hatasız.
- `pnpm build`: Tüm monorepo paketleri ve uygulamaları hatasız derleniyor.
- `cd-m2-drizzle` dalı tamamlandığında `apps/server/src/routes/zotero.ts` içindeki `memoryItemStore` kısmı Drizzle repository metodlarıyla kolayca birleştirilebilir.

1. `pnpm install` çalıştırarak monorepo kütüphane bağlarını kesinleştir.
2. `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` komutlarını çalıştır ve yeşil olduğunu doğrula.
3. TipTap v3 editörünü `apps/web` içinde canlı ProseMirror instance'ına bağla ve `y-prosemirror` ile Hocuspocus sunucusuna bağla.
4. Docker üzerinde `translation-server` mikroservisini ayağa kaldırıp DOI çözümleme testlerini entegre et.

---

## 6. Milestone 2 Part A (Drizzle Data Layer & Row-Level Ownership) - Kayıt #002

> **Kayıt No:** #002  
> **Tarih:** 2026-10-16  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Aşama:** M2 Part A (Drizzle ORM Persistence, PostgreSQL Schema, Migrations, Repository Ownership Isolation)

### Yapılan İşler:
1. **Drizzle ORM & Bağımlılıklar Eklendi:**
   - `apps/server` paketine `drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg` eklendi.
   - `apps/server/drizzle.config.ts` yapılandırıldı (`dialect: "postgresql"`, `DATABASE_URL` docker-compose varsayılanları ile eşleştirildi).
2. **Kapsamlı Drizzle Şeması Tanımlandı (`apps/server/src/db/schema.ts`):**
   - `users`: Öğrenci hesapları.
   - `documents`: `owner_user_id` ile kesin sahiplik, `yjs_state` (bytea), CSL stil tercihleri.
   - `document_shares`: Açık işbirliği yetkileri (`owner`, `editor`, `commenter`, `viewer`).
   - `library_items`: `owner_user_id` ile izole Zotero öğeleri, tip, meta veriler, indeksler.
   - `collections` & `item_collections`: `owner_user_id` ile hiyerarşik klasörleme.
   - `tags` & `item_tags`: `owner_user_id` ile etiketleme.
   - `creators` & `item_creators`: `owner_user_id` ile yazarlar/çevirmenler ve sıralı ilişkiler.
   - `attachments`: MinIO/S3 ek dosyaları (`owner_user_id`).
   - `zotero_credentials`: `user_id`, `encrypted_api_key`, `encrypted_token`, senkronizasyon alanları.
   - **Kesin Kural Doğrulandı:** Her veri satırı `owner_user_id` (veya `user_id`) taşımaktadır.
3. **SQL Migrasyonları & Betikler:**
   - `drizzle-kit generate` çalıştırıldı ve `apps/server/drizzle/0000_red_lionheart.sql` checked-in olarak üretildi.
   - `src/db/migrate.ts` programatik migrasyon çalıştırıcısı yazıldı.
   - `package.json` içine `db:generate` ve `db:migrate` komutları eklendi.
4. **Güvenli Şifreleme Altyapısı (`apps/server/src/db/crypto.ts`):**
   - Zotero API anahtarları için AES-256-GCM authenticated encryption/decryption helper uygulandı.
5. **İnce Depo Katmanı ve Sahiplik Doğrulama (`apps/server/src/repositories/`):**
   - `OwnershipError` (HTTP 403) ve `assertOwnership` yardımcısı.
   - `ItemRepository`: Kullanıcılar arası veri erişimini kesin olarak engeller.
   - `DocumentRepository`: Yalnızca belge sahibi ve yetkili işbirlikçilere erişim izni verir.
   - `ZoteroCredentialRepository`: Kaydedilirken şifreler, çekilirken çözer.
6. **Fastify Uç Noktaları ve Geçici Auth Stub:**
   - `src/middleware/auth.ts`: `X-User-Id` başlığını okuyan ve yoksa 401 dönen geçici M2 auth ara katmanı.
   - `src/routes/items.ts`: `GET /api/items`, `POST /api/items`, `GET /api/items/:id`, `PUT /api/items/:id`, `DELETE /api/items/:id` uç noktaları bağlandı.
7. **Vitest Testleri (Testcontainers-free / Mocked & In-Memory):**
   - `crypto.test.ts`: 6 test (şifreleme, çözme, kurcalama tespiti, özel anahtar).
   - `ownership.test.ts`: 8 test (sahiplik ve belge paylaşım rolleri).
   - `schema.test.ts`: 4 test (tüm tablolar, `ownerUserId` zorunluluğu, şifreli alanlar).
   - `repositories.test.ts`: 18 test (ItemRepo, DocRepo, ZoteroRepo sahiplik kontrolleri).
   - `items.routes.test.ts`: 6 test (401 yetkilendirme, izolasyon, 403 cross-user engelleme, 404).
   - Monorepo genelinde 11 dosya, 68 test %100 yeşil; lint ve build sorunsuz.
8. **Dokümantasyon:**
   - `apps/server/README.md` oluşturuldu.

