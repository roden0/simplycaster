#!/bin/bash

# Validate Grafana Dashboard Configuration
# This script validates the JSON structure of Grafana dashboards and configuration files

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
GRAFANA_CONFIG_DIR="$PROJECT_ROOT/lib/observability/config/grafana"

echo "🔍 Validating Grafana Dashboard Configuration..."
echo "Configuration directory: $GRAFANA_CONFIG_DIR"

# Check if configuration directory exists
if [ ! -d "$GRAFANA_CONFIG_DIR" ]; then
    echo "❌ Grafana configuration directory not found: $GRAFANA_CONFIG_DIR"
    exit 1
fi

# Validate YAML configuration files
echo ""
echo "📋 Validating YAML configuration files..."

for yaml_file in "$GRAFANA_CONFIG_DIR"/*.yml; do
    if [ -f "$yaml_file" ]; then
        filename=$(basename "$yaml_file")
        echo -n "  Validating $filename... "
        
        if command -v yq >/dev/null 2>&1; then
            if yq eval '.' "$yaml_file" >/dev/null 2>&1; then
                echo "✅ Valid"
            else
                echo "❌ Invalid YAML syntax"
                exit 1
            fi
        elif python3 -c "import yaml" 2>/dev/null; then
            if python3 -c "import yaml; yaml.safe_load(open('$yaml_file'))" 2>/dev/null; then
                echo "✅ Valid"
            else
                echo "❌ Invalid YAML syntax"
                exit 1
            fi
        else
            echo "⚠️  Skipped (no YAML validator available)"
        fi
    fi
done

# Validate JSON dashboard files
echo ""
echo "📊 Validating JSON dashboard files..."

dashboard_count=0
for json_file in "$GRAFANA_CONFIG_DIR"/simplycast/*.json; do
    if [ -f "$json_file" ]; then
        filename=$(basename "$json_file")
        echo -n "  Validating $filename... "
        
        if python3 -m json.tool "$json_file" >/dev/null 2>&1; then
            echo "✅ Valid JSON"
            dashboard_count=$((dashboard_count + 1))
        else
            echo "❌ Invalid JSON syntax"
            exit 1
        fi
    fi
done

# Validate dashboard structure
echo ""
echo "🏗️  Validating dashboard structure..."

for json_file in "$GRAFANA_CONFIG_DIR"/simplycast/*.json; do
    if [ -f "$json_file" ]; then
        filename=$(basename "$json_file")
        echo -n "  Checking $filename structure... "
        
        # Check for required dashboard fields
        if python3 -c "
import json
import sys

with open('$json_file') as f:
    data = json.load(f)

dashboard = data.get('dashboard', {})
required_fields = ['title', 'panels', 'time', 'refresh']
missing_fields = [field for field in required_fields if field not in dashboard]

if missing_fields:
    print(f'Missing required fields: {missing_fields}')
    sys.exit(1)

if not isinstance(dashboard.get('panels'), list):
    print('Panels must be an array')
    sys.exit(1)

if len(dashboard.get('panels', [])) == 0:
    print('Dashboard must have at least one panel')
    sys.exit(1)

print('Valid structure')
" 2>/dev/null; then
            echo "✅ Valid structure"
        else
            echo "❌ Invalid dashboard structure"
            exit 1
        fi
    fi
done

# Summary
echo ""
echo "📈 Dashboard Summary:"
echo "  Total dashboards: $dashboard_count"
echo "  Configuration files: $(find "$GRAFANA_CONFIG_DIR" -name "*.yml" | wc -l)"
echo ""

# Check for expected dashboards
expected_dashboards=("overview-dashboard.json" "webrtc-dashboard.json" "database-infrastructure-dashboard.json")
missing_dashboards=()

for expected in "${expected_dashboards[@]}"; do
    if [ ! -f "$GRAFANA_CONFIG_DIR/simplycast/$expected" ]; then
        missing_dashboards+=("$expected")
    fi
done

if [ ${#missing_dashboards[@]} -eq 0 ]; then
    echo "✅ All expected dashboards are present:"
    for expected in "${expected_dashboards[@]}"; do
        echo "  - $expected"
    done
else
    echo "❌ Missing expected dashboards:"
    for missing in "${missing_dashboards[@]}"; do
        echo "  - $missing"
    done
    exit 1
fi

echo ""
echo "🎉 All Grafana dashboard configurations are valid!"
echo ""
echo "📝 Next steps:"
echo "  1. Start the OTEL-LGTM stack: docker-compose -f docker/docker-compose.development.yml up otel-lgtm"
echo "  2. Access Grafana at: http://localhost:3000"
echo "  3. Login with admin/admin (development) or configured credentials (production)"
echo "  4. Navigate to Dashboards > SimplyCaster folder to view the dashboards"