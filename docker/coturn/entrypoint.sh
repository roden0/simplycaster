#!/bin/sh
set -e

# Coturn entrypoint script for SimplyCaster
# This script configures Coturn based on environment variables

echo "Starting Coturn TURN/STUN server for SimplyCaster..."

# Set default values if environment variables are not provided
TURN_SECRET=${TURN_SECRET:-"default-turn-secret-change-in-production"}
TURN_REALM=${TURN_REALM:-"simplycast.local"}
TURN_LOG_LEVEL=${TURN_LOG_LEVEL:-"3"}
TURN_MIN_PORT=${TURN_MIN_PORT:-"49152"}
TURN_MAX_PORT=${TURN_MAX_PORT:-"65535"}

# Create log directory if it doesn't exist
mkdir -p /var/log/coturn

# Build the command arguments
COTURN_ARGS=""

# Add configuration file
COTURN_ARGS="$COTURN_ARGS -c /etc/coturn/turnserver.conf"

# Add shared secret
COTURN_ARGS="$COTURN_ARGS --static-auth-secret=$TURN_SECRET"

# Add realm
COTURN_ARGS="$COTURN_ARGS --realm=$TURN_REALM"

# Add external IP if provided
if [ -n "$TURN_EXTERNAL_IP" ]; then
    COTURN_ARGS="$COTURN_ARGS --external-ip=$TURN_EXTERNAL_IP"
fi

# Add log file
COTURN_ARGS="$COTURN_ARGS --log-file=/var/log/coturn/turnserver.log"

# Add PID file
COTURN_ARGS="$COTURN_ARGS --pidfile=/var/run/turnserver.pid"

# Add port range
COTURN_ARGS="$COTURN_ARGS --min-port=$TURN_MIN_PORT --max-port=$TURN_MAX_PORT"

# Add verbose logging based on log level
if [ "$TURN_LOG_LEVEL" -ge "4" ]; then
    COTURN_ARGS="$COTURN_ARGS --verbose"
fi

echo "Coturn configuration:"
echo "  Realm: $TURN_REALM"
echo "  External IP: ${TURN_EXTERNAL_IP:-auto-detect}"
echo "  Port range: $TURN_MIN_PORT-$TURN_MAX_PORT"
echo "  Log level: $TURN_LOG_LEVEL"

# Execute coturn with the built arguments
echo "Starting turnserver with args: $COTURN_ARGS"
exec turnserver $COTURN_ARGS