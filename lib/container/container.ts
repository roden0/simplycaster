/**
 * Dependency Injection Container
 * 
 * Provides service registration and resolution with singleton pattern
 * and type safety for dependency management.
 */

export type ServiceFactory<T = any> = () => T;
export type ServiceKey = string;

export class Container {
  private services = new Map<ServiceKey, any>();
  private factories = new Map<ServiceKey, ServiceFactory>();

  /**
   * Register a service factory with the container
   * @param key - Unique service identifier
   * @param factory - Function that creates the service instance
   */
  register<T>(key: ServiceKey, factory: ServiceFactory<T>): void {
    if (this.factories.has(key)) {
      throw new Error(`Service ${key} is already registered`);
    }
    this.factories.set(key, factory);
  }

  /**
   * Get a service instance (singleton pattern)
   * @param key - Service identifier
   * @returns Service instance
   */
  get<T>(key: ServiceKey): T {
    // Return existing instance if available
    if (this.services.has(key)) {
      return this.services.get(key) as T;
    }

    // Create new instance using factory
    const factory = this.factories.get(key);
    if (!factory) {
      throw new Error(`Service ${key} not registered`);
    }

    try {
      const instance = factory();
      this.services.set(key, instance);
      return instance as T;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create service ${key}: ${errorMessage}`);
    }
  }

  /**
   * Check if a service is registered
   * @param key - Service identifier
   * @returns True if service is registered
   */
  has(key: ServiceKey): boolean {
    return this.factories.has(key);
  }

  /**
   * Clear all services and factories (useful for testing)
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
  }

  /**
   * Get all registered service keys
   * @returns Array of service keys
   */
  getRegisteredKeys(): ServiceKey[] {
    return Array.from(this.factories.keys());
  }
}

// Global container instance
export const container = new Container();