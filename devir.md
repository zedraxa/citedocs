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
   - >100 öğeli kütüphanelerde sayfalama doğrulaması.
   - `since=<version>` ile artımlı senkronizasyon ve `/deleted` temizliği.
   - <=50 öğelik parçalar halinde `Zotero-Write-Token` ile yazma ve silme.
   - 412 Precondition Failed senaryosunda otomatik re-pull, alan düzeyinde merge ve conflict raporlama.
   - `Backoff` / `Retry-After` / `429` başlıklarının sahte saat (`sleepFn`) ile gecikmesiz doğrulanması.
   - İki farklı öğrenci (User A ve User B) arasında kesin veri ve anahtar izolasyonu testi.
   - Fırlatılan hatalarda API anahtarının asla görünmediğinin teyidi.
   - Monorepo genelinde `pnpm -r test` (95 test), `pnpm lint` (0 hata, 0 uyarı), `pnpm typecheck` ve `pnpm build` komutlarının %100 yeşil geçtiği doğrulandı.
6. **Dokümantasyon:**
   - `packages/zotero-core/README.md` eksiksiz oluşturuldu.


