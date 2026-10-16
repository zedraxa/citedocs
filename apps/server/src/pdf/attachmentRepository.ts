import { eq, and, desc } from "drizzle-orm";
import { getDb, type CitedocsDb } from "../db/client.js";
import { attachments, type Attachment, type NewAttachment } from "../db/schema.js";
import { assertOwnership } from "../repositories/ownership.js";
import { OwnershipError } from "../repositories/errors.js";

export class AttachmentRepository {
  protected db: CitedocsDb;

  constructor(dbInstance?: CitedocsDb) {
    this.db = dbInstance || getDb();
  }

  /**
   * Retrieves all attachments belonging to the authenticated student.
   * Can optionally filter by parent library itemId.
   */
  async list(userId: string, itemId?: string): Promise<Attachment[]> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const conditions = [eq(attachments.ownerUserId, userId)];
    if (itemId) {
      conditions.push(eq(attachments.itemId, itemId));
    }

    return await this.db
      .select()
      .from(attachments)
      .where(and(...conditions))
      .orderBy(desc(attachments.createdAt));
  }

  /**
   * Retrieves an attachment by its ID, enforcing multi-tenant ownership.
   */
  async getById(userId: string, attachmentId: string): Promise<Attachment | null> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const rows = await this.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const attachment = rows[0];
    assertOwnership(attachment.ownerUserId, userId, "PDF Attachment");
    return attachment;
  }

  /**
   * Creates a new attachment record strictly bound to the requesting user.
   */
  async create(
    userId: string,
    data: Omit<NewAttachment, "id" | "ownerUserId" | "createdAt" | "updatedAt">,
  ): Promise<Attachment> {
    if (!userId) {
      throw new OwnershipError("Unauthenticated: valid user ID is required");
    }

    const now = new Date();
    const rows = await this.db
      .insert(attachments)
      .values({
        ...data,
        ownerUserId: userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return rows[0];
  }

  /**
   * Deletes an attachment after verifying ownership.
   */
  async delete(userId: string, attachmentId: string): Promise<void> {
    const existing = await this.getById(userId, attachmentId);
    if (!existing) return;

    await this.db.delete(attachments).where(eq(attachments.id, attachmentId));
  }
}
