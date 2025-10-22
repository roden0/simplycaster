// ============================================================================
// SimplyCaster Database Seed Utility
// Creates initial data for development and testing
// ============================================================================

import { db, users, closeDatabase } from "./connection.ts";
import { eq } from "drizzle-orm";

async function seedDatabase() {
  console.log("🌱 Seeding database with initial data...");
  
  try {
    // Check if admin user already exists
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, "admin@simplycaster.com"))
      .limit(1);
    
    if (existingAdmin.length === 0) {
      // Create default admin user
      const [adminUser] = await db
        .insert(users)
        .values({
          email: "admin@simplycaster.com",
          role: "admin",
          isActive: true,
          emailVerified: true,
          // Note: In production, password should be set through proper auth flow
          passwordHash: null,
          passwordSalt: null,
        })
        .returning();
      
      console.log("✅ Created admin user:", adminUser.email);
    } else {
      console.log("ℹ️  Admin user already exists, skipping creation");
    }
    
    // Check if demo host exists
    const existingHost = await db
      .select()
      .from(users)
      .where(eq(users.email, "host@simplycaster.com"))
      .limit(1);
    
    if (existingHost.length === 0) {
      // Create demo host user
      const [hostUser] = await db
        .insert(users)
        .values({
          email: "host@simplycaster.com",
          role: "host",
          isActive: true,
          emailVerified: true,
          // Note: In production, password should be set through proper auth flow
          passwordHash: null,
          passwordSalt: null,
        })
        .returning();
      
      console.log("✅ Created demo host user:", hostUser.email);
    } else {
      console.log("ℹ️  Demo host user already exists, skipping creation");
    }
    
    console.log("✅ Database seeding completed successfully!");
    console.log("");
    console.log("📋 Default users created:");
    console.log("   Admin: admin@simplycaster.com");
    console.log("   Host:  host@simplycaster.com");
    console.log("");
    console.log("🔐 Note: Set passwords through the host setup flow or admin panel");
    
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    throw error;
  } finally {
    await closeDatabase();
  }
}

// Run seeding if this file is executed directly
if (import.meta.main) {
  await seedDatabase();
}

export { seedDatabase };