# Environment Configuration

This directory contains environment-specific configuration files for SimplyCaster.

## Files

- `development.env` - Development environment configuration
- `staging.env` - Staging environment configuration  
- `production.env` - Production environment configuration
- `otel.env` - Complete OpenTelemetry configuration reference

## OpenTelemetry Configuration

### Quick Start

1. **Generate configuration for your environment:**
   ```bash
   # Development
   deno task otel:dev
   
   # Staging  
   deno task otel:staging
   
   # Production
   deno task otel:prod
   ```

2. **Validate your configuration:**
   ```bash
   deno task otel:validate
   ```

3. **Start your application with OpenTelemetry:**
   ```bash
   OTEL_DENO=true deno run main.ts
   ```

### Environment Variables

The key OpenTelemetry environment variables are:

```bash
# Core Configuration
OTEL_DENO=true                                    # Enable Deno auto-instrumentation
OTEL_SERVICE_NAME=simplycast                      # Service name
OTEL_SERVICE_VERSION=1.0.0                       # Service version
OTEL_ENVIRONMENT=development                      # Environment name

# Exporter Configuration
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 # OTLP collector endpoint
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf         # Export protocol

# Sampling Configuration
OTEL_TRACES_SAMPLER=traceidratio                  # Sampling strategy
OTEL_TRACES_SAMPLER_ARG=1.0                       # Sampling rate (0.0-1.0)

# Resource Attributes
OTEL_RESOURCE_ATTRIBUTES=service.name=simplycast,service.version=1.0.0,deployment.environment=development
```

### Environment-Specific Settings

| Environment | Sampling Rate | Endpoint | Retention |
|-------------|---------------|----------|-----------|
| Development | 1.0 (100%) | localhost:4318 | 24h |
| Staging | 0.5 (50%) | otel-lgtm:4318 | 168h |
| Production | 0.1 (10%) | otel-lgtm:4318 | 720h |

## Usage

### Loading Environment Files

Environment files can be loaded in several ways:

1. **Direct sourcing:**
   ```bash
   source config/environments/development.env
   deno run main.ts
   ```

2. **Using environment-specific variables:**
   ```bash
   NODE_ENV=development deno run main.ts
   ```

3. **Docker Compose:**
   ```yaml
   services:
     app:
       env_file:
         - config/environments/production.env
   ```

### Configuration Tools

- `scripts/configure-otel.sh` - Generate OpenTelemetry configuration
- `scripts/validate-otel-config.sh` - Validate OpenTelemetry setup
- `deno task otel:*` - OpenTelemetry-related tasks

## Security Notes

- Never commit production secrets to version control
- Use environment variable substitution for sensitive values
- Rotate secrets regularly in production
- Use secure secret management systems

## Documentation

For complete documentation, see:
- [OpenTelemetry Configuration Guide](../../docs/OPENTELEMETRY_CONFIGURATION.md)
- [Observability Setup Guide](../../docs/OBSERVABILITY_SETUP.md)