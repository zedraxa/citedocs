import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  customType,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";

/**
 * Custom bytea column type for binary data (such as Yjs CRDT document binary state).
 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Users table: each student has their own unique account.
 */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Documents table: owned by a specific student (owner_user_id).
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled Document"),
    yjsState: bytea("yjs_state"),
    cslStyleId: text("csl_style_id").notNull().default("apa"),
    cslLocale: text("csl_locale").notNull().default("en-US"),
    preferences: jsonb("preferences").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("documents_owner_user_id_idx").on(table.ownerUserId),
  ]
);

/**
 * Document shares: explicit collaboration grants (owner, editor, commenter, viewer).
 * Collaboration only occurs when explicitly granted here.
 */
export const documentShares = pgTable(
  "document_shares",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("viewer"), // "owner" | "editor" | "commenter" | "viewer"
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("document_shares_doc_user_idx").on(table.documentId, table.userId),
  ]
);

/**
 * Library items (Zotero parity): strictly isolated per user (owner_user_id).
 */
export const libraryItems = pgTable(
  "library_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    zoteroKey: text("zotero_key"),
    version: integer("version").notNull().default(0),
    itemType: text("item_type").notNull().default("journalArticle"),
    title: text("title").notNull().default(""),
    parsedDate: text("parsed_date"),
    publicationTitle: text("publication_title"),
    doi: text("doi"),
    url: text("url"),
    abstractNote: text("abstract_note"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    dateAdded: timestamp("date_added", { withTimezone: true }).defaultNow().notNull(),
    dateModified: timestamp("date_modified", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("library_items_owner_user_id_idx").on(table.ownerUserId),
    index("library_items_zotero_key_idx").on(table.ownerUserId, table.zoteroKey),
  ]
);

/**
 * Collections: folder/hierarchy organization, strictly scoped to owner.
 */
export const collections = pgTable(
  "collections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentCollectionId: uuid("parent_collection_id"),
    name: text("name").notNull(),
    zoteroKey: text("zotero_key"),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("collections_owner_user_id_idx").on(table.ownerUserId),
  ]
);

/**
 * Item collections: many-to-many junction between library_items and collections.
 */
export const itemCollections = pgTable(
  "item_collections",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.collectionId] }),
    index("item_collections_owner_user_id_idx").on(table.ownerUserId),
  ]
);

/**
 * Tags: categorized tags strictly isolated per user.
 */
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: integer("type").notNull().default(0), // 0: manual, 1: automatic
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("tags_owner_user_id_idx").on(table.ownerUserId),
  ]
);

/**
 * Item tags: junction between library_items and tags.
 */
export const itemTags = pgTable(
  "item_tags",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.tagId] }),
    index("item_tags_owner_user_id_idx").on(table.ownerUserId),
  ]
);

/**
 * Creators: authors, editors, translators, etc. Scoped to user.
 */
export const creators = pgTable(
  "creators",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    firstName: text("first_name"),
    lastName: text("last_name"),
    name: text("name"), // For single-field names (institutions, committees)
    creatorType: text("creator_type").notNull().default("author"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("creators_owner_user_id_idx").on(table.ownerUserId),
  ]
);

/**
 * Item creators: ordered association of creators with library items.
 */
export const itemCreators = pgTable(
  "item_creators",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => libraryItems.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    order: integer("order").notNull().default(0),
    creatorType: text("creator_type").notNull().default("author"),
  },
  (table) => [
    index("item_creators_item_idx").on(table.itemId),
    index("item_creators_owner_user_id_idx").on(table.ownerUserId),
  ]
);

/**
 * Attachments: PDF files, notes, snapshots stored in MinIO/S3.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => libraryItems.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Attachment"),
    contentType: text("content_type").notNull().default("application/pdf"),
    filePath: text("file_path").notNull(),
    fileSize: integer("file_size").notNull().default(0),
    md5Hash: text("md5_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("attachments_owner_user_id_idx").on(table.ownerUserId),
    index("attachments_item_id_idx").on(table.itemId),
  ]
);

/**
 * Zotero credentials: per-user zotero.org credentials encrypted at rest.
 * Never returned in plain text to the client; decrypted only in sync workers.
 */
export const zoteroCredentials = pgTable(
  "zotero_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    zoteroUserId: text("zotero_user_id"),
    encryptedApiKey: text("encrypted_api_key"),
    encryptedToken: text("encrypted_token"),
    syncEnabled: boolean("sync_enabled").notNull().default(true),
    lastSyncVersion: integer("last_sync_version").notNull().default(0),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("zotero_credentials_user_id_idx").on(table.userId),
  ]
);

// Type definitions
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type Document = InferSelectModel<typeof documents>;
export type NewDocument = InferInsertModel<typeof documents>;

export type DocumentShare = InferSelectModel<typeof documentShares>;
export type NewDocumentShare = InferInsertModel<typeof documentShares>;

export type LibraryItem = InferSelectModel<typeof libraryItems>;
export type NewLibraryItem = InferInsertModel<typeof libraryItems>;

export type Collection = InferSelectModel<typeof collections>;
export type NewCollection = InferInsertModel<typeof collections>;

export type Tag = InferSelectModel<typeof tags>;
export type NewTag = InferInsertModel<typeof tags>;

export type Creator = InferSelectModel<typeof creators>;
export type NewCreator = InferInsertModel<typeof creators>;

export type Attachment = InferSelectModel<typeof attachments>;
export type NewAttachment = InferInsertModel<typeof attachments>;

export type ZoteroCredential = InferSelectModel<typeof zoteroCredentials>;
export type NewZoteroCredential = InferInsertModel<typeof zoteroCredentials>;
