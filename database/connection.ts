// ============================================================================
// SimplyCaster Database Connection
// PostgreSQL connection with Drizzle ORM and comprehensive error handling
// ============================================================================

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";
import { getDatabaseUrl } from "../lib/secrets.ts";

// Get database URL from secrets or environment
const databaseUrl = await getDatabaseUrl();

// Create postgres client with optimized configuration
const client = postgres(databaseUrl, {
  max: 10, // Maximum number of connections
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout in seconds
  prepare: false, // Disable prepared statements for better compatibility
  types: {
    bigint: postgres.BigInt, // Handle BigInt properly
  },
});

// Create drizzle instance with schema and logging
export const db = drizzle(client, { 
  schema,
  logger: Deno.env.get("NODE_ENV") === "development",
});

// Export types for convenience
export type Database = typeof db;
export * from "./schema.ts";

// Utility function to close database connection
export async function closeDatabase() {
  await client.end();
}

// Health check function
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await client`SELECT 1`;
    return true;
  } catch (error) {
    console.error("Database health check failed:", error);
    return false;
  }
}

// Function to set RLS context for current user
export async function setRLSContext(userId: string, userRole: string) {
  try {
    await client`SELECT set_config('app.current_user_id', ${userId}, true)`;
    await client`SELECT set_config('app.current_user_role', ${userRole}, true)`;
  } catch (error) {
    console.error("Failed to set RLS context:", error);
    throw error;
  }
}

// Function to clear RLS context
export async function clearRLSContext() {
  try {
    await client`SELECT set_config('app.current_user_id', '', true)`;
    await client`SELECT set_config('app.current_user_role', '', true)`;
  } catch (error) {
    console.error("Failed to clear RLS context:", error);
    throw error;
  }
}

// Export the client for direct queries if needed
export { client };