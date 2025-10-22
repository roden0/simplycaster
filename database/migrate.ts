// ============================================================================
// SimplyCaster Database Migration Utility
// Handles database migrations and schema updates
// ============================================================================

import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, closeDatabase } from "./connection.ts";

async function runMigrations() {
  console.log("🔄 Running database migrations...");
  
  try {
    await migrate(db, {
      migrationsFolder: "./database/migrations",
    });
    
    console.log("✅ Database migrations completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await closeDatabase();
  }
}

// Run migrations if this file is executed directly
if (import.meta.main) {
  await runMigrations();
}

export { runMigrations };