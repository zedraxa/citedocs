import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  symlinkSync,
  utimesSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const temps: string[] = [];
afterEach(() => temps.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "capacity-"));
  temps.push(dir);
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  const command = (name: string, body: string) =>
    writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  command(
    "df",
    'echo "Filesystem blocks used available capacity mounted"; echo "fake 100 10 90 ${FAKE_DISK:-10}% /"',
  );
  command("curl", 'echo sent >> "$TEST_DIR/webhook"; exit "${CURL_FAIL:-0}"');
  command("supervisorctl", 'echo "$2 ${SERVICE_STATE:-STOPPED}"');
  command(
    "docker",
    `
echo "$*" >> "$TEST_DIR/docker-calls"
[ "\${DOCKER_FAIL:-0}" = 0 ] || exit 1
case "$1 $2" in
  'ps -aq') echo abc;;
  'inspect --format') echo "/test \${FAKE_RESTARTS:-0} running false";;
  'exec -i') sed "s@/var/lib/onlyoffice/documentserver/App_Data/cache/files@$TEST_DIR/cache@g" | sh -s -- "$7" "$8" "$9";;
  'exec citedocs-onlyoffice') echo "\${FAKE_CACHE_KB:-0} cache";;
esac`,
  );
  const mem = path.join(dir, "meminfo");
  writeFileSync(mem, "MemAvailable: 2097152 kB\nSwapTotal: 4194304 kB\nSwapFree: 4194304 kB\n");
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    TEST_DIR: dir,
    MEMINFO_PATH: mem,
    CAPACITY_WEBHOOK_URL: "",
    CHECK_PATHS: "/",
  };
  function run(script: string, args: string[] = [], extra: Record<string, string> = {}) {
    return spawnSync("sh", [path.join(root, "deploy/ops", script), ...args], {
      env: { ...env, ...extra },
      encoding: "utf8",
    });
  }
  return { dir, mem, run };
}

describe("capacity operations", () => {
  it.each([
    [79, 0],
    [80, 1],
    [89, 1],
    [90, 2],
  ])("disk/inode %i => %i", (value, code) => {
    const { run } = fixture();
    expect(run("check-capacity.sh", [], { FAKE_DISK: String(value) }).status).toBe(code);
  });
  it("honors configured thresholds and rejects invalid settings", () => {
    const { run } = fixture();
    expect(run("check-capacity.sh", [], { FAKE_DISK: "60", DISK_WARN: "60" }).status).toBe(1);
    expect(run("check-capacity.sh", [], { DISK_WARN: "oops" }).status).toBe(2);
    expect(run("check-capacity.sh", [], { DISK_WARN: "95" }).status).toBe(2);
  });
  it("detects memory, swap, restarts and missing Docker", () => {
    const { run, mem } = fixture();
    expect(run("check-capacity.sh", [], { FAKE_RESTARTS: "1" }).status).toBe(1);
    expect(run("check-capacity.sh", [], { FAKE_RESTARTS: "3" }).status).toBe(2);
    expect(run("check-capacity.sh", [], { DOCKER_FAIL: "1" }).status).toBe(2);
    writeFileSync(mem, "MemAvailable: 393216 kB\nSwapTotal: 4096 kB\nSwapFree: 2048 kB\n");
    const result = run("check-capacity.sh");
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("Kullanılabilir RAM MiB yetersiz");
    expect(result.stdout).toContain("Swap kullanım % eşik aşıldı");
  });
  it("checks cache thresholds", () => {
    const { run } = fixture();
    expect(run("check-capacity.sh", [], { FAKE_CACHE_KB: "5242880" }).status).toBe(1);
    expect(run("check-capacity.sh", [], { FAKE_CACHE_KB: "10485760" }).status).toBe(2);
  });
  it("posts only alarms and reports delivery failures", () => {
    const { run, dir } = fixture();
    const env = { CAPACITY_WEBHOOK_URL: "https://example.invalid/secret" };
    expect(run("check-capacity.sh", [], env).status).toBe(0);
    expect(existsSync(path.join(dir, "webhook"))).toBe(false);
    const result = run("check-capacity.sh", [], { ...env, FAKE_DISK: "80", CURL_FAIL: "1" });
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("Webhook gönderilemedi");
    expect(result.stdout).not.toContain("secret");
  });
  it("dry-run preserves files; apply requires stopped writers and protects fresh trees/forgotten", () => {
    const { run, dir } = fixture();
    for (const name of ["data/old", "data/mixed", "forgotten/old"]) {
      const folder = path.join(dir, "cache", name);
      mkdirSync(folder, { recursive: true });
      writeFileSync(path.join(folder, "old.docx"), "student work");
      const old = new Date(Date.now() - 40 * 86400000);
      utimesSync(path.join(folder, "old.docx"), old, old);
      utimesSync(folder, old, old);
    }
    writeFileSync(path.join(dir, "cache/data/mixed/new.docx"), "active");
    symlinkSync(path.join(dir, "cache/forgotten/old"), path.join(dir, "cache/data/link"));
    const oldFile = path.join(dir, "cache/data/old/old.docx");
    const preview = run("cleanup.sh");
    expect(preview.status, preview.stderr).toBe(0);
    expect(preview.stdout).toContain(oldFile);
    expect(existsSync(oldFile)).toBe(true);
    expect(readFileSync(path.join(dir, "docker-calls"), "utf8")).not.toContain("prune");
    expect(run("cleanup.sh", ["--apply"]).status).toBe(2);
    expect(
      run("cleanup.sh", ["--apply"], { MAINTENANCE_CONFIRMED: "yes", SERVICE_STATE: "RUNNING" })
        .status,
    ).toBe(2);
    expect(existsSync(oldFile)).toBe(true);
    const applied = run("cleanup.sh", ["--apply"], { MAINTENANCE_CONFIRMED: "yes" });
    expect(applied.status, applied.stderr).toBe(0);
    expect(existsSync(oldFile)).toBe(false);
    expect(existsSync(path.join(dir, "cache/data/mixed/old.docx"))).toBe(true);
    expect(existsSync(path.join(dir, "cache/forgotten/old/old.docx"))).toBe(true);
    expect(
      run("cleanup.sh", ["--apply", "--include-forgotten"], { MAINTENANCE_CONFIRMED: "yes" })
        .status,
    ).toBe(2);
  });
});
