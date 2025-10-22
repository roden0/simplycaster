/**
 * Redis Service Test Example
 * 
 * This is a simple example showing how to use the Redis services.
 * This file can be removed after testing.
 */

import { parseRedisConfig } from './redis-config.ts';
import { RedisConnectionManager } from './redis-connection-manager.ts';
import { RedisServiceImpl } from './redis-service-impl.ts';

async function testRedisServices() {
  try {
    console.log('Testing Redis services...');

    // Parse configuration
    const config = parseRedisConfig();
    console.log('Redis config:', { host: config.host, port: config.port });

    // Create connection manager
    const connectionManager = new RedisConnectionManager(config);
    
    // Connect to Redis
    await connectionManager.connect();
    console.log('Connected to Redis');

    // Create Redis service
    const redisService = new RedisServiceImpl(connectionManager, 'test');

    // Test basic operations
    await redisService.set('test-key', 'test-value', 60);
    console.log('Set test key');

    const value = await redisService.get<string>('test-key');
    console.log('Retrieved value:', value);

    // Test hash operations
    await redisService.hset('test-hash', 'field1', 'value1');
    const hashValue = await redisService.hget<string>('test-hash', 'field1');
    console.log('Hash value:', hashValue);

    // Test health check
    const isHealthy = await redisService.ping();
    console.log('Redis health check:', isHealthy);

    // Cleanup
    await redisService.del('test-key');
    await redisService.del('test-hash');
    
    // Disconnect
    await redisService.disconnect();
    console.log('Disconnected from Redis');

    console.log('✅ Redis services test completed successfully');
  } catch (error) {
    console.error('❌ Redis services test failed:', error);
  }
}

// Export for potential use
export { testRedisServices };