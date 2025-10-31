/**
 * Tests for ObservabilityConfig
 */

import { assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  DEFAULT_CONFIG,
  loadConfigFromEnv,
  validateConfig,
  ConfigValidationError,
  getEnvironmentOverrides,
  mergeConfig,
  createEnvironmentConfig,
} from "./observability-config.ts";

Deno.test("ObservabilityConfig - Default configuration is valid", () => {
  // Should not throw
  validateConfig(DEFAULT_CONFIG);
});

Deno.test("ObservabilityConfig - Environment parsing with defaults", () => {
  // Clear environment variables
  const originalEnv = { ...Deno.env.toObject() };
  
  try {
    // Clear OTEL env vars
    for (const key of Object.keys(Deno.env.toObject())) {
      if (key.startsWith('OTEL_') || key.startsWith('GRAFANA_') || key.startsWith('LOKI_') || key.startsWith('TEMPO_') || key.startsWith('MIMIR_')) {
        Deno.env.delete(key);
      }
    }
    
    const config = loadConfigFromEnv();
    
    // Should use defaults
    assertEquals(config.otel.serviceName, DEFAULT_CONFIG.otel.serviceName);
    assertEquals(config.otel.serviceVersion, DEFAULT_CONFIG.otel.serviceVersion);
    assertEquals(config.exporter.endpoint, DEFAULT_CONFIG.exporter.endpoint);
    assertEquals(config.sampling.tracesSampler, DEFAULT_CONFIG.sampling.tracesSampler);
  } finally {
    // Restore environment
    for (const key of Object.keys(Deno.env.toObject())) {
      Deno.env.delete(key);
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      Deno.env.set(key, value);
    }
  }
});

Deno.test("ObservabilityConfig - Environment parsing with custom values", () => {
  const originalEnv = { ...Deno.env.toObject() };
  
  try {
    // Set custom values
    Deno.env.set('OTEL_SERVICE_NAME', 'test-service');
    Deno.env.set('OTEL_SERVICE_VERSION', '2.0.0');
    Deno.env.set('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://test:4318');
    Deno.env.set('OTEL_TRACES_SAMPLER_ARG', '0.5');
    
    const config = loadConfigFromEnv();
    
    assertEquals(config.otel.serviceName, 'test-service');
    assertEquals(config.otel.serviceVersion, '2.0.0');
    assertEquals(config.exporter.endpoint, 'http://test:4318');
    assertEquals(config.sampling.tracesSamplerArg, 0.5);
  } finally {
    // Restore environment
    for (const key of Object.keys(Deno.env.toObject())) {
      Deno.env.delete(key);
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      Deno.env.set(key, value);
    }
  }
});

Deno.test("ObservabilityConfig - Validation catches invalid URLs", () => {
  const invalidConfig = {
    ...DEFAULT_CONFIG,
    exporter: {
      ...DEFAULT_CONFIG.exporter,
      endpoint: 'not-a-url',
    },
  };
  
  assertThrows(
    () => validateConfig(invalidConfig),
    ConfigValidationError,
    'Invalid URL format'
  );
});

Deno.test("ObservabilityConfig - Validation catches invalid sampling rate", () => {
  const invalidConfig = {
    ...DEFAULT_CONFIG,
    sampling: {
      ...DEFAULT_CONFIG.sampling,
      tracesSamplerArg: 1.5, // Invalid: > 1.0
    },
  };
  
  assertThrows(
    () => validateConfig(invalidConfig),
    ConfigValidationError,
    'must be between 0 and 1'
  );
});

Deno.test("ObservabilityConfig - Validation catches empty service name", () => {
  const invalidConfig = {
    ...DEFAULT_CONFIG,
    otel: {
      ...DEFAULT_CONFIG.otel,
      serviceName: '',
    },
  };
  
  assertThrows(
    () => validateConfig(invalidConfig),
    ConfigValidationError,
    'Service name cannot be empty'
  );
});

Deno.test("ObservabilityConfig - Environment overrides work correctly", () => {
  const devOverrides = getEnvironmentOverrides('development');
  assertEquals(devOverrides.sampling?.tracesSampler, 'always_on');
  assertEquals(devOverrides.sampling?.tracesSamplerArg, 1.0);
  
  const prodOverrides = getEnvironmentOverrides('production');
  assertEquals(prodOverrides.sampling?.tracesSampler, 'traceidratio');
  assertEquals(prodOverrides.sampling?.tracesSamplerArg, 0.1);
});

Deno.test("ObservabilityConfig - Config merging works correctly", () => {
  const base = DEFAULT_CONFIG;
  const overrides = {
    otel: {
      serviceName: 'overridden-service',
    },
    sampling: {
      tracesSamplerArg: 0.5,
    },
  };
  
  const merged = mergeConfig(base, overrides);
  
  assertEquals(merged.otel.serviceName, 'overridden-service');
  assertEquals(merged.otel.serviceVersion, base.otel.serviceVersion); // Should keep base value
  assertEquals(merged.sampling.tracesSamplerArg, 0.5);
  assertEquals(merged.sampling.tracesSampler, base.sampling.tracesSampler); // Should keep base value
});

Deno.test("ObservabilityConfig - Environment config creation", () => {
  const originalEnv = { ...Deno.env.toObject() };
  
  try {
    // Set base environment
    Deno.env.set('OTEL_SERVICE_NAME', 'test-service');
    
    const config = createEnvironmentConfig('production');
    
    assertEquals(config.otel.serviceName, 'test-service');
    assertEquals(config.sampling.tracesSampler, 'traceidratio');
    assertEquals(config.sampling.tracesSamplerArg, 0.1); // Production override
  } finally {
    // Restore environment
    for (const key of Object.keys(Deno.env.toObject())) {
      Deno.env.delete(key);
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      Deno.env.set(key, value);
    }
  }
});