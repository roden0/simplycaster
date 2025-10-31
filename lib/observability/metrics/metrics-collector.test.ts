/**
 * MetricsCollector Tests
 * 
 * Tests for the metrics collection service functionality
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { MetricsCollector } from "./metrics-collector.ts";
import type { RoomMetricsContext, WebRTCMetricsContext, RecordingMetricsContext } from "./metrics-collector.ts";

Deno.test("MetricsCollector - Initialization", async () => {
  const collector = new MetricsCollector();
  
  // Test initial state
  const initialHealth = collector.getCollectorHealth();
  assertEquals(initialHealth.initialized, false);
  assertEquals(initialHealth.healthy, false);
  assertEquals(initialHealth.metricsRecorded, 0);
  
  // Test initialization
  await collector.initialize("test-service", "1.0.0");
  
  const healthAfterInit = collector.getCollectorHealth();
  assertEquals(healthAfterInit.initialized, true);
  assertEquals(healthAfterInit.healthy, true);
  assertEquals(healthAfterInit.metricsRecorded, 0);
  
  // Test shutdown
  await collector.shutdown();
  
  const healthAfterShutdown = collector.getCollectorHealth();
  assertEquals(healthAfterShutdown.initialized, false);
});

Deno.test("MetricsCollector - Room Operation Metrics", async () => {
  const collector = new MetricsCollector();
  await collector.initialize("test-service", "1.0.0");
  
  const roomContext: RoomMetricsContext = {
    roomId: "test-room-123",
    hostId: "host-456",
    participantCount: 3,
    maxParticipants: 10,
    allowVideo: true,
    operation: "create",
    success: true,
    duration: 150,
  };
  
  // Record room operation
  collector.recordRoomOperation(roomContext);
  
  // Check that metrics were recorded
  const health = collector.getCollectorHealth();
  assertEquals(health.metricsRecorded, 1);
  assertEquals(health.healthy, true);
  
  // Record active rooms
  collector.recordActiveRooms(5);
  collector.recordTotalParticipants(15);
  
  const finalHealth = collector.getCollectorHealth();
  assertEquals(finalHealth.metricsRecorded, 3);
  
  await collector.shutdown();
});

Deno.test("MetricsCollector - WebRTC Operation Metrics", async () => {
  const collector = new MetricsCollector();
  await collector.initialize("test-service", "1.0.0");
  
  const webrtcContext: WebRTCMetricsContext = {
    roomId: "test-room-123",
    participantId: "participant-789",
    participantType: "guest",
    connectionId: "conn-abc",
    operation: "signaling",
    success: true,
    duration: 50,
    quality: 0.95,
    bandwidth: 1024000,
    latency: 25,
  };
  
  // Record WebRTC operation
  collector.recordWebRTCOperation(webrtcContext);
  
  // Record connection quality
  collector.recordConnectionQuality({
    roomId: webrtcContext.roomId,
    participantId: webrtcContext.participantId,
    quality: webrtcContext.quality,
    bandwidth: webrtcContext.bandwidth,
    latency: webrtcContext.latency,
  });
  
  // Record active connections
  collector.recordActiveConnections(8);
  
  const health = collector.getCollectorHealth();
  assertEquals(health.metricsRecorded, 3);
  assertEquals(health.healthy, true);
  
  await collector.shutdown();
});

Deno.test("MetricsCollector - Recording Operation Metrics", async () => {
  const collector = new MetricsCollector();
  await collector.initialize("test-service", "1.0.0");
  
  const recordingContext: RecordingMetricsContext = {
    roomId: "test-room-123",
    recordingId: "recording-def",
    participantCount: 4,
    operation: "start",
    success: true,
    duration: 200,
    fileSize: 1024 * 1024 * 50, // 50MB
    format: "webm",
  };
  
  // Record recording operation
  collector.recordRecordingOperation(recordingContext);
  
  // Record active recordings and total size
  collector.recordActiveRecordings(2);
  collector.recordTotalRecordingSize(1024 * 1024 * 100); // 100MB
  
  const health = collector.getCollectorHealth();
  assertEquals(health.metricsRecorded, 3);
  assertEquals(health.healthy, true);
  
  await collector.shutdown();
});

Deno.test("MetricsCollector - Error Handling", async () => {
  const collector = new MetricsCollector();
  
  // Test recording metrics before initialization (should not throw)
  const roomContext: RoomMetricsContext = {
    roomId: "test-room-123",
    hostId: "host-456",
    participantCount: 1,
    maxParticipants: 10,
    allowVideo: true,
    operation: "create",
    success: false,
    errorType: "ValidationError",
  };
  
  // Should not throw error when not initialized
  collector.recordRoomOperation(roomContext);
  
  const health = collector.getCollectorHealth();
  assertEquals(health.initialized, false);
  assertEquals(health.metricsRecorded, 0);
  
  // Initialize and test error recording
  await collector.initialize("test-service", "1.0.0");
  
  collector.recordRoomOperation(roomContext);
  
  const healthAfterError = collector.getCollectorHealth();
  assertEquals(healthAfterError.metricsRecorded, 1);
  assertEquals(healthAfterError.healthy, true);
  
  await collector.shutdown();
});

Deno.test("MetricsCollector - Database and Cache Metrics", async () => {
  const collector = new MetricsCollector();
  await collector.initialize("test-service", "1.0.0");
  
  // Test database metrics
  collector.recordDatabaseOperation({
    operation: "select",
    table: "users",
    success: true,
    duration: 25,
    rowsAffected: 1,
  });
  
  collector.recordConnectionPoolStats({
    connectionPoolSize: 10,
    activeConnections: 3,
  });
  
  // Test cache metrics
  collector.recordCacheOperation({
    operation: "get",
    keyPattern: "user:*",
    hit: true,
    success: true,
    duration: 5,
    valueSize: 1024,
  });
  
  collector.recordCacheHitRate(0.85);
  collector.recordCacheSize(1024 * 1024 * 10); // 10MB
  
  const health = collector.getCollectorHealth();
  assertEquals(health.metricsRecorded, 5);
  assertEquals(health.healthy, true);
  
  await collector.shutdown();
});

Deno.test("MetricsCollector - System Metrics", async () => {
  const collector = new MetricsCollector();
  await collector.initialize("test-service", "1.0.0");
  
  // Test system metrics
  collector.recordSystemMetrics({
    cpuUsage: 0.65,
    memoryUsage: 1024 * 1024 * 512, // 512MB
    memoryTotal: 1024 * 1024 * 1024, // 1GB
    diskUsage: 1024 * 1024 * 1024 * 10, // 10GB
    diskTotal: 1024 * 1024 * 1024 * 100, // 100GB
    networkBytesIn: 1024 * 1024, // 1MB
    networkBytesOut: 1024 * 512, // 512KB
  });
  
  const health = collector.getCollectorHealth();
  assertEquals(health.metricsRecorded, 1);
  assertEquals(health.healthy, true);
  
  await collector.shutdown();
});

Deno.test("MetricsCollector - Singleton Instance", async () => {
  const { metricsCollector, initializeMetricsCollector, getMetricsCollectorHealth } = await import("./metrics-collector.ts");
  
  // Test singleton initialization
  await initializeMetricsCollector("singleton-test", "1.0.0");
  
  const health = getMetricsCollectorHealth();
  assertEquals(health.initialized, true);
  assertEquals(health.healthy, true);
  
  // Test that it's the same instance
  assertExists(metricsCollector);
  assertEquals(metricsCollector.getCollectorHealth().initialized, true);
  
  await metricsCollector.shutdown();
});