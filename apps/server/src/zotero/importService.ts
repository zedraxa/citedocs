import type { ZoteroCredentialRepository } from "../repositories/zoteroRepository.js";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2 MB file / text cap
export const MAX_IMPORT_ITEMS = 500; // 500 items max per import
export const ZOTERO_BATCH_SIZE = 50; // Zotero Web API v3 limit per request

export interface ItemPreview {
  title: string;
  authors?: string;
  year?: string;
  doi?: string;
  itemType?: string;
  publicationTitle?: string;
  key?: string;
}

export interface FailedItemReport {
  index: number;
  title: string;
  reason: string;
  code?: number;
}

export interface ImportReferencesInput {
  data?: string;
  filename?: string;
  format?: string;
  save?: boolean;
  items?: Record<string, unknown>[];
}

export interface ImportReferencesResult {
  success: boolean;
  saved: boolean;
  total: number;
  savedCount: number;
  failedCount: number;
  savedItems?: ItemPreview[];
  failedItems?: FailedItemReport[];
  items?: ItemPreview[];
  rawItems?: Record<string, unknown>[];
  message: string;
}

export class ImportValidationError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "ImportValidationError";
  }
}

export class ImportPayloadTooLargeError extends Error {
  public readonly statusCode = 413;
  constructor(message = "Dosya veya metin boyutu 2 MB sınırını aşıyor.") {
    super(message);
    this.name = "ImportPayloadTooLargeError";
  }
}

export class ImportTranslationError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
  ) {
    super(message);
    this.name = "ImportTranslationError";
  }
}

export class ImportSaveError extends Error {
  constructor(
    public readonly error: string,
    message: string,
    public readonly statusCode = 502,
    public readonly failedItems: FailedItemReport[] = [],
  ) {
    super(message);
    this.name = "ImportSaveError";
  }
}

export class ImportZoteroUnlinkedError extends Error {
  public readonly statusCode = 409;
  constructor(
    public readonly error: string,
    message: string,
    public readonly total: number,
    public readonly items: ItemPreview[],
    public readonly rawItems: Record<string, unknown>[],
  ) {
    super(message);
    this.name = "ImportZoteroUnlinkedError";
  }
}

/**
 * Detects format and maps to appropriate Content-Type for translation-server.
 */
export function detectBibFormat(
  data: string,
  filename?: string,
  explicitFormat?: string,
): { format: string; contentType: string } {
  const normFormat = (explicitFormat || "").trim().toLowerCase();
  const ext = filename ? filename.split(".").pop()?.toLowerCase() : "";

  if (normFormat === "bibtex" || normFormat === "bib" || ext === "bib" || ext === "bibtex") {
    return { format: "bibtex", contentType: "application/x-bibtex" };
  }
  if (normFormat === "ris" || ext === "ris") {
    return { format: "ris", contentType: "application/x-research-info-systems" };
  }
  if (normFormat === "csljson" || normFormat === "json" || ext === "json" || ext === "csljson") {
    return { format: "csljson", contentType: "application/json" };
  }
  if (normFormat === "xml" || normFormat === "endnote" || normFormat === "endnote-xml" || ext === "xml") {
    return { format: "endnote-xml", contentType: "application/xml" };
  }
  if (normFormat === "rdf" || normFormat === "zotero-rdf" || ext === "rdf") {
    return { format: "rdf", contentType: "application/rdf+xml" };
  }

  // Sniff from content
  const trimmed = data.trim();
  if (/^@\w+\s*\{/i.test(trimmed)) {
    return { format: "bibtex", contentType: "application/x-bibtex" };
  }
  if (/^(TY\s+-|ER\s+-)/m.test(trimmed)) {
    return { format: "ris", contentType: "application/x-research-info-systems" };
  }
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return { format: "csljson", contentType: "application/json" };
  }
  if (/^<\?xml|<records|<xml|<rdf:RDF/i.test(trimmed)) {
    if (/rdf:RDF/i.test(trimmed)) {
      return { format: "rdf", contentType: "application/rdf+xml" };
    }
    return { format: "endnote-xml", contentType: "application/xml" };
  }

  return { format: "unknown", contentType: "text/plain" };
}

/**
 * Strips transient / internal keys so Zotero generates fresh identifiers in the user library.
 */
export function cleanZoteroItem(raw: Record<string, unknown>): Record<string, unknown> {
  const { key, version, attachments, notes, seeAlso, id, ...rest } = raw;
  void key;
  void version;
  void attachments;
  void notes;
  void seeAlso;
  void id;
  return rest;
}

/**
 * Extracts a concise Turkish-friendly preview for UI display.
 */
export function extractItemPreview(raw: Record<string, unknown>): ItemPreview {
  const title = String(raw.title || "İsimsiz Kaynak");

  let authors: string | undefined;
  if (Array.isArray(raw.creators) && raw.creators.length > 0) {
    authors = (raw.creators as Array<{ firstName?: string; lastName?: string; name?: string }>)
      .map((c) => (c.name ? c.name : [c.firstName, c.lastName].filter(Boolean).join(" ")))
      .filter(Boolean)
      .join(", ");
  }

  let year: string | undefined;
  const rawDate = raw.date || raw.parsedDate;
  if (rawDate) {
    const m = String(rawDate).match(/\b(19\d\d|20\d\d)\b/);
    year = m ? m[0] : String(rawDate);
  }

  const doi = raw.DOI || raw.doi ? String(raw.DOI || raw.doi) : undefined;
  const itemType = raw.itemType ? String(raw.itemType) : undefined;
  const publicationTitle = raw.publicationTitle ? String(raw.publicationTitle) : undefined;

  return { title, authors, year, doi, itemType, publicationTitle };
}

export interface ZoteroImportServiceOptions {
  credentialRepo: ZoteroCredentialRepository;
  fetchFn?: typeof fetch;
  translationServerUrl?: string;
  zoteroApiBaseUrl?: string;
}

export class ZoteroImportService {
  private readonly credentialRepo: ZoteroCredentialRepository;
  private readonly fetchFn: typeof fetch;
  private readonly translationServerUrl: string;
  private readonly zoteroApiBaseUrl: string;

  constructor(options: ZoteroImportServiceOptions) {
    this.credentialRepo = options.credentialRepo;
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.translationServerUrl = (
      options.translationServerUrl ||
      process.env.TRANSLATION_SERVER_URL ||
      "http://localhost:1969"
    ).replace(/\/+$/, "");
    this.zoteroApiBaseUrl = (options.zoteroApiBaseUrl || "https://api.zotero.org").replace(/\/+$/, "");
  }

  /**
   * Imports bibliographic references from raw text/file or pre-parsed items,
   * converts via translation-server, and optionally batch writes to the student's Zotero library.
   */
  async importReferences(
    userId: string,
    input: ImportReferencesInput,
  ): Promise<ImportReferencesResult> {
    if (!userId) {
      throw new ImportValidationError("Kullanıcı kimliği doğrulanmalıdır.", 401);
    }

    let rawItems: Record<string, unknown>[] = [];

    // Case A: Pre-parsed items provided directly (e.g. after OAuth resume)
    if (input.items && Array.isArray(input.items)) {
      if (input.items.length === 0) {
        throw new ImportValidationError("İçe aktarılacak kaynak listesi boş olamaz.", 400);
      }
      if (input.items.length > MAX_IMPORT_ITEMS) {
        throw new ImportValidationError(
          `Tek seferde en fazla ${MAX_IMPORT_ITEMS} kaynak içe aktarılabilir (${input.items.length} kaynak bulundu). Lütfen verinizi bölerek tekrar deneyin.`,
          400,
        );
      }
      rawItems = input.items;
    } else {
      // Case B: Raw text or file content
      const data = String(input.data || "").trim();
      if (!data) {
        throw new ImportValidationError(
          "İçe aktarılacak metin veya dosya içeriği boş olamaz.",
          400,
        );
      }

      const byteLength = Buffer.byteLength(data, "utf8");
      if (byteLength > MAX_IMPORT_BYTES) {
        throw new ImportPayloadTooLargeError(
          "Dosya veya metin boyutu 2 MB sınırını aşıyor.",
        );
      }

      const detected = detectBibFormat(data, input.filename, input.format);
      rawItems = await this.translateData(data, detected.contentType);
    }

    const validItems = rawItems.filter(
      (i) => i && typeof i === "object" && i.itemType && i.itemType !== "attachment" && i.itemType !== "note",
    );

    if (validItems.length === 0) {
      throw new ImportValidationError("İçerikte geçerli bir kaynak bulunamadı.", 404);
    }

    if (validItems.length > MAX_IMPORT_ITEMS) {
      throw new ImportValidationError(
        `Tek seferde en fazla ${MAX_IMPORT_ITEMS} kaynak içe aktarılabilir (${validItems.length} kaynak bulundu). Lütfen verinizi bölerek tekrar deneyin.`,
        400,
      );
    }

    const cleanedItems = validItems.map(cleanZoteroItem);
    const previews = validItems.map(extractItemPreview);

    // If save is explicitly false, return preview only
    if (input.save === false) {
      return {
        success: true,
        saved: false,
        total: validItems.length,
        savedCount: 0,
        failedCount: 0,
        items: previews,
        rawItems: cleanedItems,
        message: `${validItems.length} kaynak bulundu.`,
      };
    }

    // Check student Zotero linking
    const cred = await this.credentialRepo.get(userId).catch(() => null);
    if (!cred?.apiKey) {
      throw new ImportZoteroUnlinkedError(
        "Zotero account not linked",
        "Kaynakları kütüphanenize kaydetmek için Zotero hesabınızı bağlamalısınız.",
        validItems.length,
        previews,
        cleanedItems,
      );
    }

    let zuid = cred.zoteroUserId;
    if (!zuid) {
      const k = await this.fetchFn(
        `${this.zoteroApiBaseUrl}/keys/${encodeURIComponent(cred.apiKey)}`,
      ).catch(() => null);
      if (k?.ok) {
        const keyData = (await k.json().catch(() => ({}))) as { userID?: number };
        if (keyData.userID) {
          zuid = String(keyData.userID);
          await this.credentialRepo.save(userId, { apiKey: cred.apiKey, zoteroUserId: zuid }).catch(() => null);
        }
      }
    }

    if (!zuid) {
      throw new ImportValidationError("Zotero kullanıcı kimliği çözümlenemedi.", 400);
    }

    // Batch write to Zotero API in chunks of 50
    const savedItems: ItemPreview[] = [];
    const failedItems: FailedItemReport[] = [];

    for (let i = 0; i < cleanedItems.length; i += ZOTERO_BATCH_SIZE) {
      const batch = cleanedItems.slice(i, i + ZOTERO_BATCH_SIZE);
      try {
        const zRes = await this.fetchFn(`${this.zoteroApiBaseUrl}/users/${zuid}/items`, {
          method: "POST",
          headers: {
            "Zotero-API-Key": cred.apiKey,
            "Zotero-API-Version": "3",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(batch),
        });

        if (!zRes.ok) {
          const errText = await zRes.text().catch(() => "");
          for (let j = 0; j < batch.length; j++) {
            const itemIdx = i + j;
            failedItems.push({
              index: itemIdx,
              title: previews[itemIdx]?.title || `Kaynak ${itemIdx + 1}`,
              reason: `Zotero API hatası (${zRes.status}): ${errText || zRes.statusText}`,
              code: zRes.status,
            });
          }
          continue;
        }

        const zData = (await zRes.json().catch(() => ({}))) as {
          successful?: Record<string, { key?: string }>;
          failed?: Record<string, { code?: number; message?: string }>;
        };

        const successfulMap = zData.successful || {};
        const failedMap = zData.failed || {};

        for (let j = 0; j < batch.length; j++) {
          const itemIdx = i + j;
          const localKey = String(j);
          if (successfulMap[localKey]) {
            const createdKey = successfulMap[localKey].key;
            savedItems.push({
              ...previews[itemIdx],
              key: createdKey,
            });
          } else if (failedMap[localKey]) {
            const f = failedMap[localKey];
            failedItems.push({
              index: itemIdx,
              title: previews[itemIdx]?.title || `Kaynak ${itemIdx + 1}`,
              reason: f.message || `Hata kodu ${f.code || 400}`,
              code: f.code,
            });
          } else {
            // Default success fallback
            savedItems.push(previews[itemIdx]);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        for (let j = 0; j < batch.length; j++) {
          const itemIdx = i + j;
          failedItems.push({
            index: itemIdx,
            title: previews[itemIdx]?.title || `Kaynak ${itemIdx + 1}`,
            reason: `Bağlantı hatası: ${msg}`,
          });
        }
      }
    }

    const savedCount = savedItems.length;
    const failedCount = failedItems.length;

    if (savedCount === 0 && failedCount > 0) {
      throw new ImportSaveError(
        "Zotero kaydı başarısız oldu",
        "Kaynaklar Zotero kütüphanenize kaydedilemedi.",
        502,
        failedItems,
      );
    }

    const message =
      failedCount > 0
        ? `${savedCount} kaynak Zotero kütüphanenize başarıyla eklendi, ${failedCount} kaynak eklenemedi.`
        : `${savedCount} kaynak Zotero kütüphanenize başarıyla eklendi.`;

    return {
      success: true,
      saved: true,
      total: cleanedItems.length,
      savedCount,
      failedCount,
      savedItems,
      failedItems,
      message,
    };
  }

  /**
   * Internal call to translation-server POST /import with fallback.
   */
  private async translateData(data: string, contentType: string): Promise<Record<string, unknown>[]> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.translationServerUrl}/import`, {
        method: "POST",
        headers: {
          "Content-Type": `${contentType}; charset=utf-8`,
          Accept: "application/json",
        },
        body: data,
      });

      // If specific content-type failed, try text/plain fallback
      if (!response.ok && contentType !== "text/plain") {
        const retryRes = await this.fetchFn(`${this.translationServerUrl}/import`, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            Accept: "application/json",
          },
          body: data,
        }).catch(() => null);
        if (retryRes && retryRes.ok) {
          response = retryRes;
        }
      }
    } catch (err: unknown) {
      throw new ImportTranslationError(
        `Çeviri sunucusuna ulaşılamadı: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }

    if (!response.ok) {
      if (response.status === 400 || response.status === 404 || response.status === 422) {
        throw new ImportValidationError(
          "Geçerli bir kaynak bulunamadı. Lütfen dosya veya metin formatını (BibTeX, RIS, CSL-JSON vb.) kontrol edin.",
          422,
        );
      }
      throw new ImportTranslationError(
        "Çeviri sunucusu (translation-server) yanıt vermedi veya içe aktarma sırasında hata oluştu.",
        502,
      );
    }

    try {
      const parsed = (await response.json()) as unknown;
      return (Array.isArray(parsed) ? parsed : [parsed]) as Record<string, unknown>[];
    } catch {
      throw new ImportTranslationError(
        "Çeviri sunucusu geçersiz JSON yanıtı döndürdü.",
        502,
      );
    }
  }
}
