# Coturn ICE Server for SimplyCaster

This directory contains the Docker configuration for Coturn TURN/STUN server used by SimplyCaster for WebRTC NAT traversal.

## Overview

Coturn provides STUN and TURN services that help WebRTC connections traverse NAT and firewall restrictions. This is essential for ensuring reliable peer-to-peer connections in various network environments.

## Configuration Files

- `Dockerfile` - Custom Coturn Docker image with security hardening
- `turnserver.conf` - Main Coturn configuration file
- `entrypoint.sh` - Startup script that configures Coturn based on environment variables
- `logs/` - Directory for Coturn log files (mounted as volume)

## Environment Variables

The following environment variables can be configured in your `.env` file:

### Required Variables

- `COTURN_SECRET` - Shared secret for TURN authentication (change in production!)
- `COTURN_REALM` - TURN realm, typically your domain name

### Optional Variables

- `COTURN_EXTERNAL_IP` - External IP address (auto-detected if not set)
- `COTURN_LOG_LEVEL` - Logging verbosity (0-4, default: 3)
- `COTURN_MIN_PORT` - Minimum relay port (default: 49152)
- `COTURN_MAX_PORT` - Maximum relay port (default: 49252)

### Client Configuration Variables

- `COTURN_HOST` - Hostname for client ICE server configuration (default: coturn)
- `COTURN_PORT` - STUN/TURN port (default: 3478)
- `COTURN_TURNS_PORT` - TURNS (TLS) port (default: 5349)

## Ports

The Coturn service exposes the following ports:

- `3478/udp` - STUN/TURN UDP
- `3478/tcp` - STUN/TURN TCP
- `5349/tcp` - TURNS (TLS) TCP
- `5349/udp` - TURNS (TLS) UDP
- `49152-49252/udp` - TURN relay port range

## Security Features

- Runs as non-root user (turnserver:1000)
- Uses shared secret authentication
- Blocks private IP ranges for security
- Resource limits to prevent abuse
- Health checks for monitoring

## Production Considerations

### Security

1. **Change the default secret**: Set a strong `COTURN_SECRET` in production
2. **Use TLS**: Configure certificates for TURNS (port 5349)
3. **Firewall**: Ensure only necessary ports are exposed
4. **Monitoring**: Monitor logs for authentication failures and abuse

### Performance

1. **Resource limits**: Adjust memory and CPU limits based on usage
2. **Port range**: Optimize the relay port range based on concurrent users
3. **External IP**: Set `COTURN_EXTERNAL_IP` for better performance

### Networking

1. **External IP**: Configure your external IP address for proper NAT traversal
2. **Load balancing**: Consider multiple Coturn instances for high availability
3. **Bandwidth**: Monitor bandwidth usage and set quotas if needed

## Troubleshooting

### Common Issues

1. **Connection failures**: Check if ports are properly exposed and not blocked by firewall
2. **Authentication errors**: Verify `COTURN_SECRET` matches between server and client
3. **No relay**: Ensure UDP port range (49152-65535) is accessible

### Debugging

1. **Increase log level**: Set `COTURN_LOG_LEVEL=4` for verbose logging
2. **Check logs**: Monitor `/var/log/coturn/turnserver.log`
3. **Test connectivity**: Use STUN/TURN testing tools

### Log Files

Logs are stored in `./docker/coturn/logs/turnserver.log` and include:
- Connection attempts
- Authentication successes/failures
- Relay allocations
- Error messages

## Testing

You can test the TURN server using online tools or command-line utilities:

```bash
# Test STUN functionality
stunclient your-server-ip 3478

# Test TURN functionality (requires authentication)
turnutils_uclient -t -u username -w password your-server-ip
```

## Integration with SimplyCaster

The Coturn server is automatically configured to work with SimplyCaster's WebRTC implementation:

1. The app service fetches ICE server configuration including Coturn endpoints
2. WebRTC clients use these endpoints for NAT traversal
3. Temporary TURN credentials are generated server-side for security
4. Connection quality is monitored to optimize the user experience

For more information on the WebRTC integration, see the main SimplyCaster documentation.