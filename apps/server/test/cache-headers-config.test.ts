import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));

describe("Deploy cache-control header configurations", () => {
  const caddyfilePath = path.join(root, "deploy/Caddyfile");
  const caddyfileOOPath = path.join(root, "deploy/Caddyfile.onlyoffice");
  const nginxWebPath = path.join(root, "apps/web/nginx.conf");

  it("deploy/Caddyfile contains the required /oo/* cache-control rules", () => {
    expect(fs.existsSync(caddyfilePath)).toBe(true);
    const content = fs.readFileSync(caddyfilePath, "utf8");

    expect(content).toContain("handle_path /oo/*");
    expect(content).toContain("@versioned path_regexp ^/[0-9]+");
    expect(content).toContain("handle @versioned");
    expect(content).toContain("@no_cache path *.html *.json */translations/* /translations/* *zotero-sync-hook.js *api.js");
    expect(content).toContain('header_down Cache-Control "no-cache"');
  });

  it("deploy/Caddyfile.onlyoffice contains the required /oo/* cache-control rules", () => {
    expect(fs.existsSync(caddyfileOOPath)).toBe(true);
    const content = fs.readFileSync(caddyfileOOPath, "utf8");

    expect(content).toContain("handle_path /oo/*");
    expect(content).toContain("@versioned path_regexp ^/[0-9]+");
    expect(content).toContain("handle @versioned");
    expect(content).toContain("@no_cache path *.html *.json */translations/* /translations/* *zotero-sync-hook.js *api.js");
    expect(content).toContain('header_down Cache-Control "no-cache"');
  });

  it("validates Caddy syntax of both Caddyfiles using caddy CLI (host or docker)", () => {
    // Check if docker or caddy is available
    const hasDocker = spawnSync("docker", ["--version"]).status === 0;
    const hasCaddy = spawnSync("caddy", ["version"]).status === 0;

    if (hasCaddy) {
      const res1 = spawnSync("caddy", ["validate", "--config", caddyfilePath], { encoding: "utf8" });
      expect(res1.status, res1.stderr).toBe(0);
      const res2 = spawnSync("caddy", ["validate", "--config", caddyfileOOPath], { encoding: "utf8" });
      expect(res2.status, res2.stderr).toBe(0);
    } else if (hasDocker) {
      const res1 = spawnSync(
        "docker",
        ["run", "--rm", "-v", `${caddyfilePath}:/etc/caddy/Caddyfile:ro`, "caddy:2-alpine", "caddy", "validate", "--config", "/etc/caddy/Caddyfile"],
        { encoding: "utf8" },
      );
      expect(res1.status, res1.stderr).toBe(0);

      const res2 = spawnSync(
        "docker",
        ["run", "--rm", "-v", `${caddyfileOOPath}:/etc/caddy/Caddyfile:ro`, "caddy:2-alpine", "caddy", "validate", "--config", "/etc/caddy/Caddyfile"],
        { encoding: "utf8" },
      );
      expect(res2.status, res2.stderr).toBe(0);
    }
  });

  it("simulates URL path matching against Caddy rules", () => {
    // Helper that replicates Caddy handle_path /oo/* evaluation order
    function evaluateOoPath(requestPath: string): "versioned" | "no-cache" | "default" {
      // handle_path strips /oo
      const stripped = requestPath.replace(/^\/oo/, "");

      // 1. @versioned path_regexp ^/[0-9]+
      if (/^\/[0-9]+/.test(stripped)) {
        return "versioned";
      }

      // 2. @no_cache path *.html *.json */translations/* /translations/* *zotero-sync-hook.js *api.js
      if (
        stripped.endsWith(".html") ||
        stripped.endsWith(".json") ||
        stripped.includes("/translations/") ||
        stripped.endsWith("zotero-sync-hook.js") ||
        stripped.endsWith("api.js")
      ) {
        return "no-cache";
      }

      return "default";
    }

    // Required no-cache paths under /oo/
    expect(evaluateOoPath("/oo/sdkjs-plugins/zotero/index.html")).toBe("no-cache");
    expect(evaluateOoPath("/oo/sdkjs-plugins/zotero/config.json")).toBe("no-cache");
    expect(evaluateOoPath("/oo/sdkjs-plugins/zotero/zotero-sync-hook.js")).toBe("no-cache");
    expect(evaluateOoPath("/oo/sdkjs-plugins/zotero/translations/tr-TR.json")).toBe("no-cache");
    expect(evaluateOoPath("/oo/web-apps/apps/api/documents/api.js")).toBe("no-cache");
    expect(evaluateOoPath("/oo/api.js")).toBe("no-cache");
    expect(evaluateOoPath("/oo/sdkjs-plugins/zotero/resources/csl/styles.json")).toBe("no-cache");

    // Truly versioned paths stay long-lived immutable (versioned)
    expect(evaluateOoPath("/oo/10.0.0-123/web-apps/apps/documenteditor/main/app.js")).toBe("versioned");
    expect(evaluateOoPath("/oo/10.0.0-123/sdkjs/word/sdk-all.js")).toBe("versioned");
    expect(evaluateOoPath("/oo/10.0.0-123/web-apps/apps/documenteditor/main/resources/translations/en.json")).toBe("versioned");
    expect(evaluateOoPath("/oo/8.2.0-143/web-apps/apps/api/documents/api.js")).toBe("versioned");
  });

  it("apps/web/nginx.conf preserves immutable hashed assets and no-cache index.html", () => {
    expect(fs.existsSync(nginxWebPath)).toBe(true);
    const content = fs.readFileSync(nginxWebPath, "utf8");

    // /assets/ must remain immutable
    expect(content).toMatch(/location\s+\/assets\/\s*\{[^}]*add_header\s+Cache-Control\s+"public,\s+max-age=31536000,\s+immutable"/);

    // index.html / sw.js must remain no-cache
    expect(content).toMatch(/location\s+~\s+\^\/\(sw\\\.js\|service-worker\\\.js\|index\\\.html\)\$\s*\{[^}]*add_header\s+Cache-Control\s+"no-cache,\s+no-store,\s+must-revalidate"/);
  });
});
