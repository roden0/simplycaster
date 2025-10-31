# SimplyCaster Observability Setup

This document describes the OpenTelemetry LGTM (Loki, Grafana, Tempo, Mimir) observability stack integration for SimplyCaster.

## Overview

The observability stack provides comprehensive monitoring, logging, and tracing capabilities:

- **Grafana**: Visualization and dashboards
- **Loki**: Log aggregation and querying
- **Tempo**: Distributed tracing
- **Mimir**: Metrics storage and querying
- **OpenTelemetry Collector**: Telemetry data collection and processing

## Quick Start

### Development Environment

1. Start the observability stack:
   ```bash
   ./scripts/observability.sh start
   ```

2. Start the SimplyCaster application with OpenTelemetry enabled:
   ```bash
   OTEL_DENO=true deno run main.ts
   ```

3. Access the services:
   - Grafana: http://localhost:3000 (admin/admin)
   - Loki: http://localhost:3100
   - Tempo: http://localhost:3200
   - Mimir: http://localhost:9090

### Production Environment

1. Configure environment variables in `config/environments/production.env`
2. Deploy using Docker Compose:
   ```bash
   docker-compose -f docker/docker-compose.production.yml up -d
   ```

## Configuration

### Environment Variables

The following environment variables control OpenTelemetry behavior:

```bash
# Enable OpenTelemetry
OTEL_DENO=true

# Service identification
OTEL_SERVICE_NAME=simplycast
OTEL_SERVICE_VERSION=1.0.0
OTEL_ENVIRONMENT=production

# Export configuration
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-lgtm:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf

# Sampling configuration
OTEL_TRACES_SAMPLER=traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1  # 10% sampling

# Resource attributes
OTEL_RESOURCE_ATTRIBUTES=service.name=simplycast,service.version=1.0.0,deployment.environment=production
```

### Data Retention

Default retention periods:

- **Development**: 24 hours (logs), 24 hours (traces), 7 days (metrics)
- **Staging**: 7 days (logs), 7 days (traces), 30 days (metrics)
- **Production**: 30 days (logs), 30 days (traces), 90 days (metrics)

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   SimplyCaster  │───▶│ OTEL Collector   │───▶│   LGTM Stack    │
│   Application   │    │                  │    │                 │
│                 │    │ - Receives OTLP  │    │ - Grafana       │
│ - Auto traces   │    │ - Processes data │    │ - Loki          │
│ - Custom spans  │    │ - Routes to LGTM │    │ - Tempo         │
│ - Metrics       │    │                  │    │ - Mimir         │
│ - Logs          │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Automatic Instrumentation

Deno automatically instruments:

- **HTTP Requests**: Incoming requests via `Deno.serve`
- **HTTP Clients**: Outgoing requests via `fetch`
- **Console Logs**: All `console.*` methods
- **Runtime Logs**: Deno runtime events and errors

## Custom Instrumentation

Add custom instrumentation using the OpenTelemetry API:

```typescript
import { trace, metrics } from "npm:@opentelemetry/api";

// Create tracer
const tracer = trace.getTracer("simplycast", "1.0.0");

// Create spans
function myFunction() {
  return tracer.startActiveSpan("myFunction", (span) => {
    try {
      // Your code here
      span.setAttributes({
        "user.id": userId,
        "room.id": roomId
      });
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: trace.SpanStatusCode.ERROR,
        message: error.message,
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

// Create metrics
const meter = metrics.getMeter("simplycast", "1.0.0");
const roomCounter = meter.createCounter("rooms_created_total", {
  description: "Total number of rooms created",
});

roomCounter.add(1, { host_id: hostId });
```

## Dashboards

Pre-configured dashboards are available for:

- **Application Overview**: Request rates, error rates, response times
- **WebRTC Monitoring**: Connection counts, quality metrics, session durations
- **Database Performance**: Query performance, connection pool usage
- **Infrastructure Health**: Resource utilization, service health

## Troubleshooting

### Common Issues

1. **OTEL-LGTM not starting**:
   ```bash
   # Check Docker resources
   docker system df
   
   # Check logs
   ./scripts/observability.sh logs
   ```

2. **No telemetry data**:
   - Verify `OTEL_DENO=true` is set
   - Check OTLP endpoint connectivity
   - Verify sampling configuration

3. **High resource usage**:
   - Reduce sampling rate (`OTEL_TRACES_SAMPLER_ARG`)
   - Adjust retention periods
   - Configure resource limits

### Health Checks

Check service health:

```bash
# Overall status
./scripts/observability.sh status

# Individual services
curl http://localhost:3000/api/health  # Grafana
curl http://localhost:3100/ready      # Loki
curl http://localhost:4318/v1/traces  # OTLP endpoint
```

## Security Considerations

- **Production**: Use secure passwords and authentication
- **Network**: Restrict access to observability ports
- **Data**: Configure appropriate retention policies
- **Secrets**: Use Docker secrets for sensitive configuration

## Performance Impact

OpenTelemetry overhead is minimal:

- **CPU**: < 1% additional CPU usage
- **Memory**: ~50MB additional memory
- **Network**: Depends on sampling rate and data volume

Recommended sampling rates:
- **Development**: 100% (`OTEL_TRACES_SAMPLER_ARG=1.0`)
- **Staging**: 50% (`OTEL_TRACES_SAMPLER_ARG=0.5`)
- **Production**: 10% (`OTEL_TRACES_SAMPLER_ARG=0.1`)

## Management Commands

Use the observability management script:

```bash
# Start the stack
./scripts/observability.sh start

# Stop the stack
./scripts/observability.sh stop

# Restart the stack
./scripts/observability.sh restart

# View logs
./scripts/observability.sh logs

# Check status
./scripts/observability.sh status

# Clean up data (destructive)
./scripts/observability.sh cleanup
```