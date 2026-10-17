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

  it("aborts cleanly when estimated backup space exceeds available disk space", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-est-space-abort-"));
    try {
      // Simulate estimated 500 GB database on local disk
      let errorStderr = "";
      try {
        execFileSync(
          backupScript,
          [
            "--backup-dir",
            tempDir,
            "--estimated-db-mb",
            "500000",
            "--estimated-objects-mb",
            "100000",
            "--disk-reserve-percent",
            "20",
          ],
          { stdio: "pipe", encoding: "utf8" },
        );
      } catch (err: unknown) {
        const error = err as { stderr?: string | Buffer; stdout?: string | Buffer; message?: string };
        errorStderr = String(error.stderr || "") + String(error.stdout || "") + String(error.message || "");
      }

      expect(errorStderr).toContain("Insufficient disk space on target filesystem");
      expect(errorStderr).toContain("Calculation breakdown: staging S=");
      expect(errorStderr).toContain("archive A=");
      expect(errorStderr).toContain("disk reserve=");
      expect(errorStderr).toContain("Refusing to proceed with backup to protect system stability");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("detects and cleans stale staging directories and partial archives on start", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-stale-cleanup-"));
    try {
      // Create stale staging dir
      const staleStage = path.join(tempDir, ".staging_stale123");
      fs.mkdirSync(staleStage, { recursive: true });
      fs.writeFileSync(path.join(staleStage, "postgres.dump"), "old dump");

      // Create stale partial archive
      const stalePartial = path.join(tempDir, "citedocs-backup-broken.tar.gz.tmp");
      fs.writeFileSync(stalePartial, "partial tar content");

      // Create corrupted 0-byte or non-tar archive
      const corruptArchive = path.join(tempDir, "citedocs-backup-corrupt.tar.gz");
      fs.writeFileSync(corruptArchive, "not a valid gzip tarball");

      // Create a valid archive that should NOT be cleaned
      const validArchive = path.join(tempDir, "citedocs-backup-20261017_010000.tar.gz");
      const validStage = path.join(tempDir, "valid_stage");
      fs.mkdirSync(validStage);
      fs.writeFileSync(path.join(validStage, "postgres.dump"), "valid");
      execFileSync("tar", ["-czf", validArchive, "-C", validStage, "."]);
      fs.rmSync(validStage, { recursive: true, force: true });

      // Run backup script with high min-free-mb so it cleans stale files on start then aborts
      let output = "";
      try {
        output = execFileSync(
          backupScript,
          ["--backup-dir", tempDir, "--min-free-mb", "999999999"],
          { encoding: "utf8", stdio: "pipe" },
        );
      } catch (err: unknown) {
        const error = err as { stderr?: string | Buffer; stdout?: string | Buffer };
        output = String(error.stdout || "") + String(error.stderr || "");
      }

      // Assert stale items were detected and cleaned
      expect(output).toContain("Cleaning stale staging workspace from earlier run: .staging_stale123");
      expect(output).toContain("Cleaning stale partial archive file from earlier run: citedocs-backup-broken.tar.gz.tmp");
      expect(output).toContain("Cleaning corrupted/truncated archive from earlier run: citedocs-backup-corrupt.tar.gz");

      expect(fs.existsSync(staleStage)).toBe(false);
      expect(fs.existsSync(stalePartial)).toBe(false);
      expect(fs.existsSync(corruptArchive)).toBe(false);

      // Valid archive must be preserved
      expect(fs.existsSync(validArchive)).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("cleans staging workspace on failure via exit trap without leaving partial artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-trap-fail-"));
    const mockBinDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-mock-bin-"));
    try {
      // Mock docker command that deliberately fails on pg_dump
      const mockDocker = path.join(mockBinDir, "docker");
      fs.writeFileSync(
        mockDocker,
        `#!/bin/sh
if echo "$*" | grep -q "pg_dump"; then
  echo "Simulated pg_dump database crash" >&2
  exit 137
fi
exit 0
`,
        { mode: 0o755 },
      );

      let failed = false;
      try {
        execFileSync(
          backupScript,
          ["--backup-dir", tempDir, "--min-free-mb", "10", "--disk-reserve-percent", "0"],
          {
            env: {
              ...process.env,
              PATH: `${mockBinDir}:${process.env.PATH}`,
            },
            stdio: "pipe",
            encoding: "utf8",
          },
        );
      } catch (err: unknown) {
        failed = true;
        const error = err as { stderr?: string | Buffer; stdout?: string | Buffer };
        const errOut = String(error.stderr || "") + String(error.stdout || "");
        expect(errOut).toContain("Backup failed with exit code");
      }

      expect(failed).toBe(true);

      // Verify no staging directory was left behind in tempDir
      const remainingFiles = fs.readdirSync(tempDir);
      const stagingDirs = remainingFiles.filter((f) => f.startsWith(".staging_"));
      expect(stagingDirs.length).toBe(0);

      // Verify no partial tar archive was left behind
      const partialArchives = remainingFiles.filter((f) => f.endsWith(".tar.gz"));
      expect(partialArchives.length).toBe(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(mockBinDir, { recursive: true, force: true });
    }
  });

  it("successfully creates backup, logs archive size and duration, and cleans staging on success", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-success-run-"));
    const mockBinDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-mock-bin-"));
    try {
      // Mock docker: returns valid pg_dump bytes
      const mockDocker = path.join(mockBinDir, "docker");
      fs.writeFileSync(
        mockDocker,
        `#!/bin/sh
if echo "$*" | grep -q "pg_dump"; then
  printf "MOCK_CUSTOM_PG_DUMP_HEADER_AND_RECORDS"
  exit 0
fi
exit 0
`,
        { mode: 0o755 },
      );

      // Mock aws: handles s3 sync
      const mockAws = path.join(mockBinDir, "aws");
      fs.writeFileSync(
        mockAws,
        `#!/bin/sh
if [ "$1" = "s3" ] && [ "$2" = "sync" ]; then
  dest="$4"
  mkdir -p "$dest"
  echo "thesis doc content" > "$dest/tez.docx"
  exit 0
fi
exit 0
`,
        { mode: 0o755 },
      );

      const output = execFileSync(
        backupScript,
        [
          "--backup-dir",
          tempDir,
          "--min-free-mb",
          "10",
          "--disk-reserve-percent",
          "0",
          "--estimated-db-mb",
          "1",
          "--estimated-objects-mb",
          "1",
        ],
        {
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          encoding: "utf8",
        },
      );

      // Check log output for size, bytes and duration
      expect(output).toContain("Backup archive successfully created:");
      expect(output).toMatch(/Backup archive successfully created: citedocs-backup-.* \(\d+.* \/ \d+ bytes\)/);
      expect(output).toMatch(/CiteDocs backup process finished successfully in \d+s/);
      expect(output).toContain("Staging workspace cleaned up.");

      // Check produced files
      const files = fs.readdirSync(tempDir);
      const archives = files.filter((f) => f.endsWith(".tar.gz"));
      expect(archives.length).toBe(1);
      const shaFiles = files.filter((f) => f.endsWith(".tar.gz.sha256"));
      expect(shaFiles.length).toBe(1);

      // Verify no staging dir remained
      const stagingDirs = files.filter((f) => f.startsWith(".staging_"));
      expect(stagingDirs.length).toBe(0);

      // Verify restore --dry-run works on the produced archive!
      const archivePath = path.join(tempDir, archives[0]);
      const restoreOutput = execFileSync(
        restoreScript,
        ["--archive", archivePath, "--dry-run"],
        { encoding: "utf8" },
      );
      expect(restoreOutput).toContain("CITEDOCS RESTORE PLAN (DRY-RUN)");
      expect(restoreOutput).toContain(archives[0]);
      expect(restoreOutput).toContain("DRY-RUN COMPLETE. No data was modified on the database or storage.");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(mockBinDir, { recursive: true, force: true });
    }
  });

  it("enforces retention counts and KEEP_LOCAL_AFTER_UPLOAD post-upload policy", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-retention-test-"));
    const mockBinDir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-mock-bin-"));
    try {
      // Create 5 fake archives with distinct timestamps
      const timestamps = [
        "20261010_033000",
        "20261011_033000",
        "20261012_033000",
        "20261013_033000",
        "20261014_033000",
      ];
      for (const ts of timestamps) {
        const arch = path.join(tempDir, `citedocs-backup-${ts}.tar.gz`);
        const st = path.join(tempDir, `st_${ts}`);
        fs.mkdirSync(st, { recursive: true });
        fs.writeFileSync(path.join(st, "postgres.dump"), `dump-${ts}`);
        execFileSync("tar", ["-czf", arch, "-C", st, "."]);
        fs.writeFileSync(`${arch}.sha256`, `fake-sha256-${ts} ${arch}\n`);
        fs.rmSync(st, { recursive: true, force: true });
      }

      // Mock docker and aws
      const mockDocker = path.join(mockBinDir, "docker");
      fs.writeFileSync(
        mockDocker,
        `#!/bin/sh
if echo "$*" | grep -q "pg_dump"; then
  printf "NEW_DUMP_BYTES"
  exit 0
fi
exit 0
`,
        { mode: 0o755 },
      );

      const mockAws = path.join(mockBinDir, "aws");
      fs.writeFileSync(
        mockAws,
        `#!/bin/sh
if [ "$1" = "s3" ] && [ "$2" = "sync" ]; then
  dest="$4"
  mkdir -p "$dest"
  echo "doc" > "$dest/file.docx"
  exit 0
fi
if [ "$1" = "s3" ] && [ "$2" = "cp" ]; then
  # S3 upload succeeds!
  exit 0
fi
exit 0
`,
        { mode: 0o755 },
      );

      // Run backup with S3 upload and KEEP_LOCAL_AFTER_UPLOAD=2
      const output = execFileSync(
        backupScript,
        [
          "--backup-dir",
          tempDir,
          "--s3-uri",
          "s3://fake-remote-bucket/backups",
          "--keep-local-after-upload",
          "2",
          "--min-free-mb",
          "10",
          "--disk-reserve-percent",
          "0",
          "--estimated-db-mb",
          "1",
          "--estimated-objects-mb",
          "1",
        ],
        {
          env: {
            ...process.env,
            PATH: `${mockBinDir}:${process.env.PATH}`,
          },
          encoding: "utf8",
        },
      );

      expect(output).toContain("Off-server S3 upload completed successfully.");
      expect(output).toContain("Applying post-upload local retention (keeping 2 most recent local archives)...");
      expect(output).toContain("Post-upload retention complete");

      // Verify that exactly 2 archives remain locally
      const remainingArchives = fs.readdirSync(tempDir).filter((f) => f.endsWith(".tar.gz"));
      expect(remainingArchives.length).toBe(2);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(mockBinDir, { recursive: true, force: true });
    }
  });
});
