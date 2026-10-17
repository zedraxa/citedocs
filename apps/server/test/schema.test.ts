import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import * as schema from "../src/db/schema.js";

describe("Drizzle Schema & Row-Level Ownership Structure", () => {
  it("defines all required tables according to the architecture specification", () => {
    expect(schema.users).toBeDefined();
    expect(schema.documents).toBeDefined();
    expect(schema.documentShares).toBeDefined();
    expect(schema.libraryItems).toBeDefined();
    expect(schema.collections).toBeDefined();
    expect(schema.itemCollections).toBeDefined();
    expect(schema.tags).toBeDefined();
    expect(schema.itemTags).toBeDefined();
    expect(schema.creators).toBeDefined();
    expect(schema.itemCreators).toBeDefined();
    expect(schema.attachments).toBeDefined();
    expect(schema.zoteroCredentials).toBeDefined();
    expect(schema.pdfAnnotations).toBeDefined();
  });

  it("strictly enforces row-level ownership on every student data table", () => {
    // Every single library/document/data entity must have ownerUserId (or userId for credentials/shares)
    const documentsCols = getTableColumns(schema.documents);
    expect(documentsCols.ownerUserId).toBeDefined();
    expect(documentsCols.ownerUserId.notNull).toBe(true);

    const libraryItemsCols = getTableColumns(schema.libraryItems);
    expect(libraryItemsCols.ownerUserId).toBeDefined();
    expect(libraryItemsCols.ownerUserId.notNull).toBe(true);

    const collectionsCols = getTableColumns(schema.collections);
    expect(collectionsCols.ownerUserId).toBeDefined();
    expect(collectionsCols.ownerUserId.notNull).toBe(true);

    const itemCollectionsCols = getTableColumns(schema.itemCollections);
    expect(itemCollectionsCols.ownerUserId).toBeDefined();
    expect(itemCollectionsCols.ownerUserId.notNull).toBe(true);

    const tagsCols = getTableColumns(schema.tags);
    expect(tagsCols.ownerUserId).toBeDefined();
    expect(tagsCols.ownerUserId.notNull).toBe(true);

    const itemTagsCols = getTableColumns(schema.itemTags);
    expect(itemTagsCols.ownerUserId).toBeDefined();
    expect(itemTagsCols.ownerUserId.notNull).toBe(true);

    const creatorsCols = getTableColumns(schema.creators);
    expect(creatorsCols.ownerUserId).toBeDefined();
    expect(creatorsCols.ownerUserId.notNull).toBe(true);

    const itemCreatorsCols = getTableColumns(schema.itemCreators);
    expect(itemCreatorsCols.ownerUserId).toBeDefined();
    expect(itemCreatorsCols.ownerUserId.notNull).toBe(true);

    const attachmentsCols = getTableColumns(schema.attachments);
    expect(attachmentsCols.ownerUserId).toBeDefined();
    expect(attachmentsCols.ownerUserId.notNull).toBe(true);

    const pdfAnnotationsCols = getTableColumns(schema.pdfAnnotations);
    expect(pdfAnnotationsCols.ownerUserId).toBeDefined();
    expect(pdfAnnotationsCols.ownerUserId.notNull).toBe(true);

    const zoteroCredCols = getTableColumns(schema.zoteroCredentials);
    expect(zoteroCredCols.userId).toBeDefined();
    expect(zoteroCredCols.userId.notNull).toBe(true);

    const documentSharesCols = getTableColumns(schema.documentShares);
    expect(documentSharesCols.userId).toBeDefined();
    expect(documentSharesCols.documentId).toBeDefined();
    expect(documentSharesCols.documentId.notNull).toBe(true);
    expect(documentSharesCols.role).toBeDefined();
    expect(documentSharesCols.role.notNull).toBe(true);
    expect(documentSharesCols.email).toBeDefined();
    expect(documentSharesCols.createdBy).toBeDefined();

    expect(documentsCols.s3ObjectKey).toBeDefined();
    expect(documentsCols.fileSize).toBeDefined();
    expect(documentsCols.mimeType).toBeDefined();
    expect(documentsCols.deletedAt).toBeDefined();
  });

  it("stores sensitive Zotero credentials in encrypted fields", () => {
    const credCols = getTableColumns(schema.zoteroCredentials);
    expect(credCols.encryptedApiKey).toBeDefined();
    expect(credCols.encryptedToken).toBeDefined();
    expect(credCols.syncEnabled).toBeDefined();
  });

  it("has primary keys on all tables", () => {
    const tables = [
      schema.users,
      schema.documents,
      schema.documentShares,
      schema.libraryItems,
      schema.collections,
      schema.tags,
      schema.creators,
      schema.itemCreators,
      schema.attachments,
      schema.zoteroCredentials,
      schema.pdfAnnotations,
    ];

    for (const table of tables) {
      const cols = getTableColumns(table);
      expect(cols.id).toBeDefined();
      expect(cols.id.primary).toBe(true);
    }
  });
});
