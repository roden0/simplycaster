/**
 * Real-time Service Implementation
 * 
 * Concrete implementation of RealtimeService interface using Redis pub/sub
 * for room status updates, participant management, and recording events.
 */

import { RedisService } from '../../domain/services/redis-service.ts';
import { 
  RealtimeService, 
  RoomStatus, 
  Participant, 
  RoomUpdate, 
  RoomEvent,
  RealtimeChannels 
} from '../../domain/services/realtime-service.ts';

export class RealtimeServiceImpl implements RealtimeService {
  private redisService: RedisService;
  private subscriptions: Map<string, (message: string) => void> = new Map();

  constructor(redisService: RedisService) {
    this.redisService = redisService;
  }

  /**
   * Serialize message for Redis pub/sub
   */
  private serializeMessage(data: unknown): string {
    return JSON.stringify(data);
  }

  /**
   * Deserialize message from Redis pub/sub
   */
  private deserializeMessage<T>(message: string): T {
    try {
      return JSON.parse(message) as T;
    } catch (error) {
      console.error('Failed to deserialize message:', error);
      throw new Error('Invalid message format');
    }
  }

  /**
   * Create a room update message
   */
  private createRoomUpdate(
    type: RoomUpdate['type'],
    roomId: string,
    data: Record<string, unknown>
  ): RoomUpdate {
    return {
      type,
      roomId,
      timestamp: new Date(),
      data,
    };
  }

  // Room status updates
  async broadcastRoomStatus(roomId: string, status: RoomStatus): Promise<void> {
    try {
      const channel = RealtimeChannels.ROOM_STATUS(roomId);
      const update = this.createRoomUpdate('status_change', roomId, { status });
      const message = this.serializeMessage(update);
      
      await this.redisService.publish(channel, message);
      
      // Also broadcast to general room updates channel
      const generalChannel = RealtimeChannels.ROOM_UPDATES(roomId);
      await this.redisService.publish(generalChannel, message);
      
      console.log(`Broadcasted room status update for room ${roomId}:`, status.status);
    } catch (error) {
      console.error(`Failed to broadcast room status for room ${roomId}:`, error);
      throw error;
    }
  }

  async subscribeToRoomUpdates(roomId: string, callback: (update: RoomUpdate) => void): Promise<void> {
    try {
      const channel = RealtimeChannels.ROOM_UPDATES(roomId);
      
      const messageHandler = (message: string) => {
        try {
          const update = this.deserializeMessage<RoomUpdate>(message);
          callback(update);
        } catch (error) {
          console.error(`Failed to process room update for room ${roomId}:`, error);
        }
      };

      this.subscriptions.set(channel, messageHandler);
      await this.redisService.subscribe(channel, messageHandler);
      
      console.log(`Subscribed to room updates for room ${roomId}`);
    } catch (error) {
      console.error(`Failed to subscribe to room updates for room ${roomId}:`, error);
      throw error;
    }
  }

  async unsubscribeFromRoomUpdates(roomId: string): Promise<void> {
    try {
      const channel = RealtimeChannels.ROOM_UPDATES(roomId);
      
      await this.redisService.unsubscribe(channel);
      this.subscriptions.delete(channel);
      
      console.log(`Unsubscribed from room updates for room ${roomId}`);
    } catch (error) {
      console.error(`Failed to unsubscribe from room updates for room ${roomId}:`, error);
      throw error;
    }
  }

  // Participant management
  async broadcastParticipantJoined(roomId: string, participant: Participant): Promise<void> {
    try {
      const channel = RealtimeChannels.ROOM_PARTICIPANTS(roomId);
      const update = this.createRoomUpdate('participant_joined', roomId, { participant });
      const message = this.serializeMessage(update);
      
      await this.redisService.publish(channel, message);
      
      // Also broadcast to general room updates channel
      const generalChannel = RealtimeChannels.ROOM_UPDATES(roomId);
      await this.redisService.publish(generalChannel, message);
      
      console.log(`Broadcasted participant joined for room ${roomId}:`, participant.name);
    } catch (error) {
      console.error(`Failed to broadcast participant joined for room ${roomId}:`, error);
      throw error;
    }
  }

  async broadcastParticipantLeft(roomId: string, participantId: string): Promise<void> {
    try {
      const channel = RealtimeChannels.ROOM_PARTICIPANTS(roomId);
      const update = this.createRoomUpdate('participant_left', roomId, { 
        participantId,
        leftAt: new Date()
      });
      const message = this.serializeMessage(update);
      
      await this.redisService.publish(channel, message);
      
      // Also broadcast to general room updates channel
      const generalChannel = RealtimeChannels.ROOM_UPDATES(roomId);
      await this.redisService.publish(generalChannel, message);
      
      console.log(`Broadcasted participant left for room ${roomId}:`, participantId);
    } catch (error) {
      console.error(`Failed to broadcast participant left for room ${roomId}:`, error);
      throw error;
    }
  }

  // Recording events
  async broadcastRecordingStarted(roomId: string, recordingId: string): Promise<void> {
    try {
      const channel = RealtimeChannels.ROOM_RECORDING(roomId);
      const update = this.createRoomUpdate('recording_started', roomId, { 
        recordingId,
        startedAt: new Date()
      });
      const message = this.serializeMessage(update);
      
      await this.redisService.publish(channel, message);
      
      // Also broadcast to general room updates channel
      const generalChannel = RealtimeChannels.ROOM_UPDATES(roomId);
      await this.redisService.publish(generalChannel, message);
      
      console.log(`Broadcasted recording started for room ${roomId}:`, recordingId);
    } catch (error) {
      console.error(`Failed to broadcast recording started for room ${roomId}:`, error);
      throw error;
    }
  }

  async broadcastRecordingStopped(roomId: string, recordingId: string): Promise<void> {
    try {
      const channel = RealtimeChannels.ROOM_RECORDING(roomId);
      const update = this.createRoomUpdate('recording_stopped', roomId, { 
        recordingId,
        stoppedAt: new Date()
      });
      const message = this.serializeMessage(update);
      
      await this.redisService.publish(channel, message);
      
      // Also broadcast to general room updates channel
      const generalChannel = RealtimeChannels.ROOM_UPDATES(roomId);
      await this.redisService.publish(generalChannel, message);
      
      console.log(`Broadcasted recording stopped for room ${roomId}:`, recordingId);
    } catch (error) {
      console.error(`Failed to broadcast recording stopped for room ${roomId}:`, error);
      throw error;
    }
  }

  // Generic room events
  async broadcastRoomEvent(roomId: string, event: RoomEvent): Promise<void> {
    try {
      const channel = RealtimeChannels.ROOM_UPDATES(roomId);
      const message = this.serializeMessage(event);
      
      await this.redisService.publish(channel, message);
      
      console.log(`Broadcasted room event for room ${roomId}:`, event.type);
    } catch (error) {
      console.error(`Failed to broadcast room event for room ${roomId}:`, error);
      throw error;
    }
  }

  // Subscription management
  async subscribeToChannel(channel: string, callback: (message: string) => void): Promise<void> {
    try {
      this.subscriptions.set(channel, callback);
      await this.redisService.subscribe(channel, callback);
      
      console.log(`Subscribed to channel: ${channel}`);
    } catch (error) {
      console.error(`Failed to subscribe to channel ${channel}:`, error);
      throw error;
    }
  }

  async unsubscribeFromChannel(channel: string): Promise<void> {
    try {
      await this.redisService.unsubscribe(channel);
      this.subscriptions.delete(channel);
      
      console.log(`Unsubscribed from channel: ${channel}`);
    } catch (error) {
      console.error(`Failed to unsubscribe from channel ${channel}:`, error);
      throw error;
    }
  }

  // Health and cleanup
  async disconnect(): Promise<void> {
    try {
      // Unsubscribe from all channels
      const channels = Array.from(this.subscriptions.keys());
      for (const channel of channels) {
        await this.unsubscribeFromChannel(channel);
      }
      
      this.subscriptions.clear();
      console.log('Realtime service disconnected and cleaned up');
    } catch (error) {
      console.error('Failed to disconnect realtime service:', error);
      throw error;
    }
  }
}