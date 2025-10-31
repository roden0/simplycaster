#!/bin/bash

# OpenTelemetry Configuration Script for SimplyCaster
# This script helps configure OpenTelemetry environment variables for different environments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DEFAULT_SERVICE_NAME="simplycast"
DEFAULT_SERVICE_VERSION="1.0.0"
DEFAULT_ENVIRONMENT="development"
DEFAULT_ENDPOINT="http://localhost:4318"

print_header() {
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}  SimplyCaster OpenTelemetry Configuration${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo
}

print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Options:"
    echo "  -e, --environment ENV    Set environment (development|staging|production)"
    echo "  -s, --service-name NAME  Set service name (default: simplycast)"
    echo "  -v, --version VERSION    Set service version (default: 1.0.0)"
    echo "  -o, --output FILE        Output file (default: .env.otel)"
    echo "  -h, --help              Show this help message"
    echo
    echo "Examples:"
    echo "  $0 --environment development"
    echo "  $0 --environment production --output .env.production"
    echo "  $0 --service-name simplycast-api --version 2.0.0"
}

generate_config() {
    local env="$1"
    local service_name="$2"
    local service_version="$3"
    local output_file="$4"
    
    echo -e "${GREEN}Generating OpenTelemetry configuration for environment: ${env}${NC}"
    
    # Set environment-specific values
    case "$env" in
        "development")
            sampling_rate="1.0"
            endpoint="http://localhost:4318"
            log_level="INFO"
            retention_logs="24h"
            retention_traces="24h"
            retention_metrics="168h"
            ;;
        "staging")
            sampling_rate="0.5"
            endpoint="http://otel-lgtm:4318"
            log_level="WARN"
            retention_logs="168h"
            retention_traces="168h"
            retention_metrics="720h"
            ;;
        "production")
            sampling_rate="0.1"
            endpoint="http://otel-lgtm:4318"
            log_level="ERROR"
            retention_logs="720h"
            retention_traces="720h"
            retention_metrics="2160h"
            ;;
        *)
            echo -e "${RED}Error: Unknown environment '$env'${NC}"
            echo "Supported environments: development, staging, production"
            exit 1
            ;;
    esac
    
    # Generate configuration file
    cat > "$output_file" << EOF
# OpenTelemetry Configuration for SimplyCaster
# Environment: $env
# Generated on: $(date)

# ============================================================================
# CORE OPENTELEMETRY CONFIGURATION
# ============================================================================

# Enable OpenTelemetry automatic instrumentation in Deno
OTEL_DENO=true

# Service identification
OTEL_SERVICE_NAME=$service_name
OTEL_SERVICE_VERSION=$service_version
OTEL_SERVICE_NAMESPACE=simplycast

# Environment identification
OTEL_ENVIRONMENT=$env

# ============================================================================
# EXPORTER CONFIGURATION
# ============================================================================

# OTLP Exporter endpoint
OTEL_EXPORTER_OTLP_ENDPOINT=$endpoint

# OTLP Protocol
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf

# Export timeout (milliseconds)
OTEL_EXPORTER_OTLP_TIMEOUT=10000

# ============================================================================
# SAMPLING CONFIGURATION
# ============================================================================

# Trace sampling strategy and ratio
OTEL_TRACES_SAMPLER=traceidratio
OTEL_TRACES_SAMPLER_ARG=$sampling_rate

# Metrics exemplar filter
OTEL_METRICS_EXEMPLAR_FILTER=trace_based

# ============================================================================
# RESOURCE ATTRIBUTES
# ============================================================================

# Resource attributes identify the service and deployment
OTEL_RESOURCE_ATTRIBUTES=service.name=$service_name,service.version=$service_version,deployment.environment=$env,service.namespace=simplycast

# ============================================================================
# INSTRUMENTATION CONFIGURATION
# ============================================================================

# Enable signal types
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp

# Metric export interval (milliseconds)
OTEL_METRIC_EXPORT_INTERVAL=5000

# Batch span processor configuration
OTEL_BSP_MAX_EXPORT_BATCH_SIZE=512
OTEL_BSP_EXPORT_TIMEOUT=30000
OTEL_BSP_SCHEDULE_DELAY=5000
OTEL_BSP_MAX_QUEUE_SIZE=2048

# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================

# OpenTelemetry SDK log level
OTEL_LOG_LEVEL=$log_level

# ============================================================================
# PERFORMANCE AND RELIABILITY
# ============================================================================

# Propagators for trace context
OTEL_PROPAGATORS=tracecontext,baggage

# Attribute and span limits
OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT=4096
OTEL_ATTRIBUTE_COUNT_LIMIT=128
OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT=128
OTEL_SPAN_EVENT_COUNT_LIMIT=128
OTEL_SPAN_LINK_COUNT_LIMIT=128

# ============================================================================
# SIMPLYCASTER-SPECIFIC CONFIGURATION
# ============================================================================

# Custom instrumentation flags
OTEL_SIMPLYCAST_WEBRTC_INSTRUMENTATION=true
OTEL_SIMPLYCAST_RECORDING_INSTRUMENTATION=true
OTEL_SIMPLYCAST_DATABASE_INSTRUMENTATION=true
OTEL_SIMPLYCAST_REDIS_INSTRUMENTATION=true
OTEL_SIMPLYCAST_AUTH_INSTRUMENTATION=true

# Performance monitoring thresholds
OTEL_SIMPLYCAST_SLOW_QUERY_THRESHOLD=1000
OTEL_SIMPLYCAST_SLOW_REQUEST_THRESHOLD=2000
OTEL_SIMPLYCAST_CACHE_MISS_ALERT_THRESHOLD=0.8

# ============================================================================
# OTEL-LGTM STACK CONFIGURATION
# ============================================================================

# Grafana Configuration
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin

# Data retention policies
LOKI_RETENTION_PERIOD=$retention_logs
TEMPO_RETENTION_PERIOD=$retention_traces
MIMIR_RETENTION_PERIOD=$retention_metrics
EOF

    echo -e "${GREEN}Configuration written to: $output_file${NC}"
    echo
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Review the generated configuration"
    echo "2. Copy relevant variables to your .env file"
    echo "3. Start your application with: OTEL_DENO=true deno run main.ts"
    echo "4. Access Grafana at: http://localhost:3000 (admin/admin)"
}

validate_environment() {
    local env="$1"
    case "$env" in
        "development"|"staging"|"production")
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Parse command line arguments
ENVIRONMENT="$DEFAULT_ENVIRONMENT"
SERVICE_NAME="$DEFAULT_SERVICE_NAME"
SERVICE_VERSION="$DEFAULT_SERVICE_VERSION"
OUTPUT_FILE=".env.otel"

while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -s|--service-name)
            SERVICE_NAME="$2"
            shift 2
            ;;
        -v|--version)
            SERVICE_VERSION="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        -h|--help)
            print_header
            print_usage
            exit 0
            ;;
        *)
            echo -e "${RED}Error: Unknown option $1${NC}"
            print_usage
            exit 1
            ;;
    esac
done

# Validate inputs
if ! validate_environment "$ENVIRONMENT"; then
    echo -e "${RED}Error: Invalid environment '$ENVIRONMENT'${NC}"
    echo "Supported environments: development, staging, production"
    exit 1
fi

# Main execution
print_header

echo -e "${BLUE}Configuration:${NC}"
echo "  Environment: $ENVIRONMENT"
echo "  Service Name: $SERVICE_NAME"
echo "  Service Version: $SERVICE_VERSION"
echo "  Output File: $OUTPUT_FILE"
echo

# Generate the configuration
generate_config "$ENVIRONMENT" "$SERVICE_NAME" "$SERVICE_VERSION" "$OUTPUT_FILE"

echo -e "${GREEN}OpenTelemetry configuration completed successfully!${NC}"