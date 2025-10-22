// ============================================================================
// Audit Service Interface
// ============================================================================

import { Result } from '../types/common.ts';
import { UserRole } from '../types/common.ts';

/**
 * Audit log entry interface
 */
export interface AuditLogEntry {
  userId?: string;
  userEmail: string;
  userRole: UserRole;
  action: string;
  entityType: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Audit service interface for logging critical actions
 */
export interface AuditService {
  /**
   * Log user authentication events
   */
  logAuthentication(userEmail: string, action: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT', ipAddress?: string, userAgent?: string): Promise<Result<void>>;

  /**
   * Log user management actions
   */
  logUserAction(
    actorUserId: string,
    actorEmail: string,
    actorRole: UserRole,
    action: 'USER_CREATED' | 'USER_UPDATED' | 'USER_DELETED' | 'USER_INVITED',
    targetUserId?: string,
    metadata?: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Result<void>>;

  /**
   * Log room management actions
   */
  logRoomAction(
    actorUserId: string,
    actorEmail: string,
    actorRole: UserRole,
    action: 'ROOM_CREATED' | 'ROOM_UPDATED' | 'ROOM_CLOSED' | 'RECORDING_STARTED' | 'RECORDING_STOPPED',
    roomId: string,
    metadata?: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Result<void>>;

  /**
   * Log guest management actions
   */
  logGuestAction(
    actorUserId: string,
    actorEmail: string,
    actorRole: UserRole,
    action: 'GUEST_INVITED' | 'GUEST_JOINED' | 'GUEST_LEFT' | 'GUEST_KICKED',
    guestId?: string,
    roomId?: string,
    metadata?: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Result<void>>;

  /**
   * Log recording management actions
   */
  logRecordingAction(
    actorUserId: string,
    actorEmail: string,
    actorRole: UserRole,
    action: 'RECORDING_CREATED' | 'RECORDING_UPDATED' | 'RECORDING_DELETED' | 'FILE_UPLOADED',
    recordingId?: string,
    metadata?: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Result<void>>;

  /**
   * Log feed management actions
   */
  logFeedAction(
    actorUserId: string,
    actorEmail: string,
    actorRole: UserRole,
    action: 'EPISODE_CREATED' | 'EPISODE_UPDATED' | 'EPISODE_DELETED' | 'EPISODE_PUBLISHED',
    episodeId?: string,
    metadata?: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Result<void>>;

  /**
   * Log generic action with custom parameters
   */
  logAction(entry: Omit<AuditLogEntry, 'createdAt'>): Promise<Result<void>>;

  /**
   * Query audit logs with filters
   */
  queryLogs(filters: {
    userId?: string;
    userEmail?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<Result<AuditLogEntry[]>>;
}