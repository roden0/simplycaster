# OTEL-LGTM Configuration

This directory contains configuration files for the OTEL-LGTM observability stack.

## Structure

- `grafana/` - Grafana dashboard and datasource configurations
- `loki/` - Loki log aggregation configuration
- `tempo/` - Tempo distributed tracing configuration
- `mimir/` - Mimir metrics storage configuration
- `otel-collector/` - OpenTelemetry Collector configuration

## Usage

These configuration files are mounted into the OTEL-LGTM container to customize the observability stack for SimplyCaster.

The configurations are environment-specific and should be adjusted based on:
- Data retention requirements
- Performance needs
- Security policies
- Integration requirements

## Default Configuration

The OTEL-LGTM image comes with sensible defaults, but these configurations allow for:
- Custom dashboards for SimplyCaster metrics
- Specific log parsing rules
- Trace sampling configuration
- Alert rules and notification channels