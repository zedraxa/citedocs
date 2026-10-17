import { describe, it, expect } from "vitest";
import { Window } from "happy-dom";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const CSL = require("../../csl-engine/node_modules/citeproc/citeproc_commonjs.js");

const UPSTREAM_INDEX_HTML_SNIPPET = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Zotero</title>
    <link rel="stylesheet" href="https://onlyoffice.github.io/sdkjs-plugins/v1/plugins.css" />
    <link rel="stylesheet" href="dist/styles.css">
    <style id="componentsStyles"></style>
    <style id="pluginStyles"></style>
    <script src="https://onlyoffice.github.io/sdkjs-plugins/v1/plugins.js"></script>
    <script src="https://onlyoffice.github.io/sdkjs-plugins/v1/plugins-ui.js"></script>
    <script src="vendor/citeproc/citeproc_commonjs.js"></script>
    <script>
        if (typeof Promise === 'function' && typeof Promise.any === 'function') {
            document.write(
                '<script type="module" src="dist/bundle.modern.js"><\\/script>'
            );
        } else {
            document.write(
                '<script src="dist/bundle.es5.js"><\\/script>'
            );
        }
    </script>
</head>
<body id="body" spellcheck="false" class="noselect">
</body>
</html>`;

describe("ONLYOFFICE Zotero plugin HTML injection & citation engine regression", () => {
  it("runs patch-zotero-plugin.py on upstream snippet, produces valid HTML with unswallowed citeproc script tag, and matches gz", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "patch-test-"));
    try {
      const transDir = path.join(tmpDir, "translations");
      fs.mkdirSync(transDir, { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "dist"), { recursive: true });

      const repoRoot = path.resolve(__dirname, "../../..");
      const patchPy = path.join(repoRoot, "deploy/onlyoffice/patch-zotero-plugin.py");
      const trTrSource = path.join(repoRoot, "deploy/onlyoffice/zotero-translations/tr-TR.json");
      const hookSource = path.join(repoRoot, "deploy/onlyoffice/zotero-sync-hook.js");

      fs.copyFileSync(trTrSource, path.join(transDir, "tr-TR.json"));
      fs.copyFileSync(hookSource, path.join(tmpDir, "zotero-sync-hook.js"));
      fs.writeFileSync(path.join(transDir, "langs.json"), JSON.stringify(["en-US", "de-DE"], null, 2));
      fs.writeFileSync(path.join(tmpDir, "config.json"), JSON.stringify({ variations: [{ descriptionLocale: {} }] }, null, 2));
      fs.writeFileSync(path.join(tmpDir, "index.html"), UPSTREAM_INDEX_HTML_SNIPPET, "utf8");
      fs.writeFileSync(path.join(tmpDir, "dist/bundle.modern.js"), "r = new Z(t, e), i = new zt(", "utf8");

      // Execute patch script
      const stdout = execFileSync("python3", [patchPy, tmpDir], { encoding: "utf8" });
      expect(stdout).toContain("Zotero Turkish translation, sync hook and citeproc script tags installed and verified successfully.");

      // Verify raw file content
      const patchedIndex = fs.readFileSync(path.join(tmpDir, "index.html"), "utf8");
      expect(patchedIndex).toContain('<script src="zotero-sync-hook.js"></script>');
      expect(patchedIndex).toContain('<script src="vendor/citeproc/citeproc_commonjs.js"></script>');
      expect(patchedIndex).not.toContain("\\>");
      expect(patchedIndex).not.toContain("</script\\>");

      // Verify gzip decompression matches identical uncompressed content
      const gzPath = path.join(tmpDir, "index.html.gz");
      expect(fs.existsSync(gzPath)).toBe(true);
      const decompressed = zlib.gunzipSync(fs.readFileSync(gzPath)).toString("utf8");
      expect(decompressed).toBe(patchedIndex);

      // Verify parsing with HTML parser (parse5 if available, happy-dom DOM parser)
      let parse5: typeof import("parse5") | null = null;
      try {
        parse5 = await import("parse5");
      } catch {
        parse5 = null;
      }

      if (parse5) {
        const documentAst = parse5.parse(patchedIndex);
        expect(documentAst).toBeDefined();
      }

      // Verify DOM structure in Happy-DOM
      const win = new Window();
      win.document.write(patchedIndex);
      const scripts = Array.from(win.document.querySelectorAll("script"));
      const scriptSrcs = scripts.map((s) => s.getAttribute("src")).filter(Boolean);

      expect(scriptSrcs).toContain("zotero-sync-hook.js");
      expect(scriptSrcs).toContain("vendor/citeproc/citeproc_commonjs.js");

      const hookIdx = scriptSrcs.indexOf("zotero-sync-hook.js");
      const citeprocIdx = scriptSrcs.indexOf("vendor/citeproc/citeproc_commonjs.js");
      expect(hookIdx).toBeGreaterThan(-1);
      expect(citeprocIdx).toBe(hookIdx + 1);

      // Second run must be idempotent without duplicate injections
      const stdoutSecond = execFileSync("python3", [patchPy, tmpDir], { encoding: "utf8" });
      expect(stdoutSecond).toContain("successfully");

      const secondIndex = fs.readFileSync(path.join(tmpDir, "index.html"), "utf8");
      const countHook = (secondIndex.match(/<script src="zotero-sync-hook\.js"><\/script>/g) || []).length;
      expect(countHook).toBe(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("verifies corrupted backslash syntax swallows citeproc script tag in HTML parsers", () => {
    // The exact regression: escaping > produced <script src="zotero-sync-hook.js"\></script\>
    const corruptedHtml = `<head>
    <script src="zotero-sync-hook.js"\\></script\\>
    <script src="vendor/citeproc/citeproc_commonjs.js"></script>
</head>`;

    const win = new Window();
    win.document.write(corruptedHtml);
    const scripts = Array.from(win.document.querySelectorAll("script"));

    // In HTML5 parsers, the unclosed/invalid tag swallows the subsequent script
    expect(scripts.length).toBe(1);
    expect(scripts[0].outerHTML).toContain("vendor/citeproc/citeproc_commonjs.js");
  });

  it("formats citations successfully with CSL.Engine in APA 7th style and tr-TR locale", () => {
    const minimalApaCsl = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">
  <info>
    <title>APA 7th</title>
    <id>http://www.zotero.org/styles/apa</id>
    <category citation-format="author-date"/>
  </info>
  <citation et-al-min="3" et-al-use-first="1" disambiguate-add-year-suffix="true">
    <layout prefix="(" suffix=")" delimiter="; ">
      <group delimiter=", ">
        <names variable="author">
          <name form="short" and="symbol" delimiter=", " initialize-with=". "/>
        </names>
        <date variable="issued">
          <date-part name="year"/>
        </date>
      </group>
    </layout>
  </citation>
</style>`;

    const trLocale = `<?xml version="1.0" encoding="utf-8"?>
<locale xmlns="http://purl.org/net/xbiblio/csl" version="1.0" xml:lang="tr-TR">
  <terms>
    <term name="and">&amp;</term>
    <term name="et-al">ve ark.</term>
  </terms>
</locale>`;

    const sys = {
      retrieveLocale: (lang: string) => {
        if (lang === "tr-TR") return trLocale;
        return null;
      },
      retrieveItem: (id: string) => {
        if (id === "ITEM1") {
          return {
            id: "ITEM1",
            type: "book",
            title: "Örnek Çalışma",
            author: [{ family: "Kaya", given: "Mehmet" }],
            issued: { "date-parts": [[2024]] },
          };
        }
        return null;
      },
    };

    const engine = new CSL.Engine(sys, minimalApaCsl, "tr-TR", true);
    expect(engine).toBeDefined();

    engine.updateItems(["ITEM1"]);
    const cluster = engine.processCitationCluster(
      {
        citationItems: [{ id: "ITEM1" }],
        properties: { noteIndex: 0 },
      },
      [],
      [],
    );

    expect(cluster).toBeDefined();
    // cluster[1][0][1] contains the formatted citation string
    const formatted = cluster[1][0][1];
    expect(formatted).toBe("(Kaya, 2024)");
  });
});
