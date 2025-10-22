// ============================================================================
// Drizzle Configuration for SimplyCaster
// Database migration and introspection configuration
// ============================================================================

import { defineConfig } from "drizzle-kit";

// Get database URL from environment, with fallback for local development
const databaseUrl = Deno.env.get("DATABASE_URL") || "postgres://app:secret@localhost:5432/appdb";

export default defineConfig({
  schema: "./database/schema.ts",
  out: "./database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
  migrations: {
    table: "__drizzle_migrations",
    schema: "public",
  },
});