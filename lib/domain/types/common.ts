// ============================================================================
// Common Domain Types and Result Pattern
// ============================================================================

/**
 * Result pattern for consistent error handling across the domain
 */
export type Result<T, E = Error> = Success<T> | Failure<E>;

export interface Success<T> {
  success: true;
  data: T;
}

export interface Failure<E> {
  success: false;
  error: E;
}

/**
 * Helper functions for creating Result instances
 */
export const Ok = <T>(data: T): Success<T> => ({ success: true, data });
export const Err = <E>(error: E): Failure<E> => ({ success: false, error });

/**
 * User roles in the system
 */
export enum UserRole {
  GUEST = 'guest',
  HOST = 'host',
  ADMIN = 'admin'
}

/**
 * Room status enumeration
 */
export enum RoomStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  RECORDING = 'recording',
  CLOSED = 'closed'
}

/**
 * Recording status enumeration
 */
export enum RecordingStatus {
  RECORDING = 'recording',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * Invitation status enumeration
 */
export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  REVOKED = 'revoked'
}

/**
 * Base entity interface with common fields
 */
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Soft deletable entity interface
 */
export interface SoftDeletableEntity extends BaseEntity {
  deletedAt?: Date;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}