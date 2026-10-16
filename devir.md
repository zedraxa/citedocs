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

## 5. Milestone 1 Part A — Tamamlanan İşler (Kayıt #002)
## 5. Milestone 2 (Part B - Add-by-Identifier) Tamamlanan İşler (Kayıt #002)

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

