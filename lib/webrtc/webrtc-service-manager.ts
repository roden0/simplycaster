/**
 * WebRTC Service Manager
 * 
 * Manages WebRTC services, periodic cleanup, and monitoring.
 * Coordinates between the signaling server and room coordinator.
 */

import { RoomCoordinator } from './room-coordinator.ts';
import { createComponentLogger, type LogContext } from '../observability/logging/structured-logger.ts';

/**
 * WebRTC Service Manager
 */
export class WebRTCServiceManager {
  private roomCoordinator: RoomCoordinator;
  private cleanupInterval: number | null = null;
  private isRunning = false;
  private logger = createComponentLogger('webrtc-service-manager');

  constructor() {
    this.roomCoordinator = new RoomCoordinator();
    this.logger.debug('WebRTC Service Manager initialized', {
      component: 'webrtc-service-manager',
      operation: 'constructor'
    });
  }

  /**
   * Start the WebRTC service manager
   */
  start(): void {
    const logContext: LogContext = {
      operation: 'start-service-manager',
      component: 'webrtc-service-manager'
    };

    if (this.isRunning) {
      this.logger.warn('WebRTC Service Manager is already running', logContext);
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting WebRTC Service Manager', logContext);

    // Start periodic cleanup every 5 minutes
    this.cleanupInterval = setInterval(async () => {
      await this.performPeriodicCleanup();
    }, 5 * 60 * 1000);

    this.logger.info('WebRTC Service Manager started successfully', {
      ...logContext,
      metadata: { cleanupInterval: '5 minutes' }
    });
  }

  /**
   * Stop the WebRTC service manager
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    console.log('Stopping WebRTC Service Manager...');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    console.log('WebRTC Service Manager stopped');
  }

  /**
   * Get the room coordinator instance
   */
  getRoomCoordinator(): RoomCoordinator {
    return this.roomCoordinator;
  }

  /**
   * Perform periodic cleanup tasks
   */
  private async performPeriodicCleanup(): Promise<void> {
    const logContext: LogContext = {
      operation: 'periodic-cleanup',
      component: 'webrtc-service-manager'
    };

    this.logger.debug('Starting WebRTC periodic cleanup', logContext);

    try {
      // Clean up inactive connections
      const inactiveCount = this.roomCoordinator.cleanupInactiveConnections();

      // Clean up expired sessions
      const expiredSessionsResult = await this.roomCoordinator.cleanupExpiredSessions();
      const expiredCount = expiredSessionsResult.success ? expiredSessionsResult.data : 0;

      // Log cleanup results
      if (inactiveCount > 0 || expiredCount > 0) {
        this.logger.info('WebRTC cleanup completed', {
          ...logContext,
          metadata: {
            inactiveConnections: inactiveCount,
            expiredSessions: expiredCount
          }
        });
      }

      // Log current statistics
      const stats = this.roomCoordinator.getConnectionStats();
      this.logger.debug('WebRTC connection statistics', {
        ...logContext,
        metadata: {
          activeConnections: stats.activeConnections,
          totalConnections: stats.totalConnections,
          participantConnections: stats.participantConnections
        }
      });

    } catch (error) {
      this.logger.error('Error during WebRTC periodic cleanup', error instanceof Error ? error : new Error(String(error)), {
        ...logContext,
        metadata: { errorType: 'cleanup-failed' }
      });
    }
  }

  /**
   * Get service statistics
   */
  getStats(): {
    isRunning: boolean;
    connectionStats: {
      totalConnections: number;
      activeConnections: number;
      participantConnections: number;
    };
  } {
    return {
      isRunning: this.isRunning,
      connectionStats: this.roomCoordinator.getConnectionStats()
    };
  }

  /**
   * Handle room closure
   */
  async handleRoomClosure(roomId: string): Promise<void> {
    try {
      console.log(`Handling closure of room ${roomId}`);
      
      // Clean up the room session
      const cleanupResult = await this.roomCoordinator.cleanupRoomSession(roomId);
      if (!cleanupResult.success) {
        console.error(`Failed to cleanup room session ${roomId}:`, cleanupResult.error);
      }

    } catch (error) {
      console.error(`Error handling room closure for ${roomId}:`, error);
    }
  }

  /**
   * Handle participant disconnection
   */
  async handleParticipantDisconnection(roomId: string, participantId: string): Promise<void> {
    try {
      console.log(`Handling disconnection of participant ${participantId} from room ${roomId}`);
      
      // Remove participant from session
      const removeResult = await this.roomCoordinator.removeParticipant(roomId, participantId);
      if (!removeResult.success) {
        console.error(`Failed to remove participant ${participantId} from room ${roomId}:`, removeResult.error);
      }

      // Sync room state with database
      const syncResult = await this.roomCoordinator.syncRoomState(roomId);
      if (!syncResult.success) {
        console.error(`Failed to sync room state for ${roomId}:`, syncResult.error);
      }

    } catch (error) {
      console.error(`Error handling participant disconnection for ${participantId} in room ${roomId}:`, error);
    }
  }

  /**
   * Handle recording status change
   */
  async handleRecordingStatusChange(roomId: string, isRecording: boolean): Promise<void> {
    try {
      console.log(`Handling recording status change for room ${roomId}: ${isRecording ? 'started' : 'stopped'}`);
      
      // Update recording status in session
      const updateResult = await this.roomCoordinator.updateRecordingStatus(roomId, isRecording);
      if (!updateResult.success) {
        console.error(`Failed to update recording status for room ${roomId}:`, updateResult.error);
      }

    } catch (error) {
      console.error(`Error handling recording status change for room ${roomId}:`, error);
    }
  }
}

// Global WebRTC service manager instance
let globalWebRTCServiceManager: WebRTCServiceManager | null = null;

/**
 * Get the global WebRTC service manager instance
 */
export function getWebRTCServiceManager(): WebRTCServiceManager {
  if (!globalWebRTCServiceManager) {
    globalWebRTCServiceManager = new WebRTCServiceManager();
  }
  return globalWebRTCServiceManager;
}

/**
 * Initialize WebRTC services
 */
export function initializeWebRTCServices(): void {
  const manager = getWebRTCServiceManager();
  manager.start();
}

/**
 * Shutdown WebRTC services
 */
export function shutdownWebRTCServices(): void {
  if (globalWebRTCServiceManager) {
    globalWebRTCServiceManager.stop();
  }
}