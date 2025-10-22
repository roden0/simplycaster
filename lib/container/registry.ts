/**
 * Service Registry for Dependency Configuration
 * 
 * Configures all service dependencies and their relationships
 * for the dependency injection container.
 */

import { Container } from './container.ts';
import { Database } from '../../database/connection.ts';

// Domain interfaces
import { UserRepository } from '../domain/repositories/user-repository.ts';
import { RoomRepository } from '../domain/repositories/room-repository.ts';
import { GuestRepository } from '../domain/repositories/guest-repository.ts';
import { PasswordService } from '../domain/services/password-service.ts';
import { StorageService } from '../domain/services/storage-service.ts';
import { TokenService } from '../domain/services/token-service.ts';

// Infrastructure implementations
import { 
  DrizzleUserRepository,
  DrizzleRoomRepository,
  DrizzleRecordingRepository,
  DrizzleGuestRepository
} from '../infrastructure/repositories/index.ts';

import {
  ArgonPasswordService,
  FileSystemStorageService,
  JWTTokenService
} from '../infrastructure/services/index.ts';

import {
  CreateUserUseCase,
  AuthenticateUserUseCase,
  UpdateUserUseCase
} from '../application/use-cases/user/index.ts';

import {
  CreateRoomUseCase,
  StartRecordingUseCase,
  InviteGuestUseCase
} from '../application/use-cases/room/index.ts';

/**
 * Service registry configuration
 */
export interface ServiceRegistryConfig {
  database: Database;
}

/**
 * Service keys for type-safe service resolution
 */
export const ServiceKeys = {
  // Database
  DATABASE: 'database',
  
  // Repositories
  USER_REPOSITORY: 'userRepository',
  ROOM_REPOSITORY: 'roomRepository',
  RECORDING_REPOSITORY: 'recordingRepository',
  GUEST_REPOSITORY: 'guestRepository',
  
  // Infrastructure Services
  PASSWORD_SERVICE: 'passwordService',
  STORAGE_SERVICE: 'storageService',
  TOKEN_SERVICE: 'tokenService',
  AUDIT_SERVICE: 'auditService',
  
  // Use Cases (to be added when implemented)
  CREATE_USER_USE_CASE: 'createUserUseCase',
  AUTHENTICATE_USER_USE_CASE: 'authenticateUserUseCase',
  UPDATE_USER_USE_CASE: 'updateUserUseCase',
  CREATE_ROOM_USE_CASE: 'createRoomUseCase',
  START_RECORDING_USE_CASE: 'startRecordingUseCase',
  INVITE_GUEST_USE_CASE: 'inviteGuestUseCase',
} as const;

export type ServiceKey = typeof ServiceKeys[keyof typeof ServiceKeys];

/**
 * Register all services with the container
 * @param container - The dependency injection container
 * @param config - Configuration for service registration
 */
export function registerServices(container: Container, config: ServiceRegistryConfig): void {
  const { database } = config;

  // Register database
  container.register(ServiceKeys.DATABASE, () => database);

  // Register repositories with Drizzle implementations
  container.register<UserRepository>(ServiceKeys.USER_REPOSITORY, () => {
    return new DrizzleUserRepository(database);
  });

  container.register<RoomRepository>(ServiceKeys.ROOM_REPOSITORY, () => {
    return new DrizzleRoomRepository(database);
  });

  container.register(ServiceKeys.RECORDING_REPOSITORY, () => {
    return new DrizzleRecordingRepository(database);
  });

  container.register<GuestRepository>(ServiceKeys.GUEST_REPOSITORY, () => {
    return new DrizzleGuestRepository(database);
  });

  // Register infrastructure services with concrete implementations
  container.register<PasswordService>(ServiceKeys.PASSWORD_SERVICE, () => {
    return new ArgonPasswordService();
  });

  container.register<StorageService>(ServiceKeys.STORAGE_SERVICE, () => {
    return new FileSystemStorageService();
  });

  container.register<TokenService>(ServiceKeys.TOKEN_SERVICE, () => {
    return new JWTTokenService();
  });

  container.register(ServiceKeys.AUDIT_SERVICE, () => {
    // TODO: Replace with DatabaseAuditService implementation
    throw new Error('AuditService implementation not yet available');
  });

  // Register use cases with their dependencies
  container.register(ServiceKeys.CREATE_USER_USE_CASE, () => {
    const userRepository = container.get<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const passwordService = container.get<PasswordService>(ServiceKeys.PASSWORD_SERVICE);
    return new CreateUserUseCase(userRepository, passwordService);
  });

  container.register(ServiceKeys.AUTHENTICATE_USER_USE_CASE, () => {
    const userRepository = container.get<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const passwordService = container.get<PasswordService>(ServiceKeys.PASSWORD_SERVICE);
    const tokenService = container.get<TokenService>(ServiceKeys.TOKEN_SERVICE);
    return new AuthenticateUserUseCase(userRepository, passwordService, tokenService);
  });

  container.register(ServiceKeys.UPDATE_USER_USE_CASE, () => {
    const userRepository = container.get<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const passwordService = container.get<PasswordService>(ServiceKeys.PASSWORD_SERVICE);
    return new UpdateUserUseCase(userRepository, passwordService);
  });

  // Register room use cases with their dependencies
  container.register(ServiceKeys.CREATE_ROOM_USE_CASE, () => {
    const roomRepository = container.get<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
    const userRepository = container.get<UserRepository>(ServiceKeys.USER_REPOSITORY);
    return new CreateRoomUseCase(roomRepository, userRepository);
  });

  container.register(ServiceKeys.START_RECORDING_USE_CASE, () => {
    const roomRepository = container.get<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
    const recordingRepository = container.get(ServiceKeys.RECORDING_REPOSITORY);
    const userRepository = container.get<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const storageService = container.get<StorageService>(ServiceKeys.STORAGE_SERVICE);
    return new StartRecordingUseCase(roomRepository, recordingRepository, userRepository, storageService);
  });

  container.register(ServiceKeys.INVITE_GUEST_USE_CASE, () => {
    const roomRepository = container.get<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
    const guestRepository = container.get<GuestRepository>(ServiceKeys.GUEST_REPOSITORY);
    const userRepository = container.get<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const tokenService = container.get<TokenService>(ServiceKeys.TOKEN_SERVICE);
    return new InviteGuestUseCase(roomRepository, guestRepository, userRepository, tokenService);
  });
}

/**
 * Type-safe service getter helper
 */
export function getService<T>(container: Container, key: ServiceKey): T {
  return container.get<T>(key);
}

/**
 * Validate that all required services are registered
 * @param container - The dependency injection container
 * @returns Array of missing service keys
 */
export function validateServiceRegistration(container: Container): string[] {
  const requiredServices = Object.values(ServiceKeys);
  const missingServices: string[] = [];

  for (const serviceKey of requiredServices) {
    if (!container.has(serviceKey)) {
      missingServices.push(serviceKey);
    }
  }

  return missingServices;
}

/**
 * Initialize container with all services
 * @param database - Database instance
 * @returns Configured container
 */
export function initializeContainer(database: Database): Container {
  const container = new Container();
  
  registerServices(container, { database });
  
  // Validate registration
  const missingServices = validateServiceRegistration(container);
  if (missingServices.length > 0) {
    console.warn('Some services are not yet implemented:', missingServices);
  }
  
  return container;
}