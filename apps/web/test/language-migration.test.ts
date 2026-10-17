// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import {
  migrateLanguagePreference,
  persistLanguagePreference,
  LANG_STORAGE_KEY,
  LANG_MIGRATION_KEY,
  type MigrationStorage,
} from "../src/auth/languageMigration.js";
import { AuthProvider, useAuth } from "../src/auth/AuthContext.js";
import { getDocumentLanguage } from "../src/documents/i18n.js";

describe("Language Migration and Persistence", () => {
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("migrateLanguagePreference unit logic", () => {
    it("resets legacy 'en' to 'tr' and sets migration marker when marker is absent", () => {
      const mockStorage: Record<string, string> = {
        [LANG_STORAGE_KEY]: "en",
      };
      const storage: MigrationStorage = {
        getItem: (k) => mockStorage[k] ?? null,
        setItem: (k, v) => {
          mockStorage[k] = v;
        },
      };

      const result = migrateLanguagePreference(storage);

      expect(result).toBe(true);
      expect(mockStorage[LANG_STORAGE_KEY]).toBe("tr");
      expect(mockStorage[LANG_MIGRATION_KEY]).toBe("true");
    });

    it("preserves deliberate 'en' when migration marker is present", () => {
      const mockStorage: Record<string, string> = {
        [LANG_STORAGE_KEY]: "en",
        [LANG_MIGRATION_KEY]: "true",
      };
      const storage: MigrationStorage = {
        getItem: (k) => mockStorage[k] ?? null,
        setItem: (k, v) => {
          mockStorage[k] = v;
        },
      };

      const result = migrateLanguagePreference(storage);

      expect(result).toBe(false);
      expect(mockStorage[LANG_STORAGE_KEY]).toBe("en");
      expect(mockStorage[LANG_MIGRATION_KEY]).toBe("true");
    });

    it("does not change 'tr' preference", () => {
      const mockStorage: Record<string, string> = {
        [LANG_STORAGE_KEY]: "tr",
      };
      const storage: MigrationStorage = {
        getItem: (k) => mockStorage[k] ?? null,
        setItem: (k, v) => {
          mockStorage[k] = v;
        },
      };

      const result = migrateLanguagePreference(storage);

      expect(result).toBe(false);
      expect(mockStorage[LANG_STORAGE_KEY]).toBe("tr");
      expect(mockStorage[LANG_MIGRATION_KEY]).toBeUndefined();
    });

    it("does nothing when no language is stored", () => {
      const mockStorage: Record<string, string> = {};
      const storage: MigrationStorage = {
        getItem: (k) => mockStorage[k] ?? null,
        setItem: (k, v) => {
          mockStorage[k] = v;
        },
      };

      const result = migrateLanguagePreference(storage);

      expect(result).toBe(false);
      expect(mockStorage[LANG_STORAGE_KEY]).toBeUndefined();
      expect(mockStorage[LANG_MIGRATION_KEY]).toBeUndefined();
    });

    it("handles storage exceptions gracefully", () => {
      const throwingStorage: MigrationStorage = {
        getItem: () => {
          throw new Error("SecurityError: storage disabled");
        },
        setItem: () => {},
      };

      expect(() => migrateLanguagePreference(throwingStorage)).not.toThrow();
      expect(migrateLanguagePreference(throwingStorage)).toBe(false);
    });
  });

  describe("persistLanguagePreference unit logic", () => {
    it("persists language and sets migration marker so deliberate choice persists", () => {
      const mockStorage: Record<string, string> = {};
      const storage: MigrationStorage = {
        getItem: (k) => mockStorage[k] ?? null,
        setItem: (k, v) => {
          mockStorage[k] = v;
        },
      };

      persistLanguagePreference("en", storage);

      expect(mockStorage[LANG_STORAGE_KEY]).toBe("en");
      expect(mockStorage[LANG_MIGRATION_KEY]).toBe("true");

      // Running migration again must not reset the user's deliberate English choice
      const migrationResult = migrateLanguagePreference(storage);
      expect(migrationResult).toBe(false);
      expect(mockStorage[LANG_STORAGE_KEY]).toBe("en");
    });
  });

  describe("AuthProvider and getDocumentLanguage integration", () => {
    it("resets legacy unmigrated 'en' to 'tr' on AuthProvider initialization", async () => {
      localStorage.setItem(LANG_STORAGE_KEY, "en");
      // Note: LANG_MIGRATION_KEY is intentionally absent

      let detectedLang = "";
      function Consumer() {
        const { lang } = useAuth();
        detectedLang = lang;
        return null;
      }

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          createElement(
            AuthProvider,
            { autoFetch: false },
            createElement(Consumer, null)
          )
        );
      });

      expect(detectedLang).toBe("tr");
      expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe("tr");
      expect(localStorage.getItem(LANG_MIGRATION_KEY)).toBe("true");

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it("preserves deliberate 'en' when migration marker is present on AuthProvider initialization", async () => {
      localStorage.setItem(LANG_STORAGE_KEY, "en");
      localStorage.setItem(LANG_MIGRATION_KEY, "true");

      let detectedLang = "";
      function Consumer() {
        const { lang } = useAuth();
        detectedLang = lang;
        return null;
      }

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(
          createElement(
            AuthProvider,
            { autoFetch: false },
            createElement(Consumer, null)
          )
        );
      });

      expect(detectedLang).toBe("en");
      expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe("en");

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it("runs migration at app start and getDocumentLanguage reads migrated Turkish preference", () => {
      localStorage.setItem(LANG_STORAGE_KEY, "en");
      expect(localStorage.getItem(LANG_MIGRATION_KEY)).toBeNull();

      migrateLanguagePreference();
      const lang = getDocumentLanguage();
      expect(lang).toBe("tr");
      expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe("tr");
      expect(localStorage.getItem(LANG_MIGRATION_KEY)).toBe("true");
    });
  });
});
