# OpenTelemetry Configuration Guide

This document provides comprehensive guidance on configuring OpenTelemetry for SimplyCaster across different environments.

## Overview

SimplyCaster uses OpenTelemetry for comprehensive observability, including:
- **Distributed Tracing**: Track requests across components
- **Metrics Collection**: Monitor performance and business metrics
- **Structured Logging**: Correlate logs with traces
- **OTEL-LGTM Stack**: Integrated observability platform

## Quick Start

### 1. Enable OpenTelemetry

Set the core environment variable to enable automatic instrumentation:

```bash
OTEL_DENO=true
```

### 2. Basic Configuration

Add these essential variables to your `.env` file:

```bash
# Core Configuration
OTEL_DENO=true
OTEL_SERVICE_NAME=simplycast
OTEL_SERVICE_VERSION=1.0.0
OTEL_ENVIRONMENT=development

# Exporter Configuration
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf

# Sampling Configuration
OTEL_TRACES_SAMPLER=traceidratio
OTEL_TRACES_SAMPLER_ARG=1.0

# Resource Attributes
OTEL_RESOURCE_ATTRIBUTES=service.name=simplycast,service.version=1.0.0,deployment.environment=development
```

### 3. Start Application

```bash
OTEL_DENO=true deno run main.ts
```

## Environment-Specific Configuration

### Development Environment

**Characteristics:**
- High sampling rate (100%) for complete visibility
- Local OTEL-LGTM stack
- Detailed logging enabled
- Short data retention

**Configuration:**
```bash
OTEL_ENVIRONMENT=development
OTEL_TRACES_SAMPLER_ARG=1.0
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_LOG_LEVEL=INFO
LOKI_RETENTION_PERIOD=24h
TEMPO_RETENTION_PERIOD=24h
MIMIR_RETENTION_PERIOD=168h
```

### Staging Environment

**Characteristics:**
- Medium sampling rate (50%) for balanced performance
- Containerized OTEL-LGTM stack
- Production-like configuration
- Medium data retention

**Configuration:**
```bash
OTEL_ENVIRONMENT=staging
OTEL_TRACES_SAMPLER_ARG=0.5
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-lgtm:4318
OTEL_LOG_LEVEL=WARN
LOKI_RETENTION_PERIOD=168h
TEMPO_RETENTION_PERIOD=168h
MIMIR_RETENTION_PERIOD=720h
```

### Production Environment

**Characteristics:**
- Low sampling rate (10%) for optimal performance
- Secure OTEL-LGTM stack
- Minimal logging overhead
- Long data retention

**Configuration:**
```bash
OTEL_ENVIRONMENT=production
OTEL_TRACES_SAMPLER_ARG=0.1
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-lgtm:4318
OTEL_LOG_LEVEL=ERROR
LOKI_RETENTION_PERIOD=720h
TEMPO_RETENTION_PERIOD=720h
MIMIR_RETENTION_PERIOD=2160h
```

## Configuration Categories

### Core OpenTelemetry Settings

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OTEL_DENO` | Enable Deno auto-instrumentation | `false` | ✅ |
| `OTEL_SERVICE_NAME` | Service identifier | `unknown_service` | ✅ |
| `OTEL_SERVICE_VERSION` | Service version | `unknown` | ✅ |
| `OTEL_ENVIRONMENT` | Deployment environment | `unknown` | ✅ |

### Exporter Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector endpoint | `http://localhost:4317` | ✅ |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Export protocol | `grpc` | ❌ |
| `OTEL_EXPORTER_OTLP_TIMEOUT` | Export timeout (ms) | `10000` | ❌ |
| `OTEL_EXPORTER_OTLP_HEADERS` | Authentication headers | - | ❌ |

### Sampling Configuration

| Variable | Description | Values | Default |
|----------|-------------|--------|---------|
| `OTEL_TRACES_SAMPLER` | Sampling strategy | `always_on`, `always_off`, `traceidratio` | `parentbased_always_on` |
| `OTEL_TRACES_SAMPLER_ARG` | Sampling ratio (0.0-1.0) | `0.0` to `1.0` | `1.0` |
| `OTEL_METRICS_EXEMPLAR_FILTER` | Exemplar filtering | `always_on`, `always_off`, `trace_based` | `trace_based` |

### Resource Attributes

Resource attributes identify your service in the observability stack:

```bash
OTEL_RESOURCE_ATTRIBUTES=service.name=simplycast,service.version=1.0.0,deployment.environment=development,service.namespace=simplycast
```

**Standard Attributes:**
- `service.name`: Service identifier
- `service.version`: Service version
- `service.namespace`: Service namespace
- `deployment.environment`: Environment name
- `service.instance.id`: Instance identifier
- `host.name`: Hostname
- `container.name`: Container name

### Performance Tuning

| Variable | Description | Default | Recommended |
|----------|-------------|---------|-------------|
| `OTEL_BSP_MAX_EXPORT_BATCH_SIZE` | Max spans per batch | `512` | `512` |
| `OTEL_BSP_EXPORT_TIMEOUT` | Batch export timeout (ms) | `30000` | `30000` |
| `OTEL_BSP_SCHEDULE_DELAY` | Batch schedule delay (ms) | `5000` | `5000` |
| `OTEL_BSP_MAX_QUEUE_SIZE` | Max queue size | `2048` | `2048` |
| `OTEL_METRIC_EXPORT_INTERVAL` | Metric export interval (ms) | `60000` | `5000` |

### SimplyCaster-Specific Configuration

Custom configuration for SimplyCaster components:

```bash
# Component instrumentation flags
OTEL_SIMPLYCAST_WEBRTC_INSTRUMENTATION=true
OTEL_SIMPLYCAST_RECORDING_INSTRUMENTATION=true
OTEL_SIMPLYCAST_DATABASE_INSTRUMENTATION=true
OTEL_SIMPLYCAST_REDIS_INSTRUMENTATION=true
OTEL_SIMPLYCAST_AUTH_INSTRUMENTATION=true

# Performance thresholds
OTEL_SIMPLYCAST_SLOW_QUERY_THRESHOLD=1000
OTEL_SIMPLYCAST_SLOW_REQUEST_THRESHOLD=2000
OTEL_SIMPLYCAST_CACHE_MISS_ALERT_THRESHOLD=0.8
```

## Configuration Tools

### Automated Configuration Script

Use the provided script to generate environment-specific configurations:

```bash
# Generate development configuration
./scripts/configure-otel.sh --environment development

# Generate production configuration
./scripts/configure-otel.sh --environment production --output .env.production

# Custom service configuration
./scripts/configure-otel.sh --service-name simplycast-api --version 2.0.0
```

### Environment Files

Pre-configured environment files are available:

- `config/environments/development.env` - Development settings
- `config/environments/staging.env` - Staging settings  
- `config/environments/production.env` - Production settings
- `config/environments/otel.env` - Complete reference

## Validation and Testing

### Verify Configuration

1. **Check Environment Variables:**
   ```bash
   env | grep OTEL_
   ```

2. **Test OTLP Endpoint:**
   ```bash
   curl -v http://localhost:4318/v1/traces
   ```

3. **Validate Service Registration:**
   Check Grafana for service appearance in dashboards.

### Common Issues

**Issue: No telemetry data appearing**
- Verify `OTEL_DENO=true` is set
- Check OTLP endpoint connectivity
- Confirm OTEL-LGTM stack is running

**Issue: High performance overhead**
- Reduce sampling rate (`OTEL_TRACES_SAMPLER_ARG`)
- Increase batch export intervals
- Disable unnecessary instrumentations

**Issue: Missing trace correlation**
- Verify propagators configuration
- Check resource attributes
- Ensure consistent service naming

## Security Considerations

### Production Security

1. **Authentication:**
   ```bash
   OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer your-secure-token
   ```

2. **Network Security:**
   - Use HTTPS endpoints in production
   - Restrict collector access to internal networks
   - Enable TLS for OTLP communication

3. **Data Privacy:**
   - Configure attribute sanitization
   - Limit sensitive data in traces
   - Implement data retention policies

### Secrets Management

Store sensitive configuration in secure secret management:

```bash
# Use environment-specific secrets
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer ${OTEL_AUTH_TOKEN}
GRAFANA_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
```

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Telemetry Health:**
   - Export success rate
   - Queue depth
   - Export latency

2. **Application Performance:**
   - Request duration
   - Error rates
   - Resource utilization

3. **Business Metrics:**
   - Active rooms
   - Recording sessions
   - User activity

### Alerting Rules

Configure alerts for:
- High error rates (>5%)
- Slow requests (>2s)
- Export failures
- Queue overflow

## Troubleshooting

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
OTEL_LOG_LEVEL=DEBUG
OTEL_TRACES_EXPORTER=console,otlp
OTEL_METRICS_EXPORTER=console,otlp
```

### Performance Profiling

Monitor telemetry overhead:

```bash
# Disable telemetry temporarily
OTEL_SDK_DISABLED=true

# Enable minimal telemetry
OTEL_TRACES_SAMPLER=always_off
OTEL_METRICS_EXPORTER=none
```

### Log Analysis

Check application logs for OpenTelemetry messages:

```bash
# Filter OpenTelemetry logs
grep -i "otel\|telemetry\|trace" application.log

# Check export errors
grep -i "export.*error\|failed.*export" application.log
```

## Best Practices

### Configuration Management

1. **Environment Separation:** Use separate configurations for each environment
2. **Version Control:** Track configuration changes in version control
3. **Validation:** Validate configuration before deployment
4. **Documentation:** Document custom configurations

### Performance Optimization

1. **Sampling Strategy:** Use appropriate sampling rates per environment
2. **Batch Configuration:** Optimize batch sizes for your workload
3. **Resource Limits:** Set appropriate resource limits
4. **Selective Instrumentation:** Enable only needed instrumentations

### Operational Excellence

1. **Monitoring:** Monitor telemetry pipeline health
2. **Alerting:** Set up alerts for telemetry failures
3. **Retention:** Configure appropriate data retention
4. **Backup:** Backup observability configurations

## References

- [OpenTelemetry Environment Variables](https://opentelemetry.io/docs/reference/specification/sdk-environment-variables/)
- [Deno OpenTelemetry Documentation](https://docs.deno.com/runtime/manual/runtime/observability)
- [OTLP Specification](https://opentelemetry.io/docs/reference/specification/protocol/otlp/)
- [Grafana LGTM Stack](https://grafana.com/docs/grafana-cloud/quickstart/lgtm-stack/)