/**
 * Health Check Script for Docker
 * 
 * Simple health check that verifies the application is responding
 */

try {
  const response = await fetch("http://localhost:8000/api/health", {
    method: "GET",
    headers: {
      "User-Agent": "SimplyCaster-HealthCheck/1.0"
    }
  });

  if (response.ok) {
    const health = await response.json();
    if (health.status === "healthy") {
      console.log("✅ Health check passed");
      Deno.exit(0);
    } else {
      console.error("❌ Health check failed: Application unhealthy");
      Deno.exit(1);
    }
  } else {
    console.error(`❌ Health check failed: HTTP ${response.status}`);
    Deno.exit(1);
  }
} catch (error) {
  console.error("❌ Health check failed:", error.message);
  Deno.exit(1);
}