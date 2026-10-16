import { eq, and, asc, inArray } from "drizzle-orm";
import { getDb, type CitedocsDb } from "../db/client.js";
import { pdfAnnotations, type PdfAnnotation, type NewPdfAnnotation } from "../db/schema.js";
import { assertOwnership } from "../repositories/ownership.js";
import { OwnershipError, NotFoundError } from "../repositories/errors.js";
import { generateZoteroKey, formatSortIndex } from "@citedocs/pdf-reader";

export class AnnotationRepository {
  protected db: CitedocsDb;

  constructor(dbInstance?: CitedocsDb) {
    this.db = dbInstance || getDb();
  }

  /**
   * Retrieves all annotations for a given attachment, strictly scoped to the owner.
   */
  async listByAttachment(userId: string, attachmentId: string): Promise<PdfAnnotation[]> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    return await this.db
      .select()
      .from(pdfAnnotations)
      .where(and(eq(pdfAnnotations.ownerUserId, userId), eq(pdfAnnotations.attachmentId, attachmentId)))
      .orderBy(asc(pdfAnnotations.annotationSortIndex), asc(pdfAnnotations.createdAt));
  }

  /**
   * Retrieves an annotation by ID, verifying ownership.
   */
  async getById(userId: string, annotationId: string): Promise<PdfAnnotation | null> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const rows = await this.db
      .select()
      .from(pdfAnnotations)
      .where(eq(pdfAnnotations.id, annotationId))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const annotation = rows[0];
    assertOwnership(annotation.ownerUserId, userId, "PDF Annotation");
    return annotation;
  }

  /**
   * Creates an annotation record strictly bound to the requesting student.
   */
  async create(
    userId: string,
    data: Omit<NewPdfAnnotation, "id" | "ownerUserId" | "createdAt" | "updatedAt"> & {
      zoteroKey?: string;
    },
  ): Promise<PdfAnnotation> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const now = new Date();
    const key = data.zoteroKey || generateZoteroKey();
    const sortIndex = data.annotationSortIndex || formatSortIndex(0);

    const rows = await this.db
      .insert(pdfAnnotations)
      .values({
        ...data,
        zoteroKey: key,
        annotationSortIndex: sortIndex,
        ownerUserId: userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return rows[0];
  }

  /**
   * Updates an existing annotation after verifying ownership.
   */
  async update(
    userId: string,
    annotationId: string,
    data: Partial<Omit<NewPdfAnnotation, "id" | "ownerUserId" | "attachmentId" | "createdAt">>,
  ): Promise<PdfAnnotation> {
    const existing = await this.getById(userId, annotationId);
    if (!existing) {
      throw new NotFoundError(`Annotation with ID ${annotationId} not found`);
    }

    const now = new Date();
    const rows = await this.db
      .update(pdfAnnotations)
      .set({
        ...data,
        version: (existing.version ?? 0) + 1,
        updatedAt: now,
      })
      .where(eq(pdfAnnotations.id, annotationId))
      .returning();

    return rows[0];
  }

  /**
   * Deletes an annotation after verifying ownership.
   */
  async delete(userId: string, annotationId: string): Promise<void> {
    const existing = await this.getById(userId, annotationId);
    if (!existing) return;

    await this.db.delete(pdfAnnotations).where(eq(pdfAnnotations.id, annotationId));
  }

  /**
   * Deletes multiple annotations by ID or Zotero key for a given attachment.
   */
  async deleteMany(userId: string, attachmentId: string, ids: string[]): Promise<number> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }
    if (!ids.length) return 0;

    const existingList = await this.listByAttachment(userId, attachmentId);
    const toDeleteIds = existingList
      .filter((ann) => ids.includes(ann.id) || ids.includes(ann.zoteroKey))
      .map((ann) => ann.id);

    if (!toDeleteIds.length) return 0;

    await this.db.delete(pdfAnnotations).where(inArray(pdfAnnotations.id, toDeleteIds));
    return toDeleteIds.length;
  }
}
