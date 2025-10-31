#!/bin/bash

# SimplyCaster Observability Stack Management Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Function to start the observability stack
start_stack() {
    print_status "Starting OTEL-LGTM observability stack..."
    
    cd "$PROJECT_ROOT"
    
    # Start only the observability services
    docker-compose up -d otel-lgtm
    
    print_status "Waiting for services to be ready..."
    sleep 30
    
    # Check if Grafana is accessible
    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        print_success "Grafana is ready at http://localhost:3000"
        print_status "Default credentials: admin/admin"
    else
        print_warning "Grafana may still be starting up. Check http://localhost:3000"
    fi
    
    print_success "OTEL-LGTM stack started successfully!"
    print_status "Services available:"
    print_status "  - Grafana: http://localhost:3000"
    print_status "  - Loki: http://localhost:3100"
    print_status "  - Tempo: http://localhost:3200"
    print_status "  - Mimir: http://localhost:9090"
    print_status "  - OTLP HTTP: http://localhost:4318"
    print_status "  - OTLP gRPC: http://localhost:4317"
}

# Function to stop the observability stack
stop_stack() {
    print_status "Stopping OTEL-LGTM observability stack..."
    
    cd "$PROJECT_ROOT"
    docker-compose stop otel-lgtm
    
    print_success "OTEL-LGTM stack stopped successfully!"
}

# Function to restart the observability stack
restart_stack() {
    print_status "Restarting OTEL-LGTM observability stack..."
    stop_stack
    start_stack
}

# Function to show logs
show_logs() {
    cd "$PROJECT_ROOT"
    docker-compose logs -f otel-lgtm
}

# Function to show status
show_status() {
    cd "$PROJECT_ROOT"
    
    print_status "OTEL-LGTM Stack Status:"
    docker-compose ps otel-lgtm
    
    print_status "\nService Health Checks:"
    
    # Check Grafana
    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        print_success "✓ Grafana (http://localhost:3000)"
    else
        print_error "✗ Grafana (http://localhost:3000)"
    fi
    
    # Check Loki
    if curl -f http://localhost:3100/ready > /dev/null 2>&1; then
        print_success "✓ Loki (http://localhost:3100)"
    else
        print_error "✗ Loki (http://localhost:3100)"
    fi
    
    # Check OTLP endpoint
    if curl -f http://localhost:4318/v1/traces > /dev/null 2>&1; then
        print_success "✓ OTLP HTTP (http://localhost:4318)"
    else
        print_error "✗ OTLP HTTP (http://localhost:4318)"
    fi
}

# Function to clean up volumes
cleanup() {
    print_warning "This will remove all observability data. Are you sure? (y/N)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        cd "$PROJECT_ROOT"
        docker-compose down otel-lgtm
        docker volume rm -f $(docker volume ls -q | grep -E "(otel_|grafana|loki|tempo|mimir)")
        print_success "Observability data cleaned up!"
    else
        print_status "Cleanup cancelled."
    fi
}

# Main script logic
case "${1:-}" in
    start)
        check_docker
        start_stack
        ;;
    stop)
        check_docker
        stop_stack
        ;;
    restart)
        check_docker
        restart_stack
        ;;
    logs)
        check_docker
        show_logs
        ;;
    status)
        check_docker
        show_status
        ;;
    cleanup)
        check_docker
        cleanup
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|logs|status|cleanup}"
        echo ""
        echo "Commands:"
        echo "  start    - Start the OTEL-LGTM observability stack"
        echo "  stop     - Stop the OTEL-LGTM observability stack"
        echo "  restart  - Restart the OTEL-LGTM observability stack"
        echo "  logs     - Show logs from the observability stack"
        echo "  status   - Show status and health of observability services"
        echo "  cleanup  - Remove all observability data (destructive)"
        exit 1
        ;;
esac