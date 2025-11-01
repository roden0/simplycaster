/**
 * Test Password Reset Functionality
 * 
 * Simple test to verify that the password reset use cases work correctly.
 */

import { Database } from './database/connection.ts';
import { users, passwordResetTokens } from './database/schema.ts';
import { eq } from 'drizzle-orm';
import { createRequestPasswordResetUseCase, createResetPasswordUseCase } from './lib/application/use-cases/user/password-reset-factory.ts';
import { EmailService, EmailResult, EmailTemplateData } from './lib/domain/services/email-service.ts';
import { Result, Ok } from './lib/domain/types/common.ts';

// Mock email service for testing
class MockEmailService implements EmailService {
  private sentEmails: EmailTemplateData[] = [];

  async send(): Promise<Result<EmailResult>> {
    return Ok({
      success: true,
      messageId: 'mock-message-id',
      provider: 'mock',
      timestamp: new Date()
    });
  }

  async sendTemplate(templateData: EmailTemplateData): Promise<Result<EmailResult>> {
    this.sentEmails.push(templateData);
    console.log('📧 Mock email sent:', {
      to: templateData.to,
      subject: templateData.subject,
      templateId: templateData.templateId,
      variables: templateData.variables
    });
    
    return Ok({
      success: true,
      messageId: 'mock-message-id',
      provider: 'mock',
      timestamp: new Date()
    });
  }

  async sendBulk(): Promise<Result<EmailResult[]>> {
    return Ok([]);
  }

  async healthCheck(): Promise<Result<any>> {
    return Ok({ healthy: true, provider: 'mock', lastCheck: new Date() });
  }

  async renderTemplate(): Promise<Result<string>> {
    return Ok('<html>Mock template</html>');
  }

  getSentEmails(): EmailTemplateData[] {
    return this.sentEmails;
  }
}

async function testPasswordResetFunctionality() {
  console.log('🧪 Testing Password Reset Functionality...\n');

  try {
    // Initialize database connection
    const database = new Database();
    await database.connect();
    console.log('✅ Database connected');

    // Create mock email service
    const emailService = new MockEmailService();
    console.log('✅ Mock email service created');

    // Create use cases
    const requestPasswordResetUseCase = createRequestPasswordResetUseCase(database, emailService);
    const resetPasswordUseCase = createResetPasswordUseCase(database);
    console.log('✅ Use cases created');

    // Test 1: Request password reset for non-existent user
    console.log('\n📝 Test 1: Request password reset for non-existent user');
    const nonExistentResult = await requestPasswordResetUseCase.execute({
      email: 'nonexistent@example.com',
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent'
    });

    if (nonExistentResult.success) {
      console.log('✅ Non-existent user request handled correctly (no error exposed)');
      console.log('   Message:', nonExistentResult.data.message);
    } else {
      console.log('❌ Non-existent user request failed:', nonExistentResult.error.message);
    }

    // Test 2: Create a test user first
    console.log('\n📝 Test 2: Create test user');
    const testUserResult = await database.db.insert(users).values({
      email: 'test@example.com',
      role: 'host',
      isActive: true,
      emailVerified: true,
      failedLoginAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    if (testUserResult[0]) {
      console.log('✅ Test user created:', testUserResult[0].email);
    } else {
      throw new Error('Failed to create test user');
    }

    // Test 3: Request password reset for existing user
    console.log('\n📝 Test 3: Request password reset for existing user');
    const existingUserResult = await requestPasswordResetUseCase.execute({
      email: 'test@example.com',
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent'
    });

    if (existingUserResult.success) {
      console.log('✅ Password reset request successful');
      console.log('   Message:', existingUserResult.data.message);
      console.log('   Token ID:', existingUserResult.data.tokenId);

      // Check if email was sent
      const sentEmails = emailService.getSentEmails();
      if (sentEmails.length > 0) {
        console.log('✅ Password reset email sent');
        console.log('   Template ID:', sentEmails[0].templateId);
        console.log('   Variables:', Object.keys(sentEmails[0].variables));
      } else {
        console.log('❌ No email was sent');
      }
    } else {
      console.log('❌ Password reset request failed:', existingUserResult.error.message);
    }

    // Test 4: Verify token was created in database
    console.log('\n📝 Test 4: Verify token in database');
    const tokens = await database.db.select().from(passwordResetTokens).where(
      eq(passwordResetTokens.userId, testUserResult[0].id)
    );

    if (tokens.length > 0) {
      console.log('✅ Password reset token created in database');
      console.log('   Token ID:', tokens[0].id);
      console.log('   Expires at:', tokens[0].expiresAt);
      console.log('   Used at:', tokens[0].usedAt || 'Not used');
    } else {
      console.log('❌ No password reset token found in database');
    }

    // Test 5: Test password reset with invalid token
    console.log('\n📝 Test 5: Test password reset with invalid token');
    const invalidTokenResult = await resetPasswordUseCase.execute({
      tokenId: 'invalid-token-id',
      token: 'invalid-token',
      newPassword: 'NewPassword123!',
      confirmPassword: 'NewPassword123!',
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent'
    });

    if (!invalidTokenResult.success) {
      console.log('✅ Invalid token correctly rejected');
      console.log('   Error:', invalidTokenResult.error.message);
    } else {
      console.log('❌ Invalid token was accepted (this should not happen)');
    }

    // Cleanup: Remove test data
    console.log('\n🧹 Cleaning up test data...');
    await database.db.delete(passwordResetTokens).where(
      eq(passwordResetTokens.userId, testUserResult[0].id)
    );
    await database.db.delete(users).where(
      eq(users.id, testUserResult[0].id)
    );
    console.log('✅ Test data cleaned up');

    await database.disconnect();
    console.log('✅ Database disconnected');

    console.log('\n🎉 Password reset functionality test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (import.meta.main) {
  await testPasswordResetFunctionality();
}