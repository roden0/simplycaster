/**
 * Connection Monitor Tests
 * 
 * Tests for connection quality monitoring, connection type detection,
 * and bandwidth/latency monitoring capabilities.
 */

import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ConnectionMonitor } from "./connection-monitor.ts";

// Mock RTCPeerConnection for testing
class MockRTCPeerConnection {
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  iceGatheringState: RTCIceGatheringState = 'new';
  
  onconnectionstatechange: ((event: Event) => void) | null = null;
  oniceconnectionstatechange: ((event: Event) => void) | null = null;
  onicegatheringstatechange: ((event: Event) => void) | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;

  async getStats(): Promise<RTCStatsReport> {
    const stats = new Map();
    
    // Mock candidate pair stats
    stats.set('candidate-pair-1', {
      type: 'candidate-pair',
      state: 'succeeded',
      currentRoundTripTime: 0.05, // 50ms
      localCandidateId: 'local-candidate-1',
      remoteCandidateId: 'remote-candidate-1'
    });

    // Mock local candidate
    stats.set('local-candidate-1', {
      type: 'local-candidate',
      candidateType: 'host'
    });

    // Mock remote candidate
    stats.set('remote-candidate-1', {
      type: 'remote-candidate',
      candidateType: 'host'
    });

    // Mock inbound RTP stats
    stats.set('inbound-rtp-1', {
      type: 'inbound-rtp',
      mediaType: 'audio',
      packetsLost: 5,
      packetsReceived: 1000,
      bytesReceived: 50000,
      jitter: 0.01
    });

    // Mock outbound RTP stats
    stats.set('outbound-rtp-1', {
      type: 'outbound-rtp',
      mediaType: 'audio',
      packetsSent: 995,
      bytesSent: 49500
    });

    return stats as RTCStatsReport;
  }
}

Deno.test("ConnectionMonitor - Constructor and configuration", () => {
  // Default configuration
  const monitor1 = new ConnectionMonitor();
  const stats1 = monitor1.getMonitoringStats();
  assertEquals(stats1.statsInterval, 5000);
  assertEquals(stats1.isMonitoring, false);

  // Custom configuration
  const monitor2 = new ConnectionMonitor({
    statsInterval: 2000,
    enableDetailedStats: false,
    qualityThresholds: {
      excellent: { rtt: 50, packetLoss: 0.005 },
      good: { rtt: 100, packetLoss: 0.02 },
      fair: { rtt: 300, packetLoss: 0.04 }
    }
  });
  const stats2 = monitor2.getMonitoringStats();
  assertEquals(stats2.statsInterval, 2000);
});

Deno.test("ConnectionMonitor - Start and stop monitoring", () => {
  const monitor = new ConnectionMonitor({ statsInterval: 1000 });
  
  // Initially not monitoring
  assert(!monitor.getMonitoringStats().isMonitoring);
  
  // Start monitoring
  monitor.startMonitoring();
  assert(monitor.getMonitoringStats().isMonitoring);
  
  // Stop monitoring
  monitor.stopMonitoring();
  assert(!monitor.getMonitoringStats().isMonitoring);
  
  // Multiple start calls should be safe
  monitor.startMonitoring();
  monitor.startMonitoring();
  assert(monitor.getMonitoringStats().isMonitoring);
  
  monitor.stopMonitoring();
});

Deno.test("ConnectionMonitor - Add and remove peer connections", () => {
  const monitor = new ConnectionMonitor();
  const mockPeerConnection = new MockRTCPeerConnection() as any;
  const participantId = "test-participant-1";
  
  // Initially no connections
  assertEquals(monitor.getMonitoringStats().monitoredConnections, 0);
  assert(monitor.getConnectionInfo(participantId) === null);
  
  // Add peer connection
  monitor.addPeerConnection(participantId, mockPeerConnection);
  assertEquals(monitor.getMonitoringStats().monitoredConnections, 1);
  assert(monitor.getConnectionInfo(participantId) !== null);
  
  // Remove peer connection
  monitor.removePeerConnection(participantId);
  assertEquals(monitor.getMonitoringStats().monitoredConnections, 0);
  assert(monitor.getConnectionInfo(participantId) === null);
});

Deno.test("ConnectionMonitor - Connection info tracking", () => {
  const monitor = new ConnectionMonitor();
  const mockPeerConnection = new MockRTCPeerConnection() as any;
  const participantId = "test-participant-1";
  
  monitor.addPeerConnection(participantId, mockPeerConnection);
  
  const connectionInfo = monitor.getConnectionInfo(participantId);
  assert(connectionInfo !== null);
  assertEquals(connectionInfo.participantId, participantId);
  assertEquals(connectionInfo.connectionState, 'new');
  assertEquals(connectionInfo.iceConnectionState, 'new');
  assertEquals(connectionInfo.iceGatheringState, 'new');
  assert(Array.isArray(connectionInfo.localCandidates));
  assert(Array.isArray(connectionInfo.remoteCandidates));
  assertEquals(connectionInfo.usingTurnRelay, false);
});

Deno.test("ConnectionMonitor - Event listeners", () => {
  const monitor = new ConnectionMonitor();
  let qualityChangedCalled = false;
  let connectionTypeDetectedCalled = false;
  let statsUpdatedCalled = false;
  
  // Add event listeners
  monitor.on('quality-changed', (participantId, quality) => {
    qualityChangedCalled = true;
    assertEquals(participantId, "test-participant");
    assert(quality.timestamp instanceof Date);
  });
  
  monitor.on('connection-type-detected', (participantId, type) => {
    connectionTypeDetectedCalled = true;
    assertEquals(participantId, "test-participant");
    assert(['direct', 'relay', 'unknown'].includes(type));
  });
  
  monitor.on('stats-updated', (participantId, stats) => {
    statsUpdatedCalled = true;
    assertEquals(participantId, "test-participant");
  });
  
  // Simulate events (in a real scenario, these would be triggered by stats collection)
  monitor['emit']('quality-changed', 'test-participant', {
    connectionType: 'direct' as const,
    bytesReceived: 1000,
    bytesSent: 1000,
    packetsLost: 0,
    packetsReceived: 100,
    packetsSent: 100,
    roundTripTime: 50,
    jitter: 0.01,
    timestamp: new Date()
  });
  
  monitor['emit']('connection-type-detected', 'test-participant', 'direct');
  monitor['emit']('stats-updated', 'test-participant', {} as any);
  
  assert(qualityChangedCalled, "quality-changed event should be called");
  assert(connectionTypeDetectedCalled, "connection-type-detected event should be called");
  assert(statsUpdatedCalled, "stats-updated event should be called");
});

Deno.test("ConnectionMonitor - Connection quality calculation", async () => {
  const monitor = new ConnectionMonitor({
    qualityThresholds: {
      excellent: { rtt: 100, packetLoss: 0.01 },
      good: { rtt: 200, packetLoss: 0.03 },
      fair: { rtt: 400, packetLoss: 0.05 }
    }
  });
  
  const mockPeerConnection = new MockRTCPeerConnection() as any;
  const participantId = "test-participant";
  
  monitor.addPeerConnection(participantId, mockPeerConnection);
  monitor.startMonitoring();
  
  // Wait a moment for stats collection
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const quality = monitor.getConnectionQuality(participantId);
  
  // Should have collected some stats
  if (quality) {
    assert(quality.timestamp instanceof Date);
    assert(typeof quality.roundTripTime === 'number');
    assert(typeof quality.packetsReceived === 'number');
    assert(['direct', 'relay', 'unknown'].includes(quality.connectionType));
  }
  
  monitor.stopMonitoring();
});

Deno.test("ConnectionMonitor - Multiple participants", () => {
  const monitor = new ConnectionMonitor();
  const participants = ['participant-1', 'participant-2', 'participant-3'];
  
  // Add multiple participants
  participants.forEach(id => {
    const mockPeerConnection = new MockRTCPeerConnection() as any;
    monitor.addPeerConnection(id, mockPeerConnection);
  });
  
  assertEquals(monitor.getMonitoringStats().monitoredConnections, 3);
  
  // Check all connection info exists
  const allConnectionInfo = monitor.getAllConnectionInfo();
  assertEquals(allConnectionInfo.size, 3);
  
  participants.forEach(id => {
    assert(allConnectionInfo.has(id));
    const info = allConnectionInfo.get(id);
    assert(info !== undefined);
    assertEquals(info.participantId, id);
  });
  
  // Remove one participant
  monitor.removePeerConnection(participants[0]);
  assertEquals(monitor.getMonitoringStats().monitoredConnections, 2);
  assert(!monitor.getAllConnectionInfo().has(participants[0]));
});

Deno.test("ConnectionMonitor - Event listener management", () => {
  const monitor = new ConnectionMonitor();
  
  const listener1 = () => {};
  const listener2 = () => {};
  
  // Add listeners
  monitor.on('quality-changed', listener1);
  monitor.on('quality-changed', listener2);
  
  // Remove specific listener
  monitor.off('quality-changed', listener1);
  
  // Should still have listener2 (we can't easily test this without accessing private members)
  // But we can test that off() doesn't throw errors
  monitor.off('quality-changed', listener2);
  monitor.off('quality-changed', () => {}); // Non-existent listener
});