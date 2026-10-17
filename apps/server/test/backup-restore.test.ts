import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("CiteDocs Backup & Restore Tooling", () => {
  const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
  const backupScript = path.join(rootDir, "deploy/backup/citedocs-backup.sh");
  const restoreScript = path.join(rootDir, "deploy/backup/citedocs-restore.sh");
  const testScript = path.join(rootDir, "deploy/backup/test/test-backup-restore.sh");
  const cronFile = path.join(rootDir, "deploy/backup/citedocs-backup.cron");
  const serviceFile = path.join(rootDir, "deploy/backup/citedocs-backup.service");
  const timerFile = path.join(rootDir, "deploy/backup/citedocs-backup.timer");

  it("passes shellcheck analysis on all backup shell scripts", () => {
    // If shellcheck is available in PATH, assert 0 warnings and 0 errors
    let shellcheckPath: string | null = null;
    try {
      shellcheckPath = execFileSync("which", ["shellcheck"], { encoding: "utf8" }).trim();
    } catch {
      // not available
    }

    if (!shellcheckPath) {
      // Shellcheck is not installed; test passes conditionally
      return;
    }

    const scripts = [backupScript, restoreScript, testScript];
    for (const script of scripts) {
      expect(fs.existsSync(script)).toBe(true);
      const result = execFileSync("shellcheck", [script], { encoding: "utf8" });
      expect(result).toBe("");
    }
  });

  it("displays help and exits 0 for citedocs-backup.sh --help", () => {
    const output = execFileSync(backupScript, ["--help"], { encoding: "utf8" });
    expect(output).toContain("CiteDocs Production Backup Tool");
    expect(output).toContain("--env-file");
    expect(output).toContain("--backup-dir");
    expect(output).toContain("--min-free-mb");
    expect(output).toContain("--retention-daily");
  });

  it("displays help and exits 0 for citedocs-restore.sh --help", () => {
    const output = execFileSync(restoreScript, ["--help"], { encoding: "utf8" });
    expect(output).toContain("CiteDocs Production Restore Tool");
    expect(output).toContain("--archive");
    expect(output).toContain("--dry-run");
    expect(output).toContain("--verify");
    expect(output).toContain("--yes");
  });

  it("exits non-zero on unknown arguments", () => {
    expect(() => {
      execFileSync(backupScript, ["--unknown-arg-xyz"], { stdio: "pipe" });
    }).toThrow();

    expect(() => {
      execFileSync(restoreScript, ["--unknown-arg-xyz"], { stdio: "pipe" });
    }).toThrow();
  });

  it("refuses to run backup when free disk space is below required threshold", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-backup-disk-test-"));
    try {
      // Require an impossibly huge amount of free disk space (e.g. 999,999,999 MB ≈ 1 PB)
      expect(() => {
        execFileSync(
          backupScript,
          ["--backup-dir", tempDir, "--min-free-mb", "999999999"],
          { stdio: "pipe" },
        );
      }).toThrow();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("aborts restore in non-interactive mode when missing confirmation flag", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-restore-confirm-test-"));
    try {
      const mockArchive = path.join(tempDir, "citedocs-backup-mock.tar.gz");
      fs.writeFileSync(mockArchive, "mock content");

      expect(() => {
        execFileSync(restoreScript, ["--archive", mockArchive], { stdio: "pipe" });
      }).toThrow();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("inspects synthetic backup archive and succeeds in --dry-run mode", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-dryrun-test-"));
    const stageDir = path.join(tempDir, "staging");
    fs.mkdirSync(path.join(stageDir, "storage/citedocs-documents"), { recursive: true });
    fs.mkdirSync(path.join(stageDir, "storage/citedocs-attachments"), { recursive: true });

    try {
      fs.writeFileSync(path.join(stageDir, "postgres.dump"), "mock-pg-dump-binary-data");
      fs.writeFileSync(path.join(stageDir, "storage/citedocs-documents/sample.docx"), "sample docx data");
      fs.writeFileSync(path.join(stageDir, "storage/citedocs-attachments/sample.pdf"), "sample pdf data");
      fs.writeFileSync(
        path.join(stageDir, "metadata.json"),
        JSON.stringify(
          {
            timestamp: "20261017_033000",
            backup_version: "1.0",
            database: { db: "citedocs", user: "citedocs" },
            storage: { total_objects: 2 },
          },
          null,
          2,
        ),
      );

      // Generate sha256sums.txt
      execFileSync("sh", [
        "-c",
        `cd "${stageDir}" && sha256sum postgres.dump metadata.json storage/citedocs-documents/sample.docx storage/citedocs-attachments/sample.pdf > sha256sums.txt`,
      ]);

      const archivePath = path.join(tempDir, "citedocs-backup-synthetic.tar.gz");
      execFileSync("tar", ["-czf", archivePath, "-C", stageDir, "."]);

      const dryRunOutput = execFileSync(
        restoreScript,
        ["--archive", archivePath, "--dry-run"],
        { encoding: "utf8" },
      );

      expect(dryRunOutput).toContain("CITEDOCS RESTORE PLAN (DRY-RUN)");
      expect(dryRunOutput).toContain("citedocs-backup-synthetic.tar.gz");
      expect(dryRunOutput).toContain("postgres.dump");
      expect(dryRunOutput).toContain("citedocs-documents");
      expect(dryRunOutput).toContain("citedocs-attachments");
      expect(dryRunOutput).toContain("DRY-RUN COMPLETE. No data was modified on the database or storage.");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("detects corrupted archive checksums and refuses to restore", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-corrupt-test-"));
    const stageDir = path.join(tempDir, "staging");
    fs.mkdirSync(stageDir, { recursive: true });

    try {
      fs.writeFileSync(path.join(stageDir, "postgres.dump"), "valid dump content");
      fs.writeFileSync(path.join(stageDir, "sha256sums.txt"), "0000000000000000000000000000000000000000000000000000000000000000  ./postgres.dump\n");

      const archivePath = path.join(tempDir, "citedocs-backup-corrupted.tar.gz");
      execFileSync("tar", ["-czf", archivePath, "-C", stageDir, "."]);

      expect(() => {
        execFileSync(restoreScript, ["--archive", archivePath, "--dry-run"], { stdio: "pipe" });
      }).toThrow();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("validates citedocs-backup.cron scheduling and configuration", () => {
    expect(fs.existsSync(cronFile)).toBe(true);
    const content = fs.readFileSync(cronFile, "utf8");
    expect(content).toContain("CRON_TZ=Europe/Istanbul");
    // Daily at 03:30 Europe/Istanbul
    expect(content).toMatch(/30\s+3\s+\*\s+\*\s+\*\s+root\s+\/opt\/citedocs\/deploy\/backup\/citedocs-backup\.sh/);
  });

  it("validates systemd backup service and timer configuration", () => {
    expect(fs.existsSync(serviceFile)).toBe(true);
    expect(fs.existsSync(timerFile)).toBe(true);

    const serviceContent = fs.readFileSync(serviceFile, "utf8");
    expect(serviceContent).toContain("Type=oneshot");
    expect(serviceContent).toContain("ExecStart=/opt/citedocs/deploy/backup/citedocs-backup.sh");
    expect(serviceContent).toContain("WorkingDirectory=/opt/citedocs");

    const timerContent = fs.readFileSync(timerFile, "utf8");
    expect(timerContent).toContain("OnCalendar=*-*-* 03:30:00 Europe/Istanbul");
    expect(timerContent).toContain("Persistent=true");
  });
});
