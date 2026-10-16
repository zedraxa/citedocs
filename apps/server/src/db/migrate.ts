import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, closeDb } from "./client.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  const db = getDb();
  const migrationsFolder = path.resolve(__dirname, "../../drizzle");
  console.log(`Running migrations from ${migrationsFolder}...`);
  await migrate(db, { migrationsFolder });
  try {
    const { sql } = await import("drizzle-orm");
    await db.execute(
      sql`INSERT INTO users (id, email, display_name)
          VALUES ('00000000-0000-0000-0000-000000000001', 'demo@citedocs.local', 'Demo Student')
          ON CONFLICT (id) DO NOTHING;`
    );
  } catch {
    // Non-fatal if table not created or user already exists
  }
  console.log("Migrations applied successfully.");
}

if (process.env.NODE_ENV !== "test" && import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(async () => {
      await closeDb();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("Migration failed:", err);
      await closeDb();
      process.exit(1);
    });
}
