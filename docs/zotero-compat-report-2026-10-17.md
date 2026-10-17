# CiteDocs Zotero Uyumluluk ve CSL Stil Deposu Doğrulama Raporu

> **Tarih:** 17 Ekim 2026  
> **Hedef Ortam:** `https://docs.sifirdanbire.com.tr` (Canlı Üretim Dağıtımı) & Yerel Test Ortamı  
> **Git Dalı:** `cd-zotero-compat` (Taban Commit: `b252b0b`)  
> **Test Motorları:** Vitest 3.2.7 & Playwright E2E Suite (Node v22.22.3, Chromium Headless)  
> **Rol / Kapsam:** Korkusuz Uzman Ajan — Zotero Masaüstü Eklentileri (Word & LibreOffice) Çift Yönlü Uyumluluğu ve CSL Stil Deposu İncelemesi

---

## 1. Yönetici Özeti (Executive Summary)

CiteDocs web tabanlı akademik kelime işlemci platformunun (ONLYOFFICE Docs CE + resmi web tabanlı Zotero eklentisi mimarisi) Türk üniversite öğrencileri için hayati önem taşıyan iki temel ürün gereksinimi deneysel kanıtlarla ve otomatik testlerle denetlenmiştir:

1. **Gereksinim 1 (Masaüstü Zotero Eklenti Uyumluluğu):** CiteDocs'ta oluşturulan veya düzenlenen bir belgenin Microsoft Word (Word Zotero eklentisi) veya LibreOffice Writer (LibreOffice Zotero eklentisi) ile açıldığında canlı, düzenlenebilir atıflar (`ADDIN ZOTERO_ITEM CSL_CITATION`) ve otomatik güncellenen kaynakça (`ADDIN ZOTERO_BIBL` / referans işaretleri) sunması; aynı şekilde Word/LibreOffice'te hazırlanmış Zotero atıflı belgelerin CiteDocs'a yüklendiğinde atıf özelliklerini kaybetmemesi.
2. **Gereksinim 2 (Tam CSL Stil Deposu Erişimi):** Öğrencilerin yalnızca 5-10 popüler stilden oluşan dar bir listeyle kısıtlanmayıp, editör içerisinden Zotero/CSL stil havuzundaki 10.000'den fazla akademik stile (özellikle TÜBİTAK ve Türk üniversitelerinin tez/dergi yazım kurallarına) doğrudan erişebilmesi.

### Doğrulama Sonuç Matrisi

| Gereksinim | Alt Başlık | Durum | Kanıt & Özet | İlgili Takip Kodu |
|---|---|---|---|---|
| **Gereksinim 1** | **Microsoft Word (.docx) Çift Yönlü Uyumluluk** | **ÇALIŞIYOR (WORKS)** | Hem canlı üretim sunucusunda (`docs.sifirdanbire.com.tr`) hem sunucu testlerinde kanıtlandı: Word Zotero eklentisi alan kodları (`w:fldChar`, `w:instrText`, `ADDIN ZOTERO_ITEM`, `ADDIN ZOTERO_BIBL`) ONLYOFFICE yükleme, açma, düzenleme, Ctrl+S force-save callback (`status: 6` & `status: 2`), veritabanı/depolama ve indirme döngüsünden **%100 kayıpsız ve hasarsız** çıkmaktadır. | — |
| **Gereksinim 1** | **LibreOffice Writer (.odt) Çift Yönlü Uyumluluk** | **KIRIK (BROKEN)** | ONLYOFFICE Document Server, ODT dışa aktarımında LibreOffice Zotero referans işaretlerini (`<text:reference-mark-start text:name="ZOTERO_ITEM..."/>`) tamamen budamakta, atıfları statik metne dönüştürmektedir. Ayrıca CiteDocs sunucusu ODT'deki atıfları parse edememektedir. | `ZC-01`, `ZC-02` |
| **Gereksinim 2** | **CSL Stil Deposu Erişilebilirliği (Network/CORS)** | **ÇALIŞIYOR (WORKS)** | Zotero resmi stil deposundaki **10.865 stil** (`styles.json`) `Access-Control-Allow-Origin: *` başlığıyla editör origin'inden erişilebilir durumdadır. Eklenti paketinde ayrıca 2.864 yerel stil bulunmaktadır. TÜBİTAK ve Türk üniversite stilleri depoda mevcuttur ve indirilebilmektedir. | — |
| **Gereksinim 2** | **Editör İçi Stil Seçici Arayüzü (UI/UX)** | **KIRIK (BROKEN)** | Resmi ONLYOFFICE Zotero eklentisi, stil seçiciyi ve ayarlar panelini Zotero API anahtarı giriş ekranının arkasına kilitlemiştir. Zotero hesabı bağlamamış öğrenciler stil seçememektedir. Boş belgelerde `docProps/custom.xml` eksiktir ve 10.865 stil DOM sanallaştırması olmadan yüklendiğinde tarayıcıyı dondurmaktadır. | `ZC-03`, `ZC-04`, `ZC-05` |

---

## 2. Ayrıntılı Bulgular ve Deneysel Kanıtlar

### 2.1 Gereksinim 1: Microsoft Word (.docx) Alan Kodları Analizi (ÇALIŞIYOR)

Microsoft Word ve Zotero Word eklentisi, atıf ve kaynakçaları OOXML içinde "Karmaşık Alanlar" (Complex Fields - `w:fldSimple` veya `w:fldChar`) olarak saklar:
- **Atıf Alan Kodu:** `w:instrText` öğesi içinde `ADDIN ZOTERO_ITEM CSL_CITATION { ...jsonPayload... }`
- **Kaynakça Alan Kodu:** `w:instrText` öğesi içinde `ADDIN ZOTERO_BIBL { ...jsonPayload... } CSL_BIBLIOGRAPHY`
- **Görüntülenen Metin:** `w:fldCharType="separate"` ile `w:fldCharType="end"` arasındaki `w:r/w:t` metin gövdesi.
- **Belge Tercihleri:** `docProps/custom.xml` içinde `ZOTERO_PREF_1` özel metaveri özelliği.

#### Canlı Sunucu Doğrulama Deneyi (`e2e/oo-zotero-compat.spec.ts` - Test 1):
1. `@citedocs/docx-exporter` kütüphanesi kullanılarak gerçek Zotero Word alan kodlarına ve APA stili kaynakçaya sahip geçerli bir `.docx` ikilisi üretildi (`apps/server/test/fixtures/zoteroWordDocx.ts`).
2. Canlı üretim ortamında (`https://docs.sifirdanbire.com.tr`) `qa+zoteroroundtrip_<timestamp>@example.com` adresiyle taze öğrenci hesabı açıldı.
3. Word belgesi `POST /api/documents/upload` üzerinden yüklendi. Arka uç `GET /api/documents/:id/citations` çağrısıyla atıf ve kaynakçayı başarıyla ayıkladı (HTTP 200).
4. Belge ONLYOFFICE editöründe (`/editor?doc=:id`) açıldı.
5. Editör içerisine `Asc.editor.callCommand` ve canlı klavye girişleriyle yeni metin eklendi: `[Edited-In-ONLYOFFICE-<timestamp>]`.
6. `Control+s` kısayoluyla force-save tetiklendi. ONLYOFFICE Document Server, CiteDocs arka ucuna `status: 6` callback'i göndererek düzenlenmiş dosyayı depoladı.
7. Düzenlenen belge `/api/documents/:id/download` adresinden ikili olarak indirildi ve `JSZip` ile OpenXML yapısı incelendi:
   - `word/document.xml` içinde `ADDIN ZOTERO_ITEM`, `CSL_CITATION` ve benzersiz atıf ID'si eksiksiz korundu.
   - `ADDIN ZOTERO_BIBL` ve `CSL_BIBLIOGRAPHY` alan kodları hasarsız kaldı.
   - ONLYOFFICE tarafından eklenen metin belgede yer aldı.
   - İndirilen dosya `importDocxZoteroFields` ayrıştırıcısından geçirildiğinde 1 atıf ve 1 kaynakça eksiksiz tespit edildi.

**Sonuç:** CiteDocs depolama katmanı, WOPI/ONLYOFFICE callback mekanizması ve ONLYOFFICE Docs CE editör motoru Microsoft Word Zotero alan kodlarını **bozmamakta, silmemekte ve tam olarak korumaktadır**.

---

### 2.2 Gereksinim 1: LibreOffice (.odt) Referans İşaretleri Analizi (KIRIK - ZC-01 & ZC-02)

LibreOffice Writer ve Zotero LibreOffice eklentisi, OpenDocument Format (ODF) standardında atıfları referans işaretleri (`text:reference-mark-start` ve `text:reference-mark-end`) ile saklar:
```xml
<text:reference-mark-start text:name="ZOTERO_ITEM CSL_CITATION {&quot;citationID&quot;:&quot;...&quot;,...}"/>
(Demir, 2023)
<text:reference-mark-end text:name="ZOTERO_ITEM CSL_CITATION ..."/>
```

#### Canlı Sunucu Doğrulama Deneyi:
1. `content.xml` içinde standart Zotero referans işaretlerine sahip gerçek bir `.odt` ikilisi oluşturuldu (`createZoteroLibreOfficeOdtBuffer`).
2. Dosya ONLYOFFICE Document Server'a yüklenip açıldığında görüntülendi; ancak düzenlenip kaydedildiğinde (`status: 6` veya `status: 2` callback):
   - ONLYOFFICE Document Server, ODT'yi dahili bellek modeline alırken ODF referans işaretlerini AddinField olarak eşleyememekte;
   - ODT olarak tekrar paketlerken tüm `<text:reference-mark-start>` etiketlerini **tamamen silmektedir**.
   - Belge indirildiğinde `(Demir, 2023)` atıfı düz bir metin dizesine (`<text:p>`) dönüşmekte, LibreOffice Writer'da açıldığında Zotero eklentisi tarafından atıf olarak algılanamamaktadır.
3. Ayrıca CiteDocs sunucusunun `apps/server/src/documents/zoteroFields.ts` modülü yalnızca `word/document.xml` dosyasını kontrol ettiği için ODT dosyalarında atıf sayısını `0` olarak raporlamaktadır.

**Sonuç:** LibreOffice ODT uyumluluğu şu an **çalışmamaktadır** (Bkz. `ZC-01` ve `ZC-02`).

---

### 2.3 Gereksinim 2: CSL Stil Deposu Erişimi ve Seçici Analizi (KISMİ / KIRIK - ZC-03, ZC-04, ZC-05)

#### Depo ve Ağ Erişimi (ÇALIŞIYOR):
- ONLYOFFICE Zotero eklentisi kaynak kodu (`dist/bundle.modern.js`) incelendiğinde, stil listesini `https://www.zotero.org/styles-files/styles.json` adresinden çektiği görülmüştür.
- Doğrudan HTTP istekleriyle doğrulandı:
  - Uzak stil listesinde **10.865 akademik stil** yer almaktadır.
  - Yanıt başlığında `Access-Control-Allow-Origin: *` bulunmaktadır; tarayıcı CORS engeline takılmamaktadır.
  - Ağ kesintisi veya çevrimdışı çalışma durumunda eklenti, sunucudaki `./resources/csl/styles.json` yerel yedeğine (2.864 stil) düşmektedir.
  - Bağımsız CSL XML dosyaları (`https://www.zotero.org/styles/<style-id>`) doğrudan çekilebilmektedir.
  - Türkiye akademik stilleri depoda mevcuttur:
    - `turkiye-bilimsel-ve-teknolojik-arastirma-kurumu` (TÜBİTAK)
    - `istanbul-universitesi-cerrahpasa-sosyal-bilimler-enstitusu`
    - `turkish-journal-of-electrical-engineering-and-computer-sciences` vb.

#### Editör İçi Arayüz ve Kullanıcı Deneyimi Kısıtları (KIRIK):
1. **Zotero Giriş Bariyeri (`ZC-03`):** Resmi ONLYOFFICE Zotero eklentisi, stil seçici açılır menüsünü ve ayarlar sekmesini `loginState` durumuna bağlamıştır. Kullanıcı kişisel bir Zotero API anahtarı girmedikçe stil seçim ekranına ulaşamamakta, boş bir giriş formuyla karşılaşmaktadır.
2. **Boş Belgelerde Eksik `docProps/custom.xml` (`ZC-04`):** CiteDocs üzerinden oluşturulan boş DOCX şablonlarında varsayılan Zotero stili (`ZOTERO_PREF_1`) tanımlı değildir. Bu belge Word'de açılıp Zotero ile ilk atıf eklenmek istendiğinde Word eklentisi stil seçme diyaloğu açmakta ve otomatik varsayılana geçememektedir.
3. **DOM Şişmesi ve Donma (`ZC-05`):** Eklenti arayüzündeki "More Styles..." (Daha Fazla Stil) listesi açıldığında 10.865 stil için sanallaştırma (virtualization) yapılmadan DOM elemanı oluşturulmakta, bu da düşük donanımlı öğrenci bilgisayarlarında tarayıcı sekmesinin birkaç saniye kilitlenmesine neden olmaktadır.

---

## 3. Önceliklendirilmiş Hata Listesi (Prioritized Bug Report)

### 🔴 ZC-01 (Öncelik: P1): ONLYOFFICE Document Server, ODT İkilisindeki LibreOffice Referans İşaretlerini Siliyor
- **Bileşen:** ONLYOFFICE Document Server Core (ODF Filter / OdfConverter)
- **Belirti:** LibreOffice Writer Zotero eklentisi ile oluşturulmuş bir `.odt` belgesi CiteDocs editöründe açılıp kaydedildiğinde, Zotero referans işaretleri (`<text:reference-mark-start text:name="ZOTERO_ITEM CSL_CITATION ..."/>`) silinmekte; atıflar ve kaynakça statik metne dönüşmektedir. İndirilen dosya LibreOffice'te açıldığında atıflar düzenlenememektedir.
- **Şüphe (Hunch):** ONLYOFFICE Docs CE'nin ODF filtreleme motoru, ODF standart referans işaretlerini dahili OOXML alanlarına (`w:fldChar`) dönüştürmemekte; belgeyi dışa aktarırken bilinmeyen referans işaretlerini XML'den ayıklamaktadır.
- **Önerilen Çözüm:**
  1. *Kısa Vade (Kullanıcı Yönlendirmesi):* CiteDocs arayüzünde belge yükleme ve indirme adımlarında öğrencilere şu uyarı gösterilmelidir: *"Zotero masaüstü eklentisi ile tam iki yönlü düzenlenebilirlik için lütfen Word (.docx) formatını kullanın."*
  2. *Orta Vade (Sunucu Taraflı Dönüştürücü Köprü):* Öğrenci ODT yüklediğinde arka uçta LibreOffice headless ile DOCX'e dönüştürülüp açılmalı; indirme sırasında ise DOCX Zotero alan kodları ODF `text:reference-mark` yapısına dönüştürülmelidir.
- **Test Durumu:** `e2e/oo-zotero-compat.spec.ts` içinde `test.fixme("Requirement 1 [FIXME ZC-01]")` ve `apps/server/test/zotero-compat.test.ts` içinde `it.todo("ZC-01")`.

---

### 🟠 ZC-02 (Öncelik: P2): CiteDocs Arka Ucu ODT Dosyalarındaki Atıfları Ayrıştıramıyor
- **Bileşen:** `apps/server/src/documents/zoteroFields.ts` (Fonksiyon: `extractZoteroState`)
- **Belirti:** `GET /api/documents/:id/citations` uç noktası bir `.odt` belgesi için çağrıldığında, belgede canlı LibreOffice Zotero atıfları bulunsa dahi `citations: []` ve `bibliography: null` dönmektedir.
- **Şüphe (Hunch):** `extractZoteroState` fonksiyonu yalnızca ZIP arşivi içindeki `word/document.xml` dosyasını aramakta; ODF standardındaki `content.xml` dosyasını ve `text:reference-mark-start` etiketlerini hiç denetlememektedir.
- **Önerilen Çözüm:** `zoteroFields.ts` dosyasına ODT desteği eklenmeli; `content.xml` dosyası taranarak `text:name="ZOTERO_ITEM CSL_CITATION ..."` özniteliğindeki JSON verisi ayıklanmalıdır.
- **Test Durumu:** `apps/server/test/zotero-compat.test.ts` içinde `it.todo("ZC-02")`.

---

### 🟠 ZC-03 (Öncelik: P2): ONLYOFFICE Zotero Eklentisi Stil Seçiciyi API Anahtarı Ekranı Arkasında Kilitliyor
- **Bileşen:** ONLYOFFICE Zotero Eklentisi (`sdkjs-plugins/zotero/scripts/code.js`) & `apps/web/src/onlyoffice/OnlyofficeEditorPage.tsx`
- **Belirti:** Zotero hesabı bağlamamış veya API anahtarı girmemiş bir öğrenci, belgesinin atıf stilini (örn. APA 7, IEEE, TÜBİTAK) seçememekte veya değiştirememektedir. Eklenti sol panelde yalnızca API anahtarı isteyen bir giriş formu göstermektedir.
- **Şüphe (Hunch):** Upstream eklenti mimarisi, stil yönetimini (`StyleManager`) bağımsız bir belge özelliği olarak değil, kullanıcının kütüphanesine (`loginState`) bağımlı bir ayar olarak tasarlamıştır.
- **Önerilen Çözüm:**
  1. *CiteDocs Editör Üst Barına Stil Seçici:* Editör üst çubuğuna CiteDocs'un kendi CSL stil seçici açılır menüsü eklenmeli; öğrencinin seçtiği stil doğrudan `docProps/custom.xml` (`ZOTERO_PREF_1`) içine yazılarak ONLYOFFICE'a komutla iletilmelidir.
  2. *Misafir/Anonim Oturum Yaması:* ONLYOFFICE Zotero eklentisine küçük bir yama uygulanarak stil seçici sekmesi giriş yapma şartından bağımsız hale getirilmelidir.
- **Test Durumu:** `e2e/oo-zotero-compat.spec.ts` içinde `test.fixme("Requirement 2 [FIXME ZC-03]")`.

---

### 🟡 ZC-04 (Öncelik: P3): Yeni Oluşturulan Boş DOCX Belgelerinde `ZOTERO_PREF_1` Metaverisi Eksik
- **Bileşen:** `apps/server/src/documents/templates.ts` (Fonksiyon: `createBlankDocxBuffer`)
- **Belirti:** CiteDocs'ta "Yeni Belge" oluşturulup indirilerek Microsoft Word'de açıldığında, Zotero Word eklentisiyle ilk atıf eklenirken kullanıcıya zorunlu stil seçim penceresi çıkmaktadır; belge varsayılan bir stille başlamamaktadır.
- **Şüphe (Hunch):** `createBlankDocxBuffer` şablonu `docProps/custom.xml` dosyasını ve `ZOTERO_PREF_1` (varsayılan APA 7 veya Türkçe dil kurallarına uygun stil) metaverisini içermemektedir.
- **Önerilen Çözüm:** `createBlankDocxBuffer` ve `deploy/office/blank.docx` şablonlarına varsayılan bir `ZOTERO_PREF_1` özel niteliği eklenmeli (örn. APA 7, Türkçe yerel ayar).
- **Test Durumu:** `apps/server/test/zotero-compat.test.ts` içinde `it.todo("ZC-04")`.

---

### 🟡 ZC-05 (Öncelik: P3): Stil Seçicide 10.865 Öğenin Sanallaştırmasız Render Edilmesi Tarayıcıyı Kasıyor
- **Bileşen:** ONLYOFFICE Zotero Eklentisi UI (`resources/csl/styles.json` ve arama açılır kutusu)
- **Belirti:** Eklenti panelinde "Search / More Styles..." tıklandığında 10 binden fazla seçenek için anında DOM düğümleri üretilmekte, bellek kullanımı fırlamakta ve sekme 1-3 saniye donmaktadır.
- **Şüphe (Hunch):** Eklentideki `selectbox` bileşeni sanallaştırılmış liste (`virtual list / react-window`) kullanmamaktadır.
- **Önerilen Çözüm:** Stil seçici arama kutusuna debounced arama eklenmeli; kullanıcı en az 2 karakter girmeden liste açılmamalı ve sonuçlar ilk 50 kayıtla sınırlandırılmalıdır.
- **Test Durumu:** `apps/server/test/zotero-compat.test.ts` içinde `it.todo("ZC-05")`.

---

## 4. Otomasyon Test Paketi ve Fikstür Yapısı

Bu doğrulama çalışması kapsamında kalıcı test regresyonunu önlemek amacıyla aşağıdaki testler ve fikstürler repoya kazandırılmıştır:

1. **İkili Fikstür Üreticisi (`apps/server/test/fixtures/zoteroWordDocx.ts`):**
   - `createZoteroWordDocxBuffer()`: `ADDIN ZOTERO_ITEM CSL_CITATION`, `ADDIN ZOTERO_BIBL` ve `docProps/custom.xml` (`ZOTERO_PREF_1`) içeren gerçek Word DOCX dosyası üretir.
   - `createZoteroLibreOfficeOdtBuffer()`: `text:reference-mark-start` etiketli ODF LibreOffice ODT dosyası üretir.
2. **Sunucu Entegrasyon Testleri (`apps/server/test/zotero-compat.test.ts`):**
   - Word DOCX Zotero karmaşık alan kodlarının ve metaverilerinin `extractZoteroState` ile %100 doğrulanması.
   - Dosya yükleme (`POST /api/documents/upload`), atıf sorgulama (`GET /api/documents/:id/citations`) ve indirme (`GET /api/documents/:id/download`) boyunca bayt ve alan kodu bütünlüğünün korunması.
   - ONLYOFFICE Document Server `status: 6` (force-save) ve `status: 2` (oturum kapatma) geri çağrımlarında Zotero alan kodlarının korunması.
   - `ZC-01`, `ZC-02`, `ZC-03`, `ZC-04`, `ZC-05` için `it.todo` bildirimleri.
   - **Test Sonucu:** 8 test (3 başarılı, 5 todo - 0 hata).
3. **Uçtan Uca Playwright Testleri (`e2e/oo-zotero-compat.spec.ts`):**
   - Canlı üretim ortamında (`https://docs.sifirdanbire.com.tr`) taze hesap açılışı, Word Zotero DOCX yüklenmesi, ONLYOFFICE içinde düzenleme yapılması, `Control+s` ile force-save alınması, dosyanın indirilip `word/document.xml` içinde Zotero kodlarının doğrulanması.
   - Uzak 10.865 CSL stiline ve yerel 2.864 stiline CORS uyumlu erişimin doğrulanması.
   - ODT ve hesap kilitlenmesi bug'ları için `test.fixme` işaretlemeleri.
   - **Test Sonucu:** 5 test (2 başarılı, 3 atlanan/fixme - 0 hata).

---

## 5. Mühendislik ve Mimari Tavsiyeleri

1. **Word (.docx) Zotero İş Akışının Öne Çıkarılması:** Word Zotero uyumluluğu canlı sistemde kusursuz çalıştığı için, Türk öğrencilere ana şablon ve indirme formatı olarak `.docx` sunulmalıdır.
2. **CiteDocs Yerel Stil Seçici Geliştirilmesi:** ONLYOFFICE Zotero eklentisindeki API anahtarı zorunluluğuna takılmamak adına, CiteDocs editör başlığına bağımsız bir stil seçici yerleştirilmeli; bu seçici `https://www.zotero.org/styles-files/styles.json` listesinden arama yaparak seçilen stili doğrudan belgeye gömmelidir.
3. **ODT Atıf Köprüsü:** LibreOffice kullanan öğrenciler için Document Server'ın referans işaretlerini silmesini engelleyecek bir ODT ara katmanı planlanmalıdır.
