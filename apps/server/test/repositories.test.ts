import { describe, it, expect, vi, beforeEach } from "vitest";
import { ItemRepository } from "../src/repositories/itemRepository.js";
import { DocumentRepository } from "../src/repositories/documentRepository.js";
import { ZoteroCredentialRepository } from "../src/repositories/zoteroRepository.js";
import { OwnershipError } from "../src/repositories/errors.js";
import { decryptAtRest, encryptAtRest } from "../src/db/crypto.js";
import type { CitedocsDb } from "../src/db/client.js";

type MockDb = Record<string, ReturnType<typeof vi.fn>>;

describe("Repositories with Row-Level Ownership Enforcement", () => {
  describe("ItemRepository", () => {
    let mockDb: MockDb;
    let repo: ItemRepository;

    const studentAlice = "student-alice-uuid";
    const studentBob = "student-bob-uuid";

    const aliceItem = {
      id: "item-111",
      ownerUserId: studentAlice,
      zoteroKey: "KEY123",
      version: 1,
      itemType: "journalArticle",
      title: "Alice's Quantum Computing Paper",
      parsedDate: "2024",
      publicationTitle: "Nature Physics",
      doi: "10.1038/nature12345",
      url: "https://nature.com",
      abstractNote: "Abstract text",
      metadata: {},
      dateAdded: new Date(),
      dateModified: new Date(),
    };

    beforeEach(() => {
      mockDb = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
      repo = new ItemRepository(mockDb as unknown as CitedocsDb);
    });

    it("creates an item strictly bound to the requesting student's ownerUserId", async () => {
      const returningMock = vi.fn().mockResolvedValue([aliceItem]);
      const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
      mockDb.insert.mockReturnValue({ values: valuesMock });

      const created = await repo.create(studentAlice, {
        title: "Alice's Quantum Computing Paper",
        itemType: "journalArticle",
        version: 1,
      });

      expect(created).toEqual(aliceItem);
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerUserId: studentAlice,
          title: "Alice's Quantum Computing Paper",
        })
      );
    });

    it("rejects creation if user ID is empty", async () => {
      await expect(
        repo.create("", {
          title: "Test",
          itemType: "book",
          version: 1,
        })
      ).rejects.toThrowError(OwnershipError);
    });

    it("lists only items belonging to the requesting user", async () => {
      const orderByMock = vi.fn().mockResolvedValue([aliceItem]);
      const whereMock = vi.fn().mockReturnValue({
        orderBy: orderByMock,
      });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      const items = await repo.list(studentAlice);
      expect(items).toEqual([aliceItem]);
      expect(fromMock).toHaveBeenCalled();
    });

    it("retrieves item when owner matches requesting user", async () => {
      const limitMock = vi.fn().mockResolvedValue([aliceItem]);
      const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      const item = await repo.getById(studentAlice, "item-111");
      expect(item).toEqual(aliceItem);
    });

    it("rejects cross-user access: throws OwnershipError when studentBob accesses Alice's item", async () => {
      const limitMock = vi.fn().mockResolvedValue([aliceItem]);
      const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      await expect(repo.getById(studentBob, "item-111")).rejects.toThrowError(
        OwnershipError
      );
      await expect(repo.getById(studentBob, "item-111")).rejects.toThrow(
        /Access denied: Library item belongs to another user/
      );
    });

    it("returns null when item does not exist", async () => {
      const limitMock = vi.fn().mockResolvedValue([]);
      const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      const item = await repo.getById(studentAlice, "non-existent-id");
      expect(item).toBeNull();
    });

    it("rejects cross-user update: throws OwnershipError when studentBob tries to update Alice's item", async () => {
      // Mock getById returning Alice's item
      const limitMock = vi.fn().mockResolvedValue([aliceItem]);
      const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      await expect(
        repo.update(studentBob, "item-111", { title: "Hacked Title" })
      ).rejects.toThrowError(OwnershipError);

      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("updates item successfully when studentAlice owns it", async () => {
      // First call (getById)
      const limitMock = vi.fn().mockResolvedValue([aliceItem]);
      const selectWhere = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: selectWhere });
      mockDb.select.mockReturnValue({ from: fromMock });

      // Update call
      const updatedItem = { ...aliceItem, title: "Updated Title" };
      const returningMock = vi.fn().mockResolvedValue([updatedItem]);
      const updateWhere = vi.fn().mockReturnValue({ returning: returningMock });
      const setMock = vi.fn().mockReturnValue({ where: updateWhere });
      mockDb.update.mockReturnValue({ set: setMock });

      const result = await repo.update(studentAlice, "item-111", { title: "Updated Title" });
      expect(result.title).toBe("Updated Title");
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Updated Title" })
      );
    });

    it("rejects cross-user delete: throws OwnershipError when studentBob tries to delete Alice's item", async () => {
      const limitMock = vi.fn().mockResolvedValue([aliceItem]);
      const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      await expect(repo.delete(studentBob, "item-111")).rejects.toThrowError(
        OwnershipError
      );
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it("deletes item successfully when studentAlice owns it", async () => {
      // First call (getById)
      const limitMock = vi.fn().mockResolvedValue([aliceItem]);
      const selectWhere = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: selectWhere });
      mockDb.select.mockReturnValue({ from: fromMock });

      // Delete call
      const returningMock = vi.fn().mockResolvedValue([{ id: "item-111" }]);
      const deleteWhere = vi.fn().mockReturnValue({ returning: returningMock });
      mockDb.delete.mockReturnValue({ where: deleteWhere });

      const success = await repo.delete(studentAlice, "item-111");
      expect(success).toBe(true);
    });
  });

  describe("DocumentRepository", () => {
    let mockDb: MockDb;
    let repo: DocumentRepository;

    const studentAlice = "student-alice-uuid";
    const studentBob = "student-bob-uuid";
    const strangerCharlie = "student-charlie-uuid";

    const aliceDoc = {
      id: "doc-111",
      ownerUserId: studentAlice,
      title: "Alice Dissertation",
      yjsState: null,
      cslStyleId: "apa",
      cslLocale: "en-US",
      preferences: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      mockDb = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
      repo = new DocumentRepository(mockDb as unknown as CitedocsDb);
    });

    it("allows owner full access to document", async () => {
      const limitMock = vi.fn().mockResolvedValue([aliceDoc]);
      const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      const doc = await repo.getById(studentAlice, "doc-111");
      expect(doc).toBeDefined();
      expect(doc?.userRole).toBe("owner");
    });

    it("allows shared collaborator to access document with granted role", async () => {
      // 1. Doc lookup
      const docLimit = vi.fn().mockResolvedValue([aliceDoc]);
      const docWhere = vi.fn().mockReturnValue({ limit: docLimit });
      const docFrom = vi.fn().mockReturnValue({ where: docWhere });

      // 2. Share grant lookup
      const shareLimit = vi.fn().mockResolvedValue([{ role: "editor" }]);
      const shareWhere = vi.fn().mockReturnValue({ limit: shareLimit });
      const shareFrom = vi.fn().mockReturnValue({ where: shareWhere });

      mockDb.select
        .mockReturnValueOnce({ from: docFrom })
        .mockReturnValueOnce({ from: shareFrom });

      const doc = await repo.getById(studentBob, "doc-111");
      expect(doc).toBeDefined();
      expect(doc?.userRole).toBe("editor");
    });

    it("rejects unauthorized access when document is neither owned nor shared", async () => {
      // 1. Doc lookup returns Alice's doc
      const docLimit = vi.fn().mockResolvedValue([aliceDoc]);
      const docWhere = vi.fn().mockReturnValue({ limit: docLimit });
      const docFrom = vi.fn().mockReturnValue({ where: docWhere });

      // 2. Share grant lookup returns empty
      const shareLimit = vi.fn().mockResolvedValue([]);
      const shareWhere = vi.fn().mockReturnValue({ limit: shareLimit });
      const shareFrom = vi.fn().mockReturnValue({ where: shareWhere });

      mockDb.select
        .mockReturnValueOnce({ from: docFrom })
        .mockReturnValueOnce({ from: shareFrom });

      await expect(repo.getById(strangerCharlie, "doc-111")).rejects.toThrowError(
        OwnershipError
      );
    });

    it("allows shared editor to update document but rejects viewer", async () => {
      // Mock getById returning editor role
      vi.spyOn(repo, "getById").mockResolvedValueOnce({
        ...aliceDoc,
        userRole: "editor",
      });

      const returningMock = vi.fn().mockResolvedValue([{ ...aliceDoc, title: "New Title" }]);
      const updateWhere = vi.fn().mockReturnValue({ returning: returningMock });
      const setMock = vi.fn().mockReturnValue({ where: updateWhere });
      mockDb.update.mockReturnValue({ set: setMock });

      const updated = await repo.update(studentBob, "doc-111", { title: "New Title" });
      expect(updated.title).toBe("New Title");

      // Mock getById returning viewer role
      vi.spyOn(repo, "getById").mockResolvedValueOnce({
        ...aliceDoc,
        userRole: "viewer",
      });

      await expect(
        repo.update(studentBob, "doc-111", { title: "Viewer attempted update" })
      ).rejects.toThrowError(OwnershipError);
    });

    it("only permits owner to delete document; rejects shared editor", async () => {
      vi.spyOn(repo, "getById").mockResolvedValueOnce({
        ...aliceDoc,
        userRole: "editor",
      });

      await expect(repo.delete(studentBob, "doc-111")).rejects.toThrowError(
        OwnershipError
      );

      vi.spyOn(repo, "getById").mockResolvedValueOnce({
        ...aliceDoc,
        userRole: "owner",
      });

      const returningMock = vi.fn().mockResolvedValue([{ id: "doc-111" }]);
      const deleteWhere = vi.fn().mockReturnValue({ returning: returningMock });
      mockDb.delete.mockReturnValue({ where: deleteWhere });

      const deleted = await repo.delete(studentAlice, "doc-111");
      expect(deleted).toBe(true);
    });
  });

  describe("ZoteroCredentialRepository", () => {
    let mockDb: MockDb;
    let repo: ZoteroCredentialRepository;

    const studentAlice = "student-alice-uuid";
    const apiKey = "secret_zotero_api_key_xyz";

    beforeEach(() => {
      mockDb = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
      repo = new ZoteroCredentialRepository(mockDb as unknown as CitedocsDb);
    });

    it("saves credentials with encrypted API key at rest", async () => {
      // Existing check returns empty (insert path)
      const limitMock = vi.fn().mockResolvedValue([]);
      const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      const returningMock = vi.fn().mockImplementation(() => [
        {
          id: "cred-1",
          userId: studentAlice,
          zoteroUserId: "123456",
          encryptedApiKey: "mock_encrypted",
          syncEnabled: true,
          lastSyncVersion: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
      mockDb.insert.mockReturnValue({ values: valuesMock });

      await repo.save(studentAlice, {
        zoteroUserId: "123456",
        apiKey,
      });

      expect(valuesMock).toHaveBeenCalled();
      const insertArg = valuesMock.mock.calls[0][0];
      expect(insertArg.userId).toBe(studentAlice);
      expect(insertArg.encryptedApiKey).not.toBe(apiKey);
      expect(decryptAtRest(insertArg.encryptedApiKey)).toBe(apiKey);
    });

    it("retrieves credentials and decrypts API key at rest", async () => {
      const encryptedKey = encryptAtRest(apiKey);
      const limitMock = vi.fn().mockResolvedValue([
        {
          id: "cred-1",
          userId: studentAlice,
          zoteroUserId: "123456",
          encryptedApiKey: encryptedKey,
          encryptedToken: null,
          syncEnabled: true,
          lastSyncVersion: 5,
          lastSyncedAt: new Date(),
        },
      ]);
      const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValue({ from: fromMock });

      const cred = await repo.get(studentAlice);
      expect(cred).not.toBeNull();
      expect(cred?.apiKey).toBe(apiKey);
      expect(cred?.userId).toBe(studentAlice);
    });

    it("rejects access when user ID is missing", async () => {
      await expect(repo.get("")).rejects.toThrowError(OwnershipError);
    });
  });
});
