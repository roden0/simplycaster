/**
 * Global Container Access
 * 
 * Provides access to the dependency injection container from anywhere in the application
 */

import type { Container } from './container.ts';

/**
 * Get the global service container
 * This is initialized in main.ts and made available globally
 */
export function getContainer(): Container {
  const container = (globalThis as any).serviceContainer;
  
  if (!container) {
    throw new Error('Service container not initialized. Make sure main.ts has been loaded.');
  }
  
  return container;
}

/**
 * Get a service from the global container (async)
 */
export async function getService<T>(key: string): Promise<T> {
  const container = getContainer();
  return await container.get<T>(key);
}

/**
 * Get a service from the global container (sync)
 */
export function getServiceSync<T>(key: string): T {
  const container = getContainer();
  return container.getSync<T>(key);
}