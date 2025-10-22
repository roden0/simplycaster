/**
 * Container Module Exports
 * 
 * Provides dependency injection container functionality
 * with service registration and type-safe resolution.
 */

export { Container, container, type ServiceFactory, type ServiceKey as ContainerServiceKey } from './container.ts';
export { 
  registerServices, 
  initializeContainer, 
  validateServiceRegistration,
  getService,
  ServiceKeys,
  type ServiceKey,
  type ServiceRegistryConfig 
} from './registry.ts';
export {
  initializeRedis,
  getRedisService,
  isRedisHealthy,
  getRedisHealth,
  shutdownRedis,
  withRedisOrFallback
} from './redis-global.ts';