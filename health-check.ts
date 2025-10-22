// Health check script for SimplyCaster
import { checkDatabaseHealth } from "./database/connection.ts";

async function healthCheck(): Promise<void> {
  try {
    // Check if the application is responding
    const response = await fetch("http://localhost:8000/api/health");
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check database connectivity
    const dbHealthy = await checkDatabaseHealth();
    if (!dbHealthy) {
      throw new Error("Database connection failed");
    }

    console.log("Health check passed");
    Deno.exit(0);
  } catch (error) {
    console.error("Health check failed:", error.message);
    Deno.exit(1);
  }
}

// Run health check
if (import.meta.main) {
  await healthCheck();
}