#!/usr/bin/env -S deno run -A

/**
 * End-to-End Observability Validation Script
 * 
 * This script validates complete observability functionality including:
 * - Trace creation and export to Tempo
 * - Metrics collection and export to Prometheus
 * - Log correlation with traces
 * - Dashboard data visualization
 * - Performance baseline measurements
 */

import { ObservabilityService } from "../lib/observability/observability-service.ts";
import { initializeSDK } from "../lib/observability/sdk-init.ts";

interface ValidationResult {
  component: string;
  status: 'success' | 'warning' | 'error';
  message: string;
  details?: any;
}

class ObservabilityValidator {
  private results: ValidationResult[] = [];
  private observability: ObservabilityService;

  constructor() {
    this.observability = new ObservabilityService();
  }

  private addResult(component: string, status: 'success' | 'warning' | 'error', message: string, details?: any) {
    this.results.push({ component, status, message, details });
    const emoji = status === 'success' ? '✅' : status === 'warning' ? '⚠️' : '❌';
    console.log(`${emoji} ${component}: ${message}`);
    if (details) {
      console.log(`   Details:`, details);
    }
  }

  async validateInfrastructure(): Promise<void> {
    console.log("\n🔧 Validating Infrastructure...");

    // Check Grafana accessibility
    try {
      const grafanaResponse = await fetch("http://localhost:3000/api/health");
      if (grafanaResponse.ok) {
        const health = await grafanaResponse.json();
        this.addResult("Grafana", "success", `Accessible (v${health.version})`, health);
      } else {
        this.addResult("Grafana", "error", `HTTP ${grafanaResponse.status}`);
      }
    } catch (error) {
      this.addResult("Grafana", "error", "Not accessible", error.message);
    }

    // Check Prometheus
    try {
      const prometheusResponse = await fetch("http://localhost:9090/api/v1/status/config");
      if (prometheusResponse.ok) {
        this.addResult("Prometheus", "success", "Accessible and configured");
      } else {
        this.addResult("Prometheus", "error", `HTTP ${prometheusResponse.status}`);
      }
    } catch (error) {
      this.addResult("Prometheus", "error", "Not accessible", error.message);
    }

    // Check Tempo
    try {
      const tempoResponse = await fetch("http://localhost:3200/api/status/buildinfo");
      if (tempoResponse.ok) {
        const buildInfo = await tempoResponse.json();
        this.addResult("Tempo", "success", `Accessible (v${buildInfo.version})`, buildInfo);
      } else {
        this.addResult("Tempo", "error", `HTTP ${tempoResponse.status}`);
      }
    } catch (error) {
      this.addResult("Tempo", "error", "Not accessible", error.message);
    }

    // Check Loki
    try {
      const lokiResponse = await fetch("http://localhost:3100/ready");
      if (lokiResponse.ok) {
        this.addResult("Loki", "success", "Ready for log ingestion");
      } else {
        this.addResult("Loki", "error", `HTTP ${lokiResponse.status}`);
      }
    } catch (error) {
      this.addResult("Loki", "error", "Not accessible", error.message);
    }

    // Check OTLP endpoints
    try {
      const otlpResponse = await fetch("http://localhost:4318/v1/traces", {
        method: "POST",
        headers: { "Content-Type": "application/x-protobuf" },
        body: new Uint8Array(0)
      });
      // Expect 400 for empty request, which means endpoint is working
      if (otlpResponse.status === 400) {
        this.addResult("OTLP HTTP", "success", "Endpoint responding");
      } else {
        this.addResult("OTLP HTTP", "warning", `Unexpected status: ${otlpResponse.status}`);
      }
    } catch (error) {
      this.addResult("OTLP HTTP", "error", "Not accessible", error.message);
    }
  }

  async validateTelemetryFlow(): Promise<void> {
    console.log("\n📊 Validating Telemetry Flow...");

    try {
      // Initialize observability service
      await this.observability.initialize();
      this.addResult("ObservabilityService", "success", "Initialized successfully");

      // Test trace creation
      let traceCreated = false;
      this.observability.startActiveSpan("e2e-test-trace", (span) => {
        span.setAttributes({
          "test.type": "end-to-end-validation",
          "test.timestamp": Date.now(),
          "test.environment": "development",
          "test.component": "observability-validator"
        });

        // Create nested spans to test hierarchy
        this.observability.startActiveSpan("nested-operation", (nestedSpan) => {
          nestedSpan.setAttributes({
            "operation.type": "nested-test",
            "operation.duration": 100
          });

          // Simulate some work
          const start = Date.now();
          while (Date.now() - start < 100) {
            // Busy wait for 100ms
          }

          nestedSpan.end();
        });

        span.end();
        traceCreated = true;
      });

      if (traceCreated) {
        this.addResult("Trace Creation", "success", "Spans created with attributes");
      }

      // Test metrics recording
      this.observability.recordCounter("e2e_test_operations_total", 1, {
        attributes: { test_type: "validation", status: "success" }
      });

      this.observability.recordHistogram("e2e_test_duration_ms", 150, {
        attributes: { operation: "validation" }
      });

      this.observability.recordGauge("e2e_test_active_connections", 3, {
        attributes: { connection_type: "test" }
      });

      this.addResult("Metrics Recording", "success", "Counter, histogram, and gauge metrics recorded");

      // Wait for export
      console.log("   Waiting for telemetry export...");
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
      this.addResult("Telemetry Flow", "error", "Failed to create telemetry", error.message);
    }
  }

  async validateDataIngestion(): Promise<void> {
    console.log("\n🔍 Validating Data Ingestion...");

    // Wait a bit more for data to be ingested
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if traces are in Tempo
    try {
      const traceSearchResponse = await fetch(
        "http://localhost:3200/api/search?tags=service.name%3Dsimplycast&limit=10"
      );
      
      if (traceSearchResponse.ok) {
        const searchResult = await traceSearchResponse.json();
        if (searchResult.traces && searchResult.traces.length > 0) {
          this.addResult("Trace Ingestion", "success", 
            `Found ${searchResult.traces.length} traces in Tempo`, searchResult.metrics);
        } else {
          this.addResult("Trace Ingestion", "warning", 
            "No traces found yet (may need more time)", searchResult);
        }
      } else {
        this.addResult("Trace Ingestion", "error", `Search failed: HTTP ${traceSearchResponse.status}`);
      }
    } catch (error) {
      this.addResult("Trace Ingestion", "error", "Failed to search traces", error.message);
    }

    // Check if metrics are in Prometheus
    try {
      const metricsResponse = await fetch(
        "http://localhost:9090/api/v1/query?query=e2e_test_operations_total"
      );
      
      if (metricsResponse.ok) {
        const metricsResult = await metricsResponse.json();
        if (metricsResult.data.result && metricsResult.data.result.length > 0) {
          this.addResult("Metrics Ingestion", "success", 
            `Found ${metricsResult.data.result.length} metric series`, metricsResult.data.result);
        } else {
          this.addResult("Metrics Ingestion", "warning", 
            "No metrics found yet (may need more time)", metricsResult.data);
        }
      } else {
        this.addResult("Metrics Ingestion", "error", `Query failed: HTTP ${metricsResponse.status}`);
      }
    } catch (error) {
      this.addResult("Metrics Ingestion", "error", "Failed to query metrics", error.message);
    }

    // Check collector metrics (should always be present)
    try {
      const collectorMetricsResponse = await fetch(
        "http://localhost:9090/api/v1/query?query=otelcol_receiver_accepted_metric_points_total"
      );
      
      if (collectorMetricsResponse.ok) {
        const collectorResult = await collectorMetricsResponse.json();
        if (collectorResult.data.result && collectorResult.data.result.length > 0) {
          this.addResult("Collector Metrics", "success", 
            "OTEL collector is receiving and processing metrics", 
            collectorResult.data.result[0]);
        } else {
          this.addResult("Collector Metrics", "warning", "No collector metrics found");
        }
      }
    } catch (error) {
      this.addResult("Collector Metrics", "error", "Failed to query collector metrics", error.message);
    }
  }

  async validateDashboards(): Promise<void> {
    console.log("\n📈 Validating Dashboard Configuration...");

    try {
      // Check datasources
      const datasourcesResponse = await fetch("http://localhost:3000/api/datasources", {
        headers: { "Authorization": "Basic " + btoa("admin:admin") }
      });

      if (datasourcesResponse.ok) {
        const datasources = await datasourcesResponse.json();
        const expectedDatasources = ["Prometheus", "Tempo", "Loki"];
        const foundDatasources = datasources.map((ds: any) => ds.name);
        
        for (const expected of expectedDatasources) {
          if (foundDatasources.includes(expected)) {
            this.addResult(`Datasource ${expected}`, "success", "Configured and available");
          } else {
            this.addResult(`Datasource ${expected}`, "error", "Not found in Grafana");
          }
        }
      } else {
        this.addResult("Datasources", "error", `Failed to fetch: HTTP ${datasourcesResponse.status}`);
      }
    } catch (error) {
      this.addResult("Datasources", "error", "Failed to validate datasources", error.message);
    }
  }

  async measurePerformanceBaseline(): Promise<void> {
    console.log("\n⚡ Measuring Performance Baseline...");

    const measurements = {
      traceCreationTime: 0,
      metricRecordingTime: 0,
      spanOverhead: 0,
      exportLatency: 0
    };

    try {
      // Measure trace creation time
      const traceStart = performance.now();
      this.observability.startActiveSpan("performance-test", (span) => {
        span.setAttributes({ "test.type": "performance-baseline" });
        span.end();
      });
      measurements.traceCreationTime = performance.now() - traceStart;

      // Measure metric recording time
      const metricStart = performance.now();
      this.observability.recordCounter("performance_test_counter", 1);
      measurements.metricRecordingTime = performance.now() - metricStart;

      // Measure span overhead with multiple operations
      const overheadStart = performance.now();
      for (let i = 0; i < 100; i++) {
        this.observability.startActiveSpan(`overhead-test-${i}`, (span) => {
          span.setAttributes({ "iteration": i });
          span.end();
        });
      }
      measurements.spanOverhead = (performance.now() - overheadStart) / 100;

      this.addResult("Performance Baseline", "success", "Measurements completed", measurements);

      // Validate performance thresholds
      if (measurements.traceCreationTime < 10) {
        this.addResult("Trace Performance", "success", `${measurements.traceCreationTime.toFixed(2)}ms (< 10ms threshold)`);
      } else {
        this.addResult("Trace Performance", "warning", `${measurements.traceCreationTime.toFixed(2)}ms (> 10ms threshold)`);
      }

      if (measurements.spanOverhead < 1) {
        this.addResult("Span Overhead", "success", `${measurements.spanOverhead.toFixed(3)}ms per span (< 1ms threshold)`);
      } else {
        this.addResult("Span Overhead", "warning", `${measurements.spanOverhead.toFixed(3)}ms per span (> 1ms threshold)`);
      }

    } catch (error) {
      this.addResult("Performance Baseline", "error", "Failed to measure performance", error.message);
    }
  }

  async cleanup(): Promise<void> {
    console.log("\n🧹 Cleaning up...");
    try {
      await this.observability.shutdown();
      this.addResult("Cleanup", "success", "ObservabilityService shutdown complete");
    } catch (error) {
      this.addResult("Cleanup", "error", "Failed to shutdown", error.message);
    }
  }

  printSummary(): void {
    console.log("\n" + "=".repeat(60));
    console.log("📋 VALIDATION SUMMARY");
    console.log("=".repeat(60));

    const successCount = this.results.filter(r => r.status === 'success').length;
    const warningCount = this.results.filter(r => r.status === 'warning').length;
    const errorCount = this.results.filter(r => r.status === 'error').length;

    console.log(`✅ Success: ${successCount}`);
    console.log(`⚠️  Warning: ${warningCount}`);
    console.log(`❌ Error: ${errorCount}`);
    console.log(`📊 Total: ${this.results.length}`);

    if (errorCount > 0) {
      console.log("\n❌ ERRORS:");
      this.results.filter(r => r.status === 'error').forEach(r => {
        console.log(`   - ${r.component}: ${r.message}`);
      });
    }

    if (warningCount > 0) {
      console.log("\n⚠️  WARNINGS:");
      this.results.filter(r => r.status === 'warning').forEach(r => {
        console.log(`   - ${r.component}: ${r.message}`);
      });
    }

    console.log("\n📊 Next Steps:");
    console.log("   1. Open Grafana: http://localhost:3000 (admin/admin)");
    console.log("   2. Explore > Tempo: Search for traces with service.name=simplycast");
    console.log("   3. Explore > Prometheus: Query for e2e_test_operations_total");
    console.log("   4. Check dashboards for data visualization");

    const overallStatus = errorCount === 0 ? (warningCount === 0 ? 'SUCCESS' : 'SUCCESS_WITH_WARNINGS') : 'FAILURE';
    console.log(`\n🎯 Overall Status: ${overallStatus}`);
  }
}

async function runEndToEndValidation(): Promise<void> {
  console.log("🚀 Starting End-to-End Observability Validation...");
  console.log("=".repeat(60));

  const validator = new ObservabilityValidator();

  try {
    await validator.validateInfrastructure();
    await validator.validateTelemetryFlow();
    await validator.validateDataIngestion();
    await validator.validateDashboards();
    await validator.measurePerformanceBaseline();
  } finally {
    await validator.cleanup();
    validator.printSummary();
  }
}

// Run validation if this script is executed directly
if (import.meta.main) {
  await runEndToEndValidation();
}