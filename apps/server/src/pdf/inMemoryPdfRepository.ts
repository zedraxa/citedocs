import { AttachmentRepository } from "./attachmentRepository.js";
import { AnnotationRepository } from "./annotationRepository.js";
import {
  type Attachment,
  type NewAttachment,
  type PdfAnnotation,
  type NewPdfAnnotation,
} from "../db/schema.js";
import { OwnershipError, NotFoundError } from "../repositories/errors.js";
import type { CitedocsDb } from "../db/client.js";
import { generateZoteroKey, formatSortIndex } from "@citedocs/pdf-reader";

export class InMemoryAttachmentRepository extends AttachmentRepository {
  private attachmentsMap = new Map<string, Attachment>();

  constructor() {
    super({} as CitedocsDb);
  }

  clear(): void {
    this.attachmentsMap.clear();
  }

  override async list(userId: string, itemId?: string): Promise<Attachment[]> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    let items = Array.from(this.attachmentsMap.values()).filter(
      (att) => att.ownerUserId === userId,
    );

    if (itemId) {
      items = items.filter((att) => att.itemId === itemId);
    }

    return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  override async getById(userId: string, attachmentId: string): Promise<Attachment | null> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const item = this.attachmentsMap.get(attachmentId);
    if (!item) return null;

    if (item.ownerUserId !== userId) {
      throw new OwnershipError("Access denied: PDF Attachment belongs to another user");
    }

    return item;
  }

  override async create(
    userId: string,
    data: Omit<NewAttachment, "id" | "ownerUserId" | "createdAt" | "updatedAt">,
  ): Promise<Attachment> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const id = `att-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();
    const attachment: Attachment = {
      id,
      ownerUserId: userId,
      itemId: data.itemId ?? null,
      title: data.title ?? "Attachment",
      contentType: data.contentType ?? "application/pdf",
      filePath: data.filePath,
      fileSize: data.fileSize ?? 0,
      md5Hash: data.md5Hash ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.attachmentsMap.set(id, attachment);
    return attachment;
  }

  override async delete(userId: string, attachmentId: string): Promise<void> {
    const existing = await this.getById(userId, attachmentId);
    if (!existing) return;

    this.attachmentsMap.delete(attachmentId);
  }
}

export class InMemoryAnnotationRepository extends AnnotationRepository {
  private annotationsMap = new Map<string, PdfAnnotation>();

  constructor() {
    super({} as CitedocsDb);
  }

  clear(): void {
    this.annotationsMap.clear();
  }

  override async listByAttachment(userId: string, attachmentId: string): Promise<PdfAnnotation[]> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const list = Array.from(this.annotationsMap.values()).filter(
      (ann) => ann.ownerUserId === userId && ann.attachmentId === attachmentId,
    );

    return list.sort((a, b) => {
      const idxCmp = (a.annotationSortIndex || "").localeCompare(b.annotationSortIndex || "");
      if (idxCmp !== 0) return idxCmp;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  override async getById(userId: string, annotationId: string): Promise<PdfAnnotation | null> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const ann = this.annotationsMap.get(annotationId);
    if (!ann) return null;

    if (ann.ownerUserId !== userId) {
      throw new OwnershipError("Access denied: PDF Annotation belongs to another user");
    }

    return ann;
  }

  override async create(
    userId: string,
    data: Omit<NewPdfAnnotation, "id" | "ownerUserId" | "createdAt" | "updatedAt"> & {
      zoteroKey?: string;
    },
  ): Promise<PdfAnnotation> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const id = `ann-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();
    const key = data.zoteroKey || generateZoteroKey();
    const sortIndex = data.annotationSortIndex || formatSortIndex(0);

    const annotation: PdfAnnotation = {
      id,
      ownerUserId: userId,
      attachmentId: data.attachmentId,
      zoteroKey: key,
      version: data.version ?? 0,
      parentItemKey: data.parentItemKey ?? null,
      annotationType: data.annotationType ?? "highlight",
      annotationText: data.annotationText ?? "",
      annotationComment: data.annotationComment ?? "",
      annotationColor: data.annotationColor ?? "#ffd400",
      annotationPageLabel: data.annotationPageLabel ?? "1",
      annotationSortIndex: sortIndex,
      annotationPosition: data.annotationPosition ?? null,
      imagePath: data.imagePath ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.annotationsMap.set(id, annotation);
    return annotation;
  }

  override async update(
    userId: string,
    annotationId: string,
    data: Partial<Omit<NewPdfAnnotation, "id" | "ownerUserId" | "attachmentId" | "createdAt">>,
  ): Promise<PdfAnnotation> {
    const existing = await this.getById(userId, annotationId);
    if (!existing) {
      throw new NotFoundError(`Annotation with ID ${annotationId} not found`);
    }

    const updated: PdfAnnotation = {
      ...existing,
      ...data,
      version: (existing.version ?? 0) + 1,
      updatedAt: new Date(),
    };

    this.annotationsMap.set(annotationId, updated);
    return updated;
  }

  override async delete(userId: string, annotationId: string): Promise<void> {
    const existing = await this.getById(userId, annotationId);
    if (!existing) return;

    this.annotationsMap.delete(annotationId);
  }

  override async deleteMany(userId: string, attachmentId: string, ids: string[]): Promise<number> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    let count = 0;
    for (const [id, ann] of this.annotationsMap.entries()) {
      if (
        ann.ownerUserId === userId &&
        ann.attachmentId === attachmentId &&
        (ids.includes(ann.id) || ids.includes(ann.zoteroKey))
      ) {
        this.annotationsMap.delete(id);
        count++;
      }
    }
    return count;
  }
}
