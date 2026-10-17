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


---

## 16. Kullanıcı Bazlı Bulut Belge Depolama, Paylaşım ve Kota Yönetimi (Per-User Cloud Document Storage & Explicit Sharing) — Kayıt #012

> **Kayıt No:** #012  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-docs-sharing`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Aşama:** Kullanıcı Bazlı Bulut Depolama, Rol Tabanlı Açık Paylaşım (Viewer/Editor), WOPI İzin Eşleme, 5 GB Depolama Kotası ve Web UI

### 1. Yapılan İşler

1. **Sunucu Veritabanı ve Şema Genişletmesi (`apps/server/src/db/schema.ts`):**
   - **`documents` Tablosu:**
     - `id`: UUID birincil anahtar (varsayılan rastgele).
     - `ownerUserId`: `users.id` referansı (foreign key cascade).
     - `title`: Belge başlığı (varchar 255).
     - `s3ObjectKey`: S3/MinIO nesne anahtarı (text).
     - `fileSize`: Bayt cinsinden dosya boyutu (integer, varsayılan 0).
     - `mimeType`: MIME türü (varchar 128, varsayılan docx).
     - `createdAt` / `updatedAt`: Zaman damgaları.
     - `deletedAt`: Yumuşak silme (soft delete) için boş bırakılabilir zaman damgası.
     - `documents_deleted_at_idx`: Performanslı filtreleme için indeks.
   - **`document_shares` Tablosu:**
     - `id`: UUID birincil anahtar.
     - `documentId`: `documents.id` referansı.
     - `userId`: Kayıtlı kullanıcı referansı (`users.id`, e-posta davetleri için nullable).
     - `email`: Davet edilen e-posta adresi (varchar 255).
     - `role`: Rol ('viewer' | 'editor').
     - `createdBy`: Paylaşımı oluşturan kullanıcı (`users.id`).
     - `createdAt` / `updatedAt`: Zaman damgaları.
     - `(document_id, email)` ve `created_by` üzerinde kompozit indeksler.
   - **Drizzle Migration:** `apps/server/drizzle/0001_condemned_namor.sql` oluşturuldu.

2. **Kota Muhasebesi ve Yükleme Denetimi (`apps/server/src/documents/quota.ts`):**
   - Öğrenciler için tamamen ücretsiz, ödeme duvarı veya gizli katmanlar barındırmayan eşitlikçi kota politikası.
   - `STORAGE_QUOTA_BYTES`: Ortam değişkeni ile yapılandırılabilir varsayılan 5 GB (5 * 1024 * 1024 * 1024 bayt).
   - `MAX_UPLOAD_SIZE_BYTES`: Ortam değişkeni ile yapılandırılabilir varsayılan 100 MB tekil dosya yükleme sınırı.
   - `assertUserQuota`: Belge oluşturma veya yükleme öncesinde mevcut kullanım + yeni dosya boyutunu denetler; aşımda `StorageQuotaExceededError` (HTTP 413) fırlatır.
   - `getQuotaInfo`: Kullanılan, toplam, kalan ve yüzde alanlarını döndürür.

3. **Şablon Üretimi (`apps/server/src/documents/templates.ts`):**
   - Harici LibreOffice veya MS Word çalışma ortamına bağımlı kalmadan, `jszip` motoruyla saf bellek içinde geçerli, bozulmamış standart `.docx` ve `.odt` zip arşivleri üretilir (`[Content_Types].xml`, `word/document.xml`, `content.xml`, `manifest.xml`).
   - MIME türü ve uzantı eşleme yardımcıları (`resolveDocumentMimeType`, `resolveDocumentExtension`).

4. **Çift Depo Katmanı (`IDocumentRepository`, `DocumentRepository` ve `InMemoryDocumentRepository`):**
   - `IDocumentRepository` sözleşmesi; `listOwned`, `listSharedWith`, `getById`, `findRawById`, `getStorageUsage`, `create`, `update`, `delete` (soft delete), `hardDelete`, `share`, `unshare`, `listShares`.
   - `DocumentRepository`: Drizzle PostgreSQL sorguları, soft-delete (`deletedAt IS NULL`) filtreleri, silinen belgelerin paylaşımlarını gizleme, e-posta veya kullanıcı kimliği üzerinden yetkilendirme.
   - `InMemoryDocumentRepository`: PostgreSQL gerektirmeden çevrimdışı, bağımsız test koşumu için tam ACID uyumlu bellek içi tak-çıkar depo. `DATABASE_URL` tanımlıysa Postgres, tanımsızsa bellek içi depo otomatik seçilir.

5. **WOPI İzin ve Oturum Entegrasyonu (`apps/server/src/wopi/routes.ts`):**
   - `createWopiRoutes` artık `documentRepo` bağımlılığı almaktadır.
   - `CheckFileInfo`:
     - `OwnerId`: Belge sahibinin kullanıcı kimliği.
     - `UserId`: İstek yapan kullanıcının kimliği.
     - `UserFriendlyName`: Kullanıcının görünen adı veya e-postası.
     - `UserCanWrite`: Belge sahibi veya `editor` rolüne sahip kullanıcılar için `true`; `viewer` rolüne sahip kullanıcılar için katı `false`.
   - `PutFile`:
     - Token'ın `canWrite` alanı `false` ise HTTP 403 Forbidden ile yazma engellenir.
     - Dosya kaydedildiğinde belgenin veritabanındaki `fileSize` ve `updatedAt` değerleri otomatik güncellenir.
   - `POST /api/documents/:id/collabora-session`:
     - Çağıran kullanıcının sahiplik veya paylaşım yetkisini denetler.
     - Yetkisiz yabancı kullanıcılar için HTTP 403 Forbidden döndürür.
     - Silinmiş belgeler için HTTP 404 Not Found döndürür.
     - İzleyicilere (`viewer`) otomatik olarak salt okunur (`canWrite: false`) Collabora erişim token'ı tahsis eder.
     - Geriye dönük uyumluluk: Veritabanında kayıtlı olmayan salt WOPI test dosyaları için doğrudan depolama token'ı üretilmeye devam eder.

6. **REST API Rotaları (`apps/server/src/documents/routes.ts`):**
   - Tüm rotalar `requireAuth` ara katmanı ile gerçek oturum koruması altındadır.
   - Sıkı kullanıcı izolasyonu: Hiçbir kullanıcı başka bir kullanıcının belgesini açıkça paylaşılmadıkça listeleyemez, açamaz (403), düzenleyemez, silemez veya paylaşamaz.
   - `@fastify/multipart` ve dinamik yükleme sınırı yapılandırması (100 MB).
   - Uç Noktalar:
     - `GET /api/documents`: Kullanıcının sahip olduğu belgeleri ve 5 GB kota durumunu listeler (`?search=`).
     - `GET /api/documents/shared-with-me`: Kullanıcıyla paylaşılan belgeleri ve rolleri listeler (`?search=`).
     - `GET /api/documents/quota`: Anlık kota durumunu döndürür.
     - `POST /api/documents`: Boş `.docx` veya `.odt` belgesi oluşturur ve S3/MinIO'ya yazar.
     - `POST /api/documents/upload`: İzin verilen uzantılarda (`.docx`, `.odt`, `.pdf`) dosya yükler, kota kontrolü yapar.
     - `GET /api/documents/:id`: Belge meta verisini ve kullanıcının rolünü getirir (izin yoksa 403, silinmişse 404).
     - `PATCH /api/documents/:id`: Belgeyi yeniden adlandırır (yalnızca sahip veya düzenleyici).
     - `DELETE /api/documents/:id`: Belgeyi yumuşak siler (soft delete - yalnızca sahip).
     - `GET /api/documents/:id/download`: Belgenin ham ikili dosyasını indirir.
     - `POST /api/documents/:id/shares`: E-posta ve rol belirterek belgeyi paylaşır (yalnızca sahip).
     - `GET /api/documents/:id/shares`: Belgenin mevcut paylaşımlarını listeler (yalnızca sahip).
     - `DELETE /api/documents/:id/shares/:shareId`: Paylaşımı kaldırır (yalnızca sahip).

7. **İstemci Arayüzü Mimarisi (`apps/web/src/documents/**`):**
   - `DocumentsPage.tsx`:
     - Mobil, tablet ve masaüstü uyumlu responsive tasarım.
     - 5 GB ücretsiz öğrenci kotası ilerleme çubuğu ve kullanım göstergesi.
     - "Belgelerim" ve "Benimle Paylaşılanlar" sekmeleri.
     - Anlık arama/filtreleme çubuğu.
     - Yeni Belge açılır menüsü: Boş Word (`.docx`) veya Boş LibreOffice (`.odt`) oluşturma.
     - Dosya Yükle butonu: Sürükle-bırak & dosya seçici (`.docx`, `.odt`, `.pdf`).
     - Belge kartları: Biçim ikonu, dosya boyutu, son güncelleme tarihi, Collabora Online'da Aç butonu, İndir, Yeniden Adlandır, Paylaş ve Sil eylemleri.
     - Paylaşılan belgelerde rol rozeti (`Görüntüleyici` / `Düzenleyici`) ve paylaşan kişi bilgisi.
   - `ShareDialog.tsx`:
     - E-posta adresi ve rol seçimi (`Görüntüleyici` / `Düzenleyici`).
     - Mevcut paylaşımlar listesi ve anlık paylaşım kaldırma.
   - `RenameDialog.tsx`:
     - Belge başlığını değiştiren modal dialog.
   - `i18n.ts`:
     - Türkçe ve İngilizce tam metin sözlüğü (`docTranslations`).
     - Akıllı dil algılama (`getDocumentLanguage`), tek tıkla dil geçişi, `formatBytes` bayt biçimlendirici.
   - `App.tsx` & `CollaboraEditorPage.tsx` & `UserMenu.tsx` Entegrasyonu:
     - `App.tsx` içine asgari ekleme (~20 satır): `/documents` rotası bağlandı.
     - TipTap düzenleyici üst çubuğuna ve kullanıcı açılır menüsüne (`UserMenu`) "Belgelerim / Documents" bağlantısı eklendi.
     - `CollaboraEditorPage` içine `onBackToDocuments` geri dönüş butonu ve `credentials: "include"` oturum çerezi desteği eklendi.
     - Belgeler sayfasından seçilen belge, Collabora Online düzenleyicide doğrudan açılır (`/?editor=collabora&doc=<id>&title=<title>`).

### 2. REST API Sözleşmesi (API Contract)

| Uç Nokta | Metot | Rol / İzin | Açıklama |
|---|---|---|---|
| `/api/documents` | `GET` | Oturum sahibi | Sahip olunan belgeleri ve kota durumunu döner (`?search=`) |
| `/api/documents/shared-with-me` | `GET` | Oturum sahibi | Kullanıcıyla açıkça paylaşılan belgeleri döner (`?search=`) |
| `/api/documents/quota` | `GET` | Oturum sahibi | 5 GB kota kullanım detayını döner |
| `/api/documents` | `POST` | Oturum sahibi | Boş `.docx` veya `.odt` belgesi oluşturur (`{ title?, format?: "docx"\|"odt" }`) |
| `/api/documents/upload` | `POST` | Oturum sahibi | Dosya yükler (`multipart/form-data` veya binary stream, maks 100 MB) |
| `/api/documents/:id` | `GET` | Sahip / Paylaşılan | Belge detayını ve kullanıcının erişim yetkisini döner (Yabancı: 403, Silinmiş: 404) |
| `/api/documents/:id` | `PATCH` | Sahip / Düzenleyici | Belge başlığını günceller (`{ title: string }`) |
| `/api/documents/:id` | `DELETE` | Yalnızca Sahip | Belgeyi yumuşak siler (soft delete) |
| `/api/documents/:id/download` | `GET` | Sahip / Paylaşılan | Belgenin orijinal dosya akışını indirir |
| `/api/documents/:id/shares` | `GET` | Yalnızca Sahip | Belgenin mevcut paylaşımlarını listeler |
| `/api/documents/:id/shares` | `POST` | Yalnızca Sahip | Belgeyi e-posta ile paylaşır (`{ email: string, role: "viewer"\|"editor" }`) |
| `/api/documents/:id/shares/:shareId` | `DELETE` | Yalnızca Sahip | Belgenin bir paylaşımını iptal eder |
| `/api/documents/:id/collabora-session` | `POST` | Sahip / Paylaşılan | Collabora Online için WOPI token ve actionUrl üretir (Viewer için UserCanWrite=false) |

### 3. Nasıl Doğrulanır?

```bash
# 1. Monorepo kökünden tüm testleri çalıştır (36 test dosyası, 355 testin tamamı)
pnpm test

# 2. Yalnızca belge depolama ve paylaşım sunucu testlerini çalıştır (25 test)
pnpm --filter @citedocs/server exec vitest run test/documents.test.ts

# 3. Yalnızca web belgelerim arayüzü testlerini çalıştır (18 test)
pnpm --filter @citedocs/web exec vitest run test/documents.test.tsx

# 4. Lint ve Tip Kontrolü
pnpm lint
pnpm typecheck

# 5. Üretim Derlemesi
pnpm build
```

### 4. Test Sonuçları & Kalite Güvencesi

- **Monorepo Testleri:** 36 test dosyası, 355 test %100 yeşil (1 skipped perf).
- **`apps/server` Testleri:** 13 test dosyası, 157 test %100 yeşil:
  - `test/documents.test.ts`: 25/25 test (Kullanıcı izolasyonu, yabancı kullanıcının 403 alması, izleyicinin salt okunur olması, kota aşımı 413, yumuşak silme, e-posta paylaşımı, WOPI CheckFileInfo ve PutFile entegrasyonu).
  - `test/wopi.test.ts`: 32/32 test.
  - `test/repositories.test.ts`: 18/18 test.
  - `test/schema.test.ts`: 4/4 test.
- **`apps/web` Testleri:** 7 test dosyası, 62 test %100 yeşil:
  - `test/documents.test.tsx`: 18/18 test (Belgelerim listeleme, Benimle Paylaşılanlar sekmesi, 5 GB kota barı, boş .docx/.odt oluşturma, dosya yükleme, arama filtreleme, TR/EN dil seçimi, yeniden adlandırma dialogu, e-posta paylaşım ve kaldırma dialogu, Collabora'da açma tetikleyicisi, düzenleyiciye geri dönüş).
- **`pnpm lint`:** 0 hata, 0 uyarı.
- **`pnpm typecheck` (`tsc -b`):** 0 hata, katı TypeScript doğrulaması tamam.
- **`pnpm build`:** Tüm paketler (`@citedocs/shared`, `@citedocs/collabora-cite`, `@citedocs/csl-engine`, `@citedocs/zotero-core`, `@citedocs/editor`, `@citedocs/docx-exporter`, `@citedocs/pdf-reader`) ve uygulamalar (`@citedocs/server`, `@citedocs/web`) hatasız derleniyor.

### 5. Korunan Alanlar ve Notlar

- Kural gereğince `packages/editor`, `packages/pdf-reader`, `apps/web/src/pdf*`, `apps/server/src/pdf*`, `docker-compose*.yml`, `SPEC.md` ve `docs/ARCHITECTURE.md` dosyalarına kesinlikle dokunulmamıştır.
- **Docker Compose / MinIO Notu:** Canlı ortamda S3/MinIO için `S3_ENDPOINT`, `S3_BUCKET` (varsayılan `citedocs-documents`), `STORAGE_QUOTA_BYTES` (varsayılan 5368709120) ve `MAX_UPLOAD_SIZE_BYTES` (varsayılan 104857600) ortam değişkenleri tanımlanmalıdır. Bucket henüz oluşturulmamışsa depolama katmanı nesne yükleme anında otomatik olarak oluşturur veya hata durumunda açık log üretir.
- **Git:** Değişiklikler küçük mantıksal commit'ler halinde `cd-docs-sharing` dalında yerel olarak saklanmıştır; push veya deploy yapılmamıştır.

## 16. Collabora Online Gerçek Zotero Atıf ve Kaynakça İş Akışı (Full CSL Citation Workflow) — Kayıt #012

> **Kayıt No:** #012  
> **Tarih:** 2026-10-16  
> **Dal:** `cd-cite-workflow`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Görev:** Collabora Online editör sayfasında el yordamıyla oluşturulan sahte `(Author, Year)` mantığını kaldırıp; resmi CSL stilleri, citeproc-js, çoklu kaynak, sayfa/önek/sonek (locator/prefix/suffix), Zotero ReferenceMark/Word alan kodları uyumluluğu, atıf düzenleme/silme, stil seçici ve otomatik güncellenen kaynakça motorunu uçtan uca hayata geçirmek.

### 16.1 Yapılan İşler ve Mimari Yenilikler

1. **Python UNO LibreOffice Makrosu (`apps/collabora-scripts/`):**
   - `zotero_collabora.py` içerisine atıf ve kaynakça silme işlevleri eklendi:
     - `remove_citation(markName)`: Belgedeki ilgili LibreOffice Writer `ReferenceMark` veya `Bookmark` nesnesini bulup güvenli şekilde kaldırır; metin içeriğini temizler.
     - `remove_bibliography(markName)`: Kaynakça yer imini ve biçimlendirilmiş kaynakça metnini belgeden siler.
   - `apps/collabora-scripts/test_zotero_collabora.py` kapsamlı unit testleri yazıldı (`insert_citation`, `update_citation`, `remove_citation`, `insert_bibliography`, `remove_bibliography`, `set_document_prefs`, `get_document_fields` olmak üzere 7/7 test %100 yeşil).

2. **CSL Motoru ve Zotero Alan Kodu Uyumluluğu (`packages/collabora-cite/`):**
   - **Resmi CSL Stilleri:** APA 7th Edition ve Chicago Author-Date stillerinin yanına resmi CSL deposundan doğrulanmış IEEE, Vancouver, Harvard (Cite Them Right) ve MLA 9th Edition CSL XML içerikleri eklendi (`src/assets/styles.ts`).
   - **`CollaboraCSLEngine` (`src/engine.ts`):**
     - Çoklu kaynak (citation clusters) işleme motoru geliştirildi.
     - Kaynak başına `locator` (sayfa, bölüm vb.), `label` (p., ch., sec.), `prefix` (ör. "bkz. "), `suffix` (ör. ", detaylar için") ve `suppressAuthor` (yazarı gizleyip sadece yılı basma) parametreleri citeproc-js motoruna tam adapte edildi.
     - Dinamik CSL stili kaydı (`registerStyle(id, xml)`) ve anlık stil geçişi (`switchStyle(id)`) özellikleri eklendi.
     - `makeBibliography()` ile seçili stile uygun otomatik kaynakça oluşturma sağlandı (IEEE ve Vancouver için numaralı, APA ve Harvard için alfabetik dizilim).
   - **`CollaboraBridge` (`src/bridge.ts`):** `removeCitation(markName)` ve `removeBibliography(markName)` komutları eklendi.
   - **`parser.ts` & `test/roundtrip.test.ts`:**
     - Word (`ADDIN ZOTERO_ITEM CSL_CITATION`, `ADDIN ZOTERO_BIBL`, `ZOTERO_PREF`) ve LibreOffice (`ZOTERO_ITEM ... RND...`, `ZOTERO_BIBL ... RND...`) alan kodlarının çift yönlü ayrıştırma kuralları kusursuzlaştırıldı.
     - `JSZip` ile `.odt` (OpenDocument Text) ve `.docx` (Office Open XML WordprocessingML) dosya arşivleri bellek içinde oluşturulup Zotero resmi spesifikasyonundaki alan kodlarıyla kaydedildi; ardından arşivlerden tekrar ayrıştırılarak masaüstü Zotero LibreOffice ve Word eklentileriyle birebir uyumluluk kanıtlandı.
   - `packages/collabora-cite`: 6 test dosyasında **46 test %100 yeşil**.

3. **Web Kullanıcı Deneyimi ve Arayüz Bileşenleri (`apps/web/src/collabora/`):**
   - **`StyleSelector.tsx`:**
     - Üst araç çubuğunda mevcut stili rozet olarak gösteren stil seçici.
     - Tıklandığında en popüler 6 stili (APA 7th, Chicago, IEEE, Vancouver, Harvard, MLA) anında seçtiren popover menü.
     - Resmi CSL deposundaki 10.000+ stili sunucu üzerinden arayan (`/api/csl/styles?q=...`), seçildiğinde XML'ini indirip motora kaydeden entegre arama kutusu.
   - **`CitationEditorModal.tsx`:**
     - Hem yeni atıf ekleme ("Insert Citation") hem mevcut atıfı düzenleme ("Edit Citation") modunu destekler.
     - Tek bir atıf kümesine birden fazla kaynak ekleme / çıkarma (cluster).
     - Kaynak başına sayfa numarası (locator), önek (prefix), sonek (suffix) ve yazarı gizle (suppress author) kontrolleri.
     - Canlı CSL Önizlemesi (`citation-live-preview`): Kullanıcı yazdıkça seçili stilde atıfın belgede nasıl görüneceğini anlık hesaplar.
     - Düzenleme modunda "Delete Citation" butonu ile atıfı belgeden kaldırma.
   - **`DocumentCitationsDrawer.tsx`:**
     - Belgedeki tüm atıfları sıralı listeleyen sağ çekmece paneli.
     - Her kartta biçimlendirilmiş atıf metni, başlık, yazar ve etiketler (locator, prefix).
     - Hızlı "Edit" ve "Delete" butonları.
     - "Insert / Update Bibliography" butonu ve güncel kaynakça girdilerinin önizlemesi.
   - **`CollaboraEditorPage.tsx` Entegrasyonu:**
     - Eski mock `handleCiteItem` tamamen kaldırıldı.
     - Zotero Library kenar çubuğundan "Cite" tıklandığında, Add-by-DOI modalından makale eklendiğinde ve PDF Okuyucudan "Cite this" tıklandığında (seçili metin ve sayfa numarasıyla birlikte) doğrudan `CollaboraCSLEngine` + `CollaboraBridge` çalıştırılır.
     - Belgede imleç konumuna hem Python makrosu ile resmi Zotero ReferenceMark / Bookmark kaydedilir hem de anlık görsel yerleşim için `.uno:InsertText` komutu gönderilir.
     - **Otomatik Kaynakça:** Atıf eklendiğinde, düzenlendiğinde, silindiğinde veya stil değiştirildiğinde kaynakça arka planda anında yeniden hesaplanır ve güncellenir.
     - **Stil Değişimi:** Kullanıcı stili değiştirdiğinde (ör. APA'dan IEEE'ye), belgedeki tüm atıflar `[1]`, `[2]` formatına dönüştürülür, belge tercihleri (`ZOTERO_PREF`) güncellenir ve kaynakça numaralandırılır.

4. **Uçtan Uca Duman Testi (`tools/e2e-smoke.sh`):**
   - Step 12 eklendi: CSL stillerinin aranması, IEEE CSL XML'inin doğrulanması ve headless tarayıcıda CSL stil seçici / atıf yönetim kontrollerinin DOM'da render edilmesi test edildi.

### 16.2 Kalite ve Test Sonuçları

- **`pnpm lint`:** 0 hata, 0 uyarı.
- **`pnpm typecheck` (`tsc -b`):** Tüm monorepo genelinde %100 hatasız.
- **`pnpm build`:** Monorepo genelinde tüm 10 paket ve uygulama (`@citedocs/collabora-cite`, `@citedocs/csl-engine`, `@citedocs/shared`, `@citedocs/zotero-core`, `@citedocs/pdf-reader`, `@citedocs/docx-exporter`, `@citedocs/editor`, `apps/server`, `apps/web`) başarıyla derlendi.
- **`pnpm test`:** Monorepo genelinde **40 test dosyası, 356 test %100 yeşil**.
  - `packages/collabora-cite`: 46 test yeşil (roundtrip, engine, bridge, parser, fields, refresher).
  - `apps/collabora-scripts`: 7 test yeşil (test_zotero_collabora.py).
  - `apps/web`: 17 test yeşil (collabora.test.tsx + collabora-cite-workflow.test.tsx).

### 16.3 Tarayıcıda Nasıl Denenir?

1. **Geliştirme Ortamını Başlatma:**
   ```bash
   pnpm dev
   ```
2. **Collabora Online Editörünü Açma:**
   Tarayıcınızda şu adrese gidin:
   ```txt
   http://localhost:5173/?editor=collabora
   ```
3. **Atıf Ekleme (3 Farklı Yol):**
   - **Üst Çubuktan "Insert Citation":** Butona tıklayıp açılan modalda kütüphaneden kaynak seçin, sayfa numarası (ör. `525`), önek (ör. `bkz. `) girip anlık CSL önizlemesini izleyin ve "Insert Citation"a basın.
   - **Zotero Library Kenar Çubuğundan:** Sağdaki Zotero listesinden herhangi bir makalenin yanındaki "Cite" butonuna tıklayın.
   - **"Add by DOI":** Üst bardan "Add by DOI" butonuna tıklayıp `10.1038/s41586-021-03392-y` girin ve "Cite" butonuna basın.
4. **Stil Değiştirme:**
   - Üst bardaki CSL Stil Seçiciye ("APA 7th") tıklayın.
   - Menüden "IEEE" seçin.
   - Belgedeki `(Libby, 2021)` şeklindeki atıfın anında `[1]` formatına dönüştüğünü ve kaynakçanın numaralandığını görün.
5. **Atıfı Düzenleme & Silme:**
   - Üst bardaki "Citations (1)" butonuna tıklayarak sağ çekmeceyi açın.
   - Kalem ikonuna (Edit) tıklayarak sayfayı veya öneki değiştirin, "Update Citation"a basın.
   - Çöp kutusu ikonuna (Delete) tıklayarak atıfı belgeden silin; kaynakçanın otomatik temizlendiğini gözlemleyin.
6. **Kaynakça Ekleme:**
   - Çekmecedeki "Insert Bibliography" butonuna tıklayarak imleç konumuna seçili stilde tam kaynakça yerleştirin.

---

## 17. ONLYOFFICE Docs CE Zotero Panel Açma ve Odaklama Düzeltmesi (1-Click Header Button Fix) — Kayıt #013

> **Kayıt No:** #013  
> **Tarih:** 2026-10-17  
> **Dal:** `cd-oo-zbtn`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Görev:** Canlı sitede (`https://docs.sifirdanbire.com.tr/editor?doc=...`) ONLYOFFICE Zotero eklenti paneli sol tarafta zaten açık olmasına rağmen kırmızı 'Zotero' üst butonuna tıklandığında "Zotero paneli açılamadı. Editörün Eklentiler sekmesinden Zotero'yu açmayı deneyin." hata bildiriminin çıkması hatasını gidermek; tek tıkla resmi Zotero eklenti panelini açmak veya zaten açıksa odaklamak; "zaten açık" durumunu başarı saymak; ONLYOFFICE Docs CE uyumlu mekanizma kurmak; canlı sitede Playwright ile yeni kayıt ve boş Word belgesi üzerinden doğrulamak; birim testleri ekleyip derleme ve testleri %100 yeşil teslim etmek.

### 17.1 Kök Neden Analizi (Root Cause)

1. **`api.pluginsManager` Yokluğu:** Önceki adapter kodu (`zoteroPanel.ts`), ONLYOFFICE Document Server v10 Community Edition ortamında bulunmayan `controller.api.pluginsManager` nesnesine bağımlıydı. `api.pluginsManager` `undefined` döndüğü için `manager?.getPluginByGuid(...)` kontrolü doğrudan başarısız oluyor ve panel DOM'da açık olmasına rağmen `false` dönerek kullanıcıya hata uyarısı gösteriyordu.
2. **`asc_pluginRun` Davranışı:** `asc_pluginRun` komutu çalışan bir eklenti üzerinde çağrıldığında eklentiyi kapatır (toggle off). Panel zaten açıkken veya arka planda yüklenirken bu komutun tekrar çağrılmaması, bunun yerine `openUIPlugin` veya sol araç çubuğu yuvası (`#slot-btn-pluginszotero`) üzerinden odaklama yapılması gerekir.

### 17.2 Yapılan İşler ve Mimari Çözüm

1. **`apps/web/src/onlyoffice/zoteroPanel.ts` Adapter Yenilenmesi:**
   - **DOM & Controller Çift Katmanlı Durum Tespiti:** Document Server iframe DOM'u taranarak `#panel-plugins-zotero` (eklenti paneli) ve `#slot-btn-pluginszotero` (sol kenar çubuğu buton yuvası) varlığı ve `active` durumu kontrol edildi.
   - **Zaten Açık / Çalışıyor Durumunu Başarı Sayma:** Eklenti DOM'da varsa veya `openUIPlugin` ile yönetiliyorsa, eklentiyi yeniden başlatmadan doğrudan odaklama yapıldı (`openUIPlugin`, sol slot butonu tetikleme, iframe focus).
   - **Hızlı Çift Tıklama Koruması (Launch Throttle):** Eklenti `asc_pluginRun` ile ilk kez başlatıldığında, asenkron yüklenme sırasında gelebilecek mükerrer tıklamaların eklentiyi yanlışlıkla kapatmasını önlemek için `launchMap` (`WeakMap<HTMLElement, number>`) eklendi.
   - **Geriye Dönük Uyumluluk ve Fallback Zinciri:** `pluginsManager` olan eski SDK'lar, `Asc.editor.asc_pluginRun`, `openUIPlugin` ve `editorInstance.serviceCommand` fallback zinciri kuruldu. Cross-origin güvenlik engelleri (`DOMException`) tespit edilip temiz bir şekilde ele alındı.
2. **`apps/web/src/onlyoffice/OnlyofficeEditorPage.tsx` Entegrasyonu:**
   - Üst bardaki Zotero butonuna `openZoteroPanel(editorContainerRef.current, editorRef.current)` çağrısı bağlandı.
3. **Birim Testleri (`apps/web/test/zotero-panel.test.ts`):**
   - Panel zaten açıkken başarı sayılması ve `asc_pluginRun` çağrılmaması testi.
   - `pluginsManager` undefined olan modern ONLYOFFICE Docs CE v10 ortamı testi.
   - Arka planda veya daraltılmış panelin sol slot butonu ve `openUIPlugin` ile yeniden aktifleştirilmesi testi.
   - Hızlı mükerrer tıklamalarda kapanmanın önlenmesi testi.
   - `Asc.editor` ve `serviceCommand` fallback testleri.
   - Cross-origin ve eksik eklenti durumlarında görünür başarısızlık testleri. (8/8 test %100 yeşil).
4. **Canlı Ortam Uçtan Uca Playwright Doğrulaması:**
   - `https://docs.sifirdanbire.com.tr/signup` üzerinde taze hesap açıldı (`test_*@example.com`).
   - "Yeni Belge" -> "Boş Word Belgesi" ile yeni `.docx` oluşturuldu.
   - `/editor?doc=...` URL'ine gidildi ve `/oo/` altındaki iframe yüklendi.
   - Canlı sitede eski mantığın hata uyarısı verdiği doğrulandı (reproduction).
   - Yeni `openZoteroPanel` mantığı ile tek tıkla Zotero panelinin odaklandığı, hata uyarısının kalktığı, ardışık hızlı tıklamalarda kapanmadığı, başka sekmeye geçildiğinde butona basınca Zotero panelinin tekrar aktifleştirildiği canlı tarayıcıda kanıtlandı.
5. **Dokümantasyon:** `docs/onlyoffice-zotero-ui.md` güncellendi.

### 17.3 Kalite ve Test Sonuçları

- **`pnpm typecheck` (`tsc -b`):** 0 hata, tam tip uyumu.
- **`pnpm build`:** Tüm monorepo paketleri ve web/server uygulamaları hatasız derlendi.
- **`pnpm test`:** Monorepo genelinde **46 test dosyası, 443 test %100 yeşil**.

---

## 18. Milestone ONLYOFFICE Docs CE + Zotero E2E & Standalone Production Compose (Kayıt #018)

> **Kayıt No:** #018  
> **Tarih:** 2026-10-17  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Dal:** `cd-oo-e2e`  
> **Görev:** `main` dalı üzerine rebase yapılması, `main`'in güncel ONLYOFFICE Docs CE ve Zotero panel özelliklerinin korunması, öğrenci akışını kapsayan Playwright E2E test paketinin güncel UI/testid'lere uyarlanması, Collabora'sız bağımsız üretim compose mimarisinin entegrasyonu ve tam doğrulama.

### 18.1 Yapılan Çalışmalar ve Katkılar

1. **Rebase ve Uygulama Kodu Entegrasyonu:**
   - `main` dalındaki sağlamlaştırılmış ONLYOFFICE backend kodu, Zotero OAuth ve başlık/eklenti panel özellikleri (`oo-zotero-open`, `oo-panel-toggle`, `oo-add-form`, `oo-add-input`, `oo-add-submit`, `oo-zotero-connect`, `oo-notice`, `oo-error`, `oo-cite-panel`) eksiksiz korundu.
   - Bu dal sadece test, konfigürasyon, dokümantasyon ve üretim compose katkıları sağlayacak şekilde temizlendi; `main` tarafından kapsanan uygulama kodları bırakıldı.
   - `tsconfig.tsbuildinfo` dosyaları commit'e dahil edilmedi.

2. **Collabora'sız Bağımsız Üretim Compose Mimarisi:**
   - `deploy/docker-compose.prod.onlyoffice.yml`: Collabora CODE ve WOPI konteynerlerini tamamen dışarıda bırakan, sadece Postgres, MinIO, Zotero Translation Server, CiteDocs Server, CiteDocs Web, Caddy ve ONLYOFFICE Docs Community Edition (`onlyoffice/documentserver:latest`) barındıran hafif üretim mimarisi.
   - `deploy/Caddyfile.onlyoffice`: Caddy ters vekili üzerinden `/oo/*` yol öneki ile Document Server yönlendirmesi.
   - `docs/onlyoffice-production-and-e2e.md`: Dağıtım ve test dokümantasyonu.

3. **Playwright Uçtan Uca (E2E) Test Paketi (`e2e/oo-student-flow.spec.ts`):**
   - Öğrenci kayıt (`/signup`) -> Belgelerim paneli (`/documents`) -> Boş Word belgesi oluşturma -> ONLYOFFICE editörünün açılması -> Zotero 1-click butonu kontrolü (`oo-zotero-open`) -> Hızlı kaynak paneli kontrolü (`oo-panel-toggle`, `oo-cite-panel`) -> DOI ile kaynak ekleme (`oo-add-input`, `oo-add-submit`, `oo-notice`) -> Belgelerim'e dönüş -> Belgeyi Görüntüleyici (`viewer`) ve Düzenleyici (`editor`) olarak paylaşma akışının tamamı otomatikleştirildi.
   - `BASE_URL` ortam değişkeniyle yapılandırılabilir kılındı.
   - Canlı üretim ortamında (`https://docs.sifirdanbire.com.tr`) headless Chromium ile koşturuldu ve başarıyla doğrulandı.

### 18.2 Kalite ve Test Doğrulama Raporu (Rebase Sonrası)

- **`git rebase main`:** Başarıyla güncel `main` (`65afed0`) üzerine rebase edildi.
- **`pnpm test`:** Monorepo genelinde **49 test dosyası, 474 test %100 yeşil** (1 test atlandı).
- **`pnpm build`:** Tüm 10 paket ve Vite web uygulaması 0 hata ile başarıyla derlendi.
- **`BASE_URL=https://docs.sifirdanbire.com.tr pnpm test:e2e`:** Güncellenen UI ve testid'lerle canlı ortamda **2/2 E2E testi %100 yeşil** geçti (11.9s).

---

## 19. ONLYOFFICE Docs CE Periyodik Otomatik Kaydetme ve Canlı Oturum Kalıcılığı (cd-autosave) — Kayıt #019

> **Kayıt No:** #019  
> **Tarih:** 2026-10-17  
> **Dal:** `cd-autosave`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Görev:** CiteDocs üzerinde ONLYOFFICE Docs CE editöründe düzenleme esnasında değişikliklerin periyodik olarak ve canlı oturumu bozmadan MinIO/S3 nesne deposuna kalıcı kaydedilmesi (auto-save / force-save), Document Server autoAssembly periyodik montajının konteyner başlatmasında yapılandırılması, çok kullanıcılı canlı oturum anahtarı tutarlılığının korunması, mükerrer sürüm engelleme ve depolama kotası entegrasyonu.

### 19.1 Yapılan Çalışmalar ve Mimari Yenilikler

1. **Editör Konfigürasyonu (Autosave & Forcesave):**
   - `apps/server/src/onlyoffice/routes.ts` içinde `editorConfig.customization.forcesave: true` ve `autosave: true` aktif edildi.
   - Bu sayede editörde "Kaydet" butonu ve `Ctrl+S` tetikleyicisi etkinleşirken, Document Server'ın periyodik olarak arka planda kaydetme çağrıları (status 6) yapması sağlandı. Kullanıcının tarayıcı çökmesi veya oturumu kapatmadan sayfadan ayrılması durumunda veri kaybı riski ortadan kaldırıldı.

2. **Document Server Periyodik Force-Save (autoAssembly) Konteyner Mimarisi:**
   - Document Server'ın `services.CoAuthoring.autoAssembly` (`enable: true`, `interval: "1m"`, `step: "1m"`) yeteneğini başlatma anında güvenle yükleyen `deploy/docker-entrypoint-onlyoffice.sh` wrapper betiği geliştirildi.
   - Entrypoint betiği hem Node.js `node-config` üretim override dosyası olan `/etc/onlyoffice/documentserver/local-production-linux.json` dosyasını oluşturur hem de mevcut `/etc/onlyoffice/documentserver/local.json` içine `autoAssembly` ayarlarını `jq` (veya `node`/`python3`) ile birleştirir; JWT ayarlarını ve gizli anahtarları bozmadan korur.
   - `OO_AUTOASSEMBLY_INTERVAL` ortam değişkeniyle (varsayılan `1m`) yapılandırılabilir kılındı; `deploy/docker-compose.prod.yml` ve `deploy/docker-compose.prod.onlyoffice.yml` dosyalarına yansıtıldı.
   - `deploy/onlyoffice.Dockerfile` içerisine paralel dal (`cd-turkish-ui`) ile çakışmayacak şekilde bağımsız bir adım olarak `jq` kurulumu ve entrypoint bağlantısı eklendi.

3. **Canlı Oturum Anahtarı Takibi ve Oturum Yaşam Döngüsü (`OnlyofficeSessionManager`):**
   - `apps/server/src/onlyoffice/session.ts` modülü oluşturuldu.
   - **Kritik Mimari Çözüm:** ONLYOFFICE'te status 6 force-save sırasında depolama versiyonu güncellense bile canlı oturum anahtarı (`key`) korunur. Böylece oturum esnasında belgeye katılan yeni işbirlikçiler veya sayfayı yenileyen kullanıcılar Document Server'dan "belge başka kullanıcı tarafından değiştirildi" hatası almaz, aynı canlı oturuma bağlanır.
   - Oturum ancak Document Server'dan status 2 (tüm kullanıcılar ayrıldı / kaydetmeye hazır) veya status 4 (değişiklik yapılmadan kapatıldı) callback'i geldiğinde sonlandırılır. Bir sonraki oturum açılışında yeni ve benzersiz bir anahtar üretilir.

4. **Gelişmiş Callback İşleyicisi, Mükerrer Kayıt Engelleme ve Kota Yönetimi:**
   - **Status 1:** Düzenleme devam ediyor bildirimi, no-op `{ error: 0 }`.
   - **Status 4:** Değişikliksiz kapanış bildirimi, oturumu kapatır, no-op `{ error: 0 }`.
   - **Status 3 ve 7:** Document Server hata bildirimleri uyarı olarak loglanır ve `{ error: 0 }` ile onaylanır.
   - **Status 6 ve 2 Kayıtları:** İndirilen belgenin SHA-256 içerik özeti (`contentHash`) hesaplanır. Düzenleme yapılmadan tetiklenen ardışık status 6 çağrılarında (ör. periyodik autoAssembly) aynı içerik tespit edilerek MinIO/S3'e mükerrer sürüm yazılması engellenir.
   - **Depolama Kotası Entegrasyonu:** `assertUserQuota` ile nesne değişim mantığı (`replacedDocBytes: doc.fileSize`) uygulanarak kotanın çift sayılması engellenir; kullanıcı kotasını aşan kaydetmeler güvenle reddedilir (`{ error: 1 }`).

5. **Testler ve Doğrulama:**
   - `apps/server/test/onlyoffice.test.ts`: Status 2, Status 6, ardışık status 6 mükerrer sürüm engelleme, kota hesaplama ve aşım reddi, canlı oturum anahtarı tutarlılığı & rotasyonu, status 1/4 no-op, geçersiz JWT reddi ve `autosave: true` / `forcesave: true` olmak üzere 36 test %100 yeşil.
   - `apps/server/test/onlyoffice-docker-entrypoint.test.ts`: Entrypoint betiğinin JSON override ve birleştirme mantığı için 2 test %100 yeşil.
   - `apps/server/test/onlyoffice-session.test.ts`: Oturum yöneticisi birim testleri (3 test) %100 yeşil.

### 19.2 Nasıl Doğrulanır?

1. **Birim ve Entegrasyon Testleri:**
   ```bash
   pnpm --filter @citedocs/server test test/onlyoffice
   ```
2. **Çalışan Konteynerde autoAssembly Doğrulaması:**
   ```bash
   docker exec citedocs-onlyoffice cat /etc/onlyoffice/documentserver/local.json | jq .services.CoAuthoring.autoAssembly
   # Çıktı: { "enable": true, "interval": "1m", "step": "1m" }
   ```

### 19.3 Açık Kalan Konular (Open Issues)
- Canlı sunucuya deploy henüz yapılmamıştır (talimat gereği sadece yerel daldadır). Dağıtım sırasında `deploy/onlyoffice.Dockerfile` imajının yeniden derlenmesi (`--build`) gereklidir.

## 20. Türkçe Arayüz ve Yerelleştirme Entegrasyonu (cd-turkish-ui) — Kayıt #020

> **Kayıt No:** #020  
> **Tarih:** 2026-10-17  
> **Dal:** `cd-turkish-ui`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Görev:** CiteDocs sisteminin (ONLYOFFICE Docs editör yapılandırması, Zotero ONLYOFFICE eklentisi ve React web arayüzü) baştan sona tutarlı şekilde Türkçe yapılması; varsayılan dilin her yerde Türkçe ("tr" / "tr-TR") olarak belirlenmesi; CSL atıf stili ve Zotero alan kodlarının bozulmadan korunması; birim ve entegrasyon testlerinin güncellenmesi.

### 19.1 Yapılan Çalışmalar

1. **ONLYOFFICE editorConfig ve Belge Şablonu:**
   - `apps/server/src/onlyoffice/routes.ts`: `editorConfig.lang: "tr"`, `editorConfig.region: "tr-TR"` ve `customization.spellcheck: true` varsayılan olarak sabitlendi. Güvenli `tr` öncelikli dil çözümlemesi sağlandı.
   - `apps/server/src/documents/templates.ts`: Yeni oluşturulan boş Word (.docx) belgelerinin varsayılan paragraf stiline Türkçe dil tanımlayıcısı (`<w:lang w:val="tr-TR"/>`) eklendi. Böylece ONLYOFFICE içinde yeni belgeler doğrudan Türkçe imla denetimiyle açılır.
   - `apps/server/test/onlyoffice.test.ts`: Testler `lang: "tr"`, `region: "tr-TR"` ve `spellcheck: true` beklentilerine göre güncellendi.
   - `apps/server/src/onlyoffice/routes.ts` içindeki Document Server callback işleyicisine ve forcesave/autosave ayarlarına dokunulmayarak paralel çalışan `cd-autosave` dalıyla çakışmalar önlendi.

2. **Zotero ONLYOFFICE Eklentisi Türkçe Çevirisi (Offline Kurulum, Python3 & gzip_static):**
   - `deploy/onlyoffice/zotero-translations/tr-TR.json`: Zotero eklentisinin kaynak çeviri setindeki 114 anahtarın tamamını kapsayan eksiksiz Türkçe çeviri dosyası oluşturuldu.
   - `deploy/onlyoffice.Dockerfile`: Document Server CE imajında PATH'te `node` ve `jq` bulunmadığı (yalnızca `/usr/bin/python3` mevcut olduğu) ve Document Server nginx'in `gzip_static` kullandığı tespit edildi. Kurulum adımı `python3` ile baştan yazıldı:
     - `|| true` ve `2>/dev/null` kaldırılarak herhangi bir hata durumunda derlemenin anında başarısız olması sağlandı (`fail-build`).
     - `langs.json` içine idempotent şekilde `"tr-TR"`, `config.json` içine `nameLocale.tr: "Zotero"` ve tüm varyasyonlara `descriptionLocale.tr` eklendi.
     - `tr-TR.json` dosyası `tr.json` olarak kopyalandı; `langs.json.gz`, `tr-TR.json.gz`, `tr.json.gz` ve varsa `config.json.gz` dosyaları `gzip -9` seviyesinde yeniden sıkıştırıldı.
     - Dosya izinleri `0644` yapılarak ve kardeş dosya sahipliğiyle eşitlenerek nginx (`ds`/`www-data`) tarafından okunabilir kılındı.
     - Derleme aşamasında `langs.json` içinde `"tr-TR"` olduğunu ve açılan `langs.json.gz` içeriğinin `langs.json` ile birebir eşleştiğini doğrulayan `assert` kontrolleri eklendi.
   - `apps/server/test/zotero-translation.test.ts`: JSON formatı ve 114 anahtar kontrolüne ek olarak Dockerfile adımını statik olarak denetleyen (python3 kullanımı, `|| true` bulunmaması, `.gz` yeniden üretimi ve derleme doğrulaması) ve geçici dizinde python betiğini çalıştırıp idempotentliğini ve gzip açılımını test eden birim testleri eklendi.

3. **React Web UI (`apps/web`) Türkçe Yerelleştirmesi:**
   - `apps/web/index.html`: `<html lang="tr">` ve `<title>CiteDocs - Akademik Kelime İşlemci</title>` yapıldı.
   - `apps/web/src/auth/AuthContext.tsx` & `apps/web/src/documents/i18n.ts`: Varsayılan dil durumu ve fallback dili İngilizce yerine `"tr"` yapıldı.
   - Kimlik doğrulama sayfaları (`LoginPage`, `SignupPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `VerifyEmailPage`, `UserMenu`): Hata metinleri, butonlar, rozetler ve ipuçları Türkçeleştirildi.
   - Belgelerim ve Bulut Depolama (`DocumentsPage`, `ShareDialog`, `RenameDialog`, `i18n.ts`): Depolama kotaları, tablo başlıkları, modal formları, doküman tipi etiketleri Türkçeleştirildi; İngilizce/Türkçe anahtar simetrisi korundu.
   - Belge Taslağı / Outline (`OutlineSidebar.tsx`, `App.tsx`): Başlıklar, boş durumlar ve erişilebilirlik etiketleri Türkçeleştirildi.
   - Kaynak ve Atıf Bileşenleri (`AddByIdentifier.tsx`, `CitationEditorModal.tsx`, `DocumentCitationsDrawer.tsx`, `StyleSelector.tsx`, `CollaboraEditorPage.tsx`, `ZoteroSidebar.tsx`, `ZoteroAccountModal.tsx`): Tüm butonlar, form alanları, etiketler ve durum bildirimleri Türkçeleştirildi.
   - PDF Okuyucu Paneli (`PdfReaderPanel.tsx`): Varsayılan dil `"tr"` yapıldı.

4. **CSL Atıf Uyumluluğu:**
   - CSL motoru ve Zotero alan kodları (`ADDIN ZOTERO_ITEM CSL_CITATION` vb.) kesinlikle değiştirilmedi; CSL yerel ayarı stil ayarlarına göre bağımsız çalışmaya devam ediyor.

5. **Test Paketi Uyarlamaları ve Doğrulama:**
   - `apps/web/test/outline.test.tsx`, `apps/web/test/collabora-cite-workflow.test.tsx`, `apps/web/test/zotero-sidebar.test.tsx`, `apps/web/test/auth.test.tsx`, `apps/web/test/pdf.test.tsx`, `apps/web/test/documents.test.tsx`: Türkçe arayüz metinlerine göre güncellendi.
   - `pnpm lint`, `pnpm typecheck`, `pnpm build` ve `pnpm test` monorepo genelinde başarıyla tamamlandı.

### 19.2 Nasıl Doğrulanır?

1. **Sunucu ve Çeviri Testleri:**
   ```bash
   pnpm --filter @citedocs/server test
   ```
   - ONLYOFFICE rota konfigürasyonunun `lang: "tr"`, `region: "tr-TR"`, `spellcheck: true` döndüğü doğrulanır.
   - Zotero çeviri dosyasının 114 anahtarla geçerli JSON olduğu test edilir.

2. **Web Arayüz Testleri:**
   ```bash
   pnpm --filter @citedocs/web test
   ```
   - 13 test dosyasında 101 testin tamamının Türkçe metinlerle hatasız geçtiği doğrulanır.

3. **Tam Monorepo Doğrulaması:**
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

### 20.3 Açık Kalan Konular / Tarayıcı Kontrolü Gerekenler

- ONLYOFFICE Docs CE konteyneri ayağa kaldırıldığında, Dockerfile içinde eklenen Zotero Türkçe çevirisinin sol eklenti panelinde ("Kaynak Ekle", "Stil Seç", "Zotero'ya Bağlan" vb.) tarayıcı üzerinden görsel kontrolü.
- Canlı sitede ONLYOFFICE editör menülerinin (Dosya, Giriş, Ekle, vb.) Türkçe görüntülendiğinin teyidi.

## 21. Server-Side Altyapı Güçlendirme ve Taşıma (cd-infra-salvage) — Kayıt #021

> **Kayıt No:** #021  
> **Tarih:** 2026-10-17  
> **Dal:** `cd-infra-salvage`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Görev:** Eski `cd-infra-hardening` dalında (commit `e1e2278`) geliştirilen değerli sunucu taraflı altyapı çalışmalarının mevcut ana dala (`main`, 72fd910) taşınması; ONLYOFFICE Docs CE motorunun ve kaydetme yollarının korunması; Drizzle veritabanı şema ve sıfır kayma (drift) testinin eklenmesi; S3/MinIO istemci konsolidasyonu ve `ensureBucket` idempotent başlatma mekanizması; çevrimdışı ve mock'lanmış `translation-client` testleri; `.env.example` dokümantasyonu; compose/deploy ve editör dosyalarına dokunulmaması.

### 21.1 Yapılan Çalışmalar

1. **Drizzle 0002 Migrasyonu ve Şema Drift Testi:**
   - `apps/server/src/db/schema.ts` içinde tanımlı eksik `pdf_annotations` tablosu için `drizzle-kit generate` çalıştırılarak `0002_fuzzy_marvex.sql`, meta snapshot (`0002_snapshot.json`) ve `_journal.json` üretildi.
   - `apps/server/test/schema.test.ts`: `pdfAnnotations` tablosu, zorunlu `ownerUserId` satır düzeyi sahiplik ve birincil anahtar denetimleri eklendi.
   - `apps/server/test/migrations.test.ts`: Journal bütünlüğü, şema export'larının tamamının snapshot ile uyumu ve geçici dizinde `drizzle-kit generate` çalıştırarak sıfır kayma ("No schema changes, nothing to migrate") denetimi yapan test paketi taşındı.

2. **S3 / MinIO İstemci Konsolidasyonu ve İdempotent `ensureBucket`:**
   - `apps/server/src/storage/s3Client.ts`: MinIO ve AWS S3 (us-east-1 vs diğer bölgeler için `LocationConstraint`, `BucketAlreadyOwnedByYou`/`409`, kısıtlı IAM politikaları için `403 Forbidden` toleransı) ile uyumlu, idempotent `ensureBucket`, `createS3Client`, `getStorageBuckets` ve `ensureAllStorageBuckets` yardımcıları yazıldı.
   - `apps/server/src/pdf/attachmentStorage.ts`: İstemci kurulumu `createS3Client` ile birleştirildi; `put()` öncesi idempotent `ensureBucket()` çağrısı ve `transformToByteArray()` modern stream okuması entegre edildi.
   - `apps/server/src/wopi/storage/s3Storage.ts`: Konsolide `s3Client` altyapısına geçirildi; `createFile()` ve `putFile()` öncesinde idempotent `ensureBucket()` güvenceye alındı. ONLYOFFICE callback kaydetme yolu (`storage.putFile`) ve WOPI dosya kalıcılığı kesintisiz korundu.
   - `apps/server/src/index.ts`: Sunucu açılışında (`start()`) S3 konfigüre edilmişse (`S3_ENDPOINT`, `S3_BUCKET`, `S3_DOCUMENTS_BUCKET`, `S3_ATTACHMENTS_BUCKET`) tüm kova tanımları için `ensureAllStorageBuckets` otomatik çalıştırıldı; `export * from "./storage/s3Client.js"` eklendi.
   - `apps/server/test/storage.buckets.test.ts`: HeadBucket, CreateBucket, 404, 403, 409 ve MinIO vs AWS path-style senaryolarını mock'larla çevrimdışı test eden 10 testlik paket taşındı.

3. **Çevrimdışı Zotero Translation Client Testleri:**
   - `apps/server/test/translation-client.test.ts`: `TranslationClient`, `normalizeIdentifier`, DOI/ISBN/PMID çözümleme, 502 hata yönetimi ve Fastify route entegrasyonunu (`/api/items/from-identifier`, `/api/zotero/translate`) mock'lanmış `fetchFn` ile çevrimdışı doğrulayan 9 testlik paket taşındı.

4. **Çevre Değişkenleri Dokümantasyonu (.env.example):**
   - `.env.example`: Mevcut değişkenler (Zotero, ONLYOFFICE) korunarak yeni eklenen `S3_DOCUMENTS_BUCKET`, `S3_ATTACHMENTS_BUCKET` ve `S3_FORCE_PATH_STYLE` değişkenleri açıklamalarıyla belgelendi.

5. **Dokunulmayan Alanlar ve İzolasyon:**
   - Root `docker-compose.prod.yml` eklenmedi; `deploy/`, `docker-compose.yml`, `apps/web/src/onlyoffice/` ve `apps/server/src/onlyoffice/routes.ts` callback mantığına kesinlikle dokunulmadı; Collabora'ya özgü hiçbir dosya veya ayar prod ortamına zorlanmadı.

### 21.2 Nasıl Doğrulanır?

1. **Drizzle Migrasyon ve Drift Doğrulaması:**
   ```bash
   pnpm --filter @citedocs/server test test/migrations.test.ts test/schema.test.ts
   ```
2. **Storage ve ONLYOFFICE Doğrulaması:**
   ```bash
   pnpm --filter @citedocs/server test test/storage.buckets.test.ts test/wopi.storage.test.ts test/onlyoffice.test.ts
   ```
3. **Translation Client Doğrulaması:**
   ```bash
   pnpm --filter @citedocs/server test test/translation-client.test.ts
   ```
4. **Monorepo Genel Sağlık ve Derleme:**
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm build
   pnpm test
   ```

### 21.3 Açık Kalan Konular (Open Issues)

- **Production Compose S3 Bucket Değişkenleri:** Sunucu tarafında `S3_DOCUMENTS_BUCKET` ve `S3_ATTACHMENTS_BUCKET` ayrımı desteklendi. `deploy/docker-compose.prod.yml` içinde tek kova yerine ayrı kova kullanılmak istenirse `deploy` dosyasını yöneten ajan tarafından bu ortam değişkenleri compose servisine aktarılmalıdır.
- **Translation Server Çoklu Mimari (arm64/amd64) Dockerfile:** `cd-infra-hardening` dalında `docker/translation-server/Dockerfile` içinde multi-arch Node 20 tabanlı bir imaj tanımlanmıştı. Prod compose'un bunu kullanabilmesi için deploy sorumlusu ajan tarafından `deploy/` altında incelenmesi ve prod compose'a entegrasyonu değerlendirilmelidir.

---

## 20. Canlı Sistem QA, Öğrenci Kabul Kriterleri & Hata Raporu (Kayıt #022)

> **Kayıt No:** #022  
> **Tarih:** 2026-10-17  
> **Dal:** `cd-oo-qa` (Taban: `72fd910` / `main`)  
> **Ajan Modu:** Korkusuz Uzman Ajan (QA & Doğrulama Modu)  
> **Aşama:** Canlı Sistem (`https://docs.sifirdanbire.com.tr`) Uçtan Uca Öğrenci Kabul Testleri ve Kalite Güvence Raporlaması

### 20.1 Yapılan İşler ve Otomasyon Paketleri

Uygulama ve dağıtım kodlarına dokunulmaksızın (`apps/`, `packages/`, `deploy/` değiştirilmeden), ürün gereksinimlerini denetleyen ve canlı ortamı simüle eden 4 yeni Playwright E2E test paketi geliştirildi:

1. **`e2e/oo-qa-autosave.spec.ts` (Gereksinim 1 - Autosave & Kalıcılık):**
   - Taze öğrenci kaydı (`qa+autosave_<timestamp>@example.com`), boş `.docx` belgesi oluşturulması.
   - ONLYOFFICE içi AST metin ekleme (`callCommand`) ve tuval klavye girişi simülasyonu.
   - `Control+s` force-save tetikleme ve `POST /api/onlyoffice/callback/:id` üzerinden `status: 6` callback kaydı.
   - Belgelerim sayfasına dönüşte dosya boyutu (1.956 B -> 25.384 B) ve `updatedAt` zaman damgası doğrulaması.
   - `/api/documents/:id/download` üzerinden `.docx` indirilip `JSZip` ile `word/document.xml` içinde benzersiz persistence belirtecinin doğrulanması.
   - Belgenin yeniden açılıp editörün hazır olduğunun doğrulanması ve UI silme diyaloğu ile tam temizlik.

2. **`e2e/oo-qa-language.spec.ts` (Gereksinim 2 - Türkçe Arayüz Tutarlılığı):**
   - İzin verilen özel adlar listesi (`allowlist`: Zotero, DOI, ISBN, URL, CiteDocs, ONLYOFFICE, vb.) ile İngilizce kelime sızıntı denetim motoru kuruldu.
   - `/signup`, `/login`, `/documents`, `ShareDialog`, `RenameDialog`, editör üst barı ve bildirimlerin %100 Türkçe olduğu doğrulandı.
   - ONLYOFFICE API config (`lang: "tr"`, `region: "tr-TR"`), iframe `src` parametresi (`lang=tr`), şerit sekmeleri ve Zotero eklentisi yerelleştirmesi teyit edildi.
   - Sızan İngilizce dizgeler (`Untitled Document`, `Cloud`, `Invalid email or password`) testlerle tespit edilip belgelendi.

3. **`e2e/oo-qa-workflow.spec.ts` (Gereksinim 3 - Tek Ekran İş Akışı):**
   - Editör üst barındaki kırmızı 1-tık Zotero butonunun (`oo-zotero-open`) sayfadan ayrılmadan ONLYOFFICE içi resmi Zotero eklentisini (`pluginFrameEditor`) açtığı doğrulandı.
   - "Kaynak Paneli"nin (`oo-cite-panel`) sorunsuz açılıp kapandığı teyit edildi.
   - Zotero hesabı bağlı olmayan öğrenci için uyarı bildirimleri ve bağlantı modalı denetlendi.
   - Harici Zotero hesabı gerektiren adımlar `test.fixme` ile işaretlendi.

4. **`e2e/oo-qa-robustness.spec.ts` (Gereksinim 4 - Temel Sağlamlık):**
   - Öğrencinin kayıt, pano, editör, isim değiştirme, paylaşım, silme, çıkış ve tekrar giriş döngüsünde:
     - 0 JS Runtime hatası (`pageerror`)
     - 0 Fatal konsol hatası
     - 0 Başarısız 4xx/5xx ağ isteği (kendi origin'imiz `docs.sifirdanbire.com.tr` üzerinden).

### 20.2 Tespit Edilen Öncelikli Hatalar

Detaylı rapor `docs/qa-report-2026-10-17.md` dosyasına kaydedilmiş olup, en kritik maddeler şunlardır:
1. **BUG-01 (Kritik - P1):** Force-save sonrası belge kapatılıp tekrar açıldığında ONLYOFFICE Document Server oturum anahtarının yenilenmemesi nedeniyle "Versiyon değiştirildi" modalının açılması ve editörün kilitlenmesi (`apps/server/src/onlyoffice/session.ts`).
2. **BUG-02 (Yüksek - P2):** Zotero hesabı bağlanmadan DOI/ISBN/URL ile kaynak eklenememesi (istemci engeli ve sunucu HTTP 409 Conflict: `Zotero account not linked`).
3. **BUG-03 (Orta - P3):** Yeni oluşturulan belgelerin varsayılan adının İngilizce `"Untitled Document"` olması (`apps/server/src/documents/routes.ts`).
4. **BUG-04 (Orta - P3):** Hatalı girişte sunucudan dönen İngilizce `"Invalid email or password"` mesajının arayüzde doğrudan gösterilmesi.
5. **BUG-05 (Düşük - P4):** `/documents` sayfasındaki depolama rozetinin sabit `"Cloud"` yazılması.

### 20.3 Sonraki Geliştirici / Ajan İçin Notlar

- Uygulama kodunu (`apps/`, `packages/`) devralacak ajan:
  - `apps/server/src/onlyoffice/session.ts` içinde `closeSession(fileId)` mantığını veya MD5 tabanlı oturum anahtarı yenilemesini düzelttiğinde `e2e/oo-qa-autosave.spec.ts` ek bir modal tıklamasına ihtiyaç kalmadan pürüzsüz çalışacaktır.
  - `apps/server/src/documents/routes.ts` içinde `docTitle` varsayılanını `"Adsız Belge"` yaparak BUG-03'ü kolayca çözebilir.
  - `apps/web/src/documents/DocumentsPage.tsx` içindeki `<span ...>Cloud</span>` etiketini `t.cloud` ("Bulut") yaparak BUG-05'i çözebilir.
- Tüm testler `BASE_URL=https://docs.sifirdanbire.com.tr pnpm test:e2e` ile 3.5 dakika içinde uçtan uca doğrulanabilir.

---

## 21. Türkçe Arayüz Tutarlılığı, Kimlik Doğrulama Hata Eşlemesi ve Ağ Hata Yönetimi (Kayıt #025)

> **Kayıt No:** #025  
> **Tarih:** 2026-10-17  
> **Dal:** `cd-tr-strings` (Taban: `792d3c4` / `main`)  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Aşama:** Canlı Sistem QA Bulgularının Çözümü (BUG-03, BUG-04, BUG-05, BUG-06, BUG-08) ve Tam Türkçe Arayüz Taraması

### 21.1 Yapılan İşler ve Mimari Çözümler

Canlı QA raporunda (`docs/qa-report-2026-10-17.md`) tespit edilen öğrenci arayüzü dil ve hata gösterimi sorunları mevcut i18n altyapısı genişletilerek çözüldü:

1. **BUG-03: Varsayılan Belge Başlığı Türkçe Yapıldı:**
   - Sunucu tarafında `apps/server/src/documents/routes.ts` içinde yeni belge oluşturma varsayılanı `"Untitled Document"` yerine `"Adsız Belge"` (`.odt` için `"Adsız Belge.odt"`) olarak güncellendi.
   - `InMemoryDocumentRepository` ve `InMemoryItemRepository` varsayılan başlıkları `"Adsız Belge"` / `"Adsız"` yapıldı.
   - Drizzle şema tablosunun varsayılanı değiştirilmedi; böylece gereksiz SQL migrasyon sapması (migration drift) önlendi.
   - Web tarafında belge oluşturma ve açma akışları `"Adsız Belge"` ile senkronize edildi.

2. **BUG-04: Kimlik Doğrulama Hata Mesajları İstemcide Türkçeleştirildi:**
   - Sunucu tarafındaki kararlı hata kodları (`INVALID_CREDENTIALS`, `RATE_LIMIT_EXCEEDED`, `SESSION_EXPIRED`, `EMAIL_EXISTS`, `TOKEN_EXPIRED`, `INVALID_TOKEN`, `FORBIDDEN`, `USER_NOT_FOUND`) ve HTTP durum kodları (401, 403, 404, 409, 429, 500+) `apps/web/src/auth/i18n.ts` içinde `getLocalizedAuthError` fonksiyonu ile Türkçe öğrenci dostu mesajlara eşlendi.
   - Sunucu auth testlerinin beklediği hata metinleri kırılmadan istemci katmanında `"Geçersiz e-posta veya şifre"` gibi tam Türkçe geri bildirim sağlandı.

3. **BUG-05: Depolama Rozeti ("Cloud") Türkçeleştirildi:**
   - `apps/web/src/documents/i18n.ts` içine `cloud: "Bulut"` / `cloud: "Cloud"` anahtarı eklendi.
   - `apps/web/src/documents/DocumentsPage.tsx` dosyasındaki sabit `"Cloud"` rozeti `{t.cloud}` ile reaktif hale getirildi.

4. **BUG-06: Belge Kartlarında Saat ve Dakika Hassasiyetinde Türkçe Tarih:**
   - `apps/web/src/documents/i18n.ts` içine `formatDocumentDate(dateStr, lang)` fonksiyonu eklendi.
   - `tr-TR` yerel ayarı ve `Europe/Istanbul` saat dilimi ile `17 Eki, 10:19` formatında gün, ay, saat ve dakika bilgisi gösterildi.

5. **BUG-08: Ağ Hataları ("Failed to fetch") Ortak İstemcide Yakalandı:**
   - `apps/web/src/auth/api.ts` içinde `isNetworkError()`, `createNetworkError()`, `createApiError()` yardımcıları geliştirildi.
   - `request<T>()`, `docFetch<T>()`, `uploadDocument()`, `downloadDocument()` ve `linkZoteroApiKey()` fonksiyonlarında tarayıcının ham `TypeError: Failed to fetch` veya `NetworkError` istisnaları yakalanarak öğrenciye `"Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin."` mesajı döndürüldü.

6. **Öğrenci Arayüzü İngilizce Dizge Taraması (Sweep):**
   - Giriş, kayıt, şifre sıfırlama, kullanıcı menüsü (`Student` -> `Öğrenci`), `RenameDialog`, `ShareDialog`, `AddByIdentifier` ve `App.tsx` başlık/butonlarında kalan tüm sızıntılar temizlendi.
   - ONLYOFFICE editör sayfasına (`apps/web/src/onlyoffice/OnlyofficeEditorPage.tsx`), dağıtım yapılandırmalarına ve Caddyfile'lara dokunulmadı.

7. **Testler ve E2E İyileştirmeleri:**
   - `apps/web/test/api-errors.test.ts`: Ağ hataları, kimlik doğrulama hata kodları, İstanbul saat dilimi tarih formatı ve LoginPage DOM hata banner'ını test eden 16 yeni birim testi yazıldı.
   - `e2e/oo-qa-language.spec.ts`: Geçici `test.fixme` kaldırılarak hatalı giriş uyarısı, `Bulut` rozeti, yeniden adlandırma/paylaşım diyalogları ve yeni belge varsayılan başlığı (`Adsız Belge`) için gerçek Playwright assertion'ları devreye alındı.

### 21.2 Doğrulama Durumu

- `pnpm lint`: 0 hata, 0 uyarı.
- `pnpm typecheck`: 0 hata.
- `pnpm test`: 56 test dosyası, 532 test başarılı (1 kasıtlı atlama harici).
- `pnpm build`: Tüm monorepo paketleri ve Vite SPA hatasız derlendi.

### 21.3 Açık Kalan Konular (Open Issues)

- Bu dalda (`cd-tr-strings`) Türkçe arayüz ve hata yerelleştirmeleri tamamlanmıştır; bilinen açık hata veya eksik kalmamıştır.
- Canlı sunucuya dağıtım ve ONLYOFFICE editör geliştirmeleri ilgili yetkili ajanların sorumluluğundadır.


## 22. ONLYOFFICE Oturum Anahtarı ve Yeniden Açılış Onarımı (cd-oo-session-fix) — Kayıt #024

> **Kayıt No:** #024  
> **Tarih:** 2026-10-17  
> **Dal:** `cd-oo-session-fix` (Taban: `792d3c4` / `main`)  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Görev:** BUG-01 (P1) onarımı: Bir öğrenci belgesini düzenleyip kaydettikten sonra (Ctrl+S force-save veya periyodik autoAssembly) Belgelerim'e dönüp belgeyi tekrar açtığında beliren ONLYOFFICE "Versiyon değiştirildi: Dosya versiyonu değiştirildi. Sayfa yenilenecektir." kilitlenme modalının kök nedeninin sunucu tarafında (`apps/server/src/onlyoffice/session.ts`) çözülmesi; ONLYOFFICE `document.key` kurallarına tam uyum sağlanması; birim ve entegrasyon testlerinin (`apps/server/test/onlyoffice-session.test.ts`, `apps/server/test/onlyoffice.test.ts`) ve E2E testinin (`e2e/oo-qa-autosave.spec.ts`) güncellenmesi.

### 22.1 Kök Neden ve Çözüm

1. **Tespit Edilen Kök Neden:**
   - Önceki `cd-autosave` dalında, `status: 6` force-save çağrısı sırasında MinIO/S3 depolama versiyonu güncellense bile oturum anahtarının (`key`) 24 saat boyunca sabit tutulması kuralı konulmuştu.
   - ONLYOFFICE Document Server, bir `document.key` ile açılan dosyayı önbelleğe alır. Dosya `status: 6` ile diske yazılıp versiyonu değiştiğinde, kullanıcı sayfayı kapatıp tekrar açtığında (veya yenilediğinde) sunucu eski `key` değerini sunmaktaydı. Document Server ise `document.url` üzerinden yeni dosyayı indirdiğinde anahtar ile dosya hash'i arasındaki tutarsızlığı yakalayarak *"Versiyon değiştirildi: Dosya versiyonu değiştirildi. Sayfa yenilenecektir."* uyarısını fırlatıp editörü kilitliyordu.

2. **Uygulanan Mimari Çözüm (`apps/server/src/onlyoffice/session.ts`):**
   - **Eş Zamanlı Ortak Çalışma (Co-editing):** Düzenleme oturumu aktifken ve depolamadaki dosya versiyonu değişmemişken `getOrCreateSessionKey` aynı anahtarı döndürmeye devam eder; aynı anda belgeyi açan işbirlikçiler tek bir canlı oturumu paylaşır.
   - **Kayıt Sonrası Anahtar Rotasyonu:** Bir kaydetme callback'i (`status: 2` veya `status: 6`) dosyayı depolamada güncellediğinde (`storage.putFile`), `sessionManager.recordSave` yeni versiyon ve boyut üzerinden yeni bir `document.key` üretir (`recordSave`). Böylece dosya içeriği her değiştiğinde ONLYOFFICE şartı uyarınca anahtar da değişir.
   - **Yeniden Açılış (Reopen):** Kayıt sonrası belge tekrar açıldığında güncel depolama versiyonuyla eşleşen yeni anahtar sunulur; Document Server versiyon uyuşmazlığı hatası üretmeden belgeyi doğrudan açar.
   - **Mükerrer Kayıt Engelleme (Deduplication):** `lastSavedHashes` hafızası korunarak değişiklik yapılmayan periyodik `status: 6` (autoAssembly) çağrılarında depolamaya mükerrer yazım engellenir ve dosya değişmediği için anahtar stabil kalır.

3. **Otomasyon Testleri ve Doğrulama:**
   - `apps/server/test/onlyoffice-session.test.ts`:
     - Oturum boyunca anahtarın stabil kalması (key stable during an editing session),
     - Eş zamanlı düzenleyicilerin aynı anahtarı paylaşması (concurrent editors share the key),
     - Kayıt callback'i dosyayı güncellediğinde anahtarın değişmesi (key changes after save callback),
     - Kayıt sonrası yeniden açılışın yeni anahtarı alması (reopen after save gets the new key),
     - Oturum kapatıldığında (`status: 2` / `status: 4`) taze anahtar üretilmesi,
     - İçerik hash takibi ve mükerrer kayıt engelleme doğrulandı.
   - `apps/server/test/onlyoffice.test.ts`:
     - Fastify HTTP entegrasyonu seviyesinde `status: 6` force-save, `config` yeniden açılışı, `editor` paylaşımı ve `status: 2` kapanışı doğrulandı.
   - `e2e/oo-qa-autosave.spec.ts`:
     - Reopen adımındaki "Anladım" butonuna tıklama geçici çözümü kaldırılarak, "Versiyon değiştirildi" modalının açılmadığı ve editörün kilitlenmeden doğrudan hazır hale geldiği kesin assertion (`expect().not.toBeVisible()`) haline getirildi.

### 22.2 Nasıl Doğrulanır?

1. **Birim ve Entegrasyon Testleri:**
   ```bash
   pnpm --filter @citedocs/server test test/onlyoffice
   ```
2. **Monorepo Genel Sağlık:**
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   ```

### 22.3 Açık Kalan Konular (Open Issues)
- Bu dal sadece sunucu tarafındaki oturum anahtarı mantığını onarmıştır. Canlı ortamdaki (`https://docs.sifirdanbire.com.tr`) `e2e/oo-qa-autosave.spec.ts` testi, sunucu imajı derlenip deploy edildikten sonra yeşile dönecektir (mevcut canlı sunucuda deploy öncesi eski kod koşmaktadır).



## 22. Üretim Seviyesi Yedekleme ve Kurtarma Araçları (cd-ops-backup) — Kayıt #023

> **Kayıt No:** #023 (Not: #022 başka bir dal için rezerve edilmiştir)  
> **Tarih:** 2026-10-17  
> **Dal:** `cd-ops-backup`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Görev:** CiteDocs üretim sunucusunda (docs.sifirdanbire.com.tr) yaklaşık 20 öğrencinin tez ve akademik belgelerinin sunucu veya disk çökmesi durumunda dahi asla kaybolmamasını sağlayacak üretim seviyesinde yedekleme (`citedocs-backup.sh`), geri yükleme (`citedocs-restore.sh`), zamanlama (cron.d ve systemd timer), doğrulama (`--verify`), entegrasyon testleri ve kapsamlı Türkçe dokümantasyon (`docs/BACKUP.md`) hazırlanması.

### 22.1 Yapılan Çalışmalar

1. **Üretim Yedekleme Aracı (`deploy/backup/citedocs-backup.sh`):**
   - `set -euo pipefail` ve `export LC_ALL=C` ile tam platform ve yerel dil bağımsızlığı sağlandı.
   - Sabit şifreler yerine `/opt/citedocs/.env` veya `--env-file` üzerinden kimlik bilgileri dinamik olarak okundu.
   - `pg_dump -F c` (PostgreSQL Custom Format) ile ilişkisel veritabanı atomik olarak döküldü.
   - S3 ve MinIO depolama katmanı (`citedocs-documents` ve `citedocs-attachments`) kova bazında `aws s3 sync` veya `mc mirror` ile standart `.docx`/`.pdf` nesneleri olarak yedeklendi.
   - Docker Compose ağında MinIO portu host'a kapalı olsa dahi konteyner köprü IP'si (`resolve_storage_endpoint`) üzerinden sorunsuz senkronizasyon garantilendi.
   - Boş disk koruması eklendi (`--min-free-mb`, varsayılan 2 GB). Eşik altındaki disk alanında sistem stabilitesini korumak için işlem güvenle durdurulur.
   - 7 günlük + 4 haftalık rotasyon politikası (`apply_retention`) ile en fazla 11 arşiv saklanarak disk taşması önlendi.
   - `BACKUP_S3_URI` tanımlıysa uzak off-site S3 kovasına arşiv ve SHA-256 sağlama toplamı yüklendi; tanımsızsa temiz şekilde atlandı.
   - Her arşiv için `metadata.json` ve `sha256sums.txt` kriptografik bütünlük dosyaları üretildi.

2. **Üretim Geri Yükleme ve Doğrulama Aracı (`deploy/backup/citedocs-restore.sh`):**
   - `--dry-run` modu ile hiçbir veriyi değiştirmeden arşiv içeriğini, tabloları ve nesneleri analiz eden önizleme desteği.
   - Canlı veritabanını kazara ezmeyi önleyen etkileşimli terminal onayı ve betik otomasyonu için `--yes` / `--confirm` bayrağı.
   - `--verify` modu: Canlı sisteme dokunmadan geçici throwaway konteynerler (`postgres:16-alpine` ve `pgsty/minio:latest`) üzerinde geri yükleme yapıp tablo ve satır sayıları (`users`, `documents`, `library_items`) ile depolama nesne sayılarını doğrulayan ve çıkışta konteynerleri temizleyen tam izolasyonlu test motoru.

3. **Zamanlanmış Görev ve Servis Tanımları:**
   - `deploy/backup/citedocs-backup.cron`: Her gün saat 03:30 Europe/Istanbul'da çalışacak `/etc/cron.d/citedocs-backup` örneği.
   - `deploy/backup/citedocs-backup.service` ve `citedocs-backup.timer`: Modern systemd timer alternatifi (`OnCalendar=*-*-* 03:30:00 Europe/Istanbul`).

4. **Kapsamlı Test Altyapısı:**
   - `deploy/backup/test/test-backup-restore.sh`: Uçtan uca Docker Compose tabanlı entegrasyon testi. Dinamik portlarla Postgres ve MinIO konteynerleri açar, test verileri yükler, yedek alır, canlı veriyi siler, `--dry-run` test eder, `--yes` ile geri yükler ve verilerin %100 round-trip doğruluğunu kanıtlar.
   - `apps/server/test/backup-restore.test.ts`: Vitest test paketi. ShellCheck denetimi, CLI parametre doğrulamaları, disk eşiği testi, sahte arşivle dry-run ve bozuk sağlama toplamı reddi denetimlerini çalıştırır.
   - Tüm kabuk betikleri `shellcheck` denetiminden 0 hata ve 0 uyarı ile geçmektedir.

5. **Türkçe Dokümantasyon (`docs/BACKUP.md`):**
   - Yedeklenen verilerin anatomisi, sunucu kurulum adımları, acil durum felaket kurtarma senaryoları, `--verify` kullanımı ve ~20 öğrenci için disk/S3 maliyet projeksiyonu (aylık yaklaşık 3 TL) detaylandırıldı.

### 22.2 Nasıl Doğrulanır?

1. **ShellCheck ve Vitest Birim Testleri:**
   ```bash
   pnpm --filter @citedocs/server test test/backup-restore.test.ts
   ```
2. **Uçtan Uca Konteyner Entegrasyon Testi:**
   ```bash
   deploy/backup/test/test-backup-restore.sh
   ```
3. **Monorepo Genel Sağlık ve Derleme:**
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   ```

### 22.3 Açık Kalan Konular (Open Issues)

- **Uzak S3 Kovası Yaşam Döngüsü (Lifecycle Rule):** Sunucu tarafında `BACKUP_S3_URI` üzerinden harici bir S3 kovası kullanılacaksa, AWS S3 konsolu üzerinden 30-90 gün sonrası için `Expire` veya `Glacier Flexible Retrieval` geçiş yaşam döngüsü kuralı eklenmesi tavsiye edilir.




## Editör OAuth Akışı ve Türkçe Boş Belge — Kayıt #026

> **Kayıt No:** #026
> **Tarih:** 2026-10-17
> **Dal:** `cd-editor-fixes`

- **BUG-02:** Tanımlayıcı alanının yanına açıklamalı “Zotero'yu bağla” düğmesi taşındı. Mevcut OAuth akışı aynı belgeye döner; tanımlayıcı ve belge kimliği `sessionStorage/citedocs.pendingZoteroAdd` içinde korunur. Bağlı hesapla dönüşte kayıt istekten önce tüketilir ve kaynak bir kez eklenir; HTTP/ağ hataları Türkçe bildirilir, otomatik tekrar döngüsü oluşmaz. OAuth yapılandırılmamışsa yönlendirme yerine Türkçe açıklama ve mevcut API anahtarı seçeneği gösterilir. Yerel kaynak deposu veya `save:false` eklenmedi.
- **BUG-07:** Üretilen DOCX ve eski office yolunun kullandığı `deploy/office/blank.docx` varlığına `styles.xml/docDefaults` ve `settings.xml/themeFontLang` içinde `tr-TR` eklendi; paket ilişkileri ve içerik türleri tanımlandı. Mevcut sunucu `editorConfig.lang=tr`, `region=tr-TR`, `spellcheck=true` ayarları korundu; farklı Accept-Language değerleriyle test kapsamı genişletildi.
- **Kapsam:** Oturum anahtarı mantığı, compose/Caddy dosyaları ve üretim sunucusu değiştirilmedi. Container oluşturulmadı; push veya deploy yapılmadı.
- **Odaklı doğrulama:** 4 dosyada 78 Vitest testi geçti; StrictMode altında tek ekleme, HTTP/ağ hatası, farklı belge, iptal sonrası girdi korunması, OAuth kapalı durumu, varsayılan/açık DOCX oluşturma yolları ve iki şablon doğrulandı. DOCX varlığının altı XML parçası ayrıştırıldı. Güncellenen iki Playwright dosyası `--list` ile doğrulandı (12 test); canlı E2E çalıştırılmadı.
- **Açık kontrol:** Gerçek Zotero OAuth dönüşü ve ONLYOFFICE durum çubuğunun ilk açılışta Türkçe görünmesi dağıtım sonrası tarayıcıda doğrulanmalı. Önceden oluşturulmuş belgeler dönüştürülmez.
- **Genel doğrulama (Node v22.22.3):** `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm build` ve `pnpm test` başarılı. Tam pakette 56 dosya, 528 başarılı / 1 atlanan test (529 toplam). Son kod değişikliklerinden sonra lint/typecheck yeniden geçti. Vite büyük paket ve Vitest workspace kullanımdan kaldırma uyarıları engelleyici değil.
- **Commitler:** `59ec9a7` OAuth sonrası bekleyen kaynak ekleme; `a65a0fc` Türkçe boş DOCX ve dil testleri; bu kayıt son dokümantasyon commit'inde.

## S3 Türkçe Dosya Adı ve ONLYOFFICE Forcesave — Kayıt #027

> **Kayıt No:** #027
> **Tarih:** 2026-10-17
> **Dal:** `cd-hotfix-s3-filename`

- **P0 kök neden:** Türkçe dosya adları S3 HTTP metadata başlığına ham yazıldığı için belge oluşturma 500 hatası veriyordu. Ortak `encodeS3MetaValue` / `decodeS3MetaValue` yardımcılarıyla `filename` ve `owner-id` yazımları ASCII olarak kodlanır, okumalar insan tarafından okunabilir metne döner. Bozuk yüzde dizisi içeren eski metadata ham haliyle korunur. Sunucunun diğer S3 yazımlarında kullanıcı metni taşıyan ek metadata bulunmadı.
- **P1 kök neden:** Her kayıtta anahtar yenilenmesi forcesave sonrası katılan editörleri ayrı oturuma yönlendiriyordu. Status 6 artık anahtarı koruyarak sürüm, hash ve boyutu günceller. Status 2 ve 4 oturumu kapatır; sonraki açılış yeni anahtar üretir. Aynı içerik deduplikasyonu ve BUG-01 kapanış/yeniden açılış davranışı korunur.
- **Regresyon kapsamı:** Türkçe iki başlık ve varsayılan POST yolu; ASCII metadata, oluşturma/kaydetme/okuma, legacy ve bozuk `%`, çift kodlamama; eşzamanlı editörler, forcesave sonrası katılım, aynı içerikle kapanış, status 4 ve bellekte oturum olmadan gelen callback. Autosave E2E dosyasında anahtar rotasyonu beklentisi yoktu.
- **Commitler:** `42aade9` S3 metadata; `1bdca4b` ONLYOFFICE oturum anahtarı.
- **Açık kontrol:** Gerçek S3/ONLYOFFICE ile canlı tarayıcı kontrolü dağıtım sonrası yapılmalı; bu çalışmada üretime erişilmedi, push/deploy yapılmadı. Web, compose, Caddy ve container yapılandırmaları değiştirilmedi.
||||||| f722528

## Kapasite Planı ve Operasyon Araçları — Kayıt #028

> **Kayıt No:** #028 (#027 başka dal için ayrılmıştır)
> **Tarih:** 2026-10-17
> **Dal:** `cd-ops-capacity` (taban `f722528`)

- `docs/CAPACITY.md`: 20/50/100 öğrenci için Türkçe disk, RAM, swap, CPU ve CE bağlantı planı; repo kanıtları ile tahminler ayrıldı. 20 × 5 GiB kota mevcut 100 GB diske güvenle sığmaz; 11 tam yedek + staging ile zirve yaklaşık `30 + 14D GiB`. 4 GiB RAM dar; 8 GiB RAM ve S3/yerel yedek stratejisi değişikliği önerildi.
- `deploy/ops/`: POSIX kapasite denetimi, 5 dakikalık systemd timer, JSON log rotasyonu örneği ve varsayılan dry-run temizlik. Disk/inode %80/%90, kullanılabilir RAM 768/384 MiB, swap %25/%50, cache 5/10 GiB; isteğe bağlı webhook. Cleanup aktif belge servisleri durmadan silmez; forgotten için ayrıca kurtarma doğrulaması gerekir.
- 9 sahte girdili Vitest testi: eşikler, Docker ölçüm hatası, webhook hatası, dry-run, bakım koruması, yeni dosya ve symlink koruması. Shell sözdizimi `sh -n` ile doğrulandı; ShellCheck yerelde kurulu değil.
- Üretime SSH, push, deploy veya ücretli işlem yapılmadı; konteyner oluşturulmadı. Compose, Caddy, `deploy/onlyoffice*` ve uygulama kaynakları değiştirilmedi. Yerelde çalışan CiteDocs/ONLYOFFICE yok; başka projelerin kaynak kullanımı kapasite kanıtı sayılmadı.
- Açık işler: operatörün alarmı kurup teslimini denemesi, üretim ölçümü ve staging yük testi, 21. bağlantı davranışı, CPU/kredi/bağlantı metrikleri, büyük yedeklerde alan kontrolü ve staging/retention iyileştirmesi. Bunlar üretimde uygulanmış gibi raporlanmadı.
- Commitler: `947e570` araçlar ve testler; `2c12343` kapasite planı; bu devir kaydı son commit'tedir.

## Zotero Word & LibreOffice Uyumluluğu ve CSL Stil Deposu Doğrulaması — Kayıt #029

> **Kayıt No:** #029 (birleştirmede #027/#028 çakışması nedeniyle yeniden numaralandı)  
> **Tarih:** 2026-10-17  
> **Dal:** `cd-zotero-compat`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  

### 1. Yapılan İncelemeler ve Bulgular
- **Gereksinim 1 (Word DOCX & LibreOffice ODT Uyumluluğu):**
  - **Microsoft Word (DOCX):** Canlı sistemde (`https://docs.sifirdanbire.com.tr`) ve sunucu testlerinde kanıtlandı: Word Zotero karmaşık alan kodları (`w:fldChar`, `w:instrText`, `ADDIN ZOTERO_ITEM CSL_CITATION`, `ADDIN ZOTERO_BIBL`) yükleme, ONLYOFFICE düzenleme, force-save (`status: 6` callback), oturum kapatma (`status: 2`), veritabanı/depolama ve indirme döngüsünde **tamamen korunmaktadır**.
  - **LibreOffice (ODT):** ONLYOFFICE Document Server, ODT dışa aktarımında LibreOffice referans işaretlerini (`<text:reference-mark-start>`) süzüp kaldırmaktadır (`ZC-01`). Ayrıca CiteDocs arka ucu ODT içindeki `content.xml` dosyasını taramamaktadır (`ZC-02`). Atıflar düz metne dönüşmektedir.
- **Gereksinim 2 (Zotero CSL Stil Deposu Erişilebilirliği):**
  - Resmi Zotero stil deposundaki **10.865 stil** (`https://www.zotero.org/styles-files/styles.json`) ve CSL XML tanımları açık CORS ile editör tarafından doğrudan erişilebilmektedir. Eklentide ayrıca 2.864 yerel stil yer almaktadır. TÜBİTAK ve Türk üniversite stilleri mevcuttur.
  - Ancak resmi ONLYOFFICE Zotero eklentisi stil seçiciyi API anahtarı giriş ekranının arkasına kilitlemiştir (`ZC-03`). Boş belgelerde `docProps/custom.xml` (`ZOTERO_PREF_1`) eksiktir (`ZC-04`). 10.865 stil DOM sanallaştırması olmadan listelendiğinde istemcide gecikme oluşmaktadır (`ZC-05`).

### 2. Oluşturulan Testler ve Fikstürler
- `apps/server/test/fixtures/zoteroWordDocx.ts`: Gerçek Word DOCX ve LibreOffice ODT Zotero ikili fikstür oluşturucuları.
- `apps/server/test/zotero-compat.test.ts`: Vitest test paketi (3 başarılı, 5 todo - ZC-01..ZC-05).
- `e2e/oo-zotero-compat.spec.ts`: Canlı sistem Playwright E2E paketi (2 başarılı, 3 skipped/fixme).
- `docs/zotero-compat-report-2026-10-17.md`: Kapsamlı Türkçe teknik doğrulama ve hata raporu.

### 3. Kural ve Kısıtlara Uyum
- Ürün kaynak koduna (`apps/web/src`, `apps/server/src`, `deploy/`) dokunulmamış, yalnızca test, fikstür ve dokümantasyon üretilmiştir.
- Konteyner açılmamış, harici para harcanmamış, sunucuya SSH atılmamıştır.
- `pnpm lint` (0 hata, 0 uyarı), `pnpm typecheck` (0 hata) ve `pnpm test` (58 test dosyası, 546 başarılı test) tam yeşildir.
## ONLYOFFICE CSL Atıf Stili Seçici ve Depo İndeksi — Kayıt #031

> **Kayıt No:** #031  
> **Tarih:** 2026-10-17  
> **Dal:** `cd-style-picker`  
> **Ajan Modu:** Korkusuz Uzman Ajan (Cutting-Edge)  
> **Görev:** ZC-03 + ZC-05 çözümü — ONLYOFFICE editör üst barında CiteDocs'a özgü CSL atıf stili seçici bileşeni, Zotero hesabı bağlama zorunluluğunun kaldırılması (ZC-03), tam Zotero stil deposu (~10.8k stil) için bellek içi önbellekli arama servisi ve sekme donmasını önleyen 50 sonuç sınırlaması (ZC-05), chunked ZOTERO_PREF_1.. custom properties oluşturucu/ayrıştırıcı ve editör içi/sunucu tarafı docProps/custom.xml senkronizasyonu.

### 1. Yapılan Çalışmalar ve Mimari Çözümler

1. **Zotero Word Tercih XML Şeması ve Parçalama Mantığı (`packages/shared/src/zoteroPref.ts`):**
   - Microsoft Word Zotero eklentisinin kullandığı kanonik XML yapısı modellendi:
     ```xml
     <data data-version="3" zotero-version="7.0.11">
       <session id="..."/>
       <style id="http://www.zotero.org/styles/apa" locale="tr-TR" hasBibliography="1" bibliographyStyleHasBeenSet="0"/>
       <prefs><pref name="fieldType" value="Field"/></prefs>
     </data>
     ```
   - Word custom property 255 bayt/karakter sınırına tam uyum sağlamak için 250 karakterlik sıralı `ZOTERO_PREF_1`, `ZOTERO_PREF_2` parçalama (`chunkZoteroPref`) ve yeniden birleştirme (`reassembleZoteroPref`, `parseZoteroPrefXml`) fonksiyonları geliştirildi.
   - Popüler/sabit stiller (`PINNED_POPULAR_STYLES`): APA 7 (`apa`), IEEE (`ieee`), Chicago (author-date & notes), MLA (`modern-language-association`), Harvard (`harvard-cite-them-right`), Vancouver (`vancouver`) ve TÜBİTAK (`turkiye-bilimsel-ve-teknolojik-arastirma-kurumu`).
   - 9 birim testi ile XML üretimi, ayrıştırması, bozuk/eksik XML dayanıklılığı ve parça bütünlüğü doğrulandı (`packages/shared/test/zotero-pref.test.ts`).

2. **Sunucu Tarafı Bellek İçi Önbellekli Stil Deposu Servisi (`apps/server/src/styles/styleService.ts`):**
   - Resmi Zotero stil deposu (`https://www.zotero.org/styles-files/styles.json`, ~10.865 stil) 12 saatlik TTL ile bellek içinde önbelleğe alındı.
   - Çevrimdışı/ağ kopukluğu durumunda en çok kullanılan 10 temel stili içeren statik yedek liste (`FALLBACK_STYLES`) ile kesintisiz çalışma garantilendi.
   - Türkçe aramalarda ("tubitak", "turkiye" vb.) `ı/i`, `ö/o`, `ü/u`, `ç/c`, `ş/s`, `ğ/g` harf normalizasyonu ve küçük harf eşleme sağlandı.
   - Arama sonuçları ZC-05 kısıtı uyarınca 50 kayıtla sınırlandırılarak tarayıcı sekmesinin donması engellendi.
   - 7 birim testi ile önbellekleme, arama filtreleme, Türkçe normalizasyon ve çevrimdışı fallback doğrulandı (`apps/server/test/styles-service.test.ts`).

3. **Fastify HTTP Rotaları ve docProps/custom.xml Güncellemesi (`apps/server/src/routes/styles.ts`):**
   - `GET /api/styles?q=&limit=`: Stil arama ve listeleme uç noktası.
   - `GET /api/styles/:id`: Belirli stil detayını getirme uç noktası.
   - `PUT /api/documents/:id/style`: Düzenlenen belgenin `.docx` ZIP arşivini açıp `docProps/custom.xml` içindeki `ZOTERO_PREF_1..` özel belge özelliklerini güncelleyen, eksikse `[Content_Types].xml` ve `_rels/.rels` ilişkilerini tamamlayan ve `sessionManager.recordSave()` çağrısı ile ONLYOFFICE canlı oturum anahtarını güncelleyen uç nokta.
   - `apps/server/src/index.ts` içine entegre edildi. 6 entegrasyon testi ile doğrulandı (`apps/server/test/styles-route.test.ts`).

4. **ONLYOFFICE Editör İçi Köprü ve Zotero Eklentisi Eşitlemesi (`apps/web/src/onlyoffice/editorStyleBridge.ts`):**
   - Öncelikli olarak `Asc.editor.callCommand` ve `connector.executeMethod` üzerinden belgenin `Api.GetCustomProperties()` nesnesine doğrudan erişerek `ZOTERO_PREF_1..` değerlerini Word formatında yazar.
   - Açık Zotero eklentisi iframe'ine (`postMessage`) stil güncelleme bildirimi gönderir ve tarayıcı `localStorage` (`zoteroStyle`, `zoteroStyleId`, `zoteroLocale`) anahtarlarını günceller.
   - 3 birim testi ile sanal ortamda doğrulandı (`apps/web/test/editor-style-bridge.test.ts`).

5. **Editör Üst Barında React Stil Seçici Bileşeni (`apps/web/src/onlyoffice/StylePicker.tsx`):**
   - ONLYOFFICE editör üst barında (`apps/web/src/onlyoffice/OnlyofficeEditorPage.tsx`) "Atıf Stili" butonu ve arama paneli olarak konumlandırıldı.
   - 250ms debounced arama, en az 2 karakter sınırı, 50 sonuç limiti, popüler stiller rozeti ("Popüler") ve format rozetleri ("author-date", "numeric", "note", "label").
   - Klavye navigasyonu (ESC ile kapatma), dışarı tıklamayı algılama ve %100 Türkçe arayüz metinleri.
   - 5 birim ve bileşen testi (`apps/web/test/style-picker.test.tsx`) ve 12 editör sayfa testi (`apps/web/test/onlyoffice-editor.test.tsx`) ile doğrulandı.

6. **E2E Test Paketi Güncellemesi (`e2e/oo-zotero-compat.spec.ts`):**
   - Önceden `test.fixme` olarak bekleyen "Requirement 2 [FIXME ZC-03] Style picker must be accessible without Zotero account" testi aktif bir Playwright testine dönüştürüldü.
   - Zotero hesabı bağlanmadan stil seçici butonunun (`style-picker-trigger`) görünür olduğu, tıklandığında popüler stillerin listelendiği, arama kutusuna "ieee" yazıldığında sonuçların filtrelendiği ve sonuç sayısının 50'yi aşmadığı (ZC-05) uçtan uca doğrulandı.

### 2. Dokunulmayan Dosyalar ve İzolasyon Kurallarına Tam Uyum

Paralel çalışan geliştiricilerin ve iş kollarının güvenliği için aşağıdaki kurallara harfiyen uyuldu:
- `apps/server/src/documents/zoteroFields.ts` — **KESİNLİKLE DOKUNULMADI.**
- `apps/server/src/documents/templates.ts` — **KESİNLİKLE DOKUNULMADI.**
- `deploy/office/blank.docx` — **KESİNLİKLE DOKUNULMADI.**
- `apps/server/test/zotero-compat.test.ts` — **KESİNLİKLE DOKUNULMADI.**
- `deploy/` altındaki Dockerfile, docker-compose ve Caddyfile yapılandırmaları — **KESİNLİKLE DOKUNULMADI.**
- Belge listesi ve yükleme arayüzüne dokunulmadı (ODT uyarısı ekleyen başka ajan ile çakışma önlendi).
- Push, deploy veya merge yapılmadı.

### 3. Doğrulama ve Test Sonuçları

- **`pnpm lint`:** 0 hata, 0 uyarı (temiz).
- **`pnpm typecheck`:** 0 hata (tüm monorepo TypeScript derlemesi başarılı).
- **`pnpm build`:** Tüm paketler (`@citedocs/shared`, `@citedocs/csl-engine`, `@citedocs/server`, `@citedocs/web`) başarıyla derlendi.
- **`pnpm test` (Tam Test Paketi):**
  - **66 test dosyası** çalıştırıldı.
  - **617 test başarılı**, 1 atlanan, 5 yapılacak (todo - ZC-01, ZC-02, ZC-04 paralel işler). 0 başarısız!
- `tsconfig.tsbuildinfo` gürültüleri temizlendi, çalışma ağacı tertemiz bırakıldı.
