# COTURN ICE Server Monitoring and Maintenance

This document outlines monitoring procedures, maintenance tasks, and operational guidelines for the COTURN ICE server integration.

## Table of Contents

1. [Monitoring Overview](#monitoring-overview)
2. [Health Checks](#health-checks)
3. [Performance Monitoring](#performance-monitoring)
4. [Security Monitoring](#security-monitoring)
5. [Maintenance Procedures](#maintenance-procedures)
6. [Alerting and Notifications](#alerting-and-notifications)
7. [Capacity Planning](#capacity-planning)
8. [Incident Response](#incident-response)

## Monitoring Overview

### Monitoring Stack

The monitoring infrastructure consists of:

- **Health Check Endpoints:** Real-time service status
- **Metrics Collection:** Prometheus-based metrics
- **Log Aggregation:** Centralized logging with Loki
- **Visualization:** Grafana dashboards
- **Alerting:** Alert manager for notifications

### Key Performance Indicators (KPIs)

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Service Uptime | >99.9% | <99.5% | <99% |
| Connection Success Rate | >95% | <90% | <85% |
| Authentication Success Rate | >98% | <95% | <90% |
| Average Response Time | <200ms | >500ms | >1000ms |
| Bandwidth Utilization | <80% | >85% | >95% |

## Health Checks

### Automated Health Checks

#### Service Health Endpoint
```bash
# Check overall service health
curl http://localhost:8000/api/webrtc/coturn/health

# Expected response for healthy service:
{
  "status": "healthy",
  "message": "Coturn service is operating normally",
  "timestamp": "2024-01-15T10:30:00Z",
  "metrics": {
    "isHealthy": true,
    "responseTime": 45,
    "activeSessions": 12,
    "totalBandwidth": 1048576,
    "authSuccessRate": 98.5,
    "authFailureCount": 2,
    "uptime": 86400,
    "version": "4.6.2"
  }
}
```

#### Detailed Metrics Endpoint
```bash
# Get comprehensive metrics
curl http://localhost:8000/api/webrtc/coturn/metrics

# Expected response structure:
{
  "timestamp": "2024-01-15T10:30:00Z",
  "health": {
    "isHealthy": true,
    "responseTime": 45,
    "uptime": 86400,
    "version": "4.6.2",
    "lastChecked": "2024-01-15T10:30:00Z"
  },
  "sessions": {
    "active": 12,
    "total": 156,
    "bandwidth": {
      "total": 1048576,
      "average": 87381
    }
  },
  "authentication": {
    "successRate": 98.5,
    "failureCount": 2,
    "totalAttempts": 158
  },
  "performance": {
    "averageResponseTime": 45,
    "connectionSuccessRate": 96.2
  }
}
```

### Manual Health Checks

#### STUN Connectivity Test
```bash
# Test STUN server functionality
turnutils_stunclient -H your-coturn-host -P 3478

# Expected output:
# RFC 3489/5389/5766/5780/6062/6156 STUN client
# Primary: UDP, port 3478, addr your-coturn-host
# Local addr: 192.168.1.100:54321
# Mapped addr: 203.0.113.1:54321
```

#### TURN Connectivity Test
```bash
# Test TURN server with authentication
turnutils_uclient -H your-coturn-host -P 3478 -u testuser -w testpass

# Expected output should show successful allocation
```

#### SSL/TLS Test (Production)
```bash
# Test TURNS connectivity
openssl s_client -connect your-coturn-host:5349 -servername your-coturn-host

# Should show successful SSL handshake
```

### Health Check Automation

#### Monitoring Script
```bash
#!/bin/bash
# health_check.sh - Automated health monitoring

LOG_FILE="/var/log/coturn-health.log"
ALERT_THRESHOLD=3
FAILURE_COUNT=0

check_service_health() {
    local response=$(curl -s -w "%{http_code}" http://localhost:8000/api/webrtc/coturn/health)
    local http_code="${response: -3}"
    local body="${response%???}"
    
    if [ "$http_code" -eq 200 ]; then
        local status=$(echo "$body" | jq -r '.status')
        if [ "$status" = "healthy" ]; then
            echo "$(date): Service healthy" >> "$LOG_FILE"
            FAILURE_COUNT=0
            return 0
        fi
    fi
    
    FAILURE_COUNT=$((FAILURE_COUNT + 1))
    echo "$(date): Service unhealthy (attempt $FAILURE_COUNT)" >> "$LOG_FILE"
    
    if [ $FAILURE_COUNT -ge $ALERT_THRESHOLD ]; then
        send_alert "COTURN service health check failed $FAILURE_COUNT times"
    fi
    
    return 1
}

send_alert() {
    local message="$1"
    # Send alert via email, Slack, or other notification system
    echo "ALERT: $message" | mail -s "COTURN Health Alert" admin@example.com
}

# Run health check
check_service_health
```

#### Cron Job Setup
```bash
# Add to crontab for regular health checks
*/5 * * * * /path/to/health_check.sh
```

## Performance Monitoring

### Key Metrics

#### Connection Metrics
```bash
# Monitor connection analytics
curl http://localhost:8000/api/webrtc/analytics | jq '{
  totalConnections: .summary.totalConnections,
  activeConnections: .summary.activeConnections,
  averageQuality: .summary.averageQuality,
  connectionTypes: .connectionTypes
}'
```

#### Bandwidth Monitoring
```bash
# Check bandwidth usage
curl http://localhost:8000/api/webrtc/coturn/metrics | jq '{
  totalBandwidth: .sessions.bandwidth.total,
  averageBandwidth: .sessions.bandwidth.average,
  activeSessions: .sessions.active
}'
```

#### Response Time Monitoring
```bash
# Monitor response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:8000/api/webrtc/coturn/health

# curl-format.txt content:
#     time_namelookup:  %{time_namelookup}\n
#        time_connect:  %{time_connect}\n
#     time_appconnect:  %{time_appconnect}\n
#    time_pretransfer:  %{time_pretransfer}\n
#       time_redirect:  %{time_redirect}\n
#  time_starttransfer:  %{time_starttransfer}\n
#                     ----------\n
#          time_total:  %{time_total}\n
```

### Performance Baselines

#### Establish Baselines
```bash
# Collect baseline metrics over 24 hours
for i in {1..288}; do
    echo "$(date),$(curl -s http://localhost:8000/api/webrtc/coturn/metrics | jq -r '.health.responseTime')" >> baseline_response_times.csv
    sleep 300  # 5 minutes
done

# Analyze baseline data
awk -F',' '{sum+=$2; count++} END {print "Average:", sum/count}' baseline_response_times.csv
```

#### Performance Thresholds
- **Response Time:** <200ms (normal), 200-500ms (warning), >500ms (critical)
- **Connection Success Rate:** >95% (normal), 90-95% (warning), <90% (critical)
- **Bandwidth Utilization:** <80% (normal), 80-90% (warning), >90% (critical)
- **Active Sessions:** Monitor trends and set thresholds based on capacity

### Resource Monitoring

#### System Resources
```bash
# Monitor Docker container resources
docker stats coturn --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"

# Monitor host system resources
top -bn1 | grep -E "(Cpu|Mem|load)"
df -h
iostat -x 1 1
```

#### COTURN-Specific Resources
```bash
# Check file descriptor usage
docker exec coturn lsof | wc -l
docker exec coturn cat /proc/sys/fs/file-max

# Monitor network connections
docker exec coturn netstat -an | grep :3478 | wc -l
docker exec coturn ss -tuln | grep :3478
```

## Security Monitoring

### Security Metrics

#### Authentication Monitoring
```bash
# Monitor authentication attempts
curl http://localhost:8000/api/webrtc/security/credentials/audit?timeRange=1 | jq '{
  totalAttempts: length,
  successfulAttempts: [.[] | select(.success == true)] | length,
  failedAttempts: [.[] | select(.success == false)] | length
}'
```

#### Security Violations
```bash
# Check security status
curl http://localhost:8000/api/webrtc/security/status | jq '{
  violations: .violations,
  rateLimiting: .rateLimiting,
  ipRestrictions: .ipRestrictions
}'
```

#### Blocked IPs
```bash
# Monitor blocked IP addresses
docker logs coturn 2>&1 | grep -i "blocked\|denied" | tail -20
```

### Security Alerts

#### Failed Authentication Threshold
```bash
# Alert on high authentication failure rate
auth_failures=$(curl -s http://localhost:8000/api/webrtc/security/status | jq '.violations.byType.rate_limit')
if [ "$auth_failures" -gt 10 ]; then
    echo "SECURITY ALERT: High authentication failure rate: $auth_failures"
fi
```

#### Suspicious Activity Detection
```bash
# Monitor for unusual patterns
curl http://localhost:8000/api/webrtc/security/credentials/audit?timeRange=1 | jq '
  group_by(.clientIp) | 
  map({ip: .[0].clientIp, attempts: length, failures: [.[] | select(.success == false)] | length}) | 
  map(select(.failures > 5))
'
```

## Maintenance Procedures

### Daily Maintenance

#### Health Check Review
```bash
# Review daily health status
curl http://localhost:8000/api/webrtc/coturn/health | jq .
curl http://localhost:8000/api/webrtc/security/status | jq .summary
```

#### Log Review
```bash
# Check for errors in the last 24 hours
docker logs coturn --since 24h 2>&1 | grep -i error
docker logs app --since 24h 2>&1 | grep -i "webrtc\|coturn" | grep -i error
```

#### Resource Usage Check
```bash
# Check resource utilization
docker stats --no-stream
df -h
free -h
```

### Weekly Maintenance

#### Performance Analysis
```bash
# Analyze weekly performance trends
curl http://localhost:8000/api/webrtc/analytics?timeRange=604800 | jq '{
  averageQuality: .summary.averageQuality,
  totalConnections: .summary.totalConnections,
  connectionTypes: .connectionTypes,
  qualityDistribution: .qualityDistribution
}'
```

#### Security Review
```bash
# Weekly security audit
curl http://localhost:8000/api/webrtc/security/credentials/audit?timeRange=168 | jq '
  group_by(.action) | 
  map({action: .[0].action, count: length, failures: [.[] | select(.success == false)] | length})
'
```

#### Certificate Check (Production)
```bash
# Check SSL certificate expiration
openssl x509 -in /etc/ssl/coturn/cert.pem -noout -dates
```

### Monthly Maintenance

#### Capacity Planning Review
```bash
# Analyze monthly usage trends
curl http://localhost:8000/api/webrtc/coturn/metrics | jq '{
  peakSessions: .sessions.total,
  averageBandwidth: .sessions.bandwidth.average,
  totalBandwidth: .sessions.bandwidth.total
}'
```

#### Configuration Backup
```bash
# Backup configuration files
tar -czf "coturn-config-backup-$(date +%Y%m%d).tar.gz" \
  docker/coturn/ \
  config/environments/ \
  docs/
```

#### Update Check
```bash
# Check for COTURN updates
docker pull coturn/coturn:latest
docker images coturn/coturn
```

### Quarterly Maintenance

#### Security Audit
- Review access logs
- Update blocked IP lists
- Rotate secrets and certificates
- Review security policies

#### Performance Optimization
- Analyze performance trends
- Optimize configuration parameters
- Plan capacity upgrades
- Review monitoring thresholds

#### Disaster Recovery Testing
- Test backup and restore procedures
- Validate failover mechanisms
- Update incident response procedures

## Alerting and Notifications

### Alert Levels

#### INFO
- Service started/stopped
- Configuration changes
- Routine maintenance

#### WARNING
- Performance degradation
- High resource usage
- Authentication failures

#### CRITICAL
- Service outage
- Security breaches
- System failures

### Alert Configuration

#### Prometheus Alerting Rules
```yaml
# coturn-alerts.yml
groups:
  - name: coturn
    rules:
      - alert: CoturnServiceDown
        expr: up{job="coturn"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "COTURN service is down"
          description: "COTURN service has been down for more than 1 minute"

      - alert: HighAuthenticationFailureRate
        expr: rate(coturn_auth_failures_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High authentication failure rate"
          description: "Authentication failure rate is {{ $value }} per second"

      - alert: HighResponseTime
        expr: coturn_response_time_seconds > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time"
          description: "Response time is {{ $value }} seconds"
```

#### Notification Channels
```bash
# Email notifications
echo "ALERT: $message" | mail -s "COTURN Alert" admin@example.com

# Slack notifications
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"COTURN Alert: '$message'"}' \
  $SLACK_WEBHOOK_URL

# SMS notifications (via service like Twilio)
curl -X POST https://api.twilio.com/2010-04-01/Accounts/$ACCOUNT_SID/Messages.json \
  --data-urlencode "From=$TWILIO_PHONE" \
  --data-urlencode "To=$ADMIN_PHONE" \
  --data-urlencode "Body=COTURN Alert: $message" \
  -u $ACCOUNT_SID:$AUTH_TOKEN
```

## Capacity Planning

### Usage Metrics Collection

#### Session Tracking
```bash
# Track session patterns
curl http://localhost:8000/api/webrtc/coturn/metrics | jq '{
  timestamp: now,
  activeSessions: .sessions.active,
  totalSessions: .sessions.total,
  bandwidth: .sessions.bandwidth.total
}' >> session_metrics.jsonl
```

#### Peak Usage Analysis
```bash
# Analyze peak usage patterns
jq -s 'group_by(.timestamp | strftime("%H")) | 
  map({hour: .[0].timestamp | strftime("%H"), 
       avgSessions: (map(.activeSessions) | add / length),
       maxSessions: (map(.activeSessions) | max)})' session_metrics.jsonl
```

### Capacity Thresholds

#### Current Capacity
- **Concurrent Sessions:** 100 (warning at 80, critical at 95)
- **Bandwidth:** 1 Gbps (warning at 800 Mbps, critical at 950 Mbps)
- **CPU Usage:** 4 cores (warning at 80%, critical at 95%)
- **Memory Usage:** 4 GB (warning at 80%, critical at 95%)

#### Scaling Triggers
- Scale up when average usage > 70% for 15 minutes
- Scale down when average usage < 30% for 30 minutes
- Add capacity when peak usage approaches limits

### Growth Planning

#### Trend Analysis
```bash
# Calculate growth rate
awk '{print $1, $2}' session_metrics.csv | \
  awk 'NR>1{print ($2-prev)/(NR-1); prev=$2}' | \
  awk '{sum+=$1; count++} END {print "Average growth rate:", sum/count}'
```

#### Capacity Forecasting
- Monitor monthly growth trends
- Plan capacity 3-6 months ahead
- Consider seasonal usage patterns
- Account for business growth projections

## Incident Response

### Incident Classification

#### Severity Levels
- **P1 (Critical):** Complete service outage
- **P2 (High):** Significant performance degradation
- **P3 (Medium):** Minor issues affecting some users
- **P4 (Low):** Cosmetic issues or minor bugs

### Response Procedures

#### P1 Incident Response
1. **Immediate Actions (0-5 minutes):**
   - Acknowledge incident
   - Check service status
   - Notify stakeholders

2. **Investigation (5-15 minutes):**
   - Review logs and metrics
   - Identify root cause
   - Implement immediate fixes

3. **Resolution (15-60 minutes):**
   - Apply permanent fix
   - Verify service restoration
   - Update stakeholders

4. **Post-Incident (1-24 hours):**
   - Document incident
   - Conduct post-mortem
   - Implement preventive measures

#### Common Incident Scenarios

##### Service Outage
```bash
# Quick diagnosis
docker-compose ps
curl http://localhost:8000/api/webrtc/coturn/health

# Immediate recovery
docker-compose restart coturn
docker-compose logs coturn
```

##### High Error Rate
```bash
# Check error patterns
docker logs coturn --since 1h | grep -i error | head -20

# Monitor authentication failures
curl http://localhost:8000/api/webrtc/security/status | jq .violations
```

##### Performance Degradation
```bash
# Check resource usage
docker stats --no-stream
curl http://localhost:8000/api/webrtc/coturn/metrics | jq .performance

# Scale if necessary
docker-compose up -d --scale coturn=2
```

### Incident Documentation

#### Incident Report Template
```markdown
# Incident Report: [YYYY-MM-DD] - [Brief Description]

## Summary
- **Incident ID:** INC-YYYY-MMDD-001
- **Severity:** P1/P2/P3/P4
- **Start Time:** YYYY-MM-DD HH:MM UTC
- **End Time:** YYYY-MM-DD HH:MM UTC
- **Duration:** X hours Y minutes
- **Services Affected:** COTURN ICE Server

## Impact
- **Users Affected:** X users
- **Service Availability:** X%
- **Business Impact:** [Description]

## Root Cause
[Detailed explanation of what caused the incident]

## Timeline
- **HH:MM** - Incident detected
- **HH:MM** - Investigation started
- **HH:MM** - Root cause identified
- **HH:MM** - Fix implemented
- **HH:MM** - Service restored

## Resolution
[Description of how the incident was resolved]

## Lessons Learned
- [What went well]
- [What could be improved]
- [Action items for prevention]

## Action Items
- [ ] [Action item 1] - Owner: [Name] - Due: [Date]
- [ ] [Action item 2] - Owner: [Name] - Due: [Date]
```

### Continuous Improvement

#### Post-Incident Reviews
- Conduct within 48 hours of resolution
- Include all stakeholders
- Focus on prevention, not blame
- Document lessons learned

#### Monitoring Improvements
- Update alerting thresholds based on incidents
- Add new monitoring for identified gaps
- Improve incident detection time
- Enhance automated recovery procedures

#### Process Improvements
- Update runbooks based on incident experience
- Improve documentation and procedures
- Enhance team training and knowledge sharing
- Implement additional automation where beneficial