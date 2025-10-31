/**
 * Tests for ObservabilityService
 */

import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ObservabilityService } from "./observability-service.ts";
import { DEFAULT_CONFIG } from "./config/observability-config.ts";

Deno.test("ObservabilityService - Initialization", async () => {
  const service = new ObservabilityService();
  
  // Initially not initialized
  const initialHealth = service.getHealth();
  assertEquals(initialHealth.initialized, false);
  
  // Initialize with test config
  const testConfig = {
    ...DEFAULT_CONFIG,
    performance: {
      ...DEFAULT_CONFIG.performance,
      sdkDisabled: true, // Disable for testing
    },
  };
  
  await service.initialize(testConfig);
  
  // Should be initialized now
  const health = service.getHealth();
  assertEquals(health.initialized, true);
  assertEquals(health.configValid, true);
  assert(health.uptime >= 0);
  
  await service.shutdown();
});

Deno.test("ObservabilityService - Span creation when disabled", async () => {
  const service = new ObservabilityService();
  
  // Initialize with disabled config
  const testConfig = {
    ...DEFAULT_CONFIG,
    performance: {
      ...DEFAULT_CONFIG.performance,
      sdkDisabled: true,
    },
  };
  
  await service.initialize(testConfig);
  
  // Should create no-op spans
  const span = service.createSpan('test-span');
  assert(span !== null);
  
  // Should execute function without error
  const result = service.startActiveSpan('test-active-span', (span) => {
    assert(span !== null);
    return 'test-result';
  });
  
  assertEquals(result, 'test-result');
  
  await service.shutdown();
});

Deno.test("ObservabilityService - Metric recording when disabled", async () => {
  const service = new ObservabilityService();
  
  // Initialize with disabled config
  const testConfig = {
    ...DEFAULT_CONFIG,
    performance: {
      ...DEFAULT_CONFIG.performance,
      sdkDisabled: true,
    },
  };
  
  await service.initialize(testConfig);
  
  // Should not throw when recording metrics
  service.recordCounter('test-counter', 1);
  service.recordHistogram('test-histogram', 100);
  service.recordGauge('test-gauge', 50);
  
  await service.shutdown();
});

Deno.test("ObservabilityService - Error handling", async () => {
  const service = new ObservabilityService();
  
  // Initialize with invalid config should not throw
  const invalidConfig = {
    ...DEFAULT_CONFIG,
    exporter: {
      ...DEFAULT_CONFIG.exporter,
      endpoint: 'invalid-url',
    },
  };
  
  // Should not throw, but should set error state
  await service.initialize(invalidConfig);
  
  const health = service.getHealth();
  // Service might still initialize in no-op mode
  assert(health.startedAt instanceof Date);
  
  await service.shutdown();
});

Deno.test("ObservabilityService - Graceful shutdown", async () => {
  const service = new ObservabilityService();
  
  await service.initialize({
    ...DEFAULT_CONFIG,
    performance: {
      ...DEFAULT_CONFIG.performance,
      sdkDisabled: true,
    },
  });
  
  // Should shutdown without error
  await service.shutdown();
  
  // Should be able to shutdown multiple times
  await service.shutdown();
});

Deno.test("ObservabilityService - Health status", async () => {
  const service = new ObservabilityService();
  
  const beforeInit = service.getHealth();
  assertEquals(beforeInit.initialized, false);
  assertEquals(beforeInit.configValid, false);
  
  await service.initialize({
    ...DEFAULT_CONFIG,
    performance: {
      ...DEFAULT_CONFIG.performance,
      sdkDisabled: true,
    },
  });
  
  const afterInit = service.getHealth();
  assertEquals(afterInit.initialized, true);
  assertEquals(afterInit.configValid, true);
  assert(afterInit.uptime >= 0);
  assert(afterInit.startedAt instanceof Date);
  
  await service.shutdown();
});