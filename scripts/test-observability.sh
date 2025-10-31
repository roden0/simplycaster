#!/bin/bash

# Test script for OTEL-LGTM observability stack

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Test Docker Compose configuration validation
test_compose_configs() {
    print_status "Testing Docker Compose configurations..."
    
    # Test main compose file
    if docker-compose config --quiet > /dev/null 2>&1; then
        print_success "Main docker-compose.yml is valid"
    else
        print_error "Main docker-compose.yml has errors"
        return 1
    fi
    
    # Test development compose file
    if docker-compose -f docker/docker-compose.development.yml config --quiet > /dev/null 2>&1; then
        print_success "Development docker-compose.yml is valid"
    else
        print_error "Development docker-compose.yml has errors"
        return 1
    fi
    
    # Test production compose file (with dummy env vars)
    if COTURN_SECRET=test COTURN_EXTERNAL_IP=127.0.0.1 TURN_MASTER_KEY=test GRAFANA_ADMIN_PASSWORD=test \
       docker-compose -f docker/docker-compose.production.yml config --quiet > /dev/null 2>&1; then
        print_success "Production docker-compose.yml is valid"
    else
        print_error "Production docker-compose.yml has errors"
        return 1
    fi
}

# Test configuration files exist
test_config_files() {
    print_status "Testing observability configuration files..."
    
    local configs=(
        "lib/observability/config/README.md"
        "lib/observability/config/grafana/dashboards.yml"
        "lib/observability/config/grafana/datasources.yml"
        "lib/observability/config/otel-collector/config.yml"
        "lib/observability/config/loki/config.yml"
        "lib/observability/config/tempo/config.yml"
        "lib/observability/config/mimir/config.yml"
    )
    
    for config in "${configs[@]}"; do
        if [[ -f "$PROJECT_ROOT/$config" ]]; then
            print_success "Configuration file exists: $config"
        else
            print_error "Configuration file missing: $config"
            return 1
        fi
    done
}

# Test environment files have OTEL configuration
test_env_configs() {
    print_status "Testing environment configurations..."
    
    local env_files=(
        "config/environments/development.env"
        "config/environments/production.env"
        "config/environments/staging.env"
    )
    
    for env_file in "${env_files[@]}"; do
        if grep -q "OTEL_DENO=true" "$PROJECT_ROOT/$env_file"; then
            print_success "OTEL configuration found in $env_file"
        else
            print_error "OTEL configuration missing in $env_file"
            return 1
        fi
    done
}

# Test management script
test_management_script() {
    print_status "Testing observability management script..."
    
    if [[ -x "$PROJECT_ROOT/scripts/observability.sh" ]]; then
        print_success "Management script is executable"
    else
        print_error "Management script is not executable"
        return 1
    fi
    
    # Test script help
    if "$PROJECT_ROOT/scripts/observability.sh" 2>&1 | grep -q "Usage:"; then
        print_success "Management script shows usage information"
    else
        print_error "Management script doesn't show usage information"
        return 1
    fi
}

# Test documentation
test_documentation() {
    print_status "Testing observability documentation..."
    
    if [[ -f "$PROJECT_ROOT/docs/OBSERVABILITY_SETUP.md" ]]; then
        print_success "Observability documentation exists"
    else
        print_error "Observability documentation missing"
        return 1
    fi
}

# Main test execution
main() {
    print_status "Starting OTEL-LGTM observability stack tests..."
    
    cd "$PROJECT_ROOT"
    
    local failed=0
    
    test_compose_configs || failed=1
    test_config_files || failed=1
    test_env_configs || failed=1
    test_management_script || failed=1
    test_documentation || failed=1
    
    if [[ $failed -eq 0 ]]; then
        print_success "All observability tests passed!"
        echo ""
        print_status "Next steps:"
        print_status "1. Start the observability stack: ./scripts/observability.sh start"
        print_status "2. Run SimplyCaster with OTEL enabled: OTEL_DENO=true deno run main.ts"
        print_status "3. Access Grafana at http://localhost:3000 (admin/admin)"
        return 0
    else
        print_error "Some observability tests failed!"
        return 1
    fi
}

main "$@"