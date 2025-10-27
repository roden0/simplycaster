#!/bin/bash

# Test script for Coturn TURN/STUN server
# This script tests basic connectivity to the Coturn server

set -e

COTURN_HOST=${1:-localhost}
COTURN_PORT=${2:-3478}

echo "Testing Coturn TURN/STUN server at $COTURN_HOST:$COTURN_PORT"
echo "=================================================="

# Test 1: Check if port is open
echo "1. Testing port connectivity..."
if command -v nc >/dev/null 2>&1; then
    if nc -zu "$COTURN_HOST" "$COTURN_PORT"; then
        echo "✓ Port $COTURN_PORT is open and accessible"
    else
        echo "✗ Port $COTURN_PORT is not accessible"
        exit 1
    fi
else
    echo "⚠ netcat not available, skipping port test"
fi

# Test 2: Check Docker container status
echo ""
echo "2. Checking Docker container status..."
if command -v docker >/dev/null 2>&1; then
    if docker-compose ps coturn | grep -q "Up"; then
        echo "✓ Coturn container is running"
    else
        echo "✗ Coturn container is not running"
        echo "Run: docker-compose up -d coturn"
        exit 1
    fi
else
    echo "⚠ Docker not available, skipping container test"
fi

# Test 3: Check logs for startup messages
echo ""
echo "3. Checking recent logs..."
if command -v docker >/dev/null 2>&1; then
    echo "Recent Coturn logs:"
    docker-compose logs --tail=10 coturn
fi

# Test 4: Basic STUN test (if stunclient is available)
echo ""
echo "4. Testing STUN functionality..."
if command -v stunclient >/dev/null 2>&1; then
    if stunclient "$COTURN_HOST" "$COTURN_PORT"; then
        echo "✓ STUN test successful"
    else
        echo "✗ STUN test failed"
    fi
else
    echo "⚠ stunclient not available, skipping STUN test"
    echo "Install with: apt-get install stun-client (Ubuntu/Debian)"
fi

echo ""
echo "=================================================="
echo "Coturn test completed!"
echo ""
echo "Next steps:"
echo "1. Configure your application to use the ICE server"
echo "2. Test WebRTC connections through the TURN server"
echo "3. Monitor logs for authentication and relay usage"
echo ""
echo "For more information, see docker/coturn/README.md"