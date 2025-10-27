# ICE Connectivity Troubleshooting Guide

This guide helps diagnose and resolve WebRTC ICE connectivity issues with COTURN server integration.

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Common Issues](#common-issues)
3. [Network Diagnostics](#network-diagnostics)
4. [COTURN Server Issues](#coturn-server-issues)
5. [Client-Side Issues](#client-side-issues)
6. [Security and Authentication](#security-and-authentication)
7. [Performance Issues](#performance-issues)
8. [Monitoring and Logging](#monitoring-and-logging)

## Quick Diagnostics

### Health Check Commands

```bash
# Check COTURN service health
curl http://localhost:8000/api/webrtc/coturn/health

# Test STUN connectivity
turnutils_stunclient -H your-coturn-host -P 3478

# Test TURN connectivity with authentication
turnutils_uclient -H your-coturn-host -P 3478 -u username -w password

# Check ICE server configuration
curl http://localhost:8000/api/webrtc/ice-servers
```

### Service Status Check

```bash
# Docker services status
docker-compose ps

# COTURN container logs
docker-compose logs coturn

# Application logs for WebRTC
docker-compose logs app | grep -i webrtc
```

## Common Issues

### 1. No ICE Candidates Generated

**Symptoms:**
- WebRTC connection fails immediately
- No candidates in ICE gathering
- Browser console shows "ICE gathering failed"

**Causes:**
- COTURN server not accessible
- Incorrect ICE server configuration
- Network connectivity issues

**Diagnostics:**
```bash
# Test STUN server accessibility
turnutils_stunclient -H your-coturn-host -P 3478

# Check ICE server configuration
curl http://localhost:8000/api/webrtc/ice-servers | jq .

# Verify network connectivity
telnet your-coturn-host 3478
```

**Solutions:**
```bash
# Restart COTURN service
docker-compose restart coturn

# Check firewall rules
sudo iptables -L -n | grep 3478

# Verify DNS resolution
nslookup your-coturn-host
```

### 2. TURN Authentication Failures

**Symptoms:**
- STUN works but TURN fails
- "401 Unauthorized" in COTURN logs
- Relay candidates not generated

**Causes:**
- Incorrect shared secret
- Expired credentials
- Clock synchronization issues

**Diagnostics:**
```bash
# Check COTURN logs for auth errors
docker-compose logs coturn | grep -i "401\|unauthorized\|auth"

# Verify credential generation
curl http://localhost:8000/api/webrtc/ice-servers

# Check system time synchronization
timedatectl status
```

**Solutions:**
```bash
# Verify shared secret configuration
docker-compose exec coturn cat /etc/coturn/turnserver.conf | grep secret

# Synchronize system time
sudo ntpdate -s time.nist.gov

# Regenerate credentials
curl -X POST http://localhost:8000/api/webrtc/security/credentials/rotate
```

### 3. Connection Established but Media Fails

**Symptoms:**
- ICE connection succeeds
- No audio/video transmission
- One-way media flow

**Causes:**
- Firewall blocking media ports
- NAT traversal issues
- Bandwidth limitations

**Diagnostics:**
```bash
# Check relay port range accessibility
for port in {49152..49160}; do
  nc -u -z your-coturn-host $port && echo "Port $port open"
done

# Monitor bandwidth usage
curl http://localhost:8000/api/webrtc/coturn/metrics | jq .bandwidth

# Check connection type
curl http://localhost:8000/api/webrtc/analytics | jq .connectionTypes
```

**Solutions:**
```bash
# Open relay port range in firewall
sudo iptables -A INPUT -p udp --dport 49152:65535 -j ACCEPT

# Increase bandwidth quotas
# Edit environment configuration and restart services

# Check NAT configuration
turnutils_natdiscovery -H your-coturn-host -P 3478
```

## Network Diagnostics

### Connectivity Tests

```bash
# Test UDP connectivity to STUN port
nc -u your-coturn-host 3478

# Test TCP connectivity to TURN port
nc your-coturn-host 3478

# Test TURNS (TLS) connectivity
openssl s_client -connect your-coturn-host:5349

# Test TCP fallback port
nc your-coturn-host 443
```

### NAT Detection

```bash
# Detect NAT type
turnutils_natdiscovery -H your-coturn-host -P 3478

# Test from different network locations
# Run from client networks to identify NAT issues
```

### Firewall Diagnostics

```bash
# Check local firewall rules
sudo iptables -L -n -v

# Test specific ports
sudo nmap -sU -p 3478 your-coturn-host
sudo nmap -sT -p 3478,5349,443 your-coturn-host

# Check if ports are filtered
sudo nmap -sS -p 49152-49200 your-coturn-host
```

### Network Path Analysis

```bash
# Trace route to COTURN server
traceroute your-coturn-host

# Check for packet loss
ping -c 10 your-coturn-host

# Test MTU size
ping -M do -s 1472 your-coturn-host
```

## COTURN Server Issues

### Configuration Problems

```bash
# Validate COTURN configuration
docker-compose exec coturn turnserver --check-config

# Check configuration file syntax
docker-compose exec coturn cat /etc/coturn/turnserver.conf

# Verify environment variables
docker-compose exec coturn env | grep COTURN
```

### Resource Issues

```bash
# Check COTURN resource usage
docker stats coturn

# Monitor active sessions
curl http://localhost:8000/api/webrtc/coturn/metrics | jq .sessions

# Check file descriptor limits
docker-compose exec coturn cat /proc/sys/fs/file-max
docker-compose exec coturn lsof | wc -l
```

### SSL/TLS Issues

```bash
# Verify SSL certificate
openssl x509 -in /path/to/cert.pem -text -noout

# Test SSL handshake
openssl s_client -connect your-coturn-host:5349 -servername your-coturn-host

# Check certificate chain
curl -I https://your-coturn-host:5349
```

### Log Analysis

```bash
# Real-time COTURN logs
docker-compose logs -f coturn

# Filter for specific issues
docker-compose logs coturn | grep -E "(ERROR|WARN|401|403|500)"

# Authentication-related logs
docker-compose logs coturn | grep -i "auth"

# Connection-related logs
docker-compose logs coturn | grep -E "(allocation|channel|permission)"
```

## Client-Side Issues

### Browser Diagnostics

#### Chrome DevTools
1. Open `chrome://webrtc-internals/`
2. Look for ICE candidate gathering
3. Check connection states
4. Monitor bandwidth usage

#### Firefox DevTools
1. Open `about:webrtc`
2. Check ICE statistics
3. Monitor connection logs

### JavaScript Debugging

```javascript
// Enable WebRTC logging
localStorage.setItem('debug', 'webrtc*');

// Monitor ICE gathering
pc.onicecandidate = (event) => {
  if (event.candidate) {
    console.log('ICE candidate:', event.candidate);
  } else {
    console.log('ICE gathering complete');
  }
};

// Monitor connection state
pc.onconnectionstatechange = () => {
  console.log('Connection state:', pc.connectionState);
};

// Monitor ICE connection state
pc.oniceconnectionstatechange = () => {
  console.log('ICE connection state:', pc.iceConnectionState);
};
```

### Common Client Issues

#### 1. No STUN/TURN Servers Configured
```javascript
// Check ICE server configuration
console.log('ICE servers:', pc.getConfiguration().iceServers);

// Verify server accessibility
fetch('/api/webrtc/ice-servers')
  .then(response => response.json())
  .then(data => console.log('ICE config:', data));
```

#### 2. Incorrect Credentials
```javascript
// Check credential format
const iceServers = await fetch('/api/webrtc/ice-servers').then(r => r.json());
console.log('Credentials:', iceServers.iceServers.map(s => ({
  urls: s.urls,
  username: s.username,
  hasCredential: !!s.credential
})));
```

#### 3. Network Policy Restrictions
```javascript
// Test with different ICE server configurations
const testConfigs = [
  { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
  { iceServers: [{ urls: 'stun:your-coturn-host:3478' }] },
  // Add TURN servers with credentials
];

for (const config of testConfigs) {
  const testPc = new RTCPeerConnection(config);
  // Test connection with each configuration
}
```

## Security and Authentication

### Authentication Issues

```bash
# Check credential generation
curl http://localhost:8000/api/webrtc/ice-servers

# Verify shared secret
docker-compose exec coturn grep secret /etc/coturn/turnserver.conf

# Check credential expiration
curl http://localhost:8000/api/webrtc/security/credentials/audit
```

### Rate Limiting Issues

```bash
# Check rate limit status
curl http://localhost:8000/api/webrtc/security/status | jq .rateLimiting

# View security violations
curl http://localhost:8000/api/webrtc/security/status | jq .violations

# Check blocked IPs
docker-compose logs app | grep "IP.*blocked"
```

### Security Diagnostics

```bash
# Monitor authentication attempts
curl http://localhost:8000/api/webrtc/security/credentials/audit?timeRange=1

# Check security metrics
curl http://localhost:8000/api/webrtc/security/status

# View active security violations
docker-compose logs app | grep "Security Violation"
```

## Performance Issues

### High Latency

**Diagnostics:**
```bash
# Measure RTT to COTURN server
ping your-coturn-host

# Check connection quality metrics
curl http://localhost:8000/api/webrtc/analytics | jq .summary

# Monitor WebRTC stats
# Use browser WebRTC internals
```

**Solutions:**
- Use geographically closer COTURN servers
- Optimize network routing
- Increase bandwidth quotas

### High Bandwidth Usage

**Diagnostics:**
```bash
# Monitor bandwidth usage
curl http://localhost:8000/api/webrtc/coturn/metrics | jq .bandwidth

# Check quota violations
curl http://localhost:8000/api/webrtc/security/status | jq .bandwidthQuotas

# Analyze connection types
curl http://localhost:8000/api/webrtc/analytics | jq .connectionTypes
```

**Solutions:**
- Adjust bandwidth quotas
- Optimize media codecs
- Implement adaptive bitrate

### Connection Failures

**Diagnostics:**
```bash
# Check failure rates
curl http://localhost:8000/api/webrtc/analytics | jq .qualityDistribution

# Monitor error logs
docker-compose logs app | grep -i "connection.*fail"

# Check COTURN session limits
curl http://localhost:8000/api/webrtc/coturn/metrics | jq .sessions
```

**Solutions:**
- Increase session limits
- Scale COTURN instances
- Implement connection retry logic

## Monitoring and Logging

### Key Metrics to Monitor

1. **Connection Success Rate**
   ```bash
   curl http://localhost:8000/api/webrtc/analytics | jq '.summary.averageQuality'
   ```

2. **Authentication Success Rate**
   ```bash
   curl http://localhost:8000/api/webrtc/coturn/metrics | jq '.authentication.successRate'
   ```

3. **Bandwidth Usage**
   ```bash
   curl http://localhost:8000/api/webrtc/coturn/metrics | jq '.bandwidth'
   ```

4. **Active Sessions**
   ```bash
   curl http://localhost:8000/api/webrtc/coturn/metrics | jq '.sessions.active'
   ```

### Log Analysis Patterns

#### Successful Connection Pattern
```
INFO: ICE gathering started
INFO: STUN candidate gathered: srflx
INFO: TURN candidate gathered: relay
INFO: ICE connection state: connected
INFO: Connection established successfully
```

#### Failed Connection Pattern
```
ERROR: ICE gathering timeout
ERROR: No relay candidates found
ERROR: TURN authentication failed (401)
ERROR: ICE connection state: failed
```

#### Authentication Issues Pattern
```
ERROR: TURN authentication failed
ERROR: Invalid credentials for user
ERROR: Shared secret mismatch
ERROR: Credential expired
```

### Automated Monitoring

```bash
# Create monitoring script
cat > monitor_ice.sh << 'EOF'
#!/bin/bash

# Check service health
health=$(curl -s http://localhost:8000/api/webrtc/coturn/health | jq -r '.status')
if [ "$health" != "healthy" ]; then
  echo "ALERT: COTURN service unhealthy"
fi

# Check connection success rate
success_rate=$(curl -s http://localhost:8000/api/webrtc/analytics | jq '.summary.averageQuality')
if (( $(echo "$success_rate < 80" | bc -l) )); then
  echo "ALERT: Low connection success rate: $success_rate%"
fi

# Check authentication failures
auth_failures=$(curl -s http://localhost:8000/api/webrtc/security/status | jq '.violations.byType.rate_limit')
if [ "$auth_failures" -gt 10 ]; then
  echo "ALERT: High authentication failure rate: $auth_failures"
fi
EOF

chmod +x monitor_ice.sh

# Run monitoring every 5 minutes
echo "*/5 * * * * /path/to/monitor_ice.sh" | crontab -
```

### Alerting Rules

Set up alerts for:
- Service downtime
- High error rates (>5%)
- Authentication failures (>10/hour)
- Bandwidth quota exceeded
- SSL certificate expiration

## Emergency Procedures

### Service Recovery

```bash
# Quick service restart
docker-compose restart coturn

# Force container recreation
docker-compose up -d --force-recreate coturn

# Rollback to previous configuration
git checkout HEAD~1 -- docker/coturn/turnserver.conf
docker-compose restart coturn
```

### Network Issues

```bash
# Flush DNS cache
sudo systemctl flush-dns

# Reset network interfaces
sudo systemctl restart networking

# Check routing table
ip route show
```

### Security Incidents

```bash
# Block suspicious IP immediately
curl -X POST http://localhost:8000/api/webrtc/security/block-ip \
  -H "Content-Type: application/json" \
  -d '{"ip": "suspicious.ip.address", "duration": 3600}'

# Rotate secrets immediately
curl -X POST http://localhost:8000/api/webrtc/security/credentials/rotate

# Review security logs
curl http://localhost:8000/api/webrtc/security/credentials/audit?timeRange=24
```

## Getting Help

### Information to Collect

When reporting issues, collect:

1. **Service Status:**
   ```bash
   docker-compose ps > service_status.txt
   ```

2. **Configuration:**
   ```bash
   docker-compose config > current_config.yml
   ```

3. **Logs:**
   ```bash
   docker-compose logs --tail=1000 > service_logs.txt
   ```

4. **Network Information:**
   ```bash
   ip addr show > network_info.txt
   netstat -tulpn > port_info.txt
   ```

5. **Health Status:**
   ```bash
   curl http://localhost:8000/api/webrtc/coturn/health > health_status.json
   curl http://localhost:8000/api/webrtc/security/status > security_status.json
   ```

### Support Channels

- GitHub Issues: [repository-url]
- Documentation: [docs-url]
- Community Forum: [forum-url]
- Emergency Contact: [emergency-contact]