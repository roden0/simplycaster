# Grafana Dashboard Configuration

This directory contains the Grafana dashboard configurations for SimplyCaster observability monitoring.

## Dashboard Structure

### 1. Application Overview Dashboard (`overview-dashboard.json`)
**Purpose**: High-level application performance monitoring
**Metrics Covered**:
- Request throughput and latency visualizations
- Error rate and status code monitoring  
- Active users and sessions tracking
- HTTP response time distribution
- Request volume by method

**Key Panels**:
- Request Throughput (stat)
- Average Response Time (stat) 
- Error Rate (stat)
- Active Users (stat)
- Request Throughput Over Time (timeseries)
- Response Time Distribution (timeseries)
- HTTP Status Codes (timeseries)
- Active Sessions (timeseries)

### 2. WebRTC Monitoring Dashboard (`webrtc-dashboard.json`)
**Purpose**: Real-time communication monitoring
**Metrics Covered**:
- Connection quality and participant count visualizations
- Session duration and signaling performance metrics
- Media stream statistics dashboard

**Key Panels**:
- Active WebRTC Connections (stat)
- Total Participants (stat)
- Connection Quality Score (stat)
- Average Session Duration (stat)
- WebRTC Connection Timeline (timeseries)
- Connection Quality Distribution (timeseries)
- Signaling Performance (timeseries)
- Media Stream Statistics (timeseries)
- Room Participant Distribution (timeseries)

### 3. Database & Infrastructure Dashboard (`database-infrastructure-dashboard.json`)
**Purpose**: Backend performance and resource monitoring
**Metrics Covered**:
- Database performance and slow query analysis views
- Connection usage and transaction metrics
- System resource utilization dashboard

**Key Panels**:
- Database Query Rate (stat)
- Average Query Duration (stat)
- Active DB Connections (stat)
- Redis Cache Hit Rate (stat)
- Database Query Performance (timeseries)
- Database Connection Pool Usage (timeseries)
- Slow Query Analysis (table)
- Redis Operations Performance (timeseries)
- System Resource Utilization (timeseries)
- Transaction Metrics (timeseries)

## Configuration Files

### `datasources.yml`
Configures the data sources for Grafana:
- **Loki**: Log aggregation and querying
- **Tempo**: Distributed tracing
- **Mimir**: Metrics storage and querying (Prometheus-compatible)

### `dashboards.yml`
Configures dashboard provisioning:
- Automatically loads dashboards from the `simplycast/` directory
- Enables UI updates and prevents deletion
- Updates every 10 seconds

## Metric Naming Conventions

All SimplyCaster metrics follow the pattern: `simplycast_<component>_<metric>_<unit>`

### Application Metrics
- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - HTTP request duration histogram
- `simplycast_active_users_total` - Current active users
- `simplycast_active_sessions_total` - Current active sessions

### WebRTC Metrics
- `simplycast_webrtc_connections_active` - Active WebRTC connections
- `simplycast_webrtc_connections_total` - Total WebRTC connections
- `simplycast_webrtc_connection_quality_score` - Connection quality (0-5)
- `simplycast_webrtc_session_duration_seconds` - Session duration
- `simplycast_webrtc_signaling_duration_seconds` - Signaling operation duration
- `simplycast_webrtc_media_streams_active` - Active media streams by type
- `simplycast_room_participants_total` - Participants per room

### Database Metrics
- `simplycast_database_queries_total` - Total database queries
- `simplycast_database_query_duration_seconds` - Query duration histogram
- `simplycast_database_connections_active` - Active database connections
- `simplycast_database_connections_idle` - Idle database connections
- `simplycast_database_connections_max` - Maximum database connections
- `simplycast_database_slow_queries_total` - Slow queries by type
- `simplycast_database_transactions_total` - Transactions by status

### Redis Metrics
- `simplycast_redis_cache_hits_total` - Cache hits
- `simplycast_redis_cache_misses_total` - Cache misses
- `simplycast_redis_operation_duration_seconds` - Redis operation duration

### System Metrics
- `simplycast_system_cpu_usage_percent` - CPU usage percentage
- `simplycast_system_memory_usage_percent` - Memory usage percentage
- `simplycast_system_disk_usage_percent` - Disk usage percentage

## Deployment

These dashboards are automatically provisioned when the OTEL-LGTM stack starts up. The configuration files are mounted into the Grafana container at:
- `/etc/grafana/provisioning/datasources/datasources.yml`
- `/etc/grafana/provisioning/dashboards/dashboards.yml`
- `/etc/grafana/provisioning/dashboards/simplycast/`

## Customization

To customize dashboards:
1. Edit the JSON files directly for structural changes
2. Use the Grafana UI for visual adjustments (changes will be saved back to files)
3. Add new panels by extending the `panels` array in each dashboard
4. Modify thresholds and colors in the `fieldConfig.defaults.thresholds` sections

## Alerting

For alerting configuration, see the optional task 7.4 in the implementation plan. Alert rules can be added to each dashboard or configured separately in Grafana.