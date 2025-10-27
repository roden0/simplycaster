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
import { FeedEpisodeRepository } from '../domain/repositories/feed-episode-repository.ts';
import { PasswordService } from '../domain/services/password-service.ts';
import { StorageService } from '../domain/services/storage-service.ts';
import { TokenService } from '../domain/services/token-service.ts';
import { RedisService } from '../domain/services/redis-service.ts';
import { CacheService } from '../domain/services/cache-service.ts';
import { SessionService } from '../domain/services/session-service.ts';
import { RateLimitService } from '../domain/services/rate-limit-service.ts';
import { RealtimeService } from '../domain/services/realtime-service.ts';
import { EventPublisher } from '../domain/types/events.ts';

// Infrastructure implementations
import { 
  DrizzleUserRepository,
  DrizzleRoomRepository,
  DrizzleRecordingRepository,
  DrizzleRecordingFileRepository,
  DrizzleGuestRepository,
  DrizzleFeedEpisodeRepository
} from '../infrastructure/repositories/index.ts';

import {
  ArgonPasswordService,
  FileSystemStorageService,
  JWTTokenService,
  RedisConnectionManager,
  RedisServiceImpl,
  RedisInitializer,
  RateLimitServiceImpl,
  RealtimeServiceImpl,
  parseRedisConfig,
  parseCacheConfig,
  parseRateLimitConfig
} from '../infrastructure/services/index.ts';

import { CacheServiceImpl } from '../infrastructure/services/cache-service-impl.ts';
import { CachedUserService } from '../infrastructure/services/cached-user-service.ts';
import { CachedRoomService } from '../infrastructure/services/cached-room-service.ts';
import { CachedRecordingService } from '../infrastructure/services/cached-recording-service.ts';
import { RabbitMQEventPublisher, createRabbitMQEventPublisher } from '../infrastructure/services/rabbitmq-event-publisher.ts';
import { RabbitMQAsyncEventPublisher, createRabbitMQAsyncEventPublisher, DEFAULT_ASYNC_CONFIG } from '../infrastructure/services/rabbitmq-async-event-publisher.ts';
import { parseRabbitMQConfig } from '../infrastructure/services/rabbitmq-config.ts';
import { RabbitMQMetricsCollector } from '../infrastructure/services/rabbitmq-metrics-collector.ts';
import { RedisSessionService } from '../infrastructure/services/redis-session-service.ts';
import { SessionManager } from '../infrastructure/services/session-manager.ts';
import { SessionCleanupService } from '../infrastructure/services/session-cleanup.ts';
import { SessionInitializer } from '../infrastructure/services/session-initializer.ts';
import { CacheWarmingService, parseCacheWarmingConfig } from '../infrastructure/services/cache-warming-service.ts';
import { RedisMonitoringService } from '../infrastructure/services/redis-monitoring-service.ts';
import { RedisHealthService } from '../infrastructure/services/redis-health-service.ts';
import { RedisLogger } from '../infrastructure/services/redis-logger.ts';
import { RedisServiceWithLogging } from '../infrastructure/services/redis-service-with-logging.ts';

// WebRTC services
import { IICEServerService, createICEServerService } from '../webrtc/ice-server-service.ts';
import { createTurnCredentialService } from '../webrtc/turn-credential-service.ts';
import { IConnectionAnalyticsService, createConnectionAnalyticsService } from '../webrtc/connection-analytics-service.ts';
import { ICoturnHealthService, createCoturnHealthService } from '../webrtc/coturn-health-service.ts';
import { ITurnSecurityService, createTurnSecurityService } from '../webrtc/turn-security-service.ts';
import { ISecureCredentialManager, createSecureCredentialManager } from '../webrtc/secure-credential-manager.ts';
import { IEnvironmentConfigService, createEnvironmentConfigService } from '../webrtc/environment-config-service.ts';

import {
  CreateUserUseCase,
  AuthenticateUserUseCase,
  UpdateUserUseCase
} from '../application/use-cases/user/index.ts';

import {
  CreateRoomUseCase,
  CloseRoomUseCase,
  StartRecordingUseCase,
  StopRecordingUseCase,
  CompleteRecordingUseCase,
  FailRecordingUseCase,
  InviteGuestUseCase,
  GuestLeaveUseCase
} from '../application/use-cases/room/index.ts';

import {
  LogoutUserUseCase
} from '../application/use-cases/user/index.ts';

import {
  PublishEpisodeUseCase,
  UpdateEpisodeUseCase,
  DeleteEpisodeUseCase
} from '../application/use-cases/feed/index.ts';

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
  RECORDING_FILE_REPOSITORY: 'recordingFileRepository',
  GUEST_REPOSITORY: 'guestRepository',
  FEED_EPISODE_REPOSITORY: 'feedEpisodeRepository',
  
  // Infrastructure Services
  PASSWORD_SERVICE: 'passwordService',
  STORAGE_SERVICE: 'storageService',
  TOKEN_SERVICE: 'tokenService',
  AUDIT_SERVICE: 'auditService',
  EVENT_PUBLISHER: 'eventPublisher',
  ASYNC_EVENT_PUBLISHER: 'asyncEventPublisher',
  RABBITMQ_METRICS_COLLECTOR: 'rabbitMQMetricsCollector',
  
  // Redis Services
  REDIS_CONNECTION_MANAGER: 'redisConnectionManager',
  REDIS_SERVICE: 'redisService',
  REDIS_INITIALIZER: 'redisInitializer',
  CACHE_SERVICE: 'cacheService',
  SESSION_SERVICE: 'sessionService',
  SESSION_MANAGER: 'sessionManager',
  SESSION_CLEANUP_SERVICE: 'sessionCleanupService',
  SESSION_INITIALIZER: 'sessionInitializer',
  CACHED_USER_SERVICE: 'cachedUserService',
  CACHED_ROOM_SERVICE: 'cachedRoomService',
  CACHED_RECORDING_SERVICE: 'cachedRecordingService',
  CACHE_WARMING_SERVICE: 'cacheWarmingService',
  RATE_LIMIT_SERVICE: 'rateLimitService',
  REALTIME_SERVICE: 'realtimeService',
  REDIS_MONITORING_SERVICE: 'redisMonitoringService',
  REDIS_HEALTH_SERVICE: 'redisHealthService',
  REDIS_LOGGER: 'redisLogger',
  REDIS_SERVICE_WITH_LOGGING: 'redisServiceWithLogging',
  
  // WebRTC Services
  ICE_SERVER_SERVICE: 'iceServerService',
  TURN_CREDENTIAL_SERVICE: 'turnCredentialService',
  CONNECTION_ANALYTICS_SERVICE: 'connectionAnalyticsService',
  COTURN_HEALTH_SERVICE: 'coturnHealthService',
  TURN_SECURITY_SERVICE: 'turnSecurityService',
  SECURE_CREDENTIAL_MANAGER: 'secureCredentialManager',
  ENVIRONMENT_CONFIG_SERVICE: 'environmentConfigService',
  
  // Use Cases
  CREATE_USER_USE_CASE: 'createUserUseCase',
  AUTHENTICATE_USER_USE_CASE: 'authenticateUserUseCase',
  UPDATE_USER_USE_CASE: 'updateUserUseCase',
  LOGOUT_USER_USE_CASE: 'logoutUserUseCase',
  CREATE_ROOM_USE_CASE: 'createRoomUseCase',
  CLOSE_ROOM_USE_CASE: 'closeRoomUseCase',
  START_RECORDING_USE_CASE: 'startRecordingUseCase',
  STOP_RECORDING_USE_CASE: 'stopRecordingUseCase',
  COMPLETE_RECORDING_USE_CASE: 'completeRecordingUseCase',
  FAIL_RECORDING_USE_CASE: 'failRecordingUseCase',
  INVITE_GUEST_USE_CASE: 'inviteGuestUseCase',
  GUEST_LEAVE_USE_CASE: 'guestLeaveUseCase',
  PUBLISH_EPISODE_USE_CASE: 'publishEpisodeUseCase',
  UPDATE_EPISODE_USE_CASE: 'updateEpisodeUseCase',
  DELETE_EPISODE_USE_CASE: 'deleteEpisodeUseCase',
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

  container.register(ServiceKeys.RECORDING_FILE_REPOSITORY, () => {
    return new DrizzleRecordingFileRepository(database);
  });

  container.register<GuestRepository>(ServiceKeys.GUEST_REPOSITORY, () => {
    return new DrizzleGuestRepository(database);
  });

  container.register(ServiceKeys.FEED_EPISODE_REPOSITORY, () => {
    return new DrizzleFeedEpisodeRepository(database);
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

  container.register<EventPublisher>(ServiceKeys.EVENT_PUBLISHER, async () => {
    const rabbitMQConfig = await parseRabbitMQConfig();
    return await createRabbitMQEventPublisher(rabbitMQConfig);
  });

  container.register<EventPublisher>(ServiceKeys.ASYNC_EVENT_PUBLISHER, async () => {
    const rabbitMQConfig = await parseRabbitMQConfig();
    
    // Configure async publishing options
    const asyncConfig = {
      ...DEFAULT_ASYNC_CONFIG,
      maxBufferSize: parseInt(Deno.env.get('RABBITMQ_ASYNC_BUFFER_SIZE') || '1000'),
      flushInterval: parseInt(Deno.env.get('RABBITMQ_ASYNC_FLUSH_INTERVAL') || '5000'),
      maxConcurrency: parseInt(Deno.env.get('RABBITMQ_ASYNC_MAX_CONCURRENCY') || '10'),
      enableBackgroundProcessing: Deno.env.get('RABBITMQ_ASYNC_BACKGROUND_PROCESSING') !== 'false',
      batchSize: parseInt(Deno.env.get('RABBITMQ_ASYNC_BATCH_SIZE') || '50'),
      publishTimeout: parseInt(Deno.env.get('RABBITMQ_ASYNC_PUBLISH_TIMEOUT') || '30000'),
      bufferConfig: {
        maxBufferSize: parseInt(Deno.env.get('RABBITMQ_BUFFER_MAX_SIZE') || '10000'),
        maxEventAge: parseInt(Deno.env.get('RABBITMQ_BUFFER_MAX_AGE') || '3600000'), // 1 hour
        enablePersistence: Deno.env.get('RABBITMQ_BUFFER_PERSISTENCE') !== 'false',
        persistentStoragePath: Deno.env.get('RABBITMQ_BUFFER_STORAGE_PATH') || './data/event-buffer.json',
        cleanupInterval: parseInt(Deno.env.get('RABBITMQ_BUFFER_CLEANUP_INTERVAL') || '300000'), // 5 minutes
        maxPersistentSize: parseInt(Deno.env.get('RABBITMQ_BUFFER_MAX_PERSISTENT_SIZE') || '52428800'), // 50MB
        flushBatchSize: parseInt(Deno.env.get('RABBITMQ_BUFFER_FLUSH_BATCH_SIZE') || '100'),
      },
    };
    
    return await createRabbitMQAsyncEventPublisher(rabbitMQConfig, asyncConfig);
  });

  // Register Redis services
  container.register(ServiceKeys.REDIS_CONNECTION_MANAGER, () => {
    const redisConfig = parseRedisConfig();
    return new RedisConnectionManager(redisConfig);
  });

  container.register<RedisService>(ServiceKeys.REDIS_SERVICE, () => {
    const connectionManager = container.get<RedisConnectionManager>(ServiceKeys.REDIS_CONNECTION_MANAGER);
    const keyPrefix = Deno.env.get('REDIS_KEY_PREFIX') || 'simplycaster';
    return new RedisServiceImpl(connectionManager, keyPrefix);
  });

  container.register(ServiceKeys.REDIS_INITIALIZER, () => {
    return new RedisInitializer(container);
  });

  container.register<CacheService>(ServiceKeys.CACHE_SERVICE, () => {
    const redisService = container.get<RedisService>(ServiceKeys.REDIS_SERVICE);
    const cacheConfig = parseCacheConfig();
    return new CacheServiceImpl(redisService, cacheConfig);
  });

  container.register<SessionService>(ServiceKeys.SESSION_SERVICE, () => {
    const redisService = container.get<RedisService>(ServiceKeys.REDIS_SERVICE);
    const sessionConfig = {
      defaultTTL: parseInt(Deno.env.get('SESSION_DEFAULT_TTL') || '3600'), // 1 hour
      maxTTL: parseInt(Deno.env.get('SESSION_MAX_TTL') || '86400'), // 24 hours
      refreshThreshold: parseInt(Deno.env.get('SESSION_REFRESH_THRESHOLD') || '1800'), // 30 minutes
      cleanupInterval: parseInt(Deno.env.get('SESSION_CLEANUP_INTERVAL') || '3600') // 1 hour
    };
    return new RedisSessionService(redisService, sessionConfig);
  });

  container.register(ServiceKeys.SESSION_MANAGER, () => {
    const sessionService = container.get<SessionService>(ServiceKeys.SESSION_SERVICE);
    const redisService = container.get<RedisService>(ServiceKeys.REDIS_SERVICE);
    const managerConfig = {
      cleanupInterval: parseInt(Deno.env.get('SESSION_CLEANUP_INTERVAL') || '3600000'), // 1 hour in ms
      healthCheckInterval: parseInt(Deno.env.get('SESSION_HEALTH_CHECK_INTERVAL') || '300000'), // 5 minutes in ms
      maxCleanupBatchSize: parseInt(Deno.env.get('SESSION_CLEANUP_BATCH_SIZE') || '100'),
      enableAutoCleanup: Deno.env.get('SESSION_AUTO_CLEANUP') !== 'false'
    };
    return new SessionManager(sessionService, redisService, managerConfig);
  });

  container.register(ServiceKeys.SESSION_CLEANUP_SERVICE, () => {
    const sessionService = container.get<SessionService>(ServiceKeys.SESSION_SERVICE);
    const redisService = container.get<RedisService>(ServiceKeys.REDIS_SERVICE);
    const userRepository = container.get<UserRepository>(ServiceKeys.USER_REPOSITORY);
    return new SessionCleanupService(sessionService, redisService, userRepository);
  });

  container.register(ServiceKeys.SESSION_INITIALIZER, () => {
    return new SessionInitializer(container);
  });

  container.register(ServiceKeys.CACHED_USER_SERVICE, () => {
    const userRepository = container.get<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const cacheService = container.get<CacheService>(ServiceKeys.CACHE_SERVICE);
    return new CachedUserService(userRepository, cacheService);
  });

  container.register(ServiceKeys.CACHED_ROOM_SERVICE, () => {
    const roomRepository = container.get<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
    const cacheService = container.get<CacheService>(ServiceKeys.CACHE_SERVICE);
    const redisService = container.get<RedisService>(ServiceKeys.REDIS_SERVICE);
    const realtimeService = container.get<RealtimeService>(ServiceKeys.REALTIME_SERVICE);
    return new CachedRoomService(roomRepository, cacheService, redisService, realtimeService);
  });

  container.register(ServiceKeys.CACHED_RECORDING_SERVICE, () => {
    const recordingRepository = container.get(ServiceKeys.RECORDING_REPOSITORY);
    const recordingFileRepository = container.get(ServiceKeys.RECORDING_FILE_REPOSITORY);
    const cacheService = container.get<CacheService>(ServiceKeys.CACHE_SERVICE);
    const redisService = container.get<RedisService>(ServiceKeys.REDIS_SERVICE);
    const realtimeService = container.get<RealtimeService>(ServiceKeys.REALTIME_SERVICE);
    return new CachedRecordingService(recordingRepository, recordingFileRepository, cacheService, redisService, realtimeService);
  });

  container.register<RateLimitService>(ServiceKeys.RATE_LIMIT_SERVICE, () => {
    const redisService = container.get<RedisService>(ServiceKeys.REDIS_SERVICE);
    const rateLimitConfig = parseRateLimitConfig();
    const keyPrefix = 'rate_limit';
    const defaultConfig = {
      limit: rateLimitConfig.defaultLimit,
      windowSeconds: rateLimitConfig.windowSeconds
    };
    return new RateLimitServiceImpl(redisService, keyPrefix, defaultConfig);
  });

  container.register<RealtimeService>(ServiceKeys.REALTIME_SERVICE, () => {
    const redisService = container.get<RedisService>(ServiceKeys.REDIS_SERVICE);
    return new RealtimeServiceImpl(redisService);
  });

  container.register(ServiceKeys.CACHE_WARMING_SERVICE, () => {
    const cachedUserService = container.get<CachedUserService>(ServiceKeys.CACHED_USER_SERVICE);
    const cachedRoomService = container.get<CachedRoomService>(ServiceKeys.CACHED_ROOM_SERVICE);
    const cachedRecordingService = container.get<CachedRecordingService>(ServiceKeys.CACHED_RECORDING_SERVICE);
    const redisService = container.get<RedisService>(ServiceKeys.REDIS_SERVICE);
    const userRepository = container.get<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const roomRepository = container.get<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
    const config = parseCacheWarmingConfig();
    
    return new CacheWarmingService(
      cachedUserService,
      cachedRoomService,
      cachedRecordingService,
      redisService,
      userRepository,
      roomRepository,
      config
    );
  });

  container.register(ServiceKeys.REDIS_MONITORING_SERVICE, () => {
    const connectionManager = container.get<RedisConnectionManager>(ServiceKeys.REDIS_CONNECTION_MANAGER);
    const redisService = container.get<RedisService>(ServiceKeys.REDIS_SERVICE);
    const monitoringConfig = {
      metricsCollectionInterval: parseInt(Deno.env.get('REDIS_METRICS_INTERVAL') || '30000'),
      performanceAlertThresholds: {
        responseTimeMs: parseInt(Deno.env.get('REDIS_RESPONSE_TIME_THRESHOLD') || '100'),
        errorRatePercent: parseInt(Deno.env.get('REDIS_ERROR_RATE_THRESHOLD') || '5'),
        cacheHitRatePercent: parseInt(Deno.env.get('REDIS_CACHE_HIT_RATE_THRESHOLD') || '80'),
        memoryUsagePercent: parseInt(Deno.env.get('REDIS_MEMORY_USAGE_THRESHOLD') || '85'),
      },
      enableSlowQueryLogging: Deno.env.get('REDIS_SLOW_QUERY_LOGGING') !== 'false',
      slowQueryThresholdMs: parseInt(Deno.env.get('REDIS_SLOW_QUERY_THRESHOLD') || '50'),
      retainMetricsHours: parseInt(Deno.env.get('REDIS_METRICS_RETENTION_HOURS') || '24'),
    };
    return new RedisMonitoringService(connectionManager, redisService, monitoringConfig);
  });

  container.register(ServiceKeys.REDIS_HEALTH_SERVICE, () => {
    const connectionManager = container.get<RedisConnectionManager>(ServiceKeys.REDIS_CONNECTION_MANAGER);
    const redisService = container.get<RedisService>(ServiceKeys.REDIS_SERVICE);
    const healthConfig = {
      thresholds: {
        responseTimeMs: parseInt(Deno.env.get('REDIS_HEALTH_RESPONSE_TIME_THRESHOLD') || '100'),
        memoryUsagePercent: parseInt(Deno.env.get('REDIS_HEALTH_MEMORY_THRESHOLD') || '85'),
        fragmentationRatio: parseFloat(Deno.env.get('REDIS_HEALTH_FRAGMENTATION_THRESHOLD') || '1.5'),
        cacheHitRatePercent: parseInt(Deno.env.get('REDIS_HEALTH_CACHE_HIT_RATE_THRESHOLD') || '80'),
        connectionTimeoutMs: parseInt(Deno.env.get('REDIS_HEALTH_CONNECTION_TIMEOUT') || '5000'),
      },
      enableDetailedChecks: Deno.env.get('REDIS_HEALTH_DETAILED_CHECKS') !== 'false',
      checkTimeout: parseInt(Deno.env.get('REDIS_HEALTH_CHECK_TIMEOUT') || '10000'),
    };
    return new RedisHealthService(connectionManager, redisService, healthConfig);
  });

  container.register(ServiceKeys.REDIS_LOGGER, () => {
    const loggerConfig = {
      enableOperationLogging: Deno.env.get('REDIS_OPERATION_LOGGING') !== 'false',
      enablePerformanceLogging: Deno.env.get('REDIS_PERFORMANCE_LOGGING') !== 'false',
      enableAuditLogging: Deno.env.get('REDIS_AUDIT_LOGGING') !== 'false',
      enableSlowQueryLogging: Deno.env.get('REDIS_SLOW_QUERY_LOGGING') !== 'false',
      slowQueryThresholdMs: parseInt(Deno.env.get('REDIS_SLOW_QUERY_THRESHOLD') || '50'),
      logLevel: (Deno.env.get('REDIS_LOG_LEVEL') || 'info') as any,
      maxLogEntries: parseInt(Deno.env.get('REDIS_MAX_LOG_ENTRIES') || '10000'),
      retainLogsHours: parseInt(Deno.env.get('REDIS_LOG_RETENTION_HOURS') || '24'),
      enableConsoleOutput: Deno.env.get('REDIS_CONSOLE_LOGGING') !== 'false',
      enableFileOutput: Deno.env.get('REDIS_FILE_LOGGING') === 'true',
      logFilePath: Deno.env.get('REDIS_LOG_FILE_PATH'),
    };
    return new RedisLogger(loggerConfig);
  });

  container.register(ServiceKeys.REDIS_SERVICE_WITH_LOGGING, () => {
    const baseService = container.get<RedisServiceImpl>(ServiceKeys.REDIS_SERVICE) as RedisServiceImpl;
    const logger = container.get<RedisLogger>(ServiceKeys.REDIS_LOGGER);
    const monitoring = container.get<RedisMonitoringService>(ServiceKeys.REDIS_MONITORING_SERVICE);
    return new RedisServiceWithLogging(baseService, logger, monitoring);
  });

  // Register WebRTC services
  container.register(ServiceKeys.TURN_CREDENTIAL_SERVICE, () => {
    return createTurnCredentialService();
  });

  container.register<IICEServerService>(ServiceKeys.ICE_SERVER_SERVICE, () => {
    const turnCredentialService = container.getSync(ServiceKeys.TURN_CREDENTIAL_SERVICE);
    return createICEServerService(turnCredentialService);
  });

  container.register<IConnectionAnalyticsService>(ServiceKeys.CONNECTION_ANALYTICS_SERVICE, () => {
    return createConnectionAnalyticsService();
  });

  container.register<ICoturnHealthService>(ServiceKeys.COTURN_HEALTH_SERVICE, () => {
    return createCoturnHealthService();
  });

  container.register<ITurnSecurityService>(ServiceKeys.TURN_SECURITY_SERVICE, () => {
    return createTurnSecurityService();
  });

  container.register<ISecureCredentialManager>(ServiceKeys.SECURE_CREDENTIAL_MANAGER, () => {
    return createSecureCredentialManager();
  });

  container.register<IEnvironmentConfigService>(ServiceKeys.ENVIRONMENT_CONFIG_SERVICE, () => {
    return createEnvironmentConfigService();
  });

  // Register use cases with their dependencies
  container.register(ServiceKeys.CREATE_USER_USE_CASE, async () => {
    const userRepository = container.getSync<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const passwordService = container.getSync<PasswordService>(ServiceKeys.PASSWORD_SERVICE);
    const eventPublisher = await container.get<EventPublisher>(ServiceKeys.EVENT_PUBLISHER);
    return new CreateUserUseCase(userRepository, passwordService, eventPublisher);
  });

  container.register(ServiceKeys.AUTHENTICATE_USER_USE_CASE, async () => {
    const userRepository = container.getSync<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const passwordService = container.getSync<PasswordService>(ServiceKeys.PASSWORD_SERVICE);
    const tokenService = container.getSync<TokenService>(ServiceKeys.TOKEN_SERVICE);
    const eventPublisher = await container.get<EventPublisher>(ServiceKeys.EVENT_PUBLISHER);
    return new AuthenticateUserUseCase(userRepository, passwordService, tokenService, eventPublisher);
  });

  container.register(ServiceKeys.UPDATE_USER_USE_CASE, async () => {
    const userRepository = container.getSync<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const passwordService = container.getSync<PasswordService>(ServiceKeys.PASSWORD_SERVICE);
    const eventPublisher = await container.get<EventPublisher>(ServiceKeys.EVENT_PUBLISHER);
    return new UpdateUserUseCase(userRepository, passwordService, eventPublisher);
  });

  // Register room use cases with their dependencies
  container.register(ServiceKeys.CREATE_ROOM_USE_CASE, async () => {
    const roomRepository = container.getSync<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
    const userRepository = container.getSync<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const eventPublisher = await container.get<EventPublisher>(ServiceKeys.EVENT_PUBLISHER);
    return new CreateRoomUseCase(roomRepository, userRepository, eventPublisher);
  });

  container.register(ServiceKeys.START_RECORDING_USE_CASE, async () => {
    const roomRepository = container.getSync<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
    const recordingRepository = container.getSync(ServiceKeys.RECORDING_REPOSITORY);
    const userRepository = container.getSync<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const storageService = container.getSync<StorageService>(ServiceKeys.STORAGE_SERVICE);
    const realtimeService = container.getSync<RealtimeService>(ServiceKeys.REALTIME_SERVICE);
    const eventPublisher = await container.get<EventPublisher>(ServiceKeys.EVENT_PUBLISHER);
    return new StartRecordingUseCase(roomRepository, recordingRepository, userRepository, storageService, realtimeService, eventPublisher);
  });

  container.register(ServiceKeys.STOP_RECORDING_USE_CASE, async () => {
    const roomRepository = container.getSync<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
    const recordingRepository = container.getSync(ServiceKeys.RECORDING_REPOSITORY);
    const userRepository = container.getSync<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const realtimeService = container.getSync<RealtimeService>(ServiceKeys.REALTIME_SERVICE);
    const eventPublisher = await container.get<EventPublisher>(ServiceKeys.EVENT_PUBLISHER);
    return new StopRecordingUseCase(roomRepository, recordingRepository, userRepository, realtimeService, eventPublisher);
  });

  container.register(ServiceKeys.INVITE_GUEST_USE_CASE, async () => {
    const roomRepository = container.getSync<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
    const guestRepository = container.getSync<GuestRepository>(ServiceKeys.GUEST_REPOSITORY);
    const userRepository = container.getSync<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const tokenService = container.getSync<TokenService>(ServiceKeys.TOKEN_SERVICE);
    const eventPublisher = await container.get<EventPublisher>(ServiceKeys.EVENT_PUBLISHER);
    return new InviteGuestUseCase(roomRepository, guestRepository, userRepository, tokenService, eventPublisher);
  });

  // Register new use cases
  container.register(ServiceKeys.LOGOUT_USER_USE_CASE, async () => {
    const userRepository = container.getSync<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const tokenService = container.getSync<TokenService>(ServiceKeys.TOKEN_SERVICE);
    const sessionService = container.getSync<SessionService>(ServiceKeys.SESSION_SERVICE);
    const eventPublisher = await container.get<EventPublisher>(ServiceKeys.EVENT_PUBLISHER);
    return new LogoutUserUseCase(userRepository, tokenService, sessionService, eventPublisher);
  });

  container.register(ServiceKeys.CLOSE_ROOM_USE_CASE, async () => {
    const roomRepository = container.getSync<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
    const guestRepository = container.getSync<GuestRepository>(ServiceKeys.GUEST_REPOSITORY);
    const userRepository = container.getSync<UserRepository>(ServiceKeys.USER_REPOSITORY);
    const eventPublisher = await container.get<EventPublisher>(ServiceKeys.EVENT_PUBLISHER);
    return new CloseRoomUseCase(roomRepository, guestRepository, userRepository, eventPublisher);
  });

  container.register(ServiceKeys.COMPLETE_RECORDING_USE_CASE, async () => {
    const recordingRepository = container.getSync(ServiceKeys.RECORDING_REPOSITORY);
    const eventPublisher = await container.get<EventPublisher>(ServiceKeys.EVENT_PUBLISHER);
    return new CompleteRecordingUseCase(recordingRepository, eventPublisher);
  });

  container.register(ServiceKeys.FAIL_RECORDING_USE_CASE, async () => {
    const recordingRepository = container.getSync(ServiceKeys.RECORDING_REPOSITORY);
    const eventPublisher = await container.get<EventPublisher>(ServiceKeys.EVENT_PUBLISHER);
    return new FailRecordingUseCase(recordingRepository, eventPublisher);
  });

  container.register(ServiceKeys.GUEST_LEAVE_USE_CASE, async () => {
    const guestRepository = container.getSync<GuestRepository>(ServiceKeys.GUEST_REPOSITORY);
    const roomRepository = container.getSync<RoomRepository>(ServiceKeys.ROOM_REPOSITORY);
    const eventPublisher = await container.get<EventPublisher>(ServiceKeys.EVENT_PUBLISHER);
    return new GuestLeaveUseCase(guestRepository, roomRepository, eventPublisher);
  });

  // Register feed episode use cases
  container.register(ServiceKeys.PUBLISH_EPISODE_USE_CASE, async () => {
    const feedEpisodeRepository = container.getSync(ServiceKeys.FEED_EPISODE_REPOSITORY);
    const eventPublisher = await container.get<EventPublisher>(ServiceKeys.EVENT_PUBLISHER);
    return new PublishEpisodeUseCase(feedEpisodeRepository, eventPublisher);
  });

  container.register(ServiceKeys.UPDATE_EPISODE_USE_CASE, async () => {
    const feedEpisodeRepository = container.getSync(ServiceKeys.FEED_EPISODE_REPOSITORY);
    const eventPublisher = await container.get<EventPublisher>(ServiceKeys.EVENT_PUBLISHER);
    return new UpdateEpisodeUseCase(feedEpisodeRepository, eventPublisher);
  });

  container.register(ServiceKeys.DELETE_EPISODE_USE_CASE, async () => {
    const feedEpisodeRepository = container.getSync(ServiceKeys.FEED_EPISODE_REPOSITORY);
    const eventPublisher = await container.get<EventPublisher>(ServiceKeys.EVENT_PUBLISHER);
    return new DeleteEpisodeUseCase(feedEpisodeRepository, eventPublisher);
  });
}

/**
 * Type-safe service getter helper (async)
 */
export async function getService<T>(container: Container, key: ServiceKey): Promise<T> {
  return await container.get<T>(key);
}

/**
 * Type-safe service getter helper (sync)
 */
export function getServiceSync<T>(container: Container, key: ServiceKey): T {
  return container.getSync<T>(key);
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