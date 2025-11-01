/**
 * Password Reset Use Cases Factory
 * 
 * Factory functions to create password reset use cases with their dependencies.
 */

import { Database } from '../../../../database/connection.ts';
import { DrizzleUserRepository } from '../../../infrastructure/repositories/drizzle-user-repository.ts';
import { JWTTokenService } from '../../../infrastructure/services/jwt-token-service.ts';
import { ArgonPasswordService } from '../../../infrastructure/services/argon-password-service.ts';
import { RequestPasswordResetUseCase } from './request-password-reset-use-case.ts';
import { ResetPasswordUseCase } from './reset-password-use-case.ts';
import { EmailService } from '../../../domain/services/email-service.ts';

/**
 * Create request password reset use case with dependencies
 */
export function createRequestPasswordResetUseCase(
  database: Database,
  emailService: EmailService
): RequestPasswordResetUseCase {
  const userRepository = new DrizzleUserRepository(database);
  const tokenService = new JWTTokenService();
  
  return new RequestPasswordResetUseCase(
    userRepository,
    tokenService,
    emailService,
    database
  );
}

/**
 * Create reset password use case with dependencies
 */
export function createResetPasswordUseCase(database: Database): ResetPasswordUseCase {
  const userRepository = new DrizzleUserRepository(database);
  const tokenService = new JWTTokenService();
  const passwordService = new ArgonPasswordService();
  
  return new ResetPasswordUseCase(
    userRepository,
    tokenService,
    passwordService,
    database
  );
}