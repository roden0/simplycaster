/**
 * OpenTelemetry SDK Initialization
 * 
 * This module initializes the OpenTelemetry SDK with proper exporters
 * to send telemetry data to the OTEL-LGTM stack.
 */

import { NodeSDK } from "npm:@opentelemetry/sdk-node@0.54.2";
import { OTLPTraceExporter } from "npm:@opentelemetry/exporter-trace-otlp-http@0.54.2";
import { OTLPMetricExporter } from "npm:@opentelemetry/exporter-metrics-otlp-http@0.54.2";
import { PeriodicExportingMetricReader } from "npm:@opentelemetry/sdk-metrics@1.26.0";
import { Resource } from "npm:@opentelemetry/resources@1.26.0";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "npm:@opentelemetry/semantic-conventions@1.26.0";
import { loadAndValidateConfig } from "./config/observability-config.ts";

let sdkInstance: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK with OTLP exporters
 */
export async function initializeSDK(): Promise<void> {
  if (sdkInstance) {
    console.log("OpenTelemetry SDK already initialized");
    return;
  }

  try {
    const config = loadAndValidateConfig();
    
    // Skip initialization if disabled
    if (!config.otel.enabled || config.performance.sdkDisabled) {
      console.log("OpenTelemetry SDK disabled by configuration");
      return;
    }

    console.log("🔧 Initializing OpenTelemetry SDK...");

    // Create resource with service information
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: config.otel.serviceName,
      [ATTR_SERVICE_VERSION]: config.otel.serviceVersion,
      "service.namespace": config.otel.serviceNamespace,
      "deployment.environment": config.otel.environment,
    });

    // Create OTLP trace exporter
    const traceExporter = new OTLPTraceExporter({
      url: `${config.exporter.endpoint}/v1/traces`,
      headers: config.exporter.headers || {},
      timeoutMillis: config.exporter.timeout,
    });

    // Create OTLP metrics exporter
    const metricExporter = new OTLPMetricExporter({
      url: `${config.exporter.endpoint}/v1/metrics`,
      headers: config.exporter.headers || {},
      timeoutMillis: config.exporter.timeout,
    });

    // Create metric reader with periodic export
    const metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: config.performance.metricExportInterval,
    });

    // Initialize SDK
    sdkInstance = new NodeSDK({
      resource,
      traceExporter,
      metricReader,
      // Enable auto-instrumentation for common libraries
      instrumentations: [], // We'll add custom instrumentations later
    });

    // Start the SDK
    await sdkInstance.start();

    console.log(`✅ OpenTelemetry SDK initialized successfully`);
    console.log(`   Service: ${config.otel.serviceName} v${config.otel.serviceVersion}`);
    console.log(`   Environment: ${config.otel.environment}`);
    console.log(`   OTLP Endpoint: ${config.exporter.endpoint}`);

  } catch (error) {
    console.error("❌ Failed to initialize OpenTelemetry SDK:", error);
    throw error;
  }
}

/**
 * Shutdown OpenTelemetry SDK
 */
export async function shutdownSDK(): Promise<void> {
  if (!sdkInstance) {
    return;
  }

  try {
    console.log("🔄 Shutting down OpenTelemetry SDK...");
    await sdkInstance.shutdown();
    sdkInstance = null;
    console.log("✅ OpenTelemetry SDK shutdown complete");
  } catch (error) {
    console.error("❌ Error during SDK shutdown:", error);
    throw error;
  }
}

/**
 * Check if SDK is initialized
 */
export function isSDKInitialized(): boolean {
  return sdkInstance !== null;
}

/**
 * Get SDK instance (for advanced usage)
 */
export function getSDKInstance(): NodeSDK | null {
  return sdkInstance;
}