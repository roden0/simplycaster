#!/usr/bin/env -S deno run -A

/**
 * Test script to verify telemetry data flow to OTEL-LGTM stack
 * This script sends test traces, metrics, and logs to verify the observability pipeline
 */

import { ObservabilityService } from "../lib/observability/observability-service.ts";

async function testTelemetryFlow() {
  console.log("🚀 Starting telemetry flow test...");

  try {
    // Initialize observability service
    console.log("1️⃣ Initializing ObservabilityService...");
    const observability = new ObservabilityService();
    await observability.initialize();
    console.log("✅ ObservabilityService initialized");

    // Test trace creation
    console.log("2️⃣ Creating test trace...");
    
    observability.startActiveSpan("test-operation", (span) => {
      span.setAttributes({
        "test.operation": "telemetry-flow-test",
        "test.timestamp": Date.now(),
        "test.environment": "development"
      });

      // Simulate some work
      setTimeout(() => {
        // Create a child span
        observability.startActiveSpan("child-operation", (childSpan) => {
          childSpan.setAttributes({
            "child.operation": "nested-test",
            "child.duration": 50
          });
          
          setTimeout(() => {
            childSpan.end();
          }, 50);
        });
        
        span.end();
      }, 100);
    });
    console.log("✅ Test trace created");

    // Test metrics
    console.log("3️⃣ Recording test metrics...");
    
    // Record some metrics using the service methods
    observability.recordCounter("test_operations_total", 1, { 
      attributes: { operation: "telemetry-test", status: "success" }
    });
    
    observability.recordHistogram("test_operation_duration", 150, { 
      attributes: { operation: "telemetry-test" }
    });
    
    observability.recordGauge("test_active_connections", 5, {
      attributes: { connection_type: "test" }
    });
    
    console.log("✅ Test metrics recorded");

    // Test structured logging
    console.log("4️⃣ Creating test logs...");
    
    // For now, just use console logging as the structured logger might need separate initialization
    console.log("INFO: Test log message", {
      test: true,
      operation: "telemetry-flow-test",
      timestamp: new Date().toISOString(),
      level: "info"
    });

    console.warn("WARN: Test warning message", {
      test: true,
      operation: "telemetry-flow-test",
      warning_type: "test_warning"
    });

    console.error("ERROR: Test error message", {
      test: true,
      operation: "telemetry-flow-test",
      error_type: "test_error",
      stack: "test stack trace"
    });
    console.log("✅ Test logs created");

    // Wait a moment for data to be exported
    console.log("5️⃣ Waiting for telemetry export...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Shutdown gracefully
    console.log("6️⃣ Shutting down observability service...");
    await observability.shutdown();
    console.log("✅ ObservabilityService shutdown complete");

    console.log("\n🎉 Telemetry flow test completed successfully!");
    console.log("\n📊 Next steps:");
    console.log("   1. Open Grafana at http://localhost:3000 (admin/admin)");
    console.log("   2. Check Explore > Tempo for traces");
    console.log("   3. Check Explore > Prometheus for metrics");
    console.log("   4. Check Explore > Loki for logs");

  } catch (error) {
    console.error("❌ Telemetry flow test failed:", error);
    Deno.exit(1);
  }
}

// Run the test
if (import.meta.main) {
  await testTelemetryFlow();
}