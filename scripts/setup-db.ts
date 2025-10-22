#!/usr/bin/env -S deno run -A

// ============================================================================
// SimplyCaster Database Setup Script
// Complete database initialization and seeding
// ============================================================================

import { runMigrations } from "../database/migrate.ts";
import { seedDatabase } from "../database/seed.ts";
import { checkDatabaseHealth } from "../database/connection.ts";

async function setupDatabase() {
  console.log("🚀 Starting SimplyCaster database setup...\n");

  try {
    // Check database connection
    console.log("1️⃣ Checking database connection...");
    const isHealthy = await checkDatabaseHealth();
    if (!isHealthy) {
      throw new Error("Database connection failed");
    }
    console.log("✅ Database connection successful\n");

    // Run migrations
    console.log("2️⃣ Running database migrations...");
    await runMigrations();
    console.log("✅ Migrations completed\n");

    // Seed initial data
    console.log("3️⃣ Seeding initial data...");
    await seedDatabase();
    console.log("✅ Seeding completed\n");

    console.log("🎉 Database setup completed successfully!");
    console.log("\n📋 Next steps:");
    console.log("   1. Start the application: deno task dev");
    console.log("   2. Visit: http://localhost:8000");
    console.log("   3. Use the seeded admin/host accounts to get started");
    console.log("\n🔧 Database management:");
    console.log("   - View data: deno task db:studio");
    console.log("   - Reset database: deno task docker:down && deno task docker:up");

  } catch (error) {
    console.error("❌ Database setup failed:", error);
    console.log("\n🔧 Troubleshooting:");
    console.log("   1. Ensure PostgreSQL is running: deno task docker:up");
    console.log("   2. Check DATABASE_URL environment variable");
    console.log("   3. Verify database permissions");
    Deno.exit(1);
  }
}

// Run setup if this file is executed directly
if (import.meta.main) {
  await setupDatabase();
}