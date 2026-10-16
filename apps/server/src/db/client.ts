import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const { Pool } = pg;

export type CitedocsDb = NodePgDatabase<typeof schema>;

let pool: pg.Pool | null = null;
let dbInstance: CitedocsDb | null = null;

export function getDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ||
    "postgres://citedocs:citedocs_secret_password@localhost:5432/citedocs"
  );
}

/**
 * Returns the pg.Pool instance, creating it lazily if necessary.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
    });
  }
  return pool;
}

/**
 * Returns the Drizzle ORM database instance with registered schema.
 */
export function getDb(): CitedocsDb {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema });
  }
  return dbInstance;
}

/**
 * Allows injecting a custom database client (e.g. For mock tests or alternative pools).
 */
export function setDb(customDb: CitedocsDb | null): void {
  dbInstance = customDb;
}

/**
 * Closes the database pool if open.
 */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  dbInstance = null;
}
