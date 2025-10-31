/**
 * Metrics Usage Example
 * 
 * This example demonstrates how to use the SimplyCaster metrics collection service
 * for recording application-specific and infrastructure metrics.
 */

import {
  initializeMetricsService,
  metricsService,
  recordRoomMetrics,
  recordWebRTCMetrics,
  recordDatabaseMetrics,
  recordCacheMetrics,
  getMetricsServiceHealth,
  shutdownMetricsService,
  metricsRecorded,
} from "../metrics/index.ts";
import { loadAndValidateConfig } from "../config/observability-config.ts";
import type {
  RoomMetricsContext,
  WebRTCMetricsContext,
  RecordingMetricsContext,
  DatabasePerformanceContext,
  RedisPerformanceContext,
  SystemResourceContext,
} from "../metrics/index.ts";

/**
 * Example: Initialize metrics service
 */
async function initializeMetrics() {
  console.log("🚀 Initializing metrics service...");
  
  // Load configuration
  const config = loadAndValidateConfig();
  
  // Initialize the unified metrics service
  await initializeMetricsService(config);
  
  // Check health
  const health = getMetricsServiceHealth();
  console.log("📊 Metrics service health:", health);
}

/**
 * Example: Record room operation metrics
 */
function recordRoomOperationExample() {
  console.log("🏠 Recording room operation metrics...");
  
  const roomContext: RoomMetricsContext = {
    roomId: "room-abc123",
    hostId: "host-def456",
    participantCount: 4,
    maxParticipants: 10,
    allowVideo: true,
    operation: "create",
    success: true,
    duration: 150, // milliseconds
  };
  
  // Record room operation
  metricsService.getMetricsCollector().recordRoomOperation(roomContext);
  
  // Record current active rooms and participants
  metricsService.getMetricsCollector().recordActiveRooms(5);
  metricsService.getMetricsCollector().recordTotalParticipants(20);
  
  // Using convenience function
  recordRoomMetrics("join", "room-abc123", "host-def456", true, 75);
  
  console.log("✅ Room metrics recorded");
}

/**
 * Example: Record WebRTC operation metrics
 */
function recordWebRTCOperationExample() {
  console.log("📡 Recording WebRTC operation metrics...");
  
  const webrtcContext: WebRTCMetricsContext = {
    roomId: "room-abc123",
    participantId: "participant-ghi789",
    participantType: "guest",
    connectionId: "conn-jkl012",
    operation: "signaling",
    success: true,
    duration: 45,
    quality: 0.92,
    bandwidth: 1024000, // 1 Mbps
    packetLoss: 0.01, // 1%
    latency: 28, // milliseconds
  };
  
  // Record WebRTC operation
  metricsService.getMetricsCollector().recordWebRTCOperation(webrtcContext);
  
  // Record connection quality separately
  metricsService.getMetricsCollector().recordConnectionQuality({
    roomId: webrtcContext.roomId,
    participantId: webrtcContext.participantId,
    quality: webrtcContext.quality,
    bandwidth: webrtcContext.bandwidth,
    latency: webrtcContext.latency,
  });
  
  // Record active connections
  metricsService.getMetricsCollector().recordActiveConnections(12);
  
  // Using convenience function
  recordWebRTCMetrics("ice_candidate", "room-abc123", "participant-ghi789", true, 15);
  
  console.log("✅ WebRTC metrics recorded");
}

/**
 * Example: Record recording operation metrics
 */
function recordRecordingOperationExample() {
  console.log("🎥 Recording recording operation metrics...");
  
  const recordingContext: RecordingMetricsContext = {
    roomId: "room-abc123",
    recordingId: "recording-mno345",
    participantCount: 4,
    operation: "start",
    success: true,
    duration: 200,
    fileSize: 1024 * 1024 * 25, // 25MB
    format: "webm",
  };
  
  // Record recording operation
  metricsService.getMetricsCollector().recordRecordingOperation(recordingContext);
  
  // Record active recordings and total size
  metricsService.getMetricsCollector().recordActiveRecordings(3);
  metricsService.getMetricsCollector().recordTotalRecordingSize(1024 * 1024 * 150); // 150MB
  
  console.log("✅ Recording metrics recorded");
}

/**
 * Example: Record database performance metrics
 */
function recordDatabasePerformanceExample() {
  console.log("🗄️ Recording database performance metrics...");
  
  const dbContext: DatabasePerformanceContext = {
    poolSize: 10,
    activeConnections: 4,
    idleConnections: 6,
    waitingConnections: 0,
    connectionAcquisitionTime: 15,
    queryType: "select",
    queryDuration: 25,
    queryComplexity: "medium",
    rowsReturned: 1,
    slowQuery: false,
    indexUsage: true,
    success: true,
  };
  
  // Record database performance
  metricsService.getInfrastructureMetrics().recordDatabasePerformance(dbContext);
  
  // Record connection pool stats
  metricsService.getInfrastructureMetrics().recordConnectionPoolStats(10, 4, 6, 0);
  
  // Using convenience function
  recordDatabaseMetrics("select", "users", true, 25, 1);
  
  console.log("✅ Database performance metrics recorded");
}

/**
 * Example: Record Redis performance metrics
 */
function recordRedisPerformanceExample() {
  console.log("🔴 Recording Redis performance metrics...");
  
  const redisContext: RedisPerformanceContext = {
    operation: "get",
    operationDuration: 5,
    keyPattern: "user:*",
    hit: true,
    keySize: 20,
    valueSize: 1024,
    ttl: 3600,
    connectionPoolSize: 5,
    activeConnections: 2,
    connectionLatency: 2,
    slowOperation: false,
    memoryUsage: 1024 * 1024 * 50, // 50MB
    success: true,
  };
  
  // Record Redis performance
  metricsService.getInfrastructureMetrics().recordRedisPerformance(redisContext);
  
  // Record cache hit rate
  metricsService.getInfrastructureMetrics().recordCacheHitRate(0.85, "user:*");
  
  // Record Redis memory usage
  metricsService.getInfrastructureMetrics().recordRedisMemoryUsage(
    1024 * 1024 * 50, // 50MB used
    1024 * 1024 * 100 // 100MB max
  );
  
  // Using convenience function
  recordCacheMetrics("get", true, true, 5, "session:*");
  
  console.log("✅ Redis performance metrics recorded");
}

/**
 * Example: Record system resource metrics
 */
function recordSystemResourcesExample() {
  console.log("💻 Recording system resource metrics...");
  
  const systemContext: SystemResourceContext = {
    cpuUsagePercent: 65,
    cpuLoadAverage1m: 1.2,
    cpuLoadAverage5m: 1.1,
    cpuLoadAverage15m: 1.0,
    memoryUsedBytes: 1024 * 1024 * 512, // 512MB
    memoryTotalBytes: 1024 * 1024 * 1024, // 1GB
    memoryAvailableBytes: 1024 * 1024 * 512, // 512MB
    diskUsedBytes: 1024 * 1024 * 1024 * 10, // 10GB
    diskTotalBytes: 1024 * 1024 * 1024 * 100, // 100GB
    diskAvailableBytes: 1024 * 1024 * 1024 * 90, // 90GB
    diskReadBytesPerSec: 1024 * 1024 * 5, // 5MB/s
    diskWriteBytesPerSec: 1024 * 1024 * 2, // 2MB/s
    networkRxBytesPerSec: 1024 * 1024, // 1MB/s
    networkTxBytesPerSec: 1024 * 512, // 512KB/s
    processCount: 150,
    threadCount: 800,
    fileDescriptorCount: 1024,
    fileDescriptorLimit: 4096,
  };
  
  // Record system resources
  metricsService.getInfrastructureMetrics().recordSystemResources(systemContext);
  
  console.log("✅ System resource metrics recorded");
}

/**
 * Example: Monitor performance alerts
 */
function monitorPerformanceAlertsExample() {
  console.log("🚨 Checking performance alerts...");
  
  // Get current performance alerts
  const alerts = metricsService.getInfrastructureMetrics().getPerformanceAlerts();
  
  if (alerts.length > 0) {
    console.log(`⚠️ Found ${alerts.length} active performance alerts:`);
    alerts.forEach(alert => {
      console.log(`  - [${alert.severity.toUpperCase()}] ${alert.type}/${alert.resource}: ${alert.message}`);
      console.log(`    Value: ${alert.value}, Threshold: ${alert.threshold}, Time: ${alert.timestamp.toISOString()}`);
    });
  } else {
    console.log("✅ No active performance alerts");
  }
  
  // Get infrastructure health
  const infraHealth = metricsService.getInfrastructureMetrics().getInfrastructureHealth();
  console.log("🏥 Infrastructure health:", infraHealth);
}

/**
 * Example: Using metrics with decorators
 */
class ExampleService {
  // Note: Decorators are simplified for this example
  // In practice, you would integrate them with the actual metrics collector
  
  async createUser(userData: { name: string; email: string }) {
    const startTime = Date.now();
    
    try {
      // Simulate user creation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (userData.email.includes("invalid")) {
        throw new Error("Invalid email format");
      }
      
      // Record success metric
      console.debug(`Metric [counter] user_creation: success, duration: ${Date.now() - startTime}ms`);
      
      return { id: "user-123", ...userData };
    } catch (error) {
      // Record error metric
      const errorType = error instanceof Error ? error.constructor.name : 'unknown';
      console.debug(`Metric [counter] user_creation: error (${errorType}), duration: ${Date.now() - startTime}ms`);
      throw error;
    }
  }
  
  async joinRoom(userId: string, roomId: string) {
    const startTime = Date.now();
    
    try {
      // Simulate room joining
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Record success metric
      console.debug(`Metric [histogram] room_join_duration: success, duration: ${Date.now() - startTime}ms`);
      
      return { success: true, userId, roomId };
    } catch (error) {
      // Record error metric
      const errorType = error instanceof Error ? error.constructor.name : 'unknown';
      console.debug(`Metric [histogram] room_join_duration: error (${errorType}), duration: ${Date.now() - startTime}ms`);
      throw error;
    }
  }
}

/**
 * Example: Test decorator functionality
 */
async function testDecoratorsExample() {
  console.log("🎯 Testing metrics decorators...");
  
  const service = new ExampleService();
  
  try {
    // Successful operations
    await service.createUser({ name: "John Doe", email: "john@example.com" });
    await service.joinRoom("user-123", "room-abc");
    
    // Failed operation
    try {
      await service.createUser({ name: "Invalid User", email: "invalid@" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("Expected error caught:", message);
    }
    
    console.log("✅ Decorator metrics recorded");
  } catch (error) {
    console.error("❌ Error in decorator example:", error);
  }
}

/**
 * Main example function
 */
async function runMetricsExample() {
  try {
    // Initialize metrics service
    await initializeMetrics();
    
    // Record various types of metrics
    recordRoomOperationExample();
    recordWebRTCOperationExample();
    recordRecordingOperationExample();
    recordDatabasePerformanceExample();
    recordRedisPerformanceExample();
    recordSystemResourcesExample();
    
    // Monitor performance
    monitorPerformanceAlertsExample();
    
    // Test decorators
    await testDecoratorsExample();
    
    // Final health check
    const finalHealth = getMetricsServiceHealth();
    console.log("📈 Final metrics service health:", finalHealth);
    
    console.log("🎉 Metrics example completed successfully!");
    
  } catch (error) {
    console.error("❌ Error in metrics example:", error);
  } finally {
    // Cleanup
    await shutdownMetricsService();
    console.log("🛑 Metrics service shutdown completed");
  }
}

// Run the example if this file is executed directly
if (import.meta.main) {
  await runMetricsExample();
}

// Export for use in other examples
export {
  runMetricsExample,
  initializeMetrics,
  recordRoomOperationExample,
  recordWebRTCOperationExample,
  recordRecordingOperationExample,
  recordDatabasePerformanceExample,
  recordRedisPerformanceExample,
  recordSystemResourcesExample,
  monitorPerformanceAlertsExample,
  testDecoratorsExample,
};