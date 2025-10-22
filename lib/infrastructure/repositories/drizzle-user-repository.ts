/**
 * Drizzle User Repository Implementation
 * 
 * Implements UserRepository interface using Drizzle ORM
 * for PostgreSQL database operations.
 */

import { eq, and, isNull, count, gte, desc, asc, ilike, or } from 'drizzle-orm';
import { Database, users } from '../../../database/connection.ts';
import { UserRepository } from '../../domain/repositories/user-repository.ts';
import { User, CreateUserData, UpdateUserData } from '../../domain/entities/user.ts';
import { UserRole, Result, PaginatedResult, PaginationParams, Ok, Err } from '../../domain/types/common.ts';
import { ValidationError, EntityNotFoundError, ConflictError } from '../../domain/errors/index.ts';

/**
 * Drizzle implementation of UserRepository
 */
export class DrizzleUserRepository implements UserRepository {
  constructor(private db: Database) {}

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<Result<User | null>> {
    try {
      const result = await this.db
        .select()
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1);

      const user = result[0] ? this.mapToEntity(result[0]) : null;
      return Ok(user);
    } catch (error) {
      return Err(new Error(`Failed to find user by ID: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<Result<User | null>> {
    try {
      const result = await this.db
        .select()
        .from(users)
        .where(and(eq(users.email, email.toLowerCase()), isNull(users.deletedAt)))
        .limit(1);

      const user = result[0] ? this.mapToEntity(result[0]) : null;
      return Ok(user);
    } catch (error) {
      return Err(new Error(`Failed to find user by email: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find users by role with pagination
   */
  async findByRole(role: UserRole, params?: PaginationParams): Promise<Result<PaginatedResult<User>>> {
    try {
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = params || {};
      const offset = (page - 1) * limit;

      // Build sort condition
      const sortColumn = users[sortBy as keyof typeof users] || users.createdAt;
      const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

      // Get total count
      const totalResult = await this.db
        .select({ count: count() })
        .from(users)
        .where(and(eq(users.role, role), isNull(users.deletedAt)));

      const total = totalResult[0]?.count || 0;

      // Get paginated results
      const result = await this.db
        .select()
        .from(users)
        .where(and(eq(users.role, role), isNull(users.deletedAt)))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      const items = result.map(row => this.mapToEntity(row));
      const totalPages = Math.ceil(total / limit);

      return Ok({
        items,
        total,
        page,
        limit,
        totalPages
      });
    } catch (error) {
      return Err(new Error(`Failed to find users by role: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find all active users with pagination
   */
  async findActive(params?: PaginationParams): Promise<Result<PaginatedResult<User>>> {
    try {
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = params || {};
      const offset = (page - 1) * limit;

      // Build sort condition
      const sortColumn = users[sortBy as keyof typeof users] || users.createdAt;
      const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

      // Get total count
      const totalResult = await this.db
        .select({ count: count() })
        .from(users)
        .where(and(eq(users.isActive, true), isNull(users.deletedAt)));

      const total = totalResult[0]?.count || 0;

      // Get paginated results
      const result = await this.db
        .select()
        .from(users)
        .where(and(eq(users.isActive, true), isNull(users.deletedAt)))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      const items = result.map(row => this.mapToEntity(row));
      const totalPages = Math.ceil(total / limit);

      return Ok({
        items,
        total,
        page,
        limit,
        totalPages
      });
    } catch (error) {
      return Err(new Error(`Failed to find active users: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Create a new user
   */
  async create(data: CreateUserData): Promise<Result<User>> {
    try {
      // Check if email already exists
      const emailExistsResult = await this.emailExists(data.email);
      if (!emailExistsResult.success) {
        return Err(emailExistsResult.error);
      }
      if (emailExistsResult.data) {
        return Err(new ConflictError('Email already exists'));
      }

      const now = new Date();
      const result = await this.db
        .insert(users)
        .values({
          email: data.email.toLowerCase(),
          role: data.role,
          isActive: data.isActive ?? true,
          emailVerified: data.emailVerified ?? false,
          failedLoginAttempts: 0,
          createdAt: now,
          updatedAt: now
        })
        .returning();

      if (!result[0]) {
        return Err(new Error('Failed to create user'));
      }

      return Ok(this.mapToEntity(result[0]));
    } catch (error) {
      return Err(new Error(`Failed to create user: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Update an existing user
   */
  async update(id: string, data: UpdateUserData): Promise<Result<User>> {
    try {
      // Check if user exists
      const existingResult = await this.findById(id);
      if (!existingResult.success) {
        return Err(existingResult.error);
      }
      if (!existingResult.data) {
        return Err(new EntityNotFoundError('User', id));
      }

      // Check email uniqueness if email is being updated
      if (data.email && data.email !== existingResult.data.email) {
        const emailExistsResult = await this.emailExists(data.email, id);
        if (!emailExistsResult.success) {
          return Err(emailExistsResult.error);
        }
        if (emailExistsResult.data) {
          return Err(new ConflictError('Email already exists'));
        }
      }

      const updateData: any = {
        updatedAt: new Date()
      };

      // Only include fields that are provided
      if (data.email !== undefined) updateData.email = data.email.toLowerCase();
      if (data.role !== undefined) updateData.role = data.role;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      if (data.emailVerified !== undefined) updateData.emailVerified = data.emailVerified;
      if (data.failedLoginAttempts !== undefined) updateData.failedLoginAttempts = data.failedLoginAttempts;
      if (data.lockedUntil !== undefined) updateData.lockedUntil = data.lockedUntil;
      if (data.lastLoginAt !== undefined) updateData.lastLoginAt = data.lastLoginAt;
      if (data.lastLoginIp !== undefined) updateData.lastLoginIp = data.lastLoginIp;

      const result = await this.db
        .update(users)
        .set(updateData)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning();

      if (!result[0]) {
        return Err(new EntityNotFoundError('User', id));
      }

      return Ok(this.mapToEntity(result[0]));
    } catch (error) {
      return Err(new Error(`Failed to update user: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Soft delete a user
   */
  async delete(id: string): Promise<Result<void>> {
    try {
      const result = await this.db
        .update(users)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning({ id: users.id });

      if (!result[0]) {
        return Err(new EntityNotFoundError('User', id));
      }

      return Ok(undefined);
    } catch (error) {
      return Err(new Error(`Failed to delete user: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Check if email exists (for uniqueness validation)
   */
  async emailExists(email: string, excludeId?: string): Promise<Result<boolean>> {
    try {
      const conditions = [
        eq(users.email, email.toLowerCase()),
        isNull(users.deletedAt)
      ];

      if (excludeId) {
        conditions.push(eq(users.id, excludeId));
      }

      const result = await this.db
        .select({ id: users.id })
        .from(users)
        .where(excludeId ? and(...conditions.slice(0, -1), eq(users.id, excludeId)) : and(...conditions))
        .limit(1);

      return Ok(result.length > 0);
    } catch (error) {
      return Err(new Error(`Failed to check email existence: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Count total users by role
   */
  async countByRole(role: UserRole): Promise<Result<number>> {
    try {
      const result = await this.db
        .select({ count: count() })
        .from(users)
        .where(and(eq(users.role, role), isNull(users.deletedAt)));

      return Ok(result[0]?.count || 0);
    } catch (error) {
      return Err(new Error(`Failed to count users by role: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find users with failed login attempts above threshold
   */
  async findWithFailedAttempts(threshold: number): Promise<Result<User[]>> {
    try {
      const result = await this.db
        .select()
        .from(users)
        .where(and(
          gte(users.failedLoginAttempts, threshold),
          isNull(users.deletedAt)
        ))
        .orderBy(desc(users.failedLoginAttempts));

      const userList = result.map(row => this.mapToEntity(row));
      return Ok(userList);
    } catch (error) {
      return Err(new Error(`Failed to find users with failed attempts: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find locked users
   */
  async findLocked(): Promise<Result<User[]>> {
    try {
      const now = new Date();
      const result = await this.db
        .select()
        .from(users)
        .where(and(
          gte(users.lockedUntil, now),
          isNull(users.deletedAt)
        ))
        .orderBy(desc(users.lockedUntil));

      const userList = result.map(row => this.mapToEntity(row));
      return Ok(userList);
    } catch (error) {
      return Err(new Error(`Failed to find locked users: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Find active users ordered by recent activity for cache warming
   */
  async findActiveUsers(params?: PaginationParams): Promise<Result<PaginatedResult<User>>> {
    try {
      const { page = 1, limit = 10 } = params || {};
      const offset = (page - 1) * limit;

      // Get total count of active users
      const totalResult = await this.db
        .select({ count: count() })
        .from(users)
        .where(and(
          eq(users.isActive, true),
          eq(users.emailVerified, true),
          isNull(users.deletedAt)
        ));

      const total = totalResult[0]?.count || 0;

      // Get active users ordered by last login (most recent first), then by creation date
      const result = await this.db
        .select()
        .from(users)
        .where(and(
          eq(users.isActive, true),
          eq(users.emailVerified, true),
          isNull(users.deletedAt)
        ))
        .orderBy(
          desc(users.lastLoginAt),
          desc(users.createdAt)
        )
        .limit(limit)
        .offset(offset);

      const items = result.map(row => this.mapToEntity(row));
      const totalPages = Math.ceil(total / limit);

      return Ok({
        items,
        total,
        page,
        limit,
        totalPages
      });
    } catch (error) {
      return Err(new Error(`Failed to find active users: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Map database row to domain entity
   */
  private mapToEntity(row: any): User {
    return {
      id: row.id,
      email: row.email,
      role: row.role as UserRole,
      isActive: row.isActive,
      emailVerified: row.emailVerified,
      failedLoginAttempts: row.failedLoginAttempts,
      lockedUntil: row.lockedUntil,
      lastLoginAt: row.lastLoginAt,
      lastLoginIp: row.lastLoginIp,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}