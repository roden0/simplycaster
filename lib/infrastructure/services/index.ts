/**
 * Infrastructure Services Exports
 * 
 * Provides concrete implementations of domain service interfaces
 */

export { ArgonPasswordService } from './argon-password-service.ts';
export { FileSystemStorageService } from './filesystem-storage-service.ts';
export { JWTTokenService } from './jwt-token-service.ts';

// Redis services
export { RedisConnectionManager } from './redis-connection-manager.ts';
export { RedisServiceImpl } from './redis-service-impl.ts';
export { RedisInitializer } from './redis-initializer.ts';
export { CacheServiceImpl } from './cache-service-impl.ts';
export { CachedUserService } from './cached-user-service.ts';
export { CachedRoomService } from './cached-room-service.ts';
export { CachedRecordingService } from './cached-recording-service.ts';
export { RedisSessionService } from './redis-session-service.ts';
export { SessionManager } from './session-manager.ts';
export { SessionCleanupService } from './session-cleanup.ts';
export { SessionInitializer } from './session-initializer.ts';
export { RateLimitServiceImpl } from './rate-limit-service-impl.ts';
export { RateLimitConfigManagerImpl } from './rate-limit-config-manager.ts';
export type { RateLimitConfigManager } from './rate-limit-config-manager.ts';
export { RealtimeServiceImpl } from './realtime-service-impl.ts';
export { parseRedisConfig, parseCacheConfig, parseRateLimitConfig } from './redis-config.ts';
export type { RedisConfig, CacheConfig, RateLimitConfig } from './redis-config.ts';

// Email services
export { 
  parseEmailConfig, 
  validateEmailConfig, 
  getValidatedEmailConfig,
  performEmailConfigHealthCheck 
} from './email-config.ts';
export type { 
  EmailConfigExtended, 
  EmailConfigValidationResult, 
  EmailConfigHealthCheck 
} from './email-config.ts';
export { 
  EmailConfigService, 
  createEmailConfigService, 
  getEmailConfigService,
  initializeEmailConfigService,
  validateEmailConfigOnStartup 
} from './email-config-service.ts';
export type { IEmailConfigService } from './email-config-service.ts';
export { 
  EmailInitializer,
  createEmailInitializer,
  initializeEmailServices,
  validateEmailOnStartup 
} from './email-initializer.ts';
export { 
  MailHogEmailProvider,
  createMailHogEmailProvider,
  isMailHogConfig 
} from './mailhog-email-provider.ts';
export { 
  SendGridEmailProvider,
  createSendGridEmailProvider,
  isSendGridConfig 
} from './sendgrid-email-provider.ts';
export { 
  AWSSESEmailProvider,
  createAWSSESEmailProvider,
  isAWSSESConfig 
} from './aws-ses-email-provider.ts';
export { 
  SMTPEmailProvider,
  createSMTPEmailProvider,
  isSMTPConfig 
} from './smtp-email-provider.ts';
export { 
  EmailServiceFactory,
  EmailServiceProviderRegistry,
  EmailServiceManager,
  createEmailServiceFactory,
  createEmailService,
  createEmailServiceManager,
  getEmailServiceProviderRegistry,
  registerEmailProvider 
} from './email-service-factory.ts';
export type { IEmailServiceFactory } from './email-service-factory.ts';

// RabbitMQ services
export { RabbitMQConnectionManager } from './rabbitmq-connection-manager.ts';
export { RabbitMQEventPublisher, createRabbitMQEventPublisher } from './rabbitmq-event-publisher.ts';
export { 
  RabbitMQCircuitBreaker, 
  RabbitMQCircuitBreakerWithFallback,
  createCircuitBreaker,
  createCircuitBreakerWithFallback,
  CircuitBreakerState
} from './rabbitmq-circuit-breaker.ts';
export { createRabbitMQConfig, createDefaultExchanges, RABBITMQ_ENV_VARS } from './rabbitmq-config.ts';