/**
 * Session Initializer
 * 
 * Handles initialization and startup of session-related services
 * including the session manager and cleanup tasks.
 */

import { Container } from '../../container/container.ts';
import { ServiceKeys } from '../../container/registry.ts';
import { SessionManager } from './session-manager.ts';
import { SessionCleanupService } from './session-cleanup.ts';

export class SessionInitializer {
  private container: Container;
  private sessionManager: SessionManager | null = null;
  private isInitialized: boolean = false;

  constructor(container: Container) {
    this.container = container;
  }

  /**
   * Initialize session services
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('Session services already initialized');
      return;
    }

    try {
      console.log('Initializing session services...');

      // Get session manager from container
      this.sessionManager = this.container.get<SessionManager>(ServiceKeys.SESSION_MANAGER);

      // Start session manager
      this.sessionManager.start();

      // Run initial cleanup
      await this.runInitialCleanup();

      this.isInitialized = true;
      console.log('Session services initialized successfully');

    } catch (error) {
      console.error('Failed to initialize session services:', error);
      throw error;
    }
  }

  /**
   * Shutdown session services
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      console.log('Shutting down session services...');

      // Stop session manager
      if (this.sessionManager) {
        this.sessionManager.stop();
      }

      // Run final cleanup
      await this.runFinalCleanup();

      this.isInitialized = false;
      console.log('Session services shut down successfully');

    } catch (error) {
      console.error('Error during session services shutdown:', error);
    }
  }

  /**
   * Run initial cleanup on startup
   */
  private async runInitialCleanup(): Promise<void> {
    try {
      const cleanupService = this.container.get<SessionCleanupService>(ServiceKeys.SESSION_CLEANUP_SERVICE);
      
      console.log('Running initial session cleanup...');
      const result = await cleanupService.runCleanup({
        inactiveUserCleanup: true,
        batchSize: 50
      });

      console.log('Initial session cleanup completed:', {
        totalCleaned: result.totalCleaned,
        duration: result.duration,
        errors: result.errors.length
      });

    } catch (error) {
      console.error('Initial session cleanup failed:', error);
      // Don't throw error - this shouldn't prevent startup
    }
  }

  /**
   * Run final cleanup on shutdown
   */
  private async runFinalCleanup(): Promise<void> {
    try {
      if (this.sessionManager) {
        // Force one final cleanup
        await this.sessionManager.forceCleanup();
      }
    } catch (error) {
      console.error('Final session cleanup failed:', error);
    }
  }

  /**
   * Check if session services are initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.sessionManager?.isActive() === true;
  }

  /**
   * Get session manager instance
   */
  getSessionManager(): SessionManager | null {
    return this.sessionManager;
  }

  /**
   * Get session health status
   */
  async getHealthStatus(): Promise<{
    initialized: boolean;
    managerActive: boolean;
    redisHealth: boolean;
    stats: any;
  }> {
    try {
      const managerActive = this.sessionManager?.isActive() === true;
      let redisHealth = false;
      let stats = null;

      if (this.sessionManager) {
        const info = await this.sessionManager.getSessionInfo();
        redisHealth = info.redisHealth;
        stats = info.stats;
      }

      return {
        initialized: this.isInitialized,
        managerActive,
        redisHealth,
        stats
      };

    } catch (error) {
      console.error('Failed to get session health status:', error);
      return {
        initialized: this.isInitialized,
        managerActive: false,
        redisHealth: false,
        stats: null
      };
    }
  }
}