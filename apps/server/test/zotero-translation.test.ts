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

  describe("Dockerfile Translation Installation Step", () => {
    const dockerfilePath = path.resolve(__dirname, "../../../deploy/onlyoffice.Dockerfile");

    it("statically verifies that the translation step uses python3, omits || true, and regenerates .gz files", () => {
      expect(fs.existsSync(dockerfilePath)).toBe(true);
      const dockerfile = fs.readFileSync(dockerfilePath, "utf8");

      // Extract the Zotero translation install block: from the COPY line up to
      // the end of the following RUN instruction (stop at the next top-level
      // Dockerfile instruction or comment line after the RUN python3 block).
      const startIndex = dockerfile.indexOf("COPY deploy/onlyoffice/zotero-translations/tr-TR.json");
      expect(startIndex).toBeGreaterThan(-1);
      const afterCopy = dockerfile.slice(startIndex);

      const runIndex = afterCopy.indexOf("RUN python3");
      expect(runIndex).toBeGreaterThan(-1);

      const nextStepMatch = afterCopy.slice(runIndex).match(/\n(?=[A-Z]+ |#)/);
      const translationStep = nextStepMatch
        ? afterCopy.slice(0, runIndex + nextStepMatch.index)
        : afterCopy;

      // 1. Must use python3, never node or jq
      expect(translationStep).toContain("python3");
      expect(translationStep).not.toContain("node ");
      expect(translationStep).not.toContain("jq ");

      // 2. Must FAIL the build if something is wrong: no `|| true`, no `2>/dev/null`
      expect(translationStep).not.toContain("|| true");
      expect(translationStep).not.toContain("2>/dev/null");

      // 3. Must update langs.json and config.json
      expect(translationStep).toContain("langs.json");
      expect(translationStep).toContain("config.json");
      expect(translationStep).toContain("tr-TR");
      expect(translationStep).toContain("nameLocale");
      expect(translationStep).toContain("descriptionLocale");

      // 4. Must regenerate .gz files for gzip_static
      expect(translationStep).toContain(".gz");
      expect(translationStep).toContain("make_gz");
      expect(translationStep).toContain("langs.json.gz");
      expect(translationStep).toContain("tr-TR.json.gz");
      expect(translationStep).toContain("tr.json.gz");
      expect(translationStep).toContain("gzip");

      // 5. Must include build-time assertion
      expect(translationStep).toContain("assert");
      expect(translationStep).toMatch(/assert.*tr-TR.*in/);
      expect(translationStep).toMatch(/assert.*dec\s*==\s*raw_langs/);
    });

    it("sanity checks that the python script executes successfully on a mock directory and is idempotent", async () => {
      const { execSync } = await import("node:child_process");
      const os = await import("node:os");
      const zlib = await import("node:zlib");

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zotero-test-"));
      try {
        const transDir = path.join(tmpDir, "translations");
        fs.mkdirSync(transDir, { recursive: true });

        const langsPath = path.join(transDir, "langs.json");
        fs.writeFileSync(langsPath, JSON.stringify(["cs-CS", "de-DE"], null, 2));
        fs.writeFileSync(langsPath + ".gz", zlib.gzipSync(Buffer.from("old langs")));

        const cfgPath = path.join(tmpDir, "config.json");
        fs.writeFileSync(
          cfgPath,
          JSON.stringify(
            {
              name: "Zotero",
              variations: [{ description: "Desc", descriptionLocale: { ru: "Ru" } }]
            },
            null,
            2
          )
        );
        fs.writeFileSync(cfgPath + ".gz", zlib.gzipSync(Buffer.from("old config")));

        const trTrPath = path.join(transDir, "tr-TR.json");
        fs.copyFileSync(trPath, trTrPath);

        // Run python snippet pointing to tmpDir
        const pyScript = `
import gzip, json, os, shutil
base = r"${tmpDir}"
trans_dir = os.path.join(base, "translations")
langs_file = os.path.join(trans_dir, "langs.json")
cfg_file = os.path.join(base, "config.json")
tr_tr_file = os.path.join(trans_dir, "tr-TR.json")
tr_file = os.path.join(trans_dir, "tr.json")

if not os.path.isfile(langs_file): raise FileNotFoundError(langs_file)
if not os.path.isfile(cfg_file): raise FileNotFoundError(cfg_file)
if not os.path.isfile(tr_tr_file): raise FileNotFoundError(tr_tr_file)

shutil.copyfile(tr_tr_file, tr_file)
with open(langs_file, "r", encoding="utf-8") as f: langs = json.load(f)
if "tr-TR" not in langs: langs.append("tr-TR")
with open(langs_file, "w", encoding="utf-8") as f:
    json.dump(langs, f, indent=2, ensure_ascii=False)
    f.write("\\n")

with open(cfg_file, "r", encoding="utf-8") as f: cfg = json.load(f)
cfg.setdefault("nameLocale", {})["tr"] = "Zotero"
for var in cfg.get("variations", []):
    if "descriptionLocale" in var and isinstance(var["descriptionLocale"], dict):
        var["descriptionLocale"]["tr"] = "Zotero servisini kullanarak gerekli stilde kaynakçalar oluşturun."
with open(cfg_file, "w", encoding="utf-8") as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)
    f.write("\\n")

def make_gz(p):
    with open(p, "rb") as fin: data = fin.read()
    with gzip.open(p + ".gz", "wb", compresslevel=9) as fout: fout.write(data)

make_gz(langs_file)
make_gz(tr_tr_file)
make_gz(tr_file)
if os.path.isfile(cfg_file + ".gz"): make_gz(cfg_file)

st = os.stat(langs_file)
targets = [langs_file, langs_file + ".gz", tr_tr_file, tr_tr_file + ".gz", tr_file, tr_file + ".gz", cfg_file]
if os.path.isfile(cfg_file + ".gz"): targets.append(cfg_file + ".gz")
for t in targets:
    os.chmod(t, 0o644)
    try: os.chown(t, st.st_uid, st.st_gid)
    except PermissionError: pass

with open(langs_file, "r", encoding="utf-8") as f: raw_langs = f.read()
assert "tr-TR" in json.loads(raw_langs)
assert os.path.isfile(langs_file + ".gz")
with gzip.open(langs_file + ".gz", "rt", encoding="utf-8") as f: dec = f.read()
assert dec == raw_langs
assert os.path.isfile(tr_tr_file + ".gz")
assert os.path.isfile(tr_file + ".gz")
`;

        // Execute once
        expect(() => execSync(`python3 -c '${pyScript.replace(/'/g, `'\\''`)}'`, { stdio: "pipe" })).not.toThrow();

        // Check updated contents
        const updatedLangs = JSON.parse(fs.readFileSync(langsPath, "utf8"));
        expect(updatedLangs).toContain("tr-TR");

        const decompressedLangs = zlib.gunzipSync(fs.readFileSync(langsPath + ".gz")).toString("utf8");
        expect(decompressedLangs).toBe(fs.readFileSync(langsPath, "utf8"));

        const updatedCfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
        expect(updatedCfg.nameLocale.tr).toBe("Zotero");
        expect(updatedCfg.variations[0].descriptionLocale.tr).toBe(
          "Zotero servisini kullanarak gerekli stilde kaynakçalar oluşturun."
        );

        const decompressedCfg = zlib.gunzipSync(fs.readFileSync(cfgPath + ".gz")).toString("utf8");
        expect(decompressedCfg).toBe(fs.readFileSync(cfgPath, "utf8"));

        expect(fs.existsSync(path.join(transDir, "tr.json"))).toBe(true);
        expect(fs.existsSync(path.join(transDir, "tr.json.gz"))).toBe(true);
        expect(fs.existsSync(path.join(transDir, "tr-TR.json.gz"))).toBe(true);

        // Run second time to verify idempotency
        expect(() => execSync(`python3 -c '${pyScript.replace(/'/g, `'\\''`)}'`, { stdio: "pipe" })).not.toThrow();
        const secondLangs = JSON.parse(fs.readFileSync(langsPath, "utf8"));
        expect(secondLangs.filter((l: string) => l === "tr-TR").length).toBe(1);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});


