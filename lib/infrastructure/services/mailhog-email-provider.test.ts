/**
 * MailHog Email Provider Tests
 * 
 * Tests for the MailHog email provider implementation.
 * These tests verify the basic functionality without requiring
 * an actual MailHog server to be running.
 */

import { expect } from '@std/expect';
import { MailHogEmailProvider, createMailHogEmailProvider } from './mailhog-email-provider.ts';
import { EmailConfigExtended } from './email-config.ts';
import { EmailMessage } from '../../domain/services/email-service.ts';

// Mock configuration for testing
const mockConfig: EmailConfigExtended = {
  provider: 'mailhog',
  from: {
    email: 'test@simplycast.local',
    name: 'Test SimplyCaster'
  },
  smtp: {
    host: 'localhost',
    port: 1025,
    secure: false
  },
  queue: {
    enabled: false,
    concurrency: 1,
    retryAttempts: 3,
    retryDelay: 1000
  },
  healthCheck: {
    enabled: true,
    intervalMs: 300000,
    timeoutMs: 10000,
    retryAttempts: 2
  },
  logging: {
    enabled: true,
    logLevel: 'info',
    logSentEmails: true,
    logFailedEmails: true
  },
  rateLimit: {
    enabled: false,
    maxEmailsPerMinute: 60,
    maxEmailsPerHour: 1000,
    maxEmailsPerDay: 10000
  },
  templates: {
    cacheEnabled: false,
    cacheTTLSeconds: 3600,
    basePath: 'lib/email/templates'
  }
};

Deno.test('MailHogEmailProvider - Factory Creation', () => {
  const provider = createMailHogEmailProvider(mockConfig);
  expect(provider).toBeInstanceOf(MailHogEmailProvider);
});

Deno.test('MailHogEmailProvider - Constructor Validation', () => {
  // Should create successfully with valid config
  expect(() => new MailHogEmailProvider(mockConfig)).not.toThrow();

  // Should throw with invalid config (no SMTP)
  const invalidConfig = { ...mockConfig, smtp: undefined };
  expect(() => new MailHogEmailProvider(invalidConfig as any)).toThrow();
});

Deno.test('MailHogEmailProvider - Email Validation', async () => {
  const provider = new MailHogEmailProvider(mockConfig);

  // Valid email should pass validation
  const validEmail: EmailMessage = {
    to: 'test@example.com',
    subject: 'Test Subject',
    html: '<p>Test content</p>',
    text: 'Test content'
  };

  // This will fail due to no MailHog server, but should pass validation
  const result = await provider.send(validEmail);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.message).toContain('Failed to connect to MailHog');
  }

  // Invalid email should fail validation
  const invalidEmail: EmailMessage = {
    to: '',
    subject: '',
    html: '',
    text: ''
  };

  const invalidResult = await provider.send(invalidEmail);
  expect(invalidResult.success).toBe(false);
  if (!invalidResult.success) {
    expect(invalidResult.error.message).toContain('recipient');
  }
});

Deno.test('MailHogEmailProvider - Email Message Formatting', () => {
  const provider = new MailHogEmailProvider(mockConfig);

  const email: EmailMessage = {
    to: 'test@example.com',
    subject: 'Test Subject',
    html: '<p>Test HTML content</p>',
    text: 'Test text content',
    priority: 'high',
    correlationId: 'test-123'
  };

  // Access private method for testing (TypeScript hack)
  const formatMethod = (provider as any).formatEmailMessage.bind(provider);
  const formatted = formatMethod(email);

  expect(formatted).toContain('From: Test SimplyCaster <test@simplycast.local>');
  expect(formatted).toContain('To: test@example.com');
  expect(formatted).toContain('Subject: Test Subject');
  expect(formatted).toContain('X-Priority: 1'); // High priority
  expect(formatted).toContain('X-Correlation-ID: test-123');
  expect(formatted).toContain('Test HTML content');
  expect(formatted).toContain('Test text content');
});

Deno.test('MailHogEmailProvider - HTML to Text Conversion', () => {
  const provider = new MailHogEmailProvider(mockConfig);

  // Access private method for testing
  const htmlToTextMethod = (provider as any).htmlToText.bind(provider);

  const html = '<h1>Title</h1><p>This is a <strong>test</strong> with &nbsp; spaces.</p>';
  const text = htmlToTextMethod(html);

  expect(text).toBe('TitleThis is a test with spaces.');
  expect(text).not.toContain('<');
  expect(text).not.toContain('>');
});

Deno.test('MailHogEmailProvider - Email Address Validation', () => {
  const provider = new MailHogEmailProvider(mockConfig);

  // Access private method for testing
  const isValidEmailMethod = (provider as any).isValidEmail.bind(provider);

  expect(isValidEmailMethod('test@example.com')).toBe(true);
  expect(isValidEmailMethod('user.name+tag@domain.co.uk')).toBe(true);
  expect(isValidEmailMethod('invalid-email')).toBe(false);
  expect(isValidEmailMethod('invalid@')).toBe(false);
  expect(isValidEmailMethod('@invalid.com')).toBe(false);
  expect(isValidEmailMethod('')).toBe(false);
});

Deno.test('MailHogEmailProvider - Bulk Email Processing', async () => {
  const provider = new MailHogEmailProvider(mockConfig);

  const emails: EmailMessage[] = [
    {
      to: 'test1@example.com',
      subject: 'Test 1',
      text: 'Content 1'
    },
    {
      to: 'test2@example.com',
      subject: 'Test 2',
      text: 'Content 2'
    }
  ];

  // This will fail due to no MailHog server, but should process all emails
  const result = await provider.sendBulk(emails);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.message).toContain('Failed to send all');
  }
});

Deno.test('MailHogEmailProvider - Health Check', async () => {
  const provider = new MailHogEmailProvider(mockConfig);

  // This will fail due to no MailHog server
  const result = await provider.healthCheck();
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.message).toContain('MailHog health check failed');
  }
});

Deno.test('MailHogEmailProvider - Template Rendering Without Service', async () => {
  const provider = new MailHogEmailProvider(mockConfig);

  const templateData = {
    templateId: 'test-template',
    to: 'test@example.com',
    subject: 'Test',
    variables: { name: 'Test User' }
  };

  const result = await provider.sendTemplate(templateData);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.message).toContain('Template service not available');
  }
});

Deno.test('MailHogEmailProvider - Render Template Without Service', async () => {
  const provider = new MailHogEmailProvider(mockConfig);

  const result = await provider.renderTemplate('test-template', { name: 'Test' });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.message).toContain('Template service not available');
  }
});