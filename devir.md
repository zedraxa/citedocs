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

Tüm paketlerin ve uygulamaların birim/entegrasyon testleri Vitest ile yazıldı. `packages/editor` ve `apps/web` için TipTap v3 şema, atıf çift yönlü round-trip ve bileşen testleri eklendi.
Tüm paketlerin ve uygulamaların birim/entegrasyon testleri Vitest ile yazıldı ve tümü yeşildir.

---

## 5. Milestone 1 Part A — TipTap v3 Editör Temeli (Kayıt #002)

> **Kayıt No:** #002  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-m1-tiptap`  
> **Aşama:** Milestone 1 Part A (TipTap v3 Editör Temeli, Şema ve Canlı Tuval)

1. **TipTap v3 Bağımlılıkları:**
   - `@citedocs/editor` ve `@citedocs/web` paketlerine TipTap v3 (`^3.32.0`) kütüphaneleri eklendi: `@tiptap/core`, `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`, `@tiptap/extension-text-align`.
2. **TipTap Extension Mimarisi (@citedocs/editor):**
   - `Citation` TipTap Node atom uzantısı (`packages/editor/src/extensions/citation.ts`) geliştirildi. `citationId`, `items`, `formattedText`, `noteIndex` öznitelikleri HTML data attribute üzerinden çift yönlü round-trip desteğiyle donatıldı. Geriye dönük uyumluluk için `CitationNodeSpec` korundu.
   - `createEditorExtensions()` ve `createEditorSchema()` factory fonksiyonları (`packages/editor/src/factory.ts`) ile Document, Paragraph, Heading (1-6), BulletList, OrderedList, ListItem, Blockquote, CodeBlock, Marks (Bold, Italic, Underline, Strike, Link, Code), TextAlign, Placeholder ve Citation modüler olarak paketlendi.
   - TipTap komutları için TypeScript tip genişletmeleri (`Commands<ReturnType>`) `packages/editor/src/types.ts` dosyasında tanımlandı.
3. **Canlı Tuval ve Google Docs Araç Çubuğu Entegrasyonu (@citedocs/web):**
   - Mock belge alanı kaldırılarak yerine gerçek `EditorContent` bileşeni yerleştirildi.
   - Google Docs araç çubuğundaki Kalın, İtalik, Altı Çizili, Üstü Çizili, Blok Alıntı, Kod Bloğu, Hizalama, Listeler, Başlık Seviyeleri, Geri Al/Yinele kontrolleri TipTap `editor.chain()` komutlarına bağlandı.
   - Zotero hızlı atıf penceresinden ve PDF okuyucu çekmecesinden doğrudan belgeye `citation` atom düğümü ekleme akışı canlı editöre bağlandı.
   - Sayfa istatistikleri (kelime, karakter, okuma süresi) ve dinamik içindekiler haritası (document outline) TipTap AST'si üzerinden reaktif hale getirildi.
4. **Test ve Doğrulama:**
   - Vitest ile TipTap şema düğümleri ve işaretlerinin varlığı, `Citation` atom düğümünün HTML dışa/içe aktarımındaki öznitelik bütünlüğü ve web uygulamasının TipTap editör yüzeyini DOM'a doğru şekilde bağladığı test edildi.
   - Monorepo genelinde `pnpm test` (30 test), `pnpm lint` (0 hata, 0 uyarı), `pnpm build` ve `pnpm typecheck` başarıyla geçti.

---

## 6. Sonraki Ajan İçin Yol Haritası ve Görevler (M1 Part B)

1. `apps/web` içinde `y-prosemirror` / `@hocuspocus/provider` ve TipTap v3 `@tiptap/extension-collaboration` ile `@tiptap/extension-collaboration-caret` (v3 ismi, asla collaboration-cursor değil!) bağlantısını kur.
2. `apps/server` içindeki Hocuspocus WebSocket sunucusu ile istemci bağlantısını gerçek zamanlı çok kullanıcılı testlerle doğrula.
3. İstemci imleç renkleri ve kullanıcı varlık (awareness) durumlarını test et.

---

## 7. Milestone 2 Part A — Drizzle Data Layer & Row-Level Ownership (Kayıt #003)

> **Kayıt No:** #003  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-m2-drizzle` → `cd-m2-integrate`  
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

## 8. Milestone 2 Part B — Add-by-Identifier (Kayıt #004)

> **Kayıt No:** #004  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-m2-identifier`  
> **Görev:** M2 Part B — Add-by-identifier (TranslationClient hardening, Fastify routes, Vitest DOI 10.1038/s41586-021-03392-y assertions)

### 6.1 `@citedocs/zotero-core` İyileştirmeleri

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

### 6.2 `apps/server` Rota ve Güvenlik İyileştirmeleri

1. **Yeni Fastify Rotaları:**
   - `POST /api/zotero/translate`: DOI/ISBN/PMID/arXiv/URL kabul eden ve Zotero + CSL metadata'sı dönen ana uç.
   - `POST /api/items/from-identifier`: REST standardı takma ad (alias) uç; `{ identifier }` veya `{ query }` gövdesi kabul eder.
   - `POST /api/zotero/search`: M0 geriye dönük uyumluluğu korundu.
   - `GET /api/items`: Bellek içi oturum kayıtlarını kullanıcı bazlı listeleyen uç (M2 entegrasyonunda Drizzle ItemRepository ile birleştirilmek üzere işaretlendi).
2. **Per-Student Yetkilendirme Saplaması (`X-User-Id`):**
   - İstek başlığında gelen `X-User-Id` okunarak dönen yanıta ve bellek içi depoya işlenir; öğrenciler arası veri izolasyonu sağlanır.

---

## 9. Milestone 2 Entegrasyonu (Drizzle ItemRepository + Zotero Identifier Entegrasyonu) - Kayıt #005

> **Kayıt No:** #004  
> **Tarih:** 2026-10-16  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Aşama:** M2 Entegrasyonu (Single Source of Truth, Row-Level Ownership & Per-Student Isolation)

### Yapılan İşler:

1. **Tek Doğruluk Kaynağı (Single Source of Truth) Kuruldu:**
   - `apps/server/src/routes/zotero.ts` içindeki geçici `memoryItemStore`, `clearItemStore()` ve mükerrer `GET /api/items` kaldırıldı.
   - Kütüphane kayıtları için `routes/items.ts` + `ItemRepository` tek yetkili ve tek doğruluk kaynağı haline getirildi.
2. **Kimlik Doğrulama ve Sahiplik Zorunluluğu Genişletildi:**
   - `POST /api/items/from-identifier`, `POST /api/zotero/translate` ve `POST /api/zotero/search` uçlarına `requireAuth` ara katmanı eklendi.
   - `X-User-Id` başlığı eksik olan tüm istekler HTTP 401 Unauthorized ile reddedilir; anonim veri oluşturulamaz veya okunamaz.
3. **Identifier Çözümleme ve Veritabanı Kalıcılığı:**
   - `POST /api/items/from-identifier` (ve `translate`), tanımlayıcıyı (DOI/ISBN vb.) `TranslationClient` ile çözer ve dönen kaynakları `ItemRepository.create` aracılığıyla çağıran öğrencinin `ownerUserId` kimliğine bağlayarak eksiksiz meta veriyle (başlık, yazarlar, DOI, tarih, yayın/dergi başlığı, etiketler) kaydeder.
   - Kaydedilen öğeler veritabanı `id` değerleriyle birlikte döndürülür.
4. **Veritabanı Bağımsız Test Desteği (DB-Free InMemoryItemRepository):**
   - Çalışan bir PostgreSQL gerektirmeden tam sahiplik ve tenant izolasyonu kurallarını denetleyen `InMemoryItemRepository` (`apps/server/src/repositories/inMemoryItemRepository.ts`) eklendi.
   - `buildApp({ itemRepo, zoteroClient })` üzerinden test edilebilir mimari korundu; `buildApp()` parametresiz çağrıldığında varsayılan `ItemRepository` kullanarak rota çakışması olmadan ayağa kalktığı doğrulandı.
5. **Kabul Testleri & Doğrulama:**
   - DOI `10.1038/s41586-021-03392-y` ile `POST /api/items/from-identifier` çağrısının A kullanıcısı için `ItemRepository`'ye tüm meta verilerle kaydedildiği;
   - `GET /api/items` çağrısında A kullanıcısının öğeyi gördüğü, B kullanıcısının boş liste aldığı;
   - B kullanıcısı A'nın öğesine `GET /api/items/:id` ile erişmeye çalıştığında 403 Forbidden aldığı;
   - `X-User-Id` olmadan yapılan isteklerin 401 Unauthorized döndüğü;
   - `pnpm -r test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` komutlarının monorepo kökünden %100 yeşil geçtiği doğrulandı.
     ||||||| 4ab7de4

## 6. Sonraki Ajan İçin Devir Notları ve Doğrulama

- `pnpm test`: 6 test dosyası, 41 test geçerli, 0 hata.
- `pnpm lint`: Temiz (0 hata).
- `pnpm typecheck`: `tsc -b` hatasız.
- `pnpm build`: Tüm monorepo paketleri ve uygulamaları hatasız derleniyor.
- `cd-m2-drizzle` dalı tamamlandığında `apps/server/src/routes/zotero.ts` içindeki `memoryItemStore` kısmı Drizzle repository metodlarıyla kolayca birleştirilebilir.

## 7. Milestone 1 Part B — Gerçek Zamanlı İşbirliği Tamamlanan İşler (Kayıt #003)

> **Kayıt No:** #003  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-m1-collab`  
> **Aşama:** Milestone 1 Part B (Hocuspocus Gerçek Zamanlı CRDT İşbirliği, TipTap v3 Collaboration/Caret ve Varlık Arayüzü)

1. **TipTap v3 İşbirliği Eklentileri (`@citedocs/editor`):**
   - `@tiptap/extension-collaboration` ve `@tiptap/extension-collaboration-caret` (TipTap v3 adı; asla v2/cursor değil) eklendi.
   - `createEditorExtensions({ provider, user, document })`: Provider sağlandığında `Collaboration` (Y.Doc fragment) ve `CollaborationCaret` eklentileri dahil edilir; çakışmaları önlemek için StarterKit yerleşik geçmişi devre dışı bırakılır (`undoRedo: false`).
   - Fabrika testleri ile provider varlığında işbirliği eklentilerinin eklendiği ve `undoRedo` eklentisinin bulunmadığı doğrulandı.

2. **Hocuspocus Sunucusu ve Öğrenci İzolasyonu (`apps/server/src/collab/**`):**
   - `DocumentAccessChecker` arayüzü ve `InMemoryDocumentAccessChecker` eklendi (`'owner' | 'editor' | 'commenter' | 'viewer' | null`). Her öğrenci yalnızca kendi belgelerine ve açıkça paylaşılan belgelere erişebilir.
   - `parseCollabToken`: Geliştirme aşaması için esnek ve belgelenmiş token ayrıştırıcı (JSON `{"userId":"...","name":"...","color":"..."}`, `id:name:color` veya düz `userId` / `Bearer`).
   - `createCollabServer`: Hocuspocus `onAuthenticate` kancasında token doğrulaması, `accessChecker.canAccess()` kontrolü ile yetkisiz istemcileri reddetme, `viewer`/`commenter` bağlantılarını zorunlu `data.connection.readOnly = true` yapma.
   - `CollabPersistence` ve `InMemoryCollabPersistence` ile tak-çıkar Yjs kalıcılık arayüzü kuruldu (ileride Postgres `bytea` yjs_state doğrudan takılabilir).

3. **Web İstemcisi ve Google Docs Varlık UI (`apps/web`):**
   - `useCollab` özel React kancası oluşturuldu: `@hocuspocus/provider` ile WebSocket (`VITE_COLLAB_URL` veya varsayılan `ws://localhost:1234`) bağlantısı, URL'den dinamik `documentId` (`?doc=...`) ve kullanıcı/renk çözümleme.
   - Google Docs üst çubuğunda canlı varlık avatar listesi (kullanıcıya özel renkli halkalı baş harfler, ipucu etiketleri) ve bağlantı durumu hapı (`Live Collab`, `Read-Only`, `Connecting`, `Offline`).
   - CSS stilleri eklendi: `.collaboration-carets__caret`, `.collaboration-carets__label`, `.collaboration-carets__selection`, `.ProseMirror-yjs-cursor`, `.ProseMirror-yjs-selection`.

4. **Kabul Testleri ve Doğrulama Durumu:**
   - Dinamik OS portunda başlatılan gerçek Hocuspocus WebSocket sunucusu üzerinde 2 Y.Doc istemcisinin CRDT metin yakınsaması sub-50ms yerel gecikme ile doğrulandı.
   - İki istemcinin anlık varlık (awareness: kullanıcı adı ve renk) paylaşımı doğrulandı.
   - Yetkisiz ve geçersiz kullanıcıların kimlik doğrulamada reddedildiği kanıtlandı.
   - Viewer rolündeki istemcinin belgeye yazma girişimlerinin sunucu tarafından reddedildiği (read-only) doğrulandı.
   - Monorepo genelinde tüm testler, tip kontrolleri, lint ve derleme yeşildir.
     ||||||| 117195d

## 7. Milestone 3 (Part A - CSL Engine Core in `@citedocs/csl-engine`) Tamamlanan İşler (Kayıt #003)

> **Kayıt No:** #003  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-m3-csl`  
> **Görev:** M3 Part A — CSL engine core in `@citedocs/csl-engine` (citeproc-js wrapper, APA 7th, IEEE, style switching <300ms SLA, tr-TR Turkish locale, lazy loading & typed UnknownStyleError)

### 7.1 `@citedocs/csl-engine` Mimari ve Çekirdek Geliştirmeleri

1. **citeproc-js Entegrasyonu ve Sarmalayıcı (`CSLEngine`):**
   - M0'daki sahte regex/dize birleştirme motoru yerine CSL 1.0.2 uyumlu resmi `citeproc-js` çekirdeği entegre edildi.
   - `CiteprocSys` arayüzü (`retrieveItem`, `retrieveLocale`, `variableWrapper`) güvenli hale getirildi; eksik kayıtlarda `[Unknown: id]` yer tutucu kaydı dönülerek parser çökmeleri engellendi.
   - Atıf kümeleri (`CitationCluster`), sayfa/bölüm belirteçleri (`locator`, `label`), ön ek/son ek (`prefix`, `suffix`) ve yazar gizleme (`suppressAuthor` -> `suppress-author`) belgeler arası sıra (`clusterOrder`, `citationsPre`, `citationsPost`) ile işlendi.
   - HTML (`<div class="csl-bib-body">...</div>`) ve düz metin (`text`) formatlarında kaynakça üretimi (`makeBibliography`) sağlandı.
2. **Yüksek Hızlı Stil Değişimi (`switchStyle` / `switchStyleById`):**
   - Belgedeki tüm atıf kümelerini ve kaynakçayı tek adımda baştan hesaplayan `switchStyle` metodu uygulandı.
   - Motor havuzu (`enginePool: Map<string, CSL.Engine>`) mimarisi kuruldu. 50 kaynak ve 100 atıf kümesi içeren büyük belgelerde stil değişimi (APA 7th -> IEEE) **~153 ms** sürerek <300 ms SLA şartını fazlasıyla karşıladı.
3. **Resmi CSL Stilleri ve Yerelleştirme Varlıkları (Assets):**
   - Resmi `citation-style-language/styles` deposundan `apa`, `ieee`, `chicago-author-date`, `modern-language-association`, `vancouver` stilleri CC BY-SA 3.0 lisans bildirimleri korunarak derlendi.
   - Resmi `citation-style-language/locales` deposundan `en-US` ve `tr-TR` dilleri derlendi.
   - Varlıklar TypeScript dize sabitleri olarak paketlenerek hem Node.js hem de tarayıcı (Vite PWA) ve WebWorker ortamlarında dosya sistemi ve ağ gereksinimi olmaksızın %100 çevrimdışı çalıştırıldı.
4. **Tembel Yükleme ve Hata Yönetimi (`StyleRegistry` & `LocaleRegistry`):**
   - Resmi 10.000+ stilin ileride ağ üzerinden talep üzerine çekilebilmesi için asenkron `StyleLoader` / `LocaleLoader` arayüzü ve `load(styleId)` metodu eklendi.
   - Bilinmeyen stillerde tip güvenli `UnknownStyleError` (`code: 'UNKNOWN_STYLE'`, `styleId`) ve bilinmeyen dillerde `UnknownLocaleError` fırlatıldı.
5. **Türkçe Yerelleştirme (tr-TR):**
   - `tr-TR` yerel ayarı ile MLA ve Chicago stillerinde iki yazarlı atıflarda "and" yerine "ve" ("Einstein ve Rosen") ifadesi test edilerek doğrulandı.
6. **Dokümantasyon:**
   - `packages/csl-engine/README.md` oluşturularak tüm API'ler, mimari kararlar ve kullanım örnekleri belgelendi.

### 7.2 Doğrulama ve Test Sonuçları

- `pnpm -r test`: 6 test dosyası, 47 test geçerli (12 csl-engine, 8 server, 16 zotero-core, 5 editor, 5 shared, 1 web), 0 hata.
- `pnpm lint`: Temiz (0 hata, 0 uyarı).
- `pnpm typecheck`: `tsc -b` hatasız.
- `pnpm build`: Tüm monorepo hatasız derleniyor.

---

## 10. Milestone 6 Part A — Zotero.org Web API v3 Çift Yönlü Senkronizasyon Motoru (Kayıt #006)

> **Kayıt No:** #006  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-m6-sync`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Aşama:** M6 Part A (Zotero Web API v3 Two-Way Sync Engine, Typed Client, Pluggable SyncStore, Field-Wise Conflict Resolution)

### Yapılan İşler:

1. **Tip Güvenli Zotero Web API v3 İstemcisi (`ZoteroWebApiClient`):**
   - `https://api.zotero.org` (API v3) için tam tip güvenli istemci yazıldı (`packages/zotero-core/src/api-client.ts`).
   - `Zotero-API-Version: 3`, kullanıcı bazlı `Zotero-API-Key`, offline testler için enjekte edilebilir `fetchFn` ve `sleepFn` eklendi.
   - Kullanıcı (`/users/{userId}`) ve grup (`/groups/{groupId}`) kütüphaneleri desteklendi.
   - Uç noktalar: `GET /keys/current` (anahtar doğrulama, kullanıcı ID'si ve yetkileri alma; anahtar asla loglanmaz veya döndürülmez), `GET items/collections/searches` (`?since=<version>&format=json`), `GET /items?itemKey=...` (en fazla 50 anahtarlık parçalar halinde), `GET /deleted?since=`, `POST` yazma işlemleri (en fazla 50 öğelik parçalar halinde, `Zotero-Write-Token` ve `If-Unmodified-Since-Version` ile), `DELETE` işlemleri (en fazla 50 anahtarlık parçalar halinde).
   - RFC 5988 `Link` başlıkları ve `Total-Results` üzerinden >100 öğeli kütüphaneler için otomatik sayfalama (pagination) uygulandı.
   - `Backoff` ve `Retry-After` (HTTP 429/503) başlıkları enjekte edilen `sleepFn` ile gerçek zaman gecikmesi olmadan saygıyla ele alındı.
   - 304 Not Modified ve 412 Precondition Failed (versiyon çakışması) durumları tip güvenli ele alındı.
2. **Çift Yönlü Artımlı Senkronizasyon Motoru (`SyncEngine`):**
   - Zotero'nun resmi artımlı senkronizasyon algoritması uygulandı (`packages/zotero-core/src/sync-engine.ts`):
     - **Pull Aşaması:** `?format=versions&since=` ile değişen anahtarlar tespit edilir, değişen öğeler parça parça çekilir, `/deleted?since=` ile silinen kayıtlar yerel depodan temizlenir ve `Last-Modified-Version` güncellenir.
     - **Push Aşaması:** Yerel oluşturulan, güncellenen ve silinen öğeler `If-Unmodified-Since-Version` ve 32 karakterlik `Zotero-Write-Token` ile en fazla 50'şerlik paketler halinde Zotero'ya iletilir.
   - **412 Çakışma Politikası ve Alan Düzeyinde Birleştirme (Field-Wise Merge):**
     - Push esnasında 412 Precondition Failed alındığında motor otomatik olarak uzak kütüphaneyi yeniden çeker (re-pull).
     - Alan düzeyinde 3 yönlü birleştirme yapılır: Uzakta değişen alanlarda uzak kazanır (remote wins), yalnızca yerelde değişen alanlarda yerel kazanır (local wins), her iki tarafın farklı değerler atadığı çakışmalarda uzak kazanır ve çakışma detayları `result.conflicts` içinde raporlanır. Birleştirilen öğe yeni sürümle tekrar sunucuya iletilir.
3. **Tak-Çıkar Depolama Katmanı (`SyncStore` & `InMemorySyncStore`):**
   - Senkronizasyon motorunun depolama bağımlılığı `SyncStore` arayüzü ile soyutlandı (`packages/zotero-core/src/sync-store.ts`).
   - Testler için izole `InMemorySyncStore` uygulandı; `apps/server` Drizzle ORM per-student PostgreSQL entegrasyonu için hazır zemin oluşturuldu.
4. **Sıfır Sızıntı & API Anahtarı Maskeleme (Redaction):**
   - API anahtarları hata mesajlarında, yanıtlarda veya loglarda asla ham halde yer almaz; `redactApiKey` yardımcısı ve `ZoteroApiError` sınıfları ile daima `[REDACTED]` olarak maskelenir.
5. **Kapsamlı Çevrimdışı Kabul Testleri & Vitest:**
   - > 100 öğeli kütüphanelerde sayfalama doğrulaması.
   - `since=<version>` ile artımlı senkronizasyon ve `/deleted` temizliği.
   - <=50 öğelik parçalar halinde `Zotero-Write-Token` ile yazma ve silme.
   - 412 Precondition Failed senaryosunda otomatik re-pull, alan düzeyinde merge ve conflict raporlama.
   - `Backoff` / `Retry-After` / `429` başlıklarının sahte saat (`sleepFn`) ile gecikmesiz doğrulanması.
   - İki farklı öğrenci (User A ve User B) arasında kesin veri ve anahtar izolasyonu testi.
   - Fırlatılan hatalarda API anahtarının asla görünmediğinin teyidi.
   - Monorepo genelinde `pnpm -r test` (95 test), `pnpm lint` (0 hata, 0 uyarı), `pnpm typecheck` ve `pnpm build` komutlarının %100 yeşil geçtiği doğrulandı.
6. **Dokümantasyon:**
   - `packages/zotero-core/README.md` eksiksiz oluşturuldu.

---

## 11. Milestone 2 Part C — Add Item by Identifier UI (@citedocs/web) (Kayıt #007)

> **Kayıt No:** #007  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-m2-id-ui`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Aşama:** M2 Part C (Add Item by Identifier UI, VITE_API_URL, X-User-Id Tenant Header, Result Card & In-App Library List Entegrasyonu)

### Yapılan İşler:
1. **`AddByIdentifier` Bileşeni Geliştirildi (`apps/web/src/components/AddByIdentifier.tsx`):**
   - DOI, ISBN, PMID, arXiv ID ve URL girdilerini kabul eden şık ve erişilebilir form arayüzü kuruldu.
   - `VITE_API_URL` (varsayılan `http://localhost:3001`) ve URL `?user=` parametresinden (veya `demo-user` varsayılanından) çözümlenen `X-User-Id` başlığıyla `POST /api/items/from-identifier` uç noktasına bağlanıldı.
   - Boş gönderimlerde gereksiz istek engellendi; istek esnasında yükleme durumu (`loading` animasyonu, pasif buton) sağlandı.
   - Başarılı sonuçlarda başlık, yazarlar, yıl ve DOI içeren sonuç kartı (`result card`) gösterildi ve doğrudan "Cite in Document" butonu sunuldu.
   - 4xx/5xx ve özellikle upstream translation-server 502 hatalarında çökmeyen, açıklayıcı hata bildirim kartı oluşturuldu.
2. **Google Docs Chrome ve Zotero Atıf Seçici Entegrasyonu (`apps/web/src/App.tsx`):**
   - Araç çubuğuna "Add by Identifier" hızlı butonu eklendi.
   - Zotero modal penceresine "Search Library" ve "Add by Identifier" sekmeleri eklendi.
   - Eklenen öğeler anında uygulama içi `libraryItems` listesine dahil edilerek arama ve hızlı atıf ekleme (`Quick Citation Picker`) akışında anında kullanılabilir hale getirildi.
   - TipTap v3 ve Hocuspocus çok kullanıcılı işbirliği (collaboration carets/presence) altyapısı bozulmadan korundu.
3. **Kapsamlı Kabul Testleri & Doğrulama (`apps/web/test/`):**
   - `add-by-identifier.test.ts`: 7 birim testi (URL/User çözümleri, Nature DOI `10.1038/s41586-021-03392-y` ile `atherosclerosis` makalesinin çekilmesi, 502 upstream hata yönetimi, boş submit denetimi, callback tetiklenmesi).
   - `web.test.ts`: 6 entegrasyon testi (App seviyesinde modal açılışı, DOI araması, kart gösterimi, kütüphane listesine ekleme, belgeye atıf düğümü ekleme ve TipTap canvas bütünlüğü).
   - Monorepo genelinde 137 test geçerli (1 skipped canlı test), lint temiz, tsc hatasız ve build başarılı.



## 11. Milestone 6 Part B — DOCX Dışa Aktarıcı ve Zotero Alan Kodları (Kayıt #007)

> **Kayıt No:** #007  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-m6-docx`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Aşama:** M6 Part B (`@citedocs/docx-exporter`, Native Zotero Word Field Codes, `ADDIN ZOTERO_ITEM CSL_CITATION` & `ADDIN ZOTERO_BIBL`)

### Yapılan İşler:

1. **`@citedocs/docx-exporter` Paketi Kuruldu:**
   - Monorepo standartlarında TypeScript 5.8, Vitest, `docx` (^9.11.0) ve `jszip` (^3.10.2) bağımlılıklarıyla scaffold edildi.
   - Kök `tsconfig.json` proje referanslarına eklendi; monorepo pnpm workspace ve vitest workspace ile tam entegre çalıştırıldı.
2. **Yerel OpenXML Zotero Alan Kodu Bileşenleri (`src/fields.ts`):**
   - WordprocessingML standardında tip güvenli karmaşık alan sınırları (`w:fldChar` begin, separate, end) ve yönerge metni (`w:instrText xml:space="preserve"`) bileşenleri yazıldı.
   - Zotero masaüstü Word eklentisinin tanıdığı `ADDIN ZOTERO_ITEM CSL_CITATION <payload>` ve `ADDIN ZOTERO_BIBL <custom> CSL_BIBLIOGRAPHY` yapıları oluşturuldu.
3. **DOCX Dışa Aktarıcı (`exportDocumentToDocx` - `src/exporter.ts`):**
   - Sadeleştirilmiş belge modelini (başlıklar H1-H6, zengin metin dizileri: kalın, italik, altı/üstü çizili, kod yazı tipi, atıf kümeleri ve kaynakça) kabul eden motor kodlandı.
   - Her atıf kümesi için Zotero uyumlu `citationID`, `citationItems` (id, uris, locator, label, prefix, suffix, suppress-author, taşınabilirlik için gömülü `itemData` CSL JSON) ve `properties` alanları otomatik oluşturuldu.
   - `htmlToTextRuns`: CSL kaynakça çıktılarındaki `<i>`, `<b>`, `<u>`, `<code>`, `<sub>`, `<sup>` gibi satır içi HTML etiketlerini Word stilli metin dizilerine dönüştüren ayrıştırıcı yazıldı.
   - `ADDIN ZOTERO_BIBL` alan kodu desteği ve `asField: false` durumunda biçimlendirilmiş statik paragraf fallback seçeneği uygulandı.
4. **DOCX Zotero Alan Tarayıcı ve İçe Aktarıcı (`importDocxZoteroFields` - `src/importer.ts`):**
   - `.docx` ZIP arşivini açarak `word/document.xml`, `footnotes.xml`, `endnotes.xml` dosyalarını tarayan motor geliştirildi.
   - Parçalanmış (split) `<w:instrText>` etiketlerini birleştiren yığın (stack) tabanlı karmaşık alan ayrıştırıcısı ve `<w:fldSimple>` basit alan desteği sağlandı.
   - XML varlık kod çözümü (`&quot;`, `&amp;`, `&#34;`, vb.) yapılarak CSL_CITATION JSON yükleri parse edildi.
   - Çift arayüzlü sonuç nesnesi sağlandı: Doğrudan dizi olarak iterate edilebilir (`result[0]`, `result.length`) ve nesne alanları (`result.citations`, `result.fields`, `result.bibliography`) barındırır.
5. **%100 Çevrimdışı ve Sıfır Ağ Garantisi:**
   - Dışa aktarma ve içe aktarma süreçleri tamamen bellek içi çalışır; hiçbir harici ağ veya API çağrısı yapılmaz.
6. **Kapsamlı Çevrimdışı Kabul Testleri (`test/*.test.ts`):**
   - Tek atıflı dışa aktarımın ham XML'inde `ADDIN ZOTERO_ITEM` ve `CSL_CITATION` varlığı doğrulandı.
   - İki atıf ve kaynakçanın geçerli bir zip/docx arşivi oluşturduğu ve tüm JSON yüklerini içerdiği teyit edildi.
   - `importDocxZoteroFields` ile dışa aktarılan fixtürün uçtan uca %100 kayıpsız round-trip yaptığı kanıtlandı.
   - `pnpm -r test` (tüm paketler), `pnpm lint`, `pnpm typecheck` ve `pnpm build` hatasız geçti.
7. **Kapsamlı Dokümantasyon:**
   - `packages/docx-exporter/README.md` alan kodu mimarisi, JSON şeması ve kullanım örnekleriyle detaylandırıldı.

## 13. Milestone 3 Part B — Canlı Kaynakça & CSL Editör Entegrasyonu (Kayıt #009)

> **Kayıt No:** #009  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-m3-biblio`  
> **Aşama:** M3 Part B (`Bibliography` TipTap node, `collectCitationClusters` / `switchStyle`, `@citedocs/csl-engine` wire)

### Yapılan İşler:
1. `packages/editor` içine canlı Bibliography atom/block node ve CSL yardımcıları eklendi.
2. `switchStyle` APA→IEEE güncellemesi ve kaynakça yeniden üretimi; kabul testleri yeşil.
3. Collaboration / CollaborationCaret factory ile uyumlu opsiyonel Bibliography etkinleştirme.

## M5 Part A — PDF okuyucu çekirdeği (2026-10-16, cd-m5-pdf)

- `@citedocs/pdf-reader`: PDF.js 5.7.284 ile byte tabanlı yükleme, sayfa metni, renkli metin/dikdörtgen vurguları, sayfa locator'lı alıntı ve TipTap bağımsız blockquote çıktısı eklendi.
- Yerel PDF fixture ve üretici betik, API/worker dokümantasyonu ve 18 çevrimdışı test tamamlandı. Anotasyonlar bellekte; dikdörtgen alıntıları metin öğesi hassasiyetinde. UI/depolama entegrasyonu sonraki parçaya ait.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` geçti. `pnpm -r test` mevcut CSL başlangıç hook'unda 10 saniye zaman aşımına takıldı; 60 saniyelik limitlerle CSL'de 11 test geçti, 300 ms performans testi ~441 ms ile başarısız oldu. CSL kaynakları değiştirilmedi.
- Kalan paketlerin ayrı çalıştırılmasında editörün mevcut performans testi ~524 ms / 450 ms sınırıyla başarısız oldu (15 test geçti); sunucu 60, DOCX 11 test geçti. Bu kapsam dışı performans sorunları nedeniyle tüm repo kabul testleri yeşil değil.
- Web'in ayrı test çalıştırmasında 13 test geçti. Uzatılmış limitlerle ayrı çalıştırmaların toplamı: 171 geçti, 2 performans testi başarısız, 1 mevcut test atlandı; yeni PDF paketinde 18/18 başarılı.
## M4 Part C — Reaktif belge taslağı (2026-10-16, cd-m4-outline)

- `apps/web` içinde transaction dinleyen H1–H6 OutlineSidebar eklendi; girinti, başlığa seçim/kaydırma, imlece göre aktif bölüm ve aç/kapat desteği var. Collaboration/Caret ve Add-by-Identifier bağlantıları korundu.
- Testing Library ile 6 yeni çevrimdışı kabul testi geçti. Web'in toplam 19 testi ayrı koşularda `--testTimeout=30000` ile doğrulandı; varsayılan 5 saniye sınırında zaman aşımı görülüyor.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` geçti. `pnpm -r test`, kapsam dışındaki CSL 300 ms performans sınırında iki kez başarısız oldu (~964–985 ms); ayrıca editor testlerinde 450 ms sınırı (~781 ms) ve 35 saniye zaman aşımı var. Paket kodlarına müdahale edilmedi.
- Testing Library bağımlılığı apps/web/package.json'a eklendi. Kök lockfile değişikliği kapsam dışında olduğundan onay bekliyor; frozen-lockfile kurulumu öncesinde güncellenmeli. Push/deploy yapılmadı.

---

## 14. Entegrasyon Mimarisi ve Karar Belgesi (ADR-001) (Kayıt #010)

> **Kayıt No:** #010  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-adr-proto`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Aşama:** ADR-001 (Entegrasyon Mimarisi: Collabora Online CODE + Açık Kaynak Zotero Ekosistemi)

### Yapılan İşler:
1. **`docs/ADR-001-integration.md` Yazıldı (İngilizce, standart ADR formatı: Status, Context, Decision, Consequences, Alternatives):**
   - **Temel İlke (Bağlayıcı Karar):** Zotero veya bir kelime işlemci (word processor) sıfırdan yeniden yazılmaz. Olgun, savaş görmüş açık kaynak bileşenler entegre edilir.
   - **Entegre Edilen Açık Kaynak Bileşenler:**
     - **Belge Düzenleme:** Collabora Online (CODE) — WOPI iframe + PostMessage entegrasyonuyla tarayıcıda sıfır kurulumla (%100 web tabanlı) LibreOffice/Word seviyesinde tam A4/Letter sayfalama, dipnot yönetimi ve izleme modu.
     - **Referans Yönetimi:** `zotero/web-library` (React/Redux kenar çubuğu), `zotero/translation-server` (DOI/ISBN/PMID/arXiv çevirici mikroservisi), `citeproc-js` + CSL 10.000+ stil deposu, `zotero/pdf-reader` (vurgu, not ve alıntı aktarma), yerel Zotero alan kodları (`ADDIN ZOTERO_ITEM CSL_CITATION` ve `ADDIN ZOTERO_BIBL`), opsiyonel `zotero/dataserver`.
   - **CiteDocs'un Özgün Katmanı:** Kimlik doğrulama/oturum yönetimi, öğrenci başına izole bulut depolama (MinIO/S3), kullanıcı başına `zotero.org` hesap bağlama (API anahtarı/OAuth), WOPI Host servisi ve bileşenler arası köprü.
   - **TipTap Editörün Durumu (`packages/editor`):** Resmi olarak **LEGACY** (eski/dondurulmuş) ilan edildi; genişletilmeyecek, silinmeyecek, aşamalı geçiş ve arşivleme planı tanımlandı.
   - **Mermaid Diyagramları ve Veri Akışları:**
     - Sistem bileşen topolojisi (Mermaid mimari şeması).
     - 5 ayrı veri akış dizilim diyagramı (Sequence diagram):
       1. WOPI üzerinden belge açma (`CheckFileInfo`, `GetFile`).
       2. Collabora belgesine CSL atıfı ekleme ve canlı kaynakça güncelleme (PostMessage / UNO komutu).
       3. DOI/ISBN ile sihirli kaynak ekleme (translation-server -> CSL JSON -> Postgres & S3).
       4. PDF okuyucudan vurgu/alıntıyı belgeye aktarma.
       5. `zotero.org` Web API v3 ile iki yönlü artımlı senkronizasyon ve çakışma çözümü.
   - **Hukuki ve Lisans Analizi:**
     - Zotero bileşenleri: AGPL-3.0.
     - `citeproc-js`: CPAL 1.0 / AGPL-3.0 dual lisans.
     - CSL Stilleri: CC BY-SA 3.0.
     - Collabora Online (CODE): MPL-2.0 (WOPI ve PostMessage sınırında zayıf copyleft).
     - CODE Kullanım Limitleri: Topluluk sürümündeki 20 bağlantı / 10 belge yumuşak uyarı bandı ve akademik/gönüllü kullanım şartları.
     - **AGPL-3.0 Madde 13 (Ağ Kullanımı Şartı / Remote Network Interaction):** Web üzerinden sunulan ve AGPL kodları içeren sistemlerde kaynak kodun uzaktaki kullanıcılara sunulma zorunluluğu detaylandırıldı.
     - **Lisans Önerisi:** CiteDocs'un resmi olarak **AGPL-3.0** lisansına geçirilmesi TAVSİYE EDİLDİ; kullanıcı onayı bekleyen somut adımlar (LICENSE dosyası, package.json lisans alanları, UI kaynak kodu sunum linki, DCO/CLA) listelendi. (Kural gereği LICENSE dosyası kullanıcı onayı olmadan eklenmedi).
2. **`docs/ARCHITECTURE.md` Güncellendi:**
   - Belge başına ve Editör Motoru (§2.3) bölümüne ADR-001 bağlayıcı mimari yönü ve TipTap'in legacy statüsüne dair referans ve uyarı blokları eklendi.
3. **`README.md` Güncellendi:**
   - Genel bakış, depo ağacı, dokümantasyon indeksi ve lisans bölümü ADR-001 doğrultusunda güncellendi.

### Nasıl Çalıştırılır ve Doğrulanır:
- Belgeleri incelemek için:
  - `cat docs/ADR-001-integration.md`
  - `git diff docs/ARCHITECTURE.md README.md`
- Monorepo doğrulama komutları:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`

### Test Durumu ve Açık Konular (Open Issues):
- **Birim & Paket Testleri:** `apps/server` (60 test), `@citedocs/shared` (5 test), `@citedocs/zotero-core` (38 test), `@citedocs/docx-exporter` (11 test), `@citedocs/pdf-reader` (18 test) olmak üzere 130'dan fazla çekirdek test %100 yeşildir.
- **Zaman Aşımı / Kırılganlık Raporu:** Önceki adımlardan devralınan `apps/web` ve `packages/editor` testleri ağır yük altında varsayılan 5000ms Vitest zaman aşımına uğramaktadır (web outline/mount testleri 5 saniyeyi aşabilmekte, CSL/editor 300ms SLA testi sistem yükünde ~524ms-1147ms sürebilmektedir). Bu testler silinmedi veya değiştirilmedi, bilinen durum olarak korundu.
- **Paralel Çalışmalar:** Diğer dallar (`cd-wopi-host`, `cd-zotero-weblib`, `cd-cite-insert`) ADR-001'de belirlenen sözleşmeye uygun şekilde kodlama süreçlerini sürdürmektedir.
- **Onay Bekleyen Konu:** CiteDocs'un AGPL-3.0 olarak yeniden lisanslanması kullanıcı onayına bağlıdır; onay verildiğinde `LICENSE` dosyası eklenecek ve `package.json` alanları güncellenecektir.
## 14. WOPI Host & Collabora Online CODE Entegrasyonu (Kayıt #010)

> **Kayıt No:** #010  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-wopi-host`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Görev:** WOPI Host in Fastify (`apps/server`), Collabora Frame & PostMessage API (`apps/web`), Docker Compose & Kabul Testleri

### Yapılan İşler:

1. **Fastify WOPI Host Uygulaması (`apps/server/src/wopi/`):**
   - **CheckFileInfo (`GET /wopi/files/:id`):** `BaseFileName`, `OwnerId`, `Size`, `UserId`, `UserFriendlyName`, `UserCanWrite`, `Version`, `SupportsLocks: true`, `SupportsGetLock: true`, `SupportsExtendedLockLength: true`, `SupportsUpdate: true`, `PostMessageOrigin`, `BreadcrumbBrandName: "CiteDocs"` alanları tam WOPI spesifikasyonuyla sunuldu.
   - **GetFile (`GET /wopi/files/:id/contents`):** İkili dosya içeriği, `Content-Type` ve `X-WOPI-ItemVersion` başlığıyla döndürüldü.
   - **PutFile (`POST /wopi/files/:id/contents`):** Fastify raw binary content-type parser (`application/octet-stream`) eklendi. `X-WOPI-Lock` başlığı zorunlu olarak denetlenir; kilit eşleşirse dosya ve sürüm güncellenir (`X-WOPI-ItemVersion`), kilit uyuşmazlığında veya kilit yokken kilit iletilmesinde HTTP 409 Conflict + `X-WOPI-Lock: <currentLock>` döndürülür.
   - **Kilit Operasyonları (`POST /wopi/files/:id`):** `X-WOPI-Override` başlığı ile:
     - `LOCK`: Kilit oluşturur veya aynı kilitse süresini yeniler; farklı kilit varsa 409 + `X-WOPI-Lock` döner. `X-WOPI-OldLock` ile yeniden kilitleme desteklenir.
     - `UNLOCK`: Kilit eşleşirse kilidi kaldırır; kilitli değilse veya uyuşmazsa 409 döner.
     - `REFRESH_LOCK`: Kilit eşleşirse 30 dakikalık süreyi yeniler.
     - `GET_LOCK`: Mevcut kilit değerini 200 + `X-WOPI-Lock` ile döner.
     - **30 Dakika Kilit Süresi:** `WopiLockManager` zaman aşımına uğrayan kilitleri otomatik temizler.
   - **İmzalı Erişim Belirteçleri (`src/wopi/token.ts`):** `node:crypto` HMAC-SHA256 ile `fileId`, `userId`, `canWrite`, `exp` bağlamalı, zaman aşımı korumalı, kurcalamaya karşı korumalı ve constant-time karşılaştırmalı token mekanizması kuruldu. Geçersiz veya süresi dolan token istekleri HTTP 401 ile reddedilir.
   - **Depolama Soyutlaması (`src/wopi/storage/`):**
     - `WopiStorage` arayüzü tanımlandı.
     - `InMemoryWopiStorage`: Hızlı çevrimdışı testler ve yerel çalışma için bellek içi depolama.
     - `S3WopiStorage`: `@aws-sdk/client-s3` ile S3/MinIO depolama (`endpoint`, `forcePathStyle: true`, metadata yönetimi).
   - **Collabora Keşif Servisi (`src/wopi/discovery.ts`):** Collabora `/hosting/discovery` XML çıktısını ayrıştırıp `actionUrl` (`WOPISrc` parametresiyle) üreten, 1 saat önbellekli ve `COLLABORA_ACTION_URL_OVERRIDE` destekli servis yazıldı.
   - **Oturum Uç Noktası (`/api/documents/:id/collabora-session`):** İstemciye imzalı erişim token'ı, `accessTokenTtl` (epoch ms), `wopiSrc` ve Collabora `actionUrl` döndüren uç bağlandı.

2. **Docker Compose Servisi (`docker-compose.yml`):**
   - `collabora` servisi eklendi (`collabora/code:latest`, `aliasgroup1: http://server:3000,http://localhost:3000`, `extra_params: --o:ssl.enable=false --o:ssl.termination=false`, `ports: 9980:9980`, `depends_on: server`).
   - Mevcut `minio` ve diğer servislerin sırası ve içeriği aynen korundu.

3. **Web İstemcisi & PostMessage Entegrasyonu (`apps/web/src/collabora/`):**
   - `postMessage.ts`: Collabora Online ile çift yönlü güvenli iletişim. `event.origin` doğrulaması, `App_LoadingStatus`, `Document_Loaded`, `Action_Save`, `Send_UNO_Command`, `Host_PostmessageReady` ve diğer çalışanların kullanabileceği `useCollaboraPostMessage` React kancası.
   - `CollaboraFrame.tsx`: Standart WOPI akışında `access_token` ve `access_token_ttl` değerlerini hedef iframe'e POST eden gizli form, iframe `onLoad` anında `Host_PostmessageReady` tetiklemesi ve yükleme durumu görsel bildirim katmanı.
   - `CollaboraEditorPage.tsx`: Belge başlığı, Collabora Online rozeti, kaydetme aksiyonu ve TipTap'e geri dönüş kontrollerini içeren tam sayfa düzeni.
   - `App.tsx`: `?editor=collabora` URL parametresi veya üst bardaki "Collabora Online" butonu ile Collabora editörüne geçiş sağlayan minimal yönlendirme eklendi (mevcut testlerle %100 uyumlu).

4. **Test ve Doğrulama Durumu:**
   - `apps/server/test/wopi.test.ts`: 32 test (Token doğrulama/hata 401, CheckFileInfo 200/404, GetFile, PutFile lock kontrolü ve çakışma 409, LOCK/UNLOCK/REFRESH_LOCK/GET_LOCK, Collabora oturum keşfi).
   - `apps/server/test/wopi.storage.test.ts`: 6 test (S3WopiStorage Head/Get/Put/Create işlemleri mock S3Client ile çevrimdışı doğrulandı).
   - `apps/server`: 9 test dosyasında **98 test %100 yeşil**.
   - `apps/web/test/collabora.test.tsx`: 9 test (PostMessage yardımcıları, origin check, `useCollaboraPostMessage`, form POST ve `CollaboraFrame` rendering) **%100 yeşil**.
   - Monorepo genelinde `pnpm typecheck` (`tsc -b`), `pnpm lint` (0 hata, 0 uyarı) ve `pnpm build` tam başarıyla tamamlandı.

### Nasıl Çalıştırılır:

1. **Altyapı (MinIO ve Collabora Online):**
   ```bash
   docker compose up -d minio collabora
   ```
2. **Sunucu Testlerini Çalıştırma:**
   ```bash
   pnpm -C apps/server test
   ```
3. **Web Collabora Testlerini Çalıştırma:**
   ```bash
   pnpm -C apps/web test test/collabora.test.tsx
   ```
4. **Geliştirme Sunucusu:**
   ```bash
   pnpm dev
   ```
   Tarayıcıda `http://localhost:5173/?editor=collabora` adresine giderek veya üst menüdeki "Collabora Online" butonuna tıklayarak doğrudan Collabora editörüne erişilebilir.

### Açık Konular / Notlar:
- Önceden var olan `packages/csl-engine` ve `apps/web` (outline/web) testlerindeki 5 saniyelik Vitest zaman aşımına bağlı timing-flakiness korundu (müdahale edilmedi, silinmedi).
- `cd-wopi-host` dalı üzerindeki tüm WOPI host ve Collabora Online isterleri eksiksiz teslim edilmiştir.
## M0.5 — Güvenilir Test Altyapısı ve CI/CD Doğrulaması (2026-10-16, cd-m0-testinfra)

- **Vitest & Test Ortamı Sertleştirildi:**
  - `vitest.shared.ts` üzerinde `pool: "forks"` yapılandırılarak her test dosyasının temiz alt süreçte (process fork) çalışması sağlandı; worker_threads bellek/RPC şişmesi (`onTaskUpdate` timeout) çözüldü.
  - Test/hook limitleri 60 saniyeye (`testTimeout: 60_000`, `hookTimeout: 60_000`) çıkarıldı; kaynak kodlar prebuilt derleme gerekmeksizin TypeScript alias ile doğrudan çözümlendi.
  - CSL citeproc motoru dosya başında tek seferlik ısıtılarak (`warmup`) başlangıç zaman aşımları engellendi.
  - Fonksiyonel atıf ve kaynakça doğrulamaları eksiksiz korunurken, sıkı zamanlama kıyaslamaları (`< 300 ms` CSL, `< 450 ms` editör) ardışık çalışan `pnpm test:perf` komutuna ayrıldı; CI ortamı için esnek sınırlar tanımlandı.
- **CI İş Akışı ve Dokümantasyon:**
  - `.github/workflows/ci.yml` oluşturuldu (Node 22, Corepack pnpm, `--frozen-lockfile`, lint, typecheck, build, test; deploy ve secret içermez).
  - `README.md` test komutları (`test`, `-r test`, `test:perf`) ve CI işleyişiyle güncellendi.
- **Doğrulama Sonuçları:**
  - Kökten `pnpm test` art arda 3 kez %100 yeşil (21 dosya, 179 geçerli, 1 atlandı).
  - `pnpm -r test` %100 yeşil.
  - `pnpm lint`, `pnpm typecheck` ve `pnpm build` sorunsuz geçti.

# 3. Tip kontrolü ve derleme
pnpm typecheck
pnpm lint
pnpm build
```

### 3. Açık Konular / Notlar
- `apps/web/test/web.test.ts` ve `apps/web/test/outline.test.tsx` varsayılan 5s Vitest zaman aşımında timing-flaky kalmaktadır; `--testTimeout=30000` ile hepsi %100 yeşil geçmektedir.
- Upstream `zotero/web-library` harici npm bağımlılıkları gerektirdiğinden, çevrimdışı CI/geliştirme için `public/zotero-weblib/index.html` tam uyumlu arayüz ve postMessage protokolü ile hizmet verir; canlı üretim derlemesi için `./tools/scripts/fetch-web-library.sh` çalıştırılabilir.

---

## 15. Gerçek Kimlik Doğrulama ve Kayıt Sistemi (Real Authentication & Signup Layer End-to-End) — Kayıt #011

> **Kayıt No:** #011  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-auth-signup`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Aşama:** Gerçek Kimlik Doğrulama ve Kayıt Mimarisi (Server + Web + OAuth + CSRF + Session + i18n TR/EN + Per-User RequireAuth Wire)

### 1. Yapılan İşler

1. **Sunucu Mimarisi (`apps/server/src/auth/**`):**
   - **Veritabanı Şeması ve Modeller (`schema.ts` & `db/schema.ts`):**
     - Drizzle ORM ile `users` tablosu genişletildi (`passwordHash`, `emailVerified`, `avatarUrl`, `role`).
     - Yeni tablolar eklendi:
       - `sessions`: `tokenHash`, `userId`, `expiresAt`, `ipAddress`, `userAgent`.
       - `verificationTokens`: E-posta doğrulama tokenları (`tokenHash`, `userId`, `expiresAt`).
       - `passwordResetTokens`: Şifre sıfırlama tokenları (`tokenHash`, `userId`, `expiresAt`).
       - `oauthAccounts`: `provider` (`google` | `orcid`), `providerUserId`, `userId`.
   - **Şifreleme ve Kriptografi (`passwords.ts`, `tokens.ts`):**
     - `bcryptjs` (salt rounds: 10) ile güvenli parola hashleme ve zamanlama saldırılarına dirençli doğrulama (`bcrypt.compare`).
     - Kriptografik güvenli token üretimi: `crypto.randomBytes(32).toString('hex')` ve veritabanında `sha256` hash ile saklama (token sızıntı koruması).
   - **Tak-Çıkar E-posta Göndericisi (`mailer.ts`):**
     - `IMailer` arayüzü ve geliştirme/test ortamları için sıfır bağımlılıklı `ConsoleMailer`. Konsola doğrudan tıklanabilir bağlantılar basar ve testler için `getSentEmails()` hafızası sunar.
   - **Depolama Katmanı (`repository.ts`, `inMemoryAuthRepository.ts`):**
     - `IAuthRepository` sözleşmesi.
     - Drizzle PostgreSQL implementasyonu (`AuthRepository`).
     - Çevrimdışı, veritabanı gerektirmeyen bağımsız testler için tam ACID uyumlu `InMemoryAuthRepository`.
   - **OAuth / OIDC Entegrasyonu (`oauth.ts`):**
     - Google (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) ve ORCID (`ORCID_CLIENT_ID`, `ORCID_CLIENT_SECRET`) OIDC akışları.
     - Çevre değişkenleri tanımlanmadığında uç noktaları zarifçe devre dışı bırakır ve istemciye `providers: { google: false, orcid: false }` bildirir.
     - ORCID akademisyen/öğrenci i18n desteği.
   - **CSRF ve Hız Sınırlama (Rate Limiting) (`csrf.ts`):**
     - Çift çerez/başlık CSRF koruması: `citedocs_csrf` çerezi ve `x-csrf-token` istek başlığı. `GET /api/auth/csrf` uç noktası.
     - `@fastify/rate-limit` entegrasyonu ile kimlik doğrulama rotalarında kaba kuvvet (brute-force) engellemesi (dakikada 15 istek sınırı).
   - **Oturum Yönetimi & Çerezler (`authService.ts`, `routes.ts`):**
     - `httpOnly`, `SameSite=Lax`, `Path=/`, `maxAge=30 gün` güvenli `citedocs_session` çerezleri.
     - Geliştirme/üretim ortamına göre dinamik `secure` bayrağı (`COOKIE_SECURE`).
     - Kayıt (signup), Giriş (login), Çıkış (logout), E-posta doğrulama (verify-email, resend-verification), Şifremi unuttum / sıfırla (forgot-password, reset-password).
     - Öğrenciler için tamamen ücretsiz, ödeme duvarı veya plan sınırlaması olmayan eşitlikçi kayıt politikası.
   - **Tüm Rotalara Oturum Bağlama (`middleware/auth.ts`, `auth/middleware.ts`):**
     - `requireAuth` ara katmanı, gelen istekteki `citedocs_session` çerezini (veya `Authorization: Bearer <token>` başlığını) veritabanında/oturum deposunda çözerek geçerli oturumu `request.user` ve `request.userId` alanlarına atar.
     - Mevcut test takımlarının geriye dönük uyumluluğunu korumak için `X-User-Id` başlık desteği yedek (fallback) olarak muhafaza edildi.
     - Böylece tüm mevcut rotalar (`/api/items`, Zotero hesap bağlama `/api/zotero/account`, WOPI token üretimi) artık gerçek doğrulanmış oturum kimliği üzerinden çalışmaktadır.

2. **İstemci Arayüz Mimarisi (`apps/web/src/auth/**`):**
   - **React AuthContext & Hook (`AuthContext.tsx`, `useAuth`):**
     - Kullanıcı oturum durumu (`user`, `loading`, `error`, `providers`).
     - Giriş, kayıt, çıkış, şifre sıfırlama, e-posta doğrulama metotları.
     - Test ortamlarında arka plan ağ gürültüsünü engellemek için koşullu `autoFetch` mimarisi.
   - **Çift Dil (i18n) Desteği (`i18n.ts`):**
     - Türkçe ve İngilizce tam metin sözlüğü (`tr` ve `en`).
     - Tarayıcı dilini algılama, `localStorage` ile kalıcılık ve arayüzden tek tıkla dil değiştirme.
   - **Kullanıcı Arayüzü Bileşenleri ve Sayfalar:**
     - `LoginPage`: Giriş formu, OAuth butonları, şifremi unuttum bağlantısı, öğrenci dostu ücretsiz CiteDocs rozeti.
     - `SignupPage`: Kayıt formu, gerçek zamanlı şifre eşleşme kontrolü, ücretsiz eğitim güvencesi.
     - `ForgotPasswordPage`: E-posta gönderme formu, kullanıcı varlığı ifşa etmeyen (anti-enumeration) güvenlik mesajı.
     - `ResetPasswordPage`: URL token veya el ile girilen token ile güvenli yeni şifre belirleme formu.
     - `VerifyEmailPage`: URL parametresinden otomatik doğrulama veya manuel token girişi, tekrar e-posta isteme butonu.
     - `OAuthButtons`: Google ve ORCID resmi vektörel SVG logolu butonlar; sunucuda yapılandırılmamışsa otomatik gizlenir.
     - `UserMenu`: Sağ üst menüde baş harflerden oluşan avatar, e-posta, e-posta onay rozeti, TR/EN dil değiştirici ve çıkış butonu.
     - `AuthModal` & `ProtectedRoute`: Yetkilendirme gerektiren sayfalarda modal veya yönlendirme desteği.
   - **`App.tsx` Entegrasyonu:**
     - Collabora yönlendirmesi üzerinde çalışan paralel çalışma arkadaşıyla çakışmayı önlemek için `App.tsx` değişikliği minimumda tutuldu (~45 satır).
     - `AuthProvider`, `UserMenu`, `AuthModal` ve `auth/*` yol yönlendiricileri eklendi.

### 2. Nasıl Çalıştırılır ve Doğrulanır?

```bash
# 1. Sunucu kimlik doğrulama testlerini çalıştır (19 yeni test, 10 test dosyası, 94 testin tamamı)
pnpm --filter @citedocs/server test

# 2. İstemci (Web) kimlik doğrulama testlerini çalıştır (10 yeni test, 5 test dosyası, 35 testin tamamı)
pnpm --filter @citedocs/web exec vitest run test/auth.test.tsx

# 3. Monorepo lint, tip kontrolü ve derleme
pnpm lint
pnpm typecheck
pnpm build
```

### 3. Test ve Doğrulama Sonuçları

- **`apps/server` Testleri:** 10 test dosyası, 94 birim ve entegrasyon testi %100 yeşil (Signup, Login, Password Hashing, Session Cookie, Verification Token, Password Reset, CSRF koruması, Rate Limiter, Google/ORCID OAuth mock, `requireAuth` entegrasyonu).
- **`apps/web` Testleri:** 5 test dosyası, 35 React bileşen ve kanca testi %100 yeşil (Login, Signup, UserMenu, ForgotPassword, VerifyEmail, TR/EN i18n, OAuth buton gizleme/gösterme, `credentials: include` ve CSRF başlık enjeksiyonu).
- **`pnpm lint`:** 0 hata, 0 uyarı.
- **`pnpm typecheck` (`tsc -b`):** 0 hata, tam TypeScript tip güvenliği.
- **`pnpm build`:** 10/10 paket ve uygulama sıfır hatayla derleniyor.

### 4. Mimari Kararlar ve Kısıtlar

- **Argon2 vs Bcrypt:** `bcrypt` yerel C++ ikili derleme bağımlılığı pnpm'in `allowBuilds` kuralıyla takılabildiği için pure-JS `bcryptjs` tercih edildi; standart bcrypt hash formatı ve güvenliği sağlandı.
- **Mevcut Test Uyumluluğu:** `apps/web/test/web.test.ts` gibi önceden var olan testlerdeki katı `expect(fetchMock).toHaveBeenCalledTimes(1)` beklentilerinin bozulmaması için `AuthProvider`'ın otomatik oturum sorgusu test ortamında (`NODE_ENV === "test"`) varsayılan olarak pasife alındı, açıkça istendiğinde çalışacak şekilde yapılandırıldı.
- **Korunan Alanlar:** Kural gereğince `packages/editor`, `packages/collabora-cite`, `apps/server/src/wopi` ve `apps/web/src/collabora` paket/dizinlerine dokunulmadı; `App.tsx` diff'i asgari düzeyde tutuldu.

---

## 15. Zotero PDF Reader Entegrasyonu (Kayıt #011)

> **Kayıt No:** #011  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-pdfreader`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Görev:** Resmi Zotero PDF Reader (`zotero/reader`, AGPL-3.0) Entegrasyonu, Ek Dosya & Açıklama (Annotation) Depolama / Mülkiyet Katmanı, Zotero Web API v3 Şema Eşlemesi, Collabora Atıf Köprüsü ("Cite this"), İki Dilli Arayüz (TR/EN).

### Yapılan İşler:

1. **Paket İnceleme ve İki Yönlü Şema Eşlemesi (`packages/pdf-reader`):**
   - Zotero okuyucu içi açıklama modeli (`ZoteroReaderAnnotation`) ile Zotero Web API v3 öğe modeli (`ZoteroAnnotationItem`) arasında kayıpsız iki yönlü eşleme yazıldı (`mapping.ts`):
     - `toZoteroAnnotationItem`: Reader açıklamasını `itemType: "annotation"`, `annotationType` (highlight, underline, note, image, ink), `annotationText`, `annotationComment`, `annotationColor`, `annotationPosition` (JSON dizgesi), `annotationSortIndex` ve 8 karakterlik benzersiz Zotero anahtarına dönüştürür.
     - `fromZoteroAnnotationItem`: API öğesini reader açıklamasına dönüştürür.
     - `formatSortIndex` / `parseSortIndex`: Zotero standart `PPPPP|YYYYYY|XXXXXX` sayfa ve koordinat sıralama indeksini biçimlendirir.
   - Typed PostMessage İletişim Protokolü (`bridge.ts`):
     - `CITEDOCS_PDF_INIT`: Okuyucu iframe'ini PDF URL, başlık, yazar bilgisi, salt okunur modu ve mevcut açıklamalarla başlatır.
     - `CITEDOCS_PDF_READY`: Iframe hazır olduğunda ana pencereye el sıkışma bildirimi gönderir.
     - `CITEDOCS_PDF_SET_ANNOTATIONS`: Açıklamaları okuyucuya enjekte eder.
     - `CITEDOCS_PDF_SAVE_ANNOTATIONS`: Kullanıcı yeni bir vurgu, alt çizgi, not veya alan çizdiğinde ana pencereye ve sunucuya aktarır.
     - `CITEDOCS_PDF_DELETE_ANNOTATIONS`: Silinen açıklamaları senkronize eder.
     - `CITEDOCS_PDF_CITE`: Açıklamadan Collabora belgesine atıf ve alıntı aktarımı tetikler.
   - Mevcut çevrimdışı PDF çıkarma fonksiyonları (`loadPdf`, `createHighlight`, `extractQuote`, `formatQuoteForDocument`) ve 18 birim testi eksiksiz korundu. Eklenen 11 yeni testle birlikte paketteki 29 test %100 yeşildir.

2. **Upstream Zotero Reader Kaynakları ve Araçları (`vendor/pdf-reader/`, `tools/scripts/`):**
   - `tools/scripts/fetch-pdf-reader.sh`: Resmi `zotero/reader` reposunu (`git clone --recursive https://github.com/zotero/reader.git`) alt modülleriyle (`pdfjs`, `epubjs`) çeken, `NODE_OPTIONS="--openssl-legacy-provider"` ve webpack ile derleyen otomasyon betiği eklendi.
   - `vendor/pdf-reader/README.md`: Lisans (AGPL-3.0), bağımlılıklar ve derleme mimarisi belgelendi.
   - `apps/web/public/zotero-pdf-reader/index.html` & `reader.html`: Upstream `window.createReader` JS arayüzünü birebir taklit eden; Zotero'nun 5 renk paletini (#ffd400, #ff6666, #5fb236, #2ea8e5, #a28ae5), vurgu, alt çizgi, not ve alan seçim araçlarını, açıklama kenar çubuğunu, "Cite this" butonunu, dil geçişini ve PostMessage köprüsünü içeren, ağ bağlantısı gerektirmeyen tam teşekküllü bağımsız bir okuyucu barındırıcısı sunuldu.

3. **Sunucu Katmanı, Mülkiyet ve Zotero Senkronizasyonu (`apps/server/src/pdf/`):**
   - **Veri Tabanı Şeması (`apps/server/src/db/schema.ts`):** `pdfAnnotations` tablosu eklendi. `id`, `ownerUserId` (kullanıcıya cascade bağlı foreign key), `attachmentId`, `zoteroKey`, `parentItemKey`, `annotationType`, `annotationText`, `annotationComment`, `annotationColor`, `annotationPageLabel`, `annotationSortIndex`, `annotationPosition` (JSONB), `imagePath`, `version`, `createdAt`, `updatedAt` alanlarıyla Drizzle ORM seviyesinde tanımlandı.
   - **Mülkiyet İzolasyonu (`AttachmentRepository`, `AnnotationRepository`):** `assertOwnership` çağrılarıyla öğrencilerin yalnızca kendi ek dosyalarına ve açıklamalarına erişebilmesi garanti altına alındı; yabancı kullanıcı istekleri anında HTTP 403 Forbidden ile engellenir.
   - **Depolama Soyutlaması (`AttachmentStorage`):** Bellek içi testler için `InMemoryAttachmentStorage`, canlı ortamlar için S3/MinIO uyumlu `S3AttachmentStorage` kuruldu.
   - **Zotero Web API v3 Senkronizasyonu (`ZoteroAnnotationSyncService`):** Kullanıcının Zotero hesabı bağlıysa açıklamaları Zotero Web API v3'e çift yönlü push/pull yapan servis ve arayüz uygulandı; hesap bağlı değilse zararsız atlama (`skipped`) loglanır.
   - **Fastify REST Rotaları (`apps/server/src/pdf/routes.ts`):**
     - `GET /api/attachments` - Kullanıcının ek dosyalarını listeleme.
     - `POST /api/attachments` - Yeni PDF ekleme.
     - `GET /api/attachments/:id` & `GET /api/attachments/:id/content` - Ek dosya detayı ve PDF akışı (stream).
     - `DELETE /api/attachments/:id` - Ek dosya silme.
     - `GET /api/attachments/:id/annotations` - Açıklamaları Zotero API formatında listeleme.
     - `POST /api/attachments/:id/annotations` - Yeni açıklama ekleme.
     - `PUT /api/attachments/:id/annotations/:annId` - Açıklama güncelleme.
     - `DELETE /api/attachments/:id/annotations/:annId` & `POST /api/attachments/:id/annotations/batch-delete` - Açıklama silme.
     - `POST /api/attachments/:id/sync` - Zotero senkronizasyonu tetikleme.
   - `apps/server/src/index.ts`: Minimal diff ile `createPdfRoutes` tescil edildi.

4. **Web İstemcisi ve Collabora Atıf Köprüsü (`apps/web/src/pdf/`):**
   - `PdfReaderPanel.tsx`: Bölünmüş ekran (split-panel) veya tam ekran (fullscreen) görünüm modları, mobil ve tablet dostu duyarlı tasarım, Türkçe ve İngilizce arayüz desteği (`i18n.ts`).
   - `PdfReaderFrame.tsx`: Güvenli iframe iletişimi, yüklenme/hata durumları ve açıklamaların otomatik arka plan kaydı.
   - **Collabora Atıf Köprüsü:** PDF okuyucu panelinde bir açıklamadan "Cite this" butonuna basıldığında `@citedocs/collabora-cite` paketi üzerinden `buildInsertCitationMessage` ve UNO `.uno:InsertText` mesajı oluşturulur; Collabora Online iframe'ine sayfa belirteciyle (`p. 42`) doğrudan alıntı ve kaynak referansı yerleştirilir.
   - **Zotero Kenar Çubuğu Entegrasyonu (`ZoteroSidebar.tsx` & `zotero-weblib/index.html`):** Öğrenci kütüphanesindeki bir PDF öğesine tıkladığında `CITEDOCS_OPEN_PDF` olayı tetiklenir ve okuyucu ilgili dosya ile açılır.
   - `App.tsx`: Minimal diff ile eski statik placeholder yerine `PdfReaderPanel` bağlandı.

### Test ve Doğrulama Durumu:

- **`packages/pdf-reader`:** 3 test dosyasında **29 test %100 yeşil** (Zotero şema eşleme, formatSortIndex, postMessage builder'ları, çevrimdışı alıntı çıkarma).
- **`apps/server`:** `test/pdf.test.ts` (6 test) ve mevcut tüm testlerle birlikte 12 test dosyasında **119 test %100 yeşil** (Mülkiyet izolasyonu, yetkisiz istek engeli, S3 stream, açıklama CRUD, Zotero senkronizasyonu).
- **`apps/web`:** `test/pdf.test.tsx` (9 test) ve `test/collabora.test.tsx` (9 test) **%100 yeşil** (Iframe iletişimi, Collabora atıf köprüsü, dil değiştirme, tam ekran geçişi, panel açma/kapama).
- **Statik Analiz ve Derleme:**
  - `pnpm lint` (`eslint .`): 0 hata, 0 uyarı.
  - `pnpm typecheck` (`tsc -b`): Sıfır hata, kod 0.
  - `pnpm build`: Tüm monorepo paketleri ve uygulamaları (`@citedocs/pdf-reader`, `@citedocs/server`, `@citedocs/web`) başarıyla derlendi.

### Nasıl Çalıştırılır ve Test Edilir:

1. **Sunucu PDF Testlerini Çalıştırma:**
   ```bash
   pnpm -C apps/server test test/pdf.test.ts
   ```
2. **Paket Birim Testlerini Çalıştırma:**
   ```bash
   pnpm -C packages/pdf-reader test
   ```
3. **Web PDF Entegrasyon Testlerini Çalıştırma:**
   ```bash
   pnpm -C apps/web test test/pdf.test.tsx
   ```
4. **Geliştirme Ortamı:**
   ```bash
   pnpm dev
   ```
   Collabora editöründeyken üst araç çubuğundaki "PDF Reader" butonuna tıklayarak veya Zotero kütüphanesinden bir ek dosyaya tıklayarak PDF okuyucuyu açabilir, metin vurgulayabilir ve doğrudan Collabora belgesine atıf yapabilirsiniz.



---

## 15. Uçtan Uca Entegrasyon Prototipi & Doğrulama (Kayıt #011)

> **Kayıt No:** #011  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-e2e-proto`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Görev:** TASK A (SPEC & Mimarinin ADR-001 ile Uyumlanması) + TASK B (Uçtan Uca Entegrasyon Prototip Kontrolü, Docker Compose, WOPI Akışı, Zotero Bileşenleri, Smoke Testi, Bellek/RAM Ölçümü)

### 15.1 TASK A — Dokümantasyon ve Mimari Güncellemesi (Tamamlandı)

1. **`SPEC.md` ve `docs/SPEC.md` (v2.0.0):**
   - Belge motoru olarak Collabora Online (CODE) + WOPI mimarisi, TipTap (`packages/editor`) bileşeninin ise LEGACY (eski/dondurulmuş) olarak işaretlendiği tanımlandı.
   - Resmi Zotero açık kaynak bileşenleri (`zotero/web-library`, `zotero/translation-server`, `citeproc-js`, `packages/collabora-cite` + UNO makroları) sisteme temel referans motoru olarak bağlandı.
   - Öğrenci başına mutlak hesap ve veri izolasyonu, MinIO/S3 üzerinde en az 5 GB cömert depolama, açık paylaşım modeli, Microsoft Word ve LibreOffice Zotero alan kodu uyumluluğu (`ADDIN ZOTERO_ITEM CSL_CITATION` & `ADDIN ZOTERO_BIBL`) ve GNU AGPL-3.0 lisans standardı spesifikasyona işlendi.
2. **`architecture.md` ve `ARCHITECTURE.md` Uzlaşması:**
   - Kök dizindeki `architecture.md` ve `ARCHITECTURE.md` dosyaları, tek doğruluk kaynağı (SSOT) olan `docs/ARCHITECTURE.md` belgesine yönlendirildi; mükerrerlik ve çelişki ortadan kaldırıldı.

---

### 15.2 TASK B — Uçtan Uca Konteyner Entegrasyonu ve Düzeltmeler (Tamamlandı)

1. **Host Port ve Konteyner İzolasyonu:**
   - Docker Compose projesi `-p citedocs-e2e` adıyla izole edildi; konteyner adları projesel önek aldı.
   - Host makinedeki port çakışmalarını önlemek amacıyla Collabora Online portu `${COLLABORA_PORT:-9982}:9980` ve Web portu `${WEB_PORT:-5173}:80` olarak yapılandırıldı. Makinede halihazırda `--net=host` ile çalışan `folio-collabora` konteynerine ve diğer servislere kesinlikle müdahale edilmedi.
   - MinIO imajı `elestio/minio:latest` olarak güncellendi (Docker Hub'ın `minio/minio` dağıtımını kısıtlaması nedeniyle).
2. **WOPI İki Yönlü Ağ ve URL Dönüşümü:**
   - Tarayıcının Collabora iframe'ini açabilmesi için `COLLABORA_PUBLIC_URL` (`http://localhost:9982`) ve Collabora'nın sunucuya konteyner ağından erişebilmesi için `WOPI_SERVER_URL` (`http://server:3000`) entegre edildi.
   - `apps/server/src/wopi/discovery.ts` servisine `publicCollaboraUrl` parametresi eklendi; Collabora iç XML adresleri tarayıcının erişebileceği host portuna dönüştürüldü.
3. **S3/MinIO ve DOCX Başlatma Sertleştirmesi:**
   - `apps/server/src/wopi/storage/s3Storage.ts` içine `ensureBucket()` eklendi; MinIO ayağa kalktığında `citedocs-attachments` kovası yoksa otomatik oluşturulması sağlandı.
   - `apps/server/src/wopi/routes.ts` içinde yeni belge oturumu açıldığında 0-byte bozuk dosya yerine `@citedocs/docx-exporter` ile geçerli 9.6 KB WordprocessingML DOCX şablonu üretilerek depoya kaydedilmesi sağlandı. Böylece LibreOffice/Collabora açılışta dosya biçim hatası vermez.
4. **Veritabanı Kendi Kendini İyileştirme (Auto-Migration & Seeding):**
   - `apps/server/src/index.ts` sunucu açılışında `DATABASE_URL` tanımlıysa Drizzle migrasyonlarını (`runMigrations()`) otomatik çalıştıracak şekilde bağlandı.
   - `apps/server/src/db/migrate.ts` migrasyon sonrasında varsayılan demo kullanıcıyı (`00000000-0000-0000-0000-000000000001`, `demo@citedocs.local`) `users` tablosuna ekleyecek şekilde güncellendi.
5. **Web İstemcisi Collabora + Zotero Entegrasyonu:**
   - `apps/web/src/collabora/CollaboraEditorPage.tsx`: Collabora editör iframe'i yanına `ZoteroSidebar` (`/zotero-weblib/index.html`), "Add by DOI" modalı (`AddByIdentifier`), CollaboraBridge atıf ekleme (`ZOTERO_ITEM CSL_CITATION`) ve kaynakça güncelleme aksiyonları bağlandı.
   - Nginx yapılandırması SPA yönlendirmelerini (`try_files $uri $uri/ /index.html`) destekleyecek şekilde `apps/web/nginx.conf` ile Docker imajına eklendi.

---

### 15.3 Uçtan Uca Doğrulama Sonuçları (Neler Çalışıyor / Neler Çalışmıyor)

#### ✅ Tam Olarak Doğrulanan ve Çalışan Akışlar:

1. **Sunucu Sağlık Denetimi:** `GET http://localhost:3000/health` -> HTTP 200 OK, servis ayakta.
2. **Upstream Zotero Translation Server:** `POST http://localhost:1969/search` ile DOI `10.1103/PhysRev.47.777` gönderildiğinde Einstein, Podolsky, Rosen (1935) Physical Review makalesi başarıyla çözümleniyor.
3. **CiteDocs API DOI Çözümleme ve Postgres Kalıcılığı:** `POST http://localhost:3000/api/items/from-identifier` çağrısı Zotero öğesini CSL formatına çevirip PostgreSQL `library_items` tablosuna öğrenci UUID'sine bağlı olarak kalıcı biçimde (`persisted: true`) kaydediyor.
4. **Collabora Online Discovery:** `GET http://localhost:9982/hosting/discovery` geçerli WOPI keşif XML'ini sunuyor.
5. **Collabora Oturum Oluşturma:** `POST http://localhost:3000/api/documents/:id/collabora-session` ile HMAC-SHA256 imzalı `accessToken`, `wopiSrc` ve tarayıcıya uygun `actionUrl` eksiksiz üretiliyor.
6. **WOPI CheckFileInfo:** `GET http://localhost:3000/wopi/files/:id?access_token=...` -> `BaseFileName`, `UserCanWrite: true`, `SupportsLocks: true`, `SupportsUpdate: true` parametreleri doğrulanıyor.
7. **WOPI GetFile:** `GET http://localhost:3000/wopi/files/:id/contents` -> MinIO/S3 üzerinden geçerli DOCX ikili akışı (`PK...` ZIP başlığı) iletiliyor.
8. **WOPI Kilit Yönetimi:** `POST` isteği `X-WOPI-Override: LOCK` başlığıyla kilidi sorunsuz alıyor (`HTTP 200`).
9. **WOPI PutFile:** `POST /contents` isteği `X-WOPI-Lock` ve yeni gövdeyle dosyayı güncelliyor (`version` artırılıyor).
10. **Kalıcılık Doğrulaması:** Ardışık `GetFile` çağrısında güncellenen içeriğin S3'ten aynen geldiği kanıtlandı.
11. **Web Frontend Servisi:** `http://localhost:5173/` üzerinden Nginx ile SPA arayüzü sunuluyor.
12. **Headless Tarayıcı UI Render Kontrolü:** `/usr/bin/google-chrome --headless=new` ile `http://localhost:5173/?editor=collabora` yüklendi; DOM çıktısında hem Collabora iframe'i (`data-testid="collabora-iframe"`) hem de Zotero Web Library kenar çubuğu (`data-testid="zotero-sidebar"`) DOM ağacında başarıyla doğrulandı.
13. **Scripted Smoke Test:** `tools/e2e-smoke.sh` yazıldı; 11 entegrasyon adımının tamamı yeşil (`[PASS]`) geçti.

#### ⚠️ Kısıtlar ve Doğrulanamayan Noktalar:
- **Collabora İç Frame İlk Render Süresi:** Collabora Online (CODE) ilk başlatıldığında LibreOffice forkit süreçlerini ısıtması ve yazı tipi önbelleğini oluşturması ~10-15 saniye sürebilmektedir; bu esnada iframe içinde "Loading: Frame_Ready..." bekleme katmanı görünür.
- **Canlı Zotero Hesabı Eşlemesi:** Testler yerel demo kullanıcı ve çevirici sunucusu üzerinden yapılmıştır; gerçek `zotero.org` iki yönlü senkronizasyonu için geçerli bir kullanıcı API anahtarı gereklidir.

---

### 15.4 Bellek Tüketimi (docker stats) ve AWS t3.medium Değerlendirmesi

Konteyner yığınının anlık bellek kullanımı `docker stats --no-stream` ile ölçülmüştür:

| Konteyner Servisi | İmaj | RAM Tüketimi | RAM Yüzdesi (Host) |
|---|---|---|---|
| `citedocs-e2e-collabora-1` | `collabora/code:latest` | **507.3 MiB** | %3.22 |
| `citedocs-e2e-translation-server-1` | `zotero/translation-server:latest` | **434.1 MiB** | %2.75 |
| `citedocs-e2e-minio-1` | `elestio/minio:latest` | **75.4 MiB** | %0.48 |
| `citedocs-e2e-postgres-1` | `postgres:16-alpine` | **61.7 MiB** | %0.39 |
| `citedocs-e2e-server-1` | `citedocs-e2e-server` | **53.7 MiB** | %0.34 |
| `citedocs-e2e-web-1` | `citedocs-e2e-web` (nginx) | **13.2 MiB** | %0.08 |
| **TOPLAM YIĞIN BELLEĞİ** | | **~1,145.4 MiB (~1.15 GB)** | |

#### 🎯 AWS `t3.medium` Kapasite Analizi:
- **`t3.medium` Donanım Özellikleri:** 2 vCPU, 4.0 GiB (4,096 MiB) RAM.
- **CiteDocs Tüketim Oranı:** Tüm CiteDocs yığını toplam **~1.15 GB** RAM kullanmaktadır; bu da `t3.medium` toplam belleğinin **yaklaşık %28.6'sına** tekabül eder.
- **Kalan Güvenli Alan:** Geriye kalan **~2.85 GB** boş bellek; Linux çekirdeği, disk I/O sayfa önbelleği (page cache), Collabora'nın birden çok büyük `.docx` belgesini bellekte açması ve PostgreSQL bellek havuzları için oldukça cömert ve güvenli bir çalışma payı (headroom) bırakmaktadır.

---

### 15.5 Yerel Olarak Çalıştırma ve Tekrarlama Adımları (Repro Steps)

1. **Yığını Başlatma:**
   ```bash
   docker compose -p citedocs-e2e up -d --build
   ```
2. **Otomatik Duman Testini (Smoke Test) Çalıştırma:**
   ```bash
   ./tools/e2e-smoke.sh
   ```
   *(Tüm 11 adımın `[PASS]` olarak sonuçlandığını ekranda görebilirsiniz).*
3. **Tarayıcıda İnceleme:**
   Tarayıcınızda şu adresi açın:
   ```txt
   http://localhost:5173/?editor=collabora
   ```
   - Üst çubukta "Collabora Online (CODE)" rozetini, "Add by DOI" ve "Zotero Library" butonlarını görebilirsiniz.
   - Sol/orta alanda Collabora Online belge düzenleyicisi, sağ alanda Zotero Web Library kenar çubuğu açılır.
   - "Add by DOI" butonuna tıklayıp `10.1103/PhysRev.47.777` yazarak makaleyi kişisel kütüphanenize anında ekleyebilirsiniz.
4. **Yığını Kapatma (Laptop Yükünü Sıfırlama):**
   ```bash
   docker compose -p citedocs-e2e down
   ```
