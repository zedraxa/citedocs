import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://citedocs:citedocs_secret_password@localhost:5432/citedocs",
  },
  verbose: true,
  strict: true,
});
