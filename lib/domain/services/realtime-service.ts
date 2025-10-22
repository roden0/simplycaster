/**
 * Real-time Service Interface
 * 
 * Defines the contract for real-time updates using Redis pub/sub
 * for room status, participant updates, and recording events.
 */

export interface RealtimeService {
  // Room status updates
  broadcastRoomStatus(roomId: string, status: RoomStatus): Promise<void>;
  subscribeToRoomUpdates(roomId: string, callback: (update: RoomUpdate) => void): Promise<void>;
  unsubscribeFromRoomUpdates(roomId: string): Promise<void>;
  
  // Participant management
  broadcastParticipantJoined(roomId: string, participant: Participant): Promise<void>;
  broadcastParticipantLeft(roomId: string, participantId: string): Promise<void>;
  
  // Recording events
  broadcastRecordingStarted(roomId: string, recordingId: string): Promise<void>;
  broadcastRecordingStopped(roomId: string, recordingId: string): Promise<void>;
  
  // Generic room events
  broadcastRoomEvent(roomId: string, event: RoomEvent): Promise<void>;
  
  // Subscription management
  subscribeToChannel(channel: string, callback: (message: string) => void): Promise<void>;
  unsubscribeFromChannel(channel: string): Promise<void>;
  
  // Health and cleanup
  disconnect(): Promise<void>;
}

// Supporting types for real-time service
export interface RoomStatus {
  status: 'waiting' | 'active' | 'recording' | 'closed';
  participantCount: number;
  recordingStartedAt?: Date;
  updatedAt: Date;
}

export interface Participant {
  id: string;
  name: string;
  type: 'host' | 'guest';
  joinedAt: Date;
}

export interface RoomUpdate {
  type: 'status_change' | 'participant_joined' | 'participant_left' | 'recording_started' | 'recording_stopped';
  roomId: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

export interface RoomEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

// Channel naming patterns
export const RealtimeChannels = {
  ROOM_UPDATES: (roomId: string) => `room:updates:${roomId}`,
  ROOM_STATUS: (roomId: string) => `room:status:${roomId}`,
  ROOM_PARTICIPANTS: (roomId: string) => `room:participants:${roomId}`,
  ROOM_RECORDING: (roomId: string) => `room:recording:${roomId}`,
  GLOBAL_UPDATES: 'global:updates',
} as const;