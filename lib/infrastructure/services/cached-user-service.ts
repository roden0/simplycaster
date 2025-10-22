/**
 * Cached User Service
 * 
 * Implements cache-aside pattern for user data operations with automatic
 * fallback to database queries and cache invalidation on updates.
 */

import { User, CreateUserData, UpdateUserData } from '../../domain/entities/user.ts';
import { UserRepository } from '../../domain/repositories/user-repository.ts';
import { CacheService } from '../../domain/services/cache-service.ts';

export class CachedUserService {
  constructor(
    private userRepository: UserRepository,
    private cacheService: CacheService
  ) {}

  /**
   * Get user by ID with cache-aside pattern
   */
  async getUserById(id: string): Promise<User | null> {
    try {
      // Try cache first
      const cachedUser = await this.cacheService.getUserById(id);
      if (cachedUser) {
        return cachedUser;
      }

      // Cache miss - fetch from database
      const user = await this.userRepository.findById(id);
      if (user) {
        // Cache the result for future requests
        await this.cacheService.setUser(user);
      }

      return user;
    } catch (error) {
      console.error(`Error getting user ${id}:`, error);
      // On cache error, fallback to database only
      return await this.userRepository.findById(id);
    }
  }

  /**
   * Get user by email with cache-aside pattern
   */
  async getUserByEmail(email: string): Promise<User | null> {
    try {
      // For email lookups, we don't have a direct cache key
      // So we go to database and then cache the result
      const user = await this.userRepository.findByEmail(email);
      if (user) {
        // Cache the user for future ID-based lookups
        await this.cacheService.setUser(user);
      }

      return user;
    } catch (error) {
      console.error(`Error getting user by email ${email}:`, error);
      return await this.userRepository.findByEmail(email);
    }
  }

  /**
   * Create user and cache the result
   */
  async createUser(userData: CreateUserData): Promise<User> {
    try {
      const user = await this.userRepository.create(userData);
      
      // Cache the newly created user
      await this.cacheService.setUser(user);
      
      return user;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Update user and invalidate cache
   */
  async updateUser(id: string, updateData: UpdateUserData): Promise<User | null> {
    try {
      const updatedUser = await this.userRepository.update(id, updateData);
      
      if (updatedUser) {
        // Invalidate cache to ensure consistency
        await this.cacheService.invalidateUser(id);
        
        // Cache the updated user
        await this.cacheService.setUser(updatedUser);
      }
      
      return updatedUser;
    } catch (error) {
      console.error(`Error updating user ${id}:`, error);
      
      // On error, still invalidate cache to prevent stale data
      try {
        await this.cacheService.invalidateUser(id);
      } catch (cacheError) {
        console.error(`Error invalidating cache for user ${id}:`, cacheError);
      }
      
      throw error;
    }
  }

  /**
   * Delete user and invalidate cache
   */
  async deleteUser(id: string): Promise<boolean> {
    try {
      const deleted = await this.userRepository.delete(id);
      
      if (deleted) {
        // Invalidate cache
        await this.cacheService.invalidateUser(id);
      }
      
      return deleted;
    } catch (error) {
      console.error(`Error deleting user ${id}:`, error);
      
      // On error, still invalidate cache to prevent stale data
      try {
        await this.cacheService.invalidateUser(id);
      } catch (cacheError) {
        console.error(`Error invalidating cache for user ${id}:`, cacheError);
      }
      
      throw error;
    }
  }

  /**
   * Get all users (typically for admin operations)
   * This operation is not cached due to its nature
   */
  async getAllUsers(): Promise<User[]> {
    return await this.userRepository.findAll();
  }

  /**
   * Update user login information and cache
   */
  async updateLoginInfo(id: string, ipAddress: string): Promise<User | null> {
    try {
      const updateData: UpdateUserData = {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
        failedLoginAttempts: 0, // Reset failed attempts on successful login
        lockedUntil: undefined // Clear any lock
      };

      return await this.updateUser(id, updateData);
    } catch (error) {
      console.error(`Error updating login info for user ${id}:`, error);
      throw error;
    }
  }

  /**
   * Increment failed login attempts and cache
   */
  async incrementFailedAttempts(id: string): Promise<User | null> {
    try {
      // Get current user to calculate new failed attempts
      const user = await this.getUserById(id);
      if (!user) {
        return null;
      }

      const newAttempts = user.failedLoginAttempts + 1;
      const shouldLock = newAttempts >= 5;
      
      const updateData: UpdateUserData = {
        failedLoginAttempts: newAttempts,
        lockedUntil: shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : undefined // 15 minutes
      };

      return await this.updateUser(id, updateData);
    } catch (error) {
      console.error(`Error incrementing failed attempts for user ${id}:`, error);
      throw error;
    }
  }

  /**
   * Check if user account is locked (with cache)
   */
  async isAccountLocked(id: string): Promise<boolean> {
    try {
      const user = await this.getUserById(id);
      if (!user) {
        return false;
      }

      return user.lockedUntil ? user.lockedUntil > new Date() : false;
    } catch (error) {
      console.error(`Error checking if account is locked for user ${id}:`, error);
      return false;
    }
  }

  /**
   * Warm user cache with frequently accessed users
   */
  async warmUserCache(userIds: string[]): Promise<void> {
    try {
      const users = await Promise.all(
        userIds.map(id => this.userRepository.findById(id))
      );

      // Cache all found users
      await Promise.all(
        users
          .filter((user): user is User => user !== null)
          .map(user => this.cacheService.setUser(user))
      );

      console.log(`Warmed cache for ${users.filter(u => u !== null).length} users`);
    } catch (error) {
      console.error('Error warming user cache:', error);
    }
  }

  /**
   * Invalidate all user cache entries
   */
  async invalidateAllUserCache(): Promise<void> {
    try {
      await this.cacheService.invalidatePattern('user:*');
      console.log('Invalidated all user cache entries');
    } catch (error) {
      console.error('Error invalidating all user cache:', error);
    }
  }
}