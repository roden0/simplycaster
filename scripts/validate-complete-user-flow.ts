#!/usr/bin/env -S deno run -A

/**
 * Complete User Flow Validation
 * 
 * This script simulates a complete user flow with distributed tracing
 * to validate end-to-end observability functionality.
 */

import { ObservabilityService } from "../lib/observability/observability-service.ts";

async function simulateCompleteUserFlow(): Promise<void> {
  console.log("🚀 Simulating Complete User Flow with Distributed Tracing");
  console.log("=" .repeat(60));

  const observability = new ObservabilityService();
  
  try {
    // Initialize observability
    await observability.initialize();
    console.log("✅ Observability initialized");

    // Simulate user authentication flow
    observability.startActiveSpan("user-authentication", (authSpan) => {
      authSpan.setAttributes({
        "user.flow": "login",
        "auth.method": "email-password",
        "user.id": "user-123",
        "user.role": "host"
      });

      // Simulate database lookup
      observability.startActiveSpan("database-user-lookup", (dbSpan) => {
        dbSpan.setAttributes({
          "db.operation": "SELECT",
          "db.table": "users",
          "db.query_time_ms": 45
        });
        
        // Record database metrics
        observability.recordHistogram("database_query_duration_ms", 45, {
          attributes: { operation: "user_lookup", table: "users" }
        });
        
        dbSpan.end();
      });

      // Simulate session creation
      observability.startActiveSpan("session-creation", (sessionSpan) => {
        sessionSpan.setAttributes({
          "session.id": "session-456",
          "session.duration_hours": 24
        });
        
        // Record authentication metrics
        observability.recordCounter("user_authentications_total", 1, {
          attributes: { method: "email-password", status: "success" }
        });
        
        sessionSpan.end();
      });

      authSpan.end();
    });

    // Simulate room creation flow
    observability.startActiveSpan("room-creation", (roomSpan) => {
      roomSpan.setAttributes({
        "room.id": "room-789",
        "room.name": "Weekly Team Meeting",
        "room.host_id": "user-123",
        "room.max_participants": 10
      });

      // Simulate database room insertion
      observability.startActiveSpan("database-room-insert", (dbSpan) => {
        dbSpan.setAttributes({
          "db.operation": "INSERT",
          "db.table": "rooms",
          "db.query_time_ms": 23
        });
        
        observability.recordHistogram("database_query_duration_ms", 23, {
          attributes: { operation: "room_insert", table: "rooms" }
        });
        
        dbSpan.end();
      });

      // Simulate WebRTC initialization
      observability.startActiveSpan("webrtc-initialization", (webrtcSpan) => {
        webrtcSpan.setAttributes({
          "webrtc.room_id": "room-789",
          "webrtc.ice_servers": 2,
          "webrtc.initialization_time_ms": 150
        });
        
        observability.recordHistogram("webrtc_initialization_duration_ms", 150, {
          attributes: { room_id: "room-789" }
        });
        
        observability.recordCounter("rooms_created_total", 1, {
          attributes: { host_type: "user", webrtc_enabled: "true" }
        });
        
        webrtcSpan.end();
      });

      roomSpan.end();
    });

    // Simulate guest joining flow
    observability.startActiveSpan("guest-joining", (guestSpan) => {
      guestSpan.setAttributes({
        "guest.id": "guest-321",
        "guest.name": "John Doe",
        "room.id": "room-789",
        "invitation.token": "token-abc123"
      });

      // Simulate token validation
      observability.startActiveSpan("token-validation", (tokenSpan) => {
        tokenSpan.setAttributes({
          "token.type": "guest-invitation",
          "token.valid": true,
          "token.expires_in_hours": 2
        });
        
        observability.recordCounter("token_validations_total", 1, {
          attributes: { type: "guest-invitation", status: "valid" }
        });
        
        tokenSpan.end();
      });

      // Simulate WebRTC connection establishment
      observability.startActiveSpan("webrtc-connection", (connectionSpan) => {
        connectionSpan.setAttributes({
          "webrtc.connection_id": "conn-654",
          "webrtc.ice_gathering_time_ms": 800,
          "webrtc.connection_state": "connected"
        });
        
        observability.recordHistogram("webrtc_connection_time_ms", 800, {
          attributes: { connection_type: "guest", ice_type: "relay" }
        });
        
        observability.recordGauge("active_webrtc_connections", 2, {
          attributes: { room_id: "room-789" }
        });
        
        connectionSpan.end();
      });

      guestSpan.end();
    });

    // Simulate recording flow
    observability.startActiveSpan("recording-session", (recordingSpan) => {
      recordingSpan.setAttributes({
        "recording.id": "rec-987",
        "recording.room_id": "room-789",
        "recording.participants": 2,
        "recording.duration_minutes": 30
      });

      // Simulate recording start
      observability.startActiveSpan("recording-start", (startSpan) => {
        startSpan.setAttributes({
          "recording.format": "webm",
          "recording.quality": "high",
          "recording.channels": 2
        });
        
        observability.recordCounter("recordings_started_total", 1, {
          attributes: { format: "webm", quality: "high" }
        });
        
        startSpan.end();
      });

      // Simulate recording processing
      observability.startActiveSpan("recording-processing", (processSpan) => {
        processSpan.setAttributes({
          "processing.type": "ffmpeg",
          "processing.duration_ms": 2500,
          "processing.output_size_mb": 45
        });
        
        observability.recordHistogram("recording_processing_duration_ms", 2500, {
          attributes: { format: "webm", participants: "2" }
        });
        
        observability.recordHistogram("recording_file_size_mb", 45, {
          attributes: { duration_minutes: "30", participants: "2" }
        });
        
        processSpan.end();
      });

      recordingSpan.end();
    });

    // Simulate error scenario
    observability.startActiveSpan("error-scenario", (errorSpan) => {
      errorSpan.setAttributes({
        "error.type": "network-timeout",
        "error.component": "webrtc-signaling",
        "error.recoverable": true
      });
      
      observability.recordCounter("errors_total", 1, {
        attributes: { 
          component: "webrtc-signaling", 
          error_type: "network-timeout",
          severity: "warning"
        }
      });
      
      errorSpan.end();
    });

    console.log("✅ Complete user flow simulation finished");
    console.log("📊 Telemetry data generated:");
    console.log("   - Authentication flow with database operations");
    console.log("   - Room creation with WebRTC initialization");
    console.log("   - Guest joining with token validation");
    console.log("   - Recording session with processing");
    console.log("   - Error handling scenario");
    
    // Wait for export
    console.log("⏳ Waiting for telemetry export...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
  } finally {
    await observability.shutdown();
    console.log("✅ Observability shutdown complete");
  }

  console.log("\n🎯 Validation Complete!");
  console.log("📈 Check Grafana dashboards:");
  console.log("   - Traces: http://localhost:3000/explore (Tempo datasource)");
  console.log("   - Metrics: http://localhost:3000/explore (Prometheus datasource)");
  console.log("   - Search for service.name=simplycast");
}

if (import.meta.main) {
  await simulateCompleteUserFlow();
}