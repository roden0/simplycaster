// Health check API endpoint
import { define } from "../../utils.ts";
import { checkDatabaseHealth } from "../../database/connection.ts";

export const handler = define.handlers({
  async GET(_req) {
    try {
      // Check database connectivity
      const dbHealthy = await checkDatabaseHealth();
      
      const health = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        services: {
          database: dbHealthy ? "healthy" : "unhealthy",
          application: "healthy",
        },
        version: "1.0.0",
      };

      // Return 503 if any service is unhealthy
      const status = dbHealthy ? 200 : 503;
      
      return new Response(JSON.stringify(health), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      });
    } catch (error) {
      const health = {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error.message,
        services: {
          database: "unknown",
          application: "unhealthy",
        },
      };

      return new Response(JSON.stringify(health), {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      });
    }
  },
});