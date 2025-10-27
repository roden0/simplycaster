# COTURN ICE Server Deployment Guide

This guide covers the deployment of COTURN ICE server integration with SimplyCaster across different environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Configuration](#environment-configuration)
3. [Development Deployment](#development-deployment)
4. [Staging Deployment](#staging-deployment)
5. [Production Deployment](#production-deployment)
6. [SSL/TLS Configuration](#ssltls-configuration)
7. [Monitoring and Health Checks](#monitoring-and-health-checks)
8. [Troubleshooting](#troubleshooting)
9. [Maintenance Procedures](#maintenance-procedures)

## Prerequisites

### System Requirements

- Docker Engine 20.10+
- Docker Compose 2.0+
- Minimum 2GB RAM for COTURN service
- Open ports: 3478 (STUN/TURN), 5349 (TURNS), 443 (TCP fallback), 49152-65535 (relay ports)

### Network Requirements

- Public IP address for production deployment
- Firewall rules configured for COTURN ports
- SSL/TLS certificates for production and staging

### Security Requirements

- Strong shared secret (minimum 32 characters)
- Master encryption key for credential management
- SSL certificates from trusted CA for production

## Environment Configuration

### Environment Variables

Each environment requires specific configuration. Use the provided environment files:

- `config/environments/development.env` - Development settings
- `config/environments/staging.env` - Staging settings  
- `config/environments/production.env` - Production settings

### Key Configuration Parameters

| Parameter | Development | Staging | Production |
|-----------|-------------|---------|------------|
| SSL/TLS | Disabled | Enabled | Enabled |
| Rate Limiting | Disabled | Moderate | Strict |
| Logging Level | Verbose (4) | Info (3) | Error (2) |
| Security Features | Relaxed | Moderate | Strict |

## Development Deployment

### Quick Start

1. **Clone the repository and navigate to docker directory:**
   ```bash
   cd docker
   ```

2. **Start development environment:**
   ```bash
   docker-compose -f docker-compose.development.yml up -d
   ```

3. **Verify services are running:**
   ```bash
   docker-compose -f docker-compose.development.yml ps
   ```

4. **Test COTURN connectivity:**
   ```bash
   # Test STUN server
   turnutils_stunclient -H localhost -P 3478
   
   # Check service health
   curl http://localhost:8000/api/webrtc/coturn/health
   ```

### Development Features

- Hot reload for application changes
- Verbose logging for debugging
- Database and Redis admin interfaces
- Relaxed security settings for testing

## Staging Deployment

### Prerequisites

1. **SSL Certificate Setup:**
   ```bash
   # Place SSL certificates in appropriate location
   sudo mkdir -p /etc/ssl/certs /etc/ssl/private
   sudo cp staging.simplycast.local.crt /etc/ssl/certs/
   sudo cp staging.simplycast.local.key /etc/ssl/private/
   sudo chmod 600 /etc/ssl/private/staging.simplycast.local.key
   ```

2. **Environment Variables:**
   ```bash
   # Set required secrets
   export COTURN_SECRET="your-staging-secret-key-at-least-32-chars-long"
   export TURN_MASTER_KEY="your-staging-master-encryption-key-32-chars"
   export COTURN_EXTERNAL_IP="your-staging-server-public-ip"
   ```

### Deployment Steps

1. **Deploy staging environment:**
   ```bash
   docker-compose -f docker-compose.staging.yml up -d
   ```

2. **Verify SSL configuration:**
   ```bash
   # Test TURNS connectivity
   turnutils_stunclient -H staging-turn.simplycast.local -P 5349 -S
   ```

3. **Monitor deployment:**
   ```bash
   # Check all services
   docker-compose -f docker-compose.staging.yml logs -f
   
   # Verify health endpoints
   curl https://staging-turn.simplycast.local/api/webrtc/coturn/health
   ```

## Production Deployment

### Prerequisites

1. **Docker Swarm Setup:**
   ```bash
   # Initialize swarm mode
   docker swarm init
   
   # Add worker nodes (if applicable)
   docker swarm join --token <token> <manager-ip>:2377
   ```

2. **Create Docker Secrets:**
   ```bash
   # COTURN secret
   echo "your-production-secret-key-at-least-32-chars-long" | \
     docker secret create coturn_secret -
   
   # Master encryption key
   echo "your-production-master-encryption-key-32-chars" | \
     docker secret create turn_master_key -
   
   # Database password
   echo "your-secure-database-password" | \
     docker secret create postgres_password -
   
   # SSL certificates
   docker secret create ssl_cert /path/to/simplycast.com.crt
   docker secret create ssl_key /path/to/simplycast.com.key
   ```

3. **Network Configuration:**
   ```bash
   # Create overlay networks
   docker network create --driver overlay simplycast-prod
   docker network create --driver overlay coturn-network
   ```

### Deployment Steps

1. **Deploy production stack:**
   ```bash
   # Set environment variables
   export APP_VERSION=latest
   export COTURN_EXTERNAL_IP="your-production-public-ip"
   
   # Deploy stack
   docker stack deploy -c docker-compose.production.yml simplycast
   ```

2. **Verify deployment:**
   ```bash
   # Check stack status
   docker stack services simplycast
   
   # Monitor logs
   docker service logs -f simplycast_coturn
   ```

3. **Test connectivity:**
   ```bash
   # Test STUN/TURN connectivity
   turnutils_stunclient -H turn.simplycast.com -P 3478
   turnutils_stunclient -H turn.simplycast.com -P 5349 -S
   
   # Test health endpoints
   curl https://turn.simplycast.com/api/webrtc/coturn/health
   ```

## SSL/TLS Configuration

### Certificate Requirements

- **Development:** Self-signed certificates or no SSL
- **Staging:** Valid SSL certificate for staging domain
- **Production:** Valid SSL certificate from trusted CA

### Certificate Installation

1. **Generate or obtain SSL certificates:**
   ```bash
   # For Let's Encrypt certificates
   certbot certonly --standalone -d turn.simplycast.com
   ```

2. **Configure COTURN for SSL:**
   ```bash
   # Copy certificates to COTURN directory
   sudo cp /etc/letsencrypt/live/turn.simplycast.com/fullchain.pem \
     /etc/ssl/coturn/cert.pem
   sudo cp /etc/letsencrypt/live/turn.simplycast.com/privkey.pem \
     /etc/ssl/coturn/key.pem
   
   # Set proper permissions
   sudo chown turnserver:turnserver /etc/ssl/coturn/*.pem
   sudo chmod 600 /etc/ssl/coturn/*.pem
   ```

3. **Generate DH parameters (production only):**
   ```bash
   sudo openssl dhparam -out /etc/ssl/coturn/dh2048.pem 2048
   sudo chown turnserver:turnserver /etc/ssl/coturn/dh2048.pem
   ```

### Certificate Renewal

Set up automatic certificate renewal:

```bash
# Add to crontab
0 2 * * * certbot renew --quiet && docker service update --force simplycast_coturn
```

## Monitoring and Health Checks

### Health Check Endpoints

- **Application Health:** `GET /api/webrtc/coturn/health`
- **Detailed Metrics:** `GET /api/webrtc/coturn/metrics`
- **Security Status:** `GET /api/webrtc/security/status`

### Monitoring Stack (Production)

The production deployment includes:

- **Prometheus:** Metrics collection
- **Grafana:** Visualization and alerting
- **Loki:** Log aggregation
- **Promtail:** Log shipping

### Key Metrics to Monitor

1. **COTURN Service:**
   - Active sessions count
   - Authentication success rate
   - Bandwidth usage
   - Connection failures

2. **System Resources:**
   - CPU usage
   - Memory usage
   - Network throughput
   - Disk I/O

3. **Security Metrics:**
   - Rate limit violations
   - Blocked IP addresses
   - Failed authentication attempts

### Alerting Rules

Configure alerts for:

- Service downtime
- High error rates (>5%)
- Resource exhaustion (>80% usage)
- Security violations

## Troubleshooting

### Common Issues

#### 1. COTURN Service Won't Start

**Symptoms:**
- Container exits immediately
- "Permission denied" errors
- Port binding failures

**Solutions:**
```bash
# Check port availability
sudo netstat -tulpn | grep :3478

# Verify permissions
ls -la /etc/ssl/coturn/

# Check configuration syntax
docker run --rm -v $(pwd)/coturn:/etc/coturn coturn/coturn \
  turnserver -c /etc/coturn/turnserver.conf --check-config
```

#### 2. WebRTC Connections Fail

**Symptoms:**
- ICE connection failures
- No relay candidates
- Authentication errors

**Diagnostics:**
```bash
# Test STUN connectivity
turnutils_stunclient -H your-coturn-host -P 3478

# Check COTURN logs
docker service logs simplycast_coturn

# Verify ICE server configuration
curl http://localhost:8000/api/webrtc/ice-servers
```

#### 3. SSL/TLS Issues

**Symptoms:**
- TURNS connections fail
- Certificate errors
- Handshake failures

**Solutions:**
```bash
# Verify certificate validity
openssl x509 -in /etc/ssl/coturn/cert.pem -text -noout

# Test SSL connectivity
openssl s_client -connect turn.simplycast.com:5349

# Check certificate chain
curl -I https://turn.simplycast.com:5349
```

#### 4. High Resource Usage

**Symptoms:**
- High CPU/memory usage
- Slow response times
- Connection timeouts

**Solutions:**
```bash
# Monitor resource usage
docker stats

# Check active sessions
curl http://localhost:8000/api/webrtc/coturn/metrics

# Adjust resource limits
docker service update --limit-memory 2g simplycast_coturn
```

### Log Analysis

#### COTURN Logs

```bash
# View real-time logs
docker service logs -f simplycast_coturn

# Search for specific issues
docker service logs simplycast_coturn 2>&1 | grep -i error

# Authentication failures
docker service logs simplycast_coturn 2>&1 | grep "401"
```

#### Application Logs

```bash
# WebRTC-related logs
docker service logs simplycast_app 2>&1 | grep -i webrtc

# Security violations
docker service logs simplycast_app 2>&1 | grep "Security Violation"
```

### Network Diagnostics

```bash
# Test UDP connectivity
nc -u your-coturn-host 3478

# Check firewall rules
sudo iptables -L -n | grep 3478

# Verify NAT traversal
turnutils_natdiscovery -H your-coturn-host -P 3478
```

## Maintenance Procedures

### Regular Maintenance Tasks

#### Daily
- Monitor service health
- Check error logs
- Verify backup completion

#### Weekly
- Review security metrics
- Update blocked IP lists
- Rotate COTURN secrets (if enabled)

#### Monthly
- Update SSL certificates
- Review resource usage trends
- Update Docker images

### Backup Procedures

#### Database Backup
```bash
# Manual backup
docker exec simplycast_postgres pg_dump -U simplycast simplycast_prod > backup.sql

# Automated backup (production)
docker service create --name backup-service \
  --mount type=volume,source=postgres_backups,target=/backups \
  --env PGPASSWORD_FILE=/run/secrets/postgres_password \
  --secret postgres_password \
  postgres:16-alpine /backup.sh
```

#### Configuration Backup
```bash
# Backup configuration files
tar -czf config-backup-$(date +%Y%m%d).tar.gz \
  config/ docker/ docs/
```

### Update Procedures

#### Application Updates
```bash
# Update application image
export APP_VERSION=v2.1.0
docker stack deploy -c docker-compose.production.yml simplycast
```

#### COTURN Updates
```bash
# Update COTURN image
docker service update --image coturn/coturn:latest simplycast_coturn
```

#### Security Updates
```bash
# Update all base images
docker-compose -f docker-compose.production.yml pull
docker stack deploy -c docker-compose.production.yml simplycast
```

### Scaling Procedures

#### Horizontal Scaling
```bash
# Scale application instances
docker service scale simplycast_app=5

# Scale COTURN instances
docker service scale simplycast_coturn=3
```

#### Vertical Scaling
```bash
# Increase resource limits
docker service update --limit-memory 4g --limit-cpus 2 simplycast_coturn
```

### Disaster Recovery

#### Service Recovery
```bash
# Restart failed services
docker service update --force simplycast_coturn

# Rollback to previous version
docker service rollback simplycast_app
```

#### Data Recovery
```bash
# Restore database from backup
docker exec -i simplycast_postgres psql -U simplycast simplycast_prod < backup.sql

# Restore configuration
tar -xzf config-backup-20240101.tar.gz
```

## Security Considerations

### Production Security Checklist

- [ ] Strong shared secrets (32+ characters)
- [ ] SSL/TLS certificates from trusted CA
- [ ] Rate limiting enabled
- [ ] IP restrictions configured
- [ ] Bandwidth quotas enforced
- [ ] Secret rotation enabled
- [ ] Monitoring and alerting active
- [ ] Regular security audits scheduled
- [ ] Backup encryption enabled
- [ ] Access logs monitored

### Security Monitoring

Monitor for:
- Unusual authentication patterns
- High bandwidth usage
- Repeated connection failures
- Suspicious IP addresses
- Certificate expiration

### Incident Response

1. **Identify** the security issue
2. **Contain** the threat (block IPs, rotate secrets)
3. **Investigate** the root cause
4. **Remediate** the vulnerability
5. **Document** the incident and lessons learned

## Support and Resources

### Documentation
- [COTURN Official Documentation](https://github.com/coturn/coturn)
- [WebRTC Troubleshooting Guide](https://webrtc.org/getting-started/testing)
- [Docker Swarm Documentation](https://docs.docker.com/engine/swarm/)

### Monitoring Dashboards
- Grafana: `http://your-host:3000`
- Prometheus: `http://your-host:9090`
- Application Health: `http://your-host:8000/api/webrtc/coturn/health`

### Emergency Contacts
- System Administrator: [contact-info]
- Security Team: [contact-info]
- Infrastructure Team: [contact-info]