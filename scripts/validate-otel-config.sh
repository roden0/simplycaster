#!/bin/bash

# OpenTelemetry Configuration Validation Script
# This script validates OpenTelemetry environment configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Validation results
ERRORS=0
WARNINGS=0

print_header() {
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}  OpenTelemetry Configuration Validation${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo
}

print_section() {
    echo -e "${BLUE}$1${NC}"
    echo "----------------------------------------"
}

check_required() {
    local var_name="$1"
    local var_value="${!var_name}"
    local description="$2"
    
    if [[ -z "$var_value" ]]; then
        echo -e "${RED}✗ $var_name${NC} - $description (REQUIRED)"
        ((ERRORS++))
        return 1
    else
        echo -e "${GREEN}✓ $var_name${NC} = $var_value"
        return 0
    fi
}

check_optional() {
    local var_name="$1"
    local var_value="${!var_name}"
    local description="$2"
    local default_value="$3"
    
    if [[ -z "$var_value" ]]; then
        echo -e "${YELLOW}⚠ $var_name${NC} - $description (using default: $default_value)"
        ((WARNINGS++))
    else
        echo -e "${GREEN}✓ $var_name${NC} = $var_value"
    fi
}

validate_endpoint() {
    local endpoint="$1"
    
    if [[ -n "$endpoint" ]]; then
        echo -n "  Testing connectivity to $endpoint... "
        if curl -s --max-time 5 "$endpoint/v1/traces" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Reachable${NC}"
        else
            echo -e "${YELLOW}⚠ Not reachable (may be normal if OTEL-LGTM is not running)${NC}"
            ((WARNINGS++))
        fi
    fi
}

validate_sampling_rate() {
    local rate="$1"
    
    if [[ -n "$rate" ]]; then
        if (( $(echo "$rate >= 0.0 && $rate <= 1.0" | bc -l) )); then
            echo -e "  ${GREEN}✓ Valid sampling rate${NC}"
        else
            echo -e "  ${RED}✗ Invalid sampling rate (must be between 0.0 and 1.0)${NC}"
            ((ERRORS++))
        fi
    fi
}

# Load environment variables from .env files if they exist
load_env_files() {
    local env_files=(".env" ".env.local" ".env.otel")
    
    for env_file in "${env_files[@]}"; do
        if [[ -f "$env_file" ]]; then
            echo -e "${BLUE}Loading environment from: $env_file${NC}"
            set -a
            source "$env_file"
            set +a
        fi
    done
    echo
}

# Main validation function
main() {
    print_header
    
    # Load environment files
    load_env_files
    
    # Core OpenTelemetry Configuration
    print_section "Core OpenTelemetry Configuration"
    check_required "OTEL_DENO" "Enable Deno auto-instrumentation"
    check_required "OTEL_SERVICE_NAME" "Service name identifier"
    check_optional "OTEL_SERVICE_VERSION" "Service version" "unknown"
    check_optional "OTEL_ENVIRONMENT" "Deployment environment" "unknown"
    echo
    
    # Exporter Configuration
    print_section "Exporter Configuration"
    check_required "OTEL_EXPORTER_OTLP_ENDPOINT" "OTLP collector endpoint"
    check_optional "OTEL_EXPORTER_OTLP_PROTOCOL" "OTLP protocol" "grpc"
    check_optional "OTEL_EXPORTER_OTLP_TIMEOUT" "Export timeout" "10000"
    
    # Test endpoint connectivity
    if [[ -n "$OTEL_EXPORTER_OTLP_ENDPOINT" ]]; then
        validate_endpoint "$OTEL_EXPORTER_OTLP_ENDPOINT"
    fi
    echo
    
    # Sampling Configuration
    print_section "Sampling Configuration"
    check_optional "OTEL_TRACES_SAMPLER" "Trace sampling strategy" "parentbased_always_on"
    check_optional "OTEL_TRACES_SAMPLER_ARG" "Sampling ratio" "1.0"
    check_optional "OTEL_METRICS_EXEMPLAR_FILTER" "Metrics exemplar filter" "trace_based"
    
    # Validate sampling rate
    if [[ -n "$OTEL_TRACES_SAMPLER_ARG" ]]; then
        validate_sampling_rate "$OTEL_TRACES_SAMPLER_ARG"
    fi
    echo
    
    # Resource Attributes
    print_section "Resource Attributes"
    check_optional "OTEL_RESOURCE_ATTRIBUTES" "Resource identification attributes" "service.name=unknown_service"
    echo
    
    # Performance Configuration
    print_section "Performance Configuration"
    check_optional "OTEL_BSP_MAX_EXPORT_BATCH_SIZE" "Max export batch size" "512"
    check_optional "OTEL_BSP_EXPORT_TIMEOUT" "Batch export timeout" "30000"
    check_optional "OTEL_BSP_SCHEDULE_DELAY" "Batch schedule delay" "5000"
    check_optional "OTEL_METRIC_EXPORT_INTERVAL" "Metric export interval" "60000"
    echo
    
    # SimplyCaster-Specific Configuration
    print_section "SimplyCaster-Specific Configuration"
    check_optional "OTEL_SIMPLYCAST_WEBRTC_INSTRUMENTATION" "WebRTC instrumentation" "true"
    check_optional "OTEL_SIMPLYCAST_RECORDING_INSTRUMENTATION" "Recording instrumentation" "true"
    check_optional "OTEL_SIMPLYCAST_DATABASE_INSTRUMENTATION" "Database instrumentation" "true"
    check_optional "OTEL_SIMPLYCAST_REDIS_INSTRUMENTATION" "Redis instrumentation" "true"
    echo
    
    # OTEL-LGTM Stack Configuration
    print_section "OTEL-LGTM Stack Configuration"
    check_optional "GRAFANA_ADMIN_USER" "Grafana admin username" "admin"
    check_optional "GRAFANA_ADMIN_PASSWORD" "Grafana admin password" "admin"
    check_optional "LOKI_RETENTION_PERIOD" "Loki log retention" "24h"
    check_optional "TEMPO_RETENTION_PERIOD" "Tempo trace retention" "24h"
    check_optional "MIMIR_RETENTION_PERIOD" "Mimir metrics retention" "168h"
    echo
    
    # Environment-Specific Recommendations
    print_section "Environment-Specific Recommendations"
    
    case "$OTEL_ENVIRONMENT" in
        "development")
            echo -e "${GREEN}✓ Development environment detected${NC}"
            if [[ "$OTEL_TRACES_SAMPLER_ARG" != "1.0" ]]; then
                echo -e "${YELLOW}⚠ Consider using 100% sampling (1.0) in development${NC}"
                ((WARNINGS++))
            fi
            ;;
        "staging")
            echo -e "${GREEN}✓ Staging environment detected${NC}"
            if (( $(echo "$OTEL_TRACES_SAMPLER_ARG > 0.5" | bc -l) )); then
                echo -e "${YELLOW}⚠ Consider reducing sampling rate (<= 0.5) in staging${NC}"
                ((WARNINGS++))
            fi
            ;;
        "production")
            echo -e "${GREEN}✓ Production environment detected${NC}"
            if (( $(echo "$OTEL_TRACES_SAMPLER_ARG > 0.1" | bc -l) )); then
                echo -e "${YELLOW}⚠ Consider reducing sampling rate (<= 0.1) in production${NC}"
                ((WARNINGS++))
            fi
            if [[ "$GRAFANA_ADMIN_PASSWORD" == "admin" ]]; then
                echo -e "${RED}✗ Change default Grafana password in production${NC}"
                ((ERRORS++))
            fi
            ;;
        *)
            echo -e "${YELLOW}⚠ Unknown environment: $OTEL_ENVIRONMENT${NC}"
            ((WARNINGS++))
            ;;
    esac
    echo
    
    # Summary
    print_section "Validation Summary"
    
    if [[ $ERRORS -eq 0 && $WARNINGS -eq 0 ]]; then
        echo -e "${GREEN}✓ All checks passed! OpenTelemetry is properly configured.${NC}"
    elif [[ $ERRORS -eq 0 ]]; then
        echo -e "${YELLOW}⚠ Configuration is valid with $WARNINGS warnings.${NC}"
        echo -e "${YELLOW}  Review warnings above for optimization opportunities.${NC}"
    else
        echo -e "${RED}✗ Configuration has $ERRORS errors and $WARNINGS warnings.${NC}"
        echo -e "${RED}  Fix errors before running the application.${NC}"
    fi
    
    echo
    echo -e "${BLUE}Next Steps:${NC}"
    echo "1. Fix any errors shown above"
    echo "2. Review warnings for optimization opportunities"
    echo "3. Start OTEL-LGTM stack: docker-compose up -d otel-lgtm"
    echo "4. Run application: OTEL_DENO=true deno run main.ts"
    echo "5. Access Grafana: http://localhost:3000"
    
    # Exit with error code if there are errors
    if [[ $ERRORS -gt 0 ]]; then
        exit 1
    fi
}

# Check if bc is available for floating point comparisons
if ! command -v bc &> /dev/null; then
    echo -e "${YELLOW}Warning: 'bc' command not found. Skipping numeric validations.${NC}"
    echo "Install bc for complete validation: apt-get install bc (Ubuntu) or brew install bc (macOS)"
    echo
fi

# Run main validation
main "$@"