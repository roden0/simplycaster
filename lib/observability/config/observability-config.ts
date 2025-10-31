/**
 * ObservabilityConfig - Configuration interface and validation for OpenTelemetry observability
 * 
 * This module provides:
 * - Type-safe configuration schema
 * - Environment variable parsing and validation
 * - Configuration defaults and fallback values
 * - Validation utilities for observability settings
 */

// ============================================================================
// CONFIGURATION INTERFACES
// ============================================================================

/**
 * Core OpenTelemetry configuration
 */
export interface OtelConfig {
  /** Enable OpenTelemetry instrumentation */
  enabled: boolean;
  /** Service identification */
  serviceName: string;
  serviceVersion: string;
  serviceNamespace: string;
  /** Environment identification */
  environment: 'development' | 'staging' | 'production';
}

/**
 * OTLP Exporter configuration
 */
export interface OtlpExporterConfig {
  /** OTLP endpoint URL */
  endpoint: string;
  /** Protocol for OTLP export */
  protocol: 'grpc' | 'http/protobuf' | 'http/json';
  /** Export timeout in milliseconds */
  timeout: number;
  /** Optional authentication headers */
  headers?: Record<string, string>;
  /** Separate endpoints for different signal types */
  tracesEndpoint?: string;
  metricsEndpoint?: string;
  logsEndpoint?: string;
}

/**
 * Sampling configuration
 */
export interface SamplingConfig {
  /** Trace sampling strategy */
  tracesSampler: 'always_on' | 'always_off' | 'traceidratio' | 'parentbased_always_on' | 'parentbased_always_off' | 'parentbased_traceidratio';
  /** Sampling ratio (0.0 to 1.0) */
  tracesSamplerArg: number;
  /** Metrics exemplar filter */
  metricsExemplarFilter: 'always_on' | 'always_off' | 'trace_based';
}

/**
 * Resource attributes configuration
 */
export interface ResourceConfig {
  /** Resource attributes as key-value pairs */
  attributes: Record<string, string>;
}

/**
 * Instrumentation configuration
 */
export interface InstrumentationConfig {
  /** Enable/disable specific signal types */
  tracesExporter: string[];
  metricsExporter: string[];
  logsExporter: string[];
  /** Metric export interval in milliseconds */
  metricExportInterval: number;
  /** Batch span processor configuration */
  batchSpanProcessor: {
    maxExportBatchSize: number;
    exportTimeout: number;
    scheduleDelay: number;
    maxQueueSize: number;
  };
}

/**
 * Performance and reliability configuration
 */
export interface PerformanceConfig {
  /** SDK disabled flag */
  sdkDisabled: boolean;
  /** Propagators for trace context */
  propagators: string[];
  /** Attribute limits */
  attributeValueLengthLimit: number;
  attributeCountLimit: number;
  /** Span limits */
  spanAttributeValueLengthLimit: number;
  spanAttributeCountLimit: number;
  spanEventCountLimit: number;
  spanLinkCountLimit: number;
  /** Event and link attribute limits */
  eventAttributeCountLimit: number;
  linkAttributeCountLimit: number;
}

/**
 * SimplyCaster-specific configuration
 */
export interface SimplyCasterConfig {
  /** Custom instrumentation flags */
  webrtcInstrumentation: boolean;
  recordingInstrumentation: boolean;
  databaseInstrumentation: boolean;
  redisInstrumentation: boolean;
  authInstrumentation: boolean;
  /** Performance monitoring thresholds */
  slowQueryThreshold: number;
  slowRequestThreshold: number;
  cacheMissAlertThreshold: number;
}

/**
 * OTEL-LGTM stack configuration
 */
export interface LgtmConfig {
  /** Grafana configuration */
  grafana: {
    adminUser: string;
    adminPassword: string;
    httpPort: number;
  };
  /** Data retention policies */
  retention: {
    lokiPeriod: string;
    tempoPeriod: string;
    mimirPeriod: string;
  };
  /** Storage configuration */
  storage: {
    dataPath: string;
    configPath: string;
  };
}

/**
 * Complete observability configuration
 */
export interface ObservabilityConfig {
  otel: OtelConfig;
  exporter: OtlpExporterConfig;
  sampling: SamplingConfig;
  resource: ResourceConfig;
  instrumentation: InstrumentationConfig;
  performance: PerformanceConfig;
  simplycast: SimplyCasterConfig;
  lgtm: LgtmConfig;
}

// ============================================================================
// CONFIGURATION DEFAULTS
// ============================================================================

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: ObservabilityConfig = {
  otel: {
    enabled: true,
    serviceName: 'simplycast',
    serviceVersion: '1.0.0',
    serviceNamespace: 'simplycast',
    environment: 'development',
  },
  exporter: {
    endpoint: 'http://localhost:4318',
    protocol: 'http/protobuf',
    timeout: 10000,
  },
  sampling: {
    tracesSampler: 'traceidratio',
    tracesSamplerArg: 1.0,
    metricsExemplarFilter: 'trace_based',
  },
  resource: {
    attributes: {
      'service.name': 'simplycast',
      'service.version': '1.0.0',
      'deployment.environment': 'development',
      'service.namespace': 'simplycast',
    },
  },
  instrumentation: {
    tracesExporter: ['otlp'],
    metricsExporter: ['otlp'],
    logsExporter: ['otlp'],
    metricExportInterval: 5000,
    batchSpanProcessor: {
      maxExportBatchSize: 512,
      exportTimeout: 30000,
      scheduleDelay: 5000,
      maxQueueSize: 2048,
    },
  },
  performance: {
    sdkDisabled: false,
    propagators: ['tracecontext', 'baggage'],
    attributeValueLengthLimit: 4096,
    attributeCountLimit: 128,
    spanAttributeValueLengthLimit: 4096,
    spanAttributeCountLimit: 128,
    spanEventCountLimit: 128,
    spanLinkCountLimit: 128,
    eventAttributeCountLimit: 128,
    linkAttributeCountLimit: 128,
  },
  simplycast: {
    webrtcInstrumentation: true,
    recordingInstrumentation: true,
    databaseInstrumentation: true,
    redisInstrumentation: true,
    authInstrumentation: true,
    slowQueryThreshold: 1000,
    slowRequestThreshold: 2000,
    cacheMissAlertThreshold: 0.8,
  },
  lgtm: {
    grafana: {
      adminUser: 'admin',
      adminPassword: 'admin',
      httpPort: 3000,
    },
    retention: {
      lokiPeriod: '24h',
      tempoPeriod: '24h',
      mimirPeriod: '168h',
    },
    storage: {
      dataPath: '/var/lib/otel-lgtm',
      configPath: '/etc/otel-lgtm',
    },
  },
};

// ============================================================================
// ENVIRONMENT VARIABLE PARSING
// ============================================================================

/**
 * Parse boolean environment variable with fallback
 */
function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Parse number environment variable with fallback
 */
function parseNumberEnv(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse string array environment variable with fallback
 */
function parseStringArrayEnv(value: string | undefined, defaultValue: string[]): string[] {
  if (!value) return defaultValue;
  return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Parse resource attributes from environment variable
 */
function parseResourceAttributes(value: string | undefined, defaultValue: Record<string, string>): Record<string, string> {
  if (!value) return defaultValue;
  
  const attributes: Record<string, string> = {};
  const pairs = value.split(',');
  
  for (const pair of pairs) {
    const [key, val] = pair.split('=');
    if (key && val) {
      attributes[key.trim()] = val.trim();
    }
  }
  
  return Object.keys(attributes).length > 0 ? attributes : defaultValue;
}

/**
 * Load configuration from environment variables
 */
export function loadConfigFromEnv(): ObservabilityConfig {
  const config: ObservabilityConfig = {
    otel: {
      enabled: parseBooleanEnv(Deno.env.get('OTEL_DENO'), DEFAULT_CONFIG.otel.enabled),
      serviceName: Deno.env.get('OTEL_SERVICE_NAME') || DEFAULT_CONFIG.otel.serviceName,
      serviceVersion: Deno.env.get('OTEL_SERVICE_VERSION') || DEFAULT_CONFIG.otel.serviceVersion,
      serviceNamespace: Deno.env.get('OTEL_SERVICE_NAMESPACE') || DEFAULT_CONFIG.otel.serviceNamespace,
      environment: (Deno.env.get('OTEL_ENVIRONMENT') as 'development' | 'staging' | 'production') || DEFAULT_CONFIG.otel.environment,
    },
    exporter: {
      endpoint: Deno.env.get('OTEL_EXPORTER_OTLP_ENDPOINT') || DEFAULT_CONFIG.exporter.endpoint,
      protocol: (Deno.env.get('OTEL_EXPORTER_OTLP_PROTOCOL') as 'grpc' | 'http/protobuf' | 'http/json') || DEFAULT_CONFIG.exporter.protocol,
      timeout: parseNumberEnv(Deno.env.get('OTEL_EXPORTER_OTLP_TIMEOUT'), DEFAULT_CONFIG.exporter.timeout),
      tracesEndpoint: Deno.env.get('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'),
      metricsEndpoint: Deno.env.get('OTEL_EXPORTER_OTLP_METRICS_ENDPOINT'),
      logsEndpoint: Deno.env.get('OTEL_EXPORTER_OTLP_LOGS_ENDPOINT'),
    },
    sampling: {
      tracesSampler: (Deno.env.get('OTEL_TRACES_SAMPLER') as 'always_on' | 'always_off' | 'traceidratio' | 'parentbased_always_on' | 'parentbased_always_off' | 'parentbased_traceidratio') || DEFAULT_CONFIG.sampling.tracesSampler,
      tracesSamplerArg: parseNumberEnv(Deno.env.get('OTEL_TRACES_SAMPLER_ARG'), DEFAULT_CONFIG.sampling.tracesSamplerArg),
      metricsExemplarFilter: (Deno.env.get('OTEL_METRICS_EXEMPLAR_FILTER') as 'always_on' | 'always_off' | 'trace_based') || DEFAULT_CONFIG.sampling.metricsExemplarFilter,
    },
    resource: {
      attributes: parseResourceAttributes(
        Deno.env.get('OTEL_RESOURCE_ATTRIBUTES'),
        DEFAULT_CONFIG.resource.attributes
      ),
    },
    instrumentation: {
      tracesExporter: parseStringArrayEnv(Deno.env.get('OTEL_TRACES_EXPORTER'), DEFAULT_CONFIG.instrumentation.tracesExporter),
      metricsExporter: parseStringArrayEnv(Deno.env.get('OTEL_METRICS_EXPORTER'), DEFAULT_CONFIG.instrumentation.metricsExporter),
      logsExporter: parseStringArrayEnv(Deno.env.get('OTEL_LOGS_EXPORTER'), DEFAULT_CONFIG.instrumentation.logsExporter),
      metricExportInterval: parseNumberEnv(Deno.env.get('OTEL_METRIC_EXPORT_INTERVAL'), DEFAULT_CONFIG.instrumentation.metricExportInterval),
      batchSpanProcessor: {
        maxExportBatchSize: parseNumberEnv(Deno.env.get('OTEL_BSP_MAX_EXPORT_BATCH_SIZE'), DEFAULT_CONFIG.instrumentation.batchSpanProcessor.maxExportBatchSize),
        exportTimeout: parseNumberEnv(Deno.env.get('OTEL_BSP_EXPORT_TIMEOUT'), DEFAULT_CONFIG.instrumentation.batchSpanProcessor.exportTimeout),
        scheduleDelay: parseNumberEnv(Deno.env.get('OTEL_BSP_SCHEDULE_DELAY'), DEFAULT_CONFIG.instrumentation.batchSpanProcessor.scheduleDelay),
        maxQueueSize: parseNumberEnv(Deno.env.get('OTEL_BSP_MAX_QUEUE_SIZE'), DEFAULT_CONFIG.instrumentation.batchSpanProcessor.maxQueueSize),
      },
    },
    performance: {
      sdkDisabled: parseBooleanEnv(Deno.env.get('OTEL_SDK_DISABLED'), DEFAULT_CONFIG.performance.sdkDisabled),
      propagators: parseStringArrayEnv(Deno.env.get('OTEL_PROPAGATORS'), DEFAULT_CONFIG.performance.propagators),
      attributeValueLengthLimit: parseNumberEnv(Deno.env.get('OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT'), DEFAULT_CONFIG.performance.attributeValueLengthLimit),
      attributeCountLimit: parseNumberEnv(Deno.env.get('OTEL_ATTRIBUTE_COUNT_LIMIT'), DEFAULT_CONFIG.performance.attributeCountLimit),
      spanAttributeValueLengthLimit: parseNumberEnv(Deno.env.get('OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT'), DEFAULT_CONFIG.performance.spanAttributeValueLengthLimit),
      spanAttributeCountLimit: parseNumberEnv(Deno.env.get('OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT'), DEFAULT_CONFIG.performance.spanAttributeCountLimit),
      spanEventCountLimit: parseNumberEnv(Deno.env.get('OTEL_SPAN_EVENT_COUNT_LIMIT'), DEFAULT_CONFIG.performance.spanEventCountLimit),
      spanLinkCountLimit: parseNumberEnv(Deno.env.get('OTEL_SPAN_LINK_COUNT_LIMIT'), DEFAULT_CONFIG.performance.spanLinkCountLimit),
      eventAttributeCountLimit: parseNumberEnv(Deno.env.get('OTEL_EVENT_ATTRIBUTE_COUNT_LIMIT'), DEFAULT_CONFIG.performance.eventAttributeCountLimit),
      linkAttributeCountLimit: parseNumberEnv(Deno.env.get('OTEL_LINK_ATTRIBUTE_COUNT_LIMIT'), DEFAULT_CONFIG.performance.linkAttributeCountLimit),
    },
    simplycast: {
      webrtcInstrumentation: parseBooleanEnv(Deno.env.get('OTEL_SIMPLYCAST_WEBRTC_INSTRUMENTATION'), DEFAULT_CONFIG.simplycast.webrtcInstrumentation),
      recordingInstrumentation: parseBooleanEnv(Deno.env.get('OTEL_SIMPLYCAST_RECORDING_INSTRUMENTATION'), DEFAULT_CONFIG.simplycast.recordingInstrumentation),
      databaseInstrumentation: parseBooleanEnv(Deno.env.get('OTEL_SIMPLYCAST_DATABASE_INSTRUMENTATION'), DEFAULT_CONFIG.simplycast.databaseInstrumentation),
      redisInstrumentation: parseBooleanEnv(Deno.env.get('OTEL_SIMPLYCAST_REDIS_INSTRUMENTATION'), DEFAULT_CONFIG.simplycast.redisInstrumentation),
      authInstrumentation: parseBooleanEnv(Deno.env.get('OTEL_SIMPLYCAST_AUTH_INSTRUMENTATION'), DEFAULT_CONFIG.simplycast.authInstrumentation),
      slowQueryThreshold: parseNumberEnv(Deno.env.get('OTEL_SIMPLYCAST_SLOW_QUERY_THRESHOLD'), DEFAULT_CONFIG.simplycast.slowQueryThreshold),
      slowRequestThreshold: parseNumberEnv(Deno.env.get('OTEL_SIMPLYCAST_SLOW_REQUEST_THRESHOLD'), DEFAULT_CONFIG.simplycast.slowRequestThreshold),
      cacheMissAlertThreshold: parseNumberEnv(Deno.env.get('OTEL_SIMPLYCAST_CACHE_MISS_ALERT_THRESHOLD'), DEFAULT_CONFIG.simplycast.cacheMissAlertThreshold),
    },
    lgtm: {
      grafana: {
        adminUser: Deno.env.get('GRAFANA_ADMIN_USER') || DEFAULT_CONFIG.lgtm.grafana.adminUser,
        adminPassword: Deno.env.get('GRAFANA_ADMIN_PASSWORD') || DEFAULT_CONFIG.lgtm.grafana.adminPassword,
        httpPort: parseNumberEnv(Deno.env.get('GRAFANA_HTTP_PORT'), DEFAULT_CONFIG.lgtm.grafana.httpPort),
      },
      retention: {
        lokiPeriod: Deno.env.get('LOKI_RETENTION_PERIOD') || DEFAULT_CONFIG.lgtm.retention.lokiPeriod,
        tempoPeriod: Deno.env.get('TEMPO_RETENTION_PERIOD') || DEFAULT_CONFIG.lgtm.retention.tempoPeriod,
        mimirPeriod: Deno.env.get('MIMIR_RETENTION_PERIOD') || DEFAULT_CONFIG.lgtm.retention.mimirPeriod,
      },
      storage: {
        dataPath: Deno.env.get('OTEL_LGTM_DATA_PATH') || DEFAULT_CONFIG.lgtm.storage.dataPath,
        configPath: Deno.env.get('OTEL_LGTM_CONFIG_PATH') || DEFAULT_CONFIG.lgtm.storage.configPath,
      },
    },
  };

  // Parse optional headers
  const headersEnv = Deno.env.get('OTEL_EXPORTER_OTLP_HEADERS');
  if (headersEnv) {
    const headers: Record<string, string> = {};
    const pairs = headersEnv.split(',');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        headers[key.trim()] = value.trim();
      }
    }
    config.exporter.headers = headers;
  }

  return config;
}

// ============================================================================
// CONFIGURATION VALIDATION
// ============================================================================

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(message: string, public field: string) {
    super(`Configuration validation error for field '${field}': ${message}`);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Validate URL format
 */
function validateUrl(url: string, field: string): void {
  try {
    new URL(url);
  } catch {
    throw new ConfigValidationError(`Invalid URL format: ${url}`, field);
  }
}

/**
 * Validate number range
 */
function validateNumberRange(value: number, min: number, max: number, field: string): void {
  if (value < min || value > max) {
    throw new ConfigValidationError(`Value ${value} must be between ${min} and ${max}`, field);
  }
}

/**
 * Validate enum value
 */
function validateEnum<T extends string>(value: T, validValues: readonly T[], field: string): void {
  if (!validValues.includes(value)) {
    throw new ConfigValidationError(`Invalid value '${value}'. Must be one of: ${validValues.join(', ')}`, field);
  }
}

/**
 * Validate observability configuration
 */
export function validateConfig(config: ObservabilityConfig): void {
  // Validate OTEL config
  if (!config.otel.serviceName.trim()) {
    throw new ConfigValidationError('Service name cannot be empty', 'otel.serviceName');
  }
  
  if (!config.otel.serviceVersion.trim()) {
    throw new ConfigValidationError('Service version cannot be empty', 'otel.serviceVersion');
  }
  
  validateEnum(config.otel.environment, ['development', 'staging', 'production'] as const, 'otel.environment');

  // Validate exporter config
  validateUrl(config.exporter.endpoint, 'exporter.endpoint');
  validateEnum(config.exporter.protocol, ['grpc', 'http/protobuf', 'http/json'] as const, 'exporter.protocol');
  validateNumberRange(config.exporter.timeout, 1000, 60000, 'exporter.timeout');

  // Validate optional endpoints
  if (config.exporter.tracesEndpoint) {
    validateUrl(config.exporter.tracesEndpoint, 'exporter.tracesEndpoint');
  }
  if (config.exporter.metricsEndpoint) {
    validateUrl(config.exporter.metricsEndpoint, 'exporter.metricsEndpoint');
  }
  if (config.exporter.logsEndpoint) {
    validateUrl(config.exporter.logsEndpoint, 'exporter.logsEndpoint');
  }

  // Validate sampling config
  const validSamplers = ['always_on', 'always_off', 'traceidratio', 'parentbased_always_on', 'parentbased_always_off', 'parentbased_traceidratio'] as const;
  validateEnum(config.sampling.tracesSampler, validSamplers, 'sampling.tracesSampler');
  validateNumberRange(config.sampling.tracesSamplerArg, 0.0, 1.0, 'sampling.tracesSamplerArg');
  validateEnum(config.sampling.metricsExemplarFilter, ['always_on', 'always_off', 'trace_based'] as const, 'sampling.metricsExemplarFilter');

  // Validate instrumentation config
  validateNumberRange(config.instrumentation.metricExportInterval, 1000, 60000, 'instrumentation.metricExportInterval');
  validateNumberRange(config.instrumentation.batchSpanProcessor.maxExportBatchSize, 1, 2048, 'instrumentation.batchSpanProcessor.maxExportBatchSize');
  validateNumberRange(config.instrumentation.batchSpanProcessor.exportTimeout, 1000, 60000, 'instrumentation.batchSpanProcessor.exportTimeout');
  validateNumberRange(config.instrumentation.batchSpanProcessor.scheduleDelay, 100, 30000, 'instrumentation.batchSpanProcessor.scheduleDelay');
  validateNumberRange(config.instrumentation.batchSpanProcessor.maxQueueSize, 1, 8192, 'instrumentation.batchSpanProcessor.maxQueueSize');

  // Validate performance config
  validateNumberRange(config.performance.attributeValueLengthLimit, 1, 32768, 'performance.attributeValueLengthLimit');
  validateNumberRange(config.performance.attributeCountLimit, 1, 1024, 'performance.attributeCountLimit');
  validateNumberRange(config.performance.spanAttributeValueLengthLimit, 1, 32768, 'performance.spanAttributeValueLengthLimit');
  validateNumberRange(config.performance.spanAttributeCountLimit, 1, 1024, 'performance.spanAttributeCountLimit');
  validateNumberRange(config.performance.spanEventCountLimit, 1, 1024, 'performance.spanEventCountLimit');
  validateNumberRange(config.performance.spanLinkCountLimit, 1, 1024, 'performance.spanLinkCountLimit');

  // Validate SimplyCaster config
  validateNumberRange(config.simplycast.slowQueryThreshold, 100, 10000, 'simplycast.slowQueryThreshold');
  validateNumberRange(config.simplycast.slowRequestThreshold, 100, 30000, 'simplycast.slowRequestThreshold');
  validateNumberRange(config.simplycast.cacheMissAlertThreshold, 0.0, 1.0, 'simplycast.cacheMissAlertThreshold');

  // Validate LGTM config
  if (!config.lgtm.grafana.adminUser.trim()) {
    throw new ConfigValidationError('Grafana admin user cannot be empty', 'lgtm.grafana.adminUser');
  }
  if (!config.lgtm.grafana.adminPassword.trim()) {
    throw new ConfigValidationError('Grafana admin password cannot be empty', 'lgtm.grafana.adminPassword');
  }
  validateNumberRange(config.lgtm.grafana.httpPort, 1, 65535, 'lgtm.grafana.httpPort');

  // Validate retention periods format (basic check for time format)
  const timeFormatRegex = /^\d+[smhd]$/;
  if (!timeFormatRegex.test(config.lgtm.retention.lokiPeriod)) {
    throw new ConfigValidationError(`Invalid time format: ${config.lgtm.retention.lokiPeriod}. Use format like '24h', '7d', etc.`, 'lgtm.retention.lokiPeriod');
  }
  if (!timeFormatRegex.test(config.lgtm.retention.tempoPeriod)) {
    throw new ConfigValidationError(`Invalid time format: ${config.lgtm.retention.tempoPeriod}. Use format like '24h', '7d', etc.`, 'lgtm.retention.tempoPeriod');
  }
  if (!timeFormatRegex.test(config.lgtm.retention.mimirPeriod)) {
    throw new ConfigValidationError(`Invalid time format: ${config.lgtm.retention.mimirPeriod}. Use format like '24h', '7d', etc.`, 'lgtm.retention.mimirPeriod');
  }
}

/**
 * Load and validate configuration from environment
 */
export function loadAndValidateConfig(): ObservabilityConfig {
  const config = loadConfigFromEnv();
  validateConfig(config);
  return config;
}

// ============================================================================
// CONFIGURATION UTILITIES
// ============================================================================

/**
 * Deep partial type for configuration overrides
 */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Get environment-specific configuration overrides
 */
export function getEnvironmentOverrides(environment: string): DeepPartial<ObservabilityConfig> {
  switch (environment) {
    case 'development':
      return {
        sampling: {
          tracesSampler: 'always_on',
          tracesSamplerArg: 1.0,
          metricsExemplarFilter: 'always_on',
        },
        lgtm: {
          retention: {
            lokiPeriod: '24h',
            tempoPeriod: '24h',
            mimirPeriod: '72h',
          },
        },
      };
    
    case 'staging':
      return {
        sampling: {
          tracesSampler: 'traceidratio',
          tracesSamplerArg: 0.5,
          metricsExemplarFilter: 'trace_based',
        },
        lgtm: {
          retention: {
            lokiPeriod: '72h',
            tempoPeriod: '72h',
            mimirPeriod: '168h',
          },
        },
      };
    
    case 'production':
      return {
        sampling: {
          tracesSampler: 'traceidratio',
          tracesSamplerArg: 0.1,
          metricsExemplarFilter: 'trace_based',
        },
        lgtm: {
          retention: {
            lokiPeriod: '168h',
            tempoPeriod: '168h',
            mimirPeriod: '720h',
          },
        },
      };
    
    default:
      return {};
  }
}

/**
 * Merge configuration with overrides
 */
export function mergeConfig(base: ObservabilityConfig, overrides: DeepPartial<ObservabilityConfig>): ObservabilityConfig {
  // Helper to merge arrays, filtering out undefined values
  const mergeArrays = <T>(baseArray: T[], overrideArray?: (T | undefined)[]): T[] => {
    if (!overrideArray) return baseArray;
    return overrideArray.filter((item): item is T => item !== undefined);
  };

  // Helper to merge objects, filtering out undefined values
  const mergeObjects = <T>(baseObj: T, overrideObj?: Partial<T>): T => {
    if (!overrideObj) return baseObj;
    const result = { ...baseObj };
    for (const [key, value] of Object.entries(overrideObj)) {
      if (value !== undefined) {
        (result as Record<string, unknown>)[key] = value;
      }
    }
    return result;
  };

  return {
    otel: mergeObjects(base.otel, overrides.otel),
    exporter: mergeObjects(base.exporter, overrides.exporter),
    sampling: mergeObjects(base.sampling, overrides.sampling),
    resource: { 
      attributes: mergeObjects(base.resource.attributes, overrides.resource?.attributes)
    },
    instrumentation: {
      tracesExporter: overrides.instrumentation?.tracesExporter 
        ? mergeArrays(base.instrumentation.tracesExporter, overrides.instrumentation.tracesExporter)
        : base.instrumentation.tracesExporter,
      metricsExporter: overrides.instrumentation?.metricsExporter
        ? mergeArrays(base.instrumentation.metricsExporter, overrides.instrumentation.metricsExporter)
        : base.instrumentation.metricsExporter,
      logsExporter: overrides.instrumentation?.logsExporter
        ? mergeArrays(base.instrumentation.logsExporter, overrides.instrumentation.logsExporter)
        : base.instrumentation.logsExporter,
      metricExportInterval: overrides.instrumentation?.metricExportInterval ?? base.instrumentation.metricExportInterval,
      batchSpanProcessor: mergeObjects(
        base.instrumentation.batchSpanProcessor,
        overrides.instrumentation?.batchSpanProcessor
      ),
    },
    performance: {
      ...base.performance,
      propagators: overrides.performance?.propagators
        ? mergeArrays(base.performance.propagators, overrides.performance.propagators)
        : base.performance.propagators,
      ...(overrides.performance && Object.fromEntries(
        Object.entries(overrides.performance).filter(([key, value]) => 
          key !== 'propagators' && value !== undefined
        )
      )),
    },
    simplycast: mergeObjects(base.simplycast, overrides.simplycast),
    lgtm: {
      grafana: mergeObjects(base.lgtm.grafana, overrides.lgtm?.grafana),
      retention: mergeObjects(base.lgtm.retention, overrides.lgtm?.retention),
      storage: mergeObjects(base.lgtm.storage, overrides.lgtm?.storage),
    },
  };
}

/**
 * Create configuration for specific environment
 */
export function createEnvironmentConfig(environment: string): ObservabilityConfig {
  const baseConfig = loadConfigFromEnv();
  const overrides = getEnvironmentOverrides(environment);
  const config = mergeConfig(baseConfig, overrides);
  validateConfig(config);
  return config;
}