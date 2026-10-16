import { describe, it, expect } from "vitest";
import { assertOwnership, checkDocumentPermission } from "../src/repositories/ownership.js";
import { OwnershipError } from "../src/repositories/errors.js";

describe("ownership helpers", () => {
  describe("assertOwnership", () => {
    it("passes when resource owner matches the requesting user ID", () => {
      expect(() => {
        assertOwnership("user-123", "user-123", "Document");
      }).not.toThrow();
    });

    it("throws OwnershipError when resource belongs to a different user", () => {
      expect(() => {
        assertOwnership("user-123", "user-456", "Library item");
      }).toThrowError(OwnershipError);

      expect(() => {
        assertOwnership("user-123", "user-456", "Library item");
      }).toThrow(/Access denied: Library item belongs to another user/);
    });

    it("throws OwnershipError if requesting user ID is missing", () => {
      expect(() => {
        assertOwnership("user-123", "", "Library item");
      }).toThrow(/valid user ID is required/);
    });
  });

  describe("checkDocumentPermission", () => {
    const ownerId = "student-alice";
    const collaboratorId = "student-bob";

    it("grants owner full permissions (read, write, admin)", () => {
      expect(checkDocumentPermission(ownerId, ownerId, null, "read")).toBe(true);
      expect(checkDocumentPermission(ownerId, ownerId, null, "write")).toBe(true);
      expect(checkDocumentPermission(ownerId, ownerId, null, "admin")).toBe(true);
    });

    it("evaluates viewer permissions correctly", () => {
      expect(checkDocumentPermission(ownerId, collaboratorId, "viewer", "read")).toBe(true);
      expect(checkDocumentPermission(ownerId, collaboratorId, "viewer", "write")).toBe(false);
      expect(checkDocumentPermission(ownerId, collaboratorId, "viewer", "admin")).toBe(false);
    });

    it("evaluates commenter permissions correctly", () => {
      expect(checkDocumentPermission(ownerId, collaboratorId, "commenter", "read")).toBe(true);
      expect(checkDocumentPermission(ownerId, collaboratorId, "commenter", "write")).toBe(false);
      expect(checkDocumentPermission(ownerId, collaboratorId, "commenter", "admin")).toBe(false);
    });

    it("evaluates editor permissions correctly", () => {
      expect(checkDocumentPermission(ownerId, collaboratorId, "editor", "read")).toBe(true);
      expect(checkDocumentPermission(ownerId, collaboratorId, "editor", "write")).toBe(true);
      expect(checkDocumentPermission(ownerId, collaboratorId, "editor", "admin")).toBe(false);
    });

    it("rejects unauthorized users with no share grant", () => {
      expect(checkDocumentPermission(ownerId, collaboratorId, null, "read")).toBe(false);
      expect(checkDocumentPermission(ownerId, collaboratorId, undefined, "read")).toBe(false);
      expect(checkDocumentPermission(ownerId, collaboratorId, "unknown_role", "read")).toBe(false);
    });
  });
});
