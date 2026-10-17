import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

describe("Zotero Plugin Turkish Translation", () => {
  const trPath = path.resolve(__dirname, "../../../deploy/onlyoffice/zotero-translations/tr-TR.json");

  it("exists and is valid JSON", () => {
    expect(fs.existsSync(trPath)).toBe(true);
    const content = fs.readFileSync(trPath, "utf8");
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it("contains all required translation keys without empty values", () => {
    const content = fs.readFileSync(trPath, "utf8");
    const json = JSON.parse(content) as Record<string, string>;
    const keys = Object.keys(json);
    expect(keys.length).toBeGreaterThanOrEqual(100);

    for (const [key, value] of Object.entries(json)) {
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    }

    // Verify key Turkish translations
    expect(json["To use Zotero you should get an API key."]).toContain("Zotero");
    expect(json["Search references by author, title or year"]).toContain("Referansları");
    expect(json["Insert Bibliography"]).toBe("Kaynakça Ekle");
    expect(json["Cancel"]).toBe("İptal");
    expect(json["Save"]).toBe("Kaydet");
    expect(json["Page"]).toBe("Sayfa");
  });
});
