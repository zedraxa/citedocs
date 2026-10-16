import type { AnnotationRepository } from "./annotationRepository.js";
import type { AttachmentRepository } from "./attachmentRepository.js";
import type { ZoteroAccountService } from "../zotero/accountService.js";
import type { ZoteroSyncResult } from "./types.js";
import {
  toZoteroAnnotationItem,
  fromZoteroAnnotationItem,
  type ZoteroReaderAnnotation,
  type ZoteroAnnotationItemData,
} from "@citedocs/pdf-reader";

export interface ZoteroAnnotationSyncServiceOptions {
  annotationRepo: AnnotationRepository;
  attachmentRepo: AttachmentRepository;
  accountService?: ZoteroAccountService;
  fetchFn?: typeof fetch;
  zoteroApiBaseUrl?: string;
}

export class ZoteroAnnotationSyncService {
  private annotationRepo: AnnotationRepository;
  private attachmentRepo: AttachmentRepository;
  private accountService?: ZoteroAccountService;
  private fetchFn: typeof fetch;
  private zoteroApiBaseUrl: string;

  constructor(options: ZoteroAnnotationSyncServiceOptions) {
    this.annotationRepo = options.annotationRepo;
    this.attachmentRepo = options.attachmentRepo;
    this.accountService = options.accountService;
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.zoteroApiBaseUrl = (options.zoteroApiBaseUrl || "https://api.zotero.org").replace(/\/+$/, "");
  }

  /**
   * Synchronizes annotations bi-directionally between local storage and zotero.org.
   */
  async syncAttachmentAnnotations(
    userId: string,
    attachmentId: string,
  ): Promise<ZoteroSyncResult> {
    const attachment = await this.attachmentRepo.getById(userId, attachmentId);
    if (!attachment) {
      return {
        pushedCount: 0,
        pulledCount: 0,
        syncedAt: new Date().toISOString(),
        status: "error",
        message: "Attachment not found",
      };
    }

    if (!this.accountService) {
      return {
        pushedCount: 0,
        pulledCount: 0,
        syncedAt: new Date().toISOString(),
        status: "skipped",
        message: "Zotero account service not configured",
      };
    }

    const creds = await this.accountService.getInternalDecryptedKey(userId);
    if (!creds || !creds.apiKey || !creds.zoteroUserId) {
      return {
        pushedCount: 0,
        pulledCount: 0,
        syncedAt: new Date().toISOString(),
        status: "skipped",
        message: "Zotero account not linked; sync skipped",
      };
    }

    const { zoteroUserId, apiKey } = creds;
    const parentItemKey = attachment.md5Hash || attachment.id;

    // 1. Fetch local annotations
    const localAnnotations = await this.annotationRepo.listByAttachment(userId, attachmentId);
    const zoteroItems = localAnnotations.map((ann) => {
      const readerAnn: ZoteroReaderAnnotation = {
        id: ann.zoteroKey,
        type: ann.annotationType as "highlight" | "underline" | "note" | "image" | "ink",
        color: ann.annotationColor,
        pageLabel: ann.annotationPageLabel,
        sortIndex: ann.annotationSortIndex,
        position: (ann.annotationPosition as unknown as ZoteroReaderAnnotation["position"]) || {
          pageIndex: 0,
          rects: [],
        },
        text: ann.annotationText,
        comment: ann.annotationComment,
        dateCreated: ann.createdAt.toISOString(),
        dateModified: ann.updatedAt.toISOString(),
      };
      return toZoteroAnnotationItem(readerAnn, parentItemKey, ann.version).data;
    });

    let pushedCount = 0;
    let pulledCount = 0;

    try {
      // 2. Push local annotations to Zotero API if any exist
      if (zoteroItems.length > 0) {
        const pushUrl = `${this.zoteroApiBaseUrl}/users/${zoteroUserId}/items`;
        const pushResp = await this.fetchFn(pushUrl, {
          method: "POST",
          headers: {
            "Zotero-API-Key": apiKey,
            "Zotero-API-Version": "3",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(zoteroItems),
        });

        if (pushResp.ok) {
          pushedCount = zoteroItems.length;
        }
      }

      // 3. Pull remote annotations from Zotero API
      const pullUrl = `${this.zoteroApiBaseUrl}/users/${zoteroUserId}/items?itemType=annotation&limit=100`;
      const pullResp = await this.fetchFn(pullUrl, {
        method: "GET",
        headers: {
          "Zotero-API-Key": apiKey,
          "Zotero-API-Version": "3",
        },
      });

      if (pullResp.ok) {
        const remoteData = (await pullResp.json()) as Array<{ data: ZoteroAnnotationItemData }>;
        if (Array.isArray(remoteData)) {
          for (const item of remoteData) {
            const data = item.data;
            if (data.parentItem === parentItemKey || !data.parentItem) {
              const readerAnn = fromZoteroAnnotationItem(data);
              // Upsert locally
              const existing = localAnnotations.find((a) => a.zoteroKey === data.key);
              if (!existing) {
                await this.annotationRepo.create(userId, {
                  attachmentId,
                  zoteroKey: readerAnn.id,
                  parentItemKey,
                  annotationType: readerAnn.type,
                  annotationText: readerAnn.text || "",
                  annotationComment: readerAnn.comment || "",
                  annotationColor: readerAnn.color,
                  annotationPageLabel: readerAnn.pageLabel || "1",
                  annotationSortIndex: readerAnn.sortIndex,
                  annotationPosition: readerAnn.position as unknown as Record<string, unknown>,
                  version: data.version,
                });
                pulledCount++;
              }
            }
          }
        }
      }

      return {
        pushedCount,
        pulledCount,
        syncedAt: new Date().toISOString(),
        status: "success",
      };
    } catch (err) {
      return {
        pushedCount,
        pulledCount,
        syncedAt: new Date().toISOString(),
        status: "partial",
        message: err instanceof Error ? err.message : "Sync error",
      };
    }
  }
}
