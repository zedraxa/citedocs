import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getTableColumns, getTableName, isTable } from "drizzle-orm";
import * as schema from "../src/db/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, "..");
const drizzleDir = path.resolve(serverDir, "drizzle");

describe("Drizzle Database Migrations & Drift Detection", () => {
  it("has matching migration files and journal entries", () => {
    const journalPath = path.join(drizzleDir, "meta/_journal.json");
    expect(fs.existsSync(journalPath)).toBe(true);

    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
      version: string;
      dialect: string;
      entries: Array<{ idx: number; tag: string }>;
    };

    expect(journal.entries.length).toBeGreaterThanOrEqual(3);
    for (const entry of journal.entries) {
      const sqlFile = path.join(drizzleDir, `${entry.tag}.sql`);
      expect(fs.existsSync(sqlFile), `Migration SQL file ${entry.tag}.sql must exist`).toBe(true);
      const sqlContent = fs.readFileSync(sqlFile, "utf-8");
      expect(sqlContent.trim().length).toBeGreaterThan(0);
    }
  });

  it("ensures all schema tables and columns are tracked in the latest migration snapshot", () => {
    const journalPath = path.join(drizzleDir, "meta/_journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const latestEntry = journal.entries[journal.entries.length - 1];
    const snapshotIndexStr = String(latestEntry.idx).padStart(4, "0");
    const snapshotPath = path.join(drizzleDir, `meta/${snapshotIndexStr}_snapshot.json`);

    expect(fs.existsSync(snapshotPath), `Latest snapshot ${snapshotPath} must exist`).toBe(true);
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8")) as {
      tables: Record<string, { name: string; columns: Record<string, { name: string }> }>;
    };

    const snapshotTableNames = new Set(
      Object.values(snapshot.tables).map((t) => t.name)
    );

    // Extract all Drizzle tables from schema exports
    const schemaTables = Object.entries(schema)
      .filter(([_, val]) => isTable(val))
      .map(([_, val]) => val);

    expect(schemaTables.length).toBeGreaterThan(0);

    for (const table of schemaTables) {
      const tableName = getTableName(table);
      expect(
        snapshotTableNames.has(tableName),
        `Table "${tableName}" from schema.ts is missing from the latest migration snapshot! Run "pnpm --filter @citedocs/server db:generate".`
      ).toBe(true);

      // Find snapshot table
      const snapTable = Object.values(snapshot.tables).find((t) => t.name === tableName);
      expect(snapTable).toBeDefined();

      const schemaCols = getTableColumns(table);
      for (const [_, col] of Object.entries(schemaCols)) {
        const colName = col.name;
        expect(
          snapTable!.columns[colName],
          `Column "${tableName}.${colName}" from schema.ts is missing from migration snapshot! Run "pnpm --filter @citedocs/server db:generate".`
        ).toBeDefined();
      }
    }
  });

  it("verifies zero drift between schema and migrations via drizzle-kit generate", () => {
    // Relative directory inside serverDir so drizzle-kit's path prefixing works
    const relTmp = `.drift-check-${Date.now()}`;
    const tmpDir = path.resolve(serverDir, relTmp);

    try {
      fs.cpSync(drizzleDir, tmpDir, { recursive: true });

      // Run drizzle-kit generate targeting the temp folder
      const output = execSync(
        `pnpm exec drizzle-kit generate --schema ./src/db/schema.ts --dialect postgresql --out ./${relTmp}`,
        {
          cwd: serverDir,
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
        }
      );

      expect(
        output,
        "Drizzle schema has drifted from migrations! New migration was generated when none was expected."
      ).toContain("No schema changes, nothing to migrate");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
