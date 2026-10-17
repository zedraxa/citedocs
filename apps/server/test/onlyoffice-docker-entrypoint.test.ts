import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("ONLYOFFICE Docker Entrypoint Script", () => {
  const scriptPath = fileURLToPath(
    new URL("../../../deploy/docker-entrypoint-onlyoffice.sh", import.meta.url),
  );

  it("creates local-production-linux.json with default autoAssembly settings", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oo-entrypoint-test-"));
    try {
      execFileSync(scriptPath, ["echo", "test-run"], {
        env: {
          ...process.env,
          CONF_DIR: tempDir,
        },
      });

      const overrideFile = path.join(tempDir, "local-production-linux.json");
      expect(fs.existsSync(overrideFile)).toBe(true);

      const parsed = JSON.parse(fs.readFileSync(overrideFile, "utf8"));
      expect(parsed.services.CoAuthoring.autoAssembly).toEqual({
        enable: true,
        interval: "1m",
        step: "1m",
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("merges custom OO_AUTOASSEMBLY_INTERVAL into existing local.json while preserving existing keys", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oo-entrypoint-test-"));
    try {
      const localJsonPath = path.join(tempDir, "local.json");
      const initialLocalJson = {
        services: {
          CoAuthoring: {
            token: { enable: { browser: true } },
            secret: { inbox: { string: "test-secret" } },
          },
        },
      };
      fs.writeFileSync(localJsonPath, JSON.stringify(initialLocalJson, null, 2), "utf8");

      execFileSync(scriptPath, ["echo", "test-run"], {
        env: {
          ...process.env,
          CONF_DIR: tempDir,
          OO_AUTOASSEMBLY_INTERVAL: "2m",
          OO_AUTOASSEMBLY_STEP: "30s",
        },
      });

      const updatedLocal = JSON.parse(fs.readFileSync(localJsonPath, "utf8"));
      // Existing token & secret preserved
      expect(updatedLocal.services.CoAuthoring.token.enable.browser).toBe(true);
      expect(updatedLocal.services.CoAuthoring.secret.inbox.string).toBe("test-secret");
      // autoAssembly merged
      expect(updatedLocal.services.CoAuthoring.autoAssembly).toEqual({
        enable: true,
        interval: "2m",
        step: "30s",
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
