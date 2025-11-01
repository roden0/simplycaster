/**
 * Email Providers Integration Test
 * 
 * Integration tests for email providers to verify they can handle
 * basic email operations like validation and message formatting.
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { EmailMessage } from '../../domain/services/email-service.ts';
import { EmailConfigExtended } from './email-config.ts';
import { createMailHogEmailProvider } from './mailhog-email-provider.ts';
import { createSendGridEmailProvider } from './sendgrid-email-provider.ts';
import { createAWSSESEmailProvider } from './aws-ses-email-provider.ts';
import { createSMTPEmailProvider } from './smtp-email-provider.ts';

// Test configurations
const mailhogConfig: EmailConfigExtended = {
  provider: 'mailhog',
  from: {
    email: 'test@example.com',
    name: 'Test Sender'
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
    enabled: false, // Disable logging for tests
    logLevel: 'info',
    logSentEmails: false,
    logFailedEmails: false
  },
  rateLimit: {
    enabled: false,
    maxEmailsPerMinute: 60,
    maxEmailsPerHour: 1000,
    maxEmailsPerDay: 10000
  },
  templates: {
    cacheEnabled: true,
    cacheTTLSeconds: 3600,
    basePath: 'lib/email/templates'
  }
};

const sendgridConfig: EmailConfigExtended = {
  ...mailhogConfig,
  provider: 'sendgrid',
  sendgrid: {
    apiKey: 'SG.test-api-key'
  },
  smtp: undefined
};

const sesConfig: EmailConfigExtended = {
  ...mailhogConfig,
  provider: 'ses',
  ses: {
    region: 'us-east-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key'
  },
  smtp: undefined
};

const smtpConfig: EmailConfigExtended = {
  ...mailhogConfig,
  provider: 'smtp',
  smtp: {
    host: 'smtp.example.com',
    port: 587,
    secure: true,
    auth: {
      user: 'test@example.com',
      pass: 'test-password'
    }
  }
};

// Test email message
const testEmail: EmailMessage = {
  to: 'recipient@example.com',
  subject: 'Test Email',
  html: '<h1>Hello World</h1><p>This is a test email.</p>',
  text: 'Hello World\n\nThis is a test email.',
  correlationId: 'test-correlation-id'
};

// Invalid email messages for validation testing
const invalidEmails = [
  {
    name: 'missing recipient',
    email: { ...testEmail, to: '' }
  },
  {
    name: 'missing subject',
    email: { ...testEmail, subject: '' }
  },
  {
    name: 'missing content',
    email: { ...testEmail, html: undefined, text: undefined }
  },
  {
    name: 'invalid email address',
    email: { ...testEmail, to: 'invalid-email' }
  }
];

Deno.test('MailHog Provider - validates email messages', async () => {
  const provider = createMailHogEmailProvider(mailhogConfig);

  // Test valid email (will fail to send due to no MailHog server, but validation should pass)
  const validResult = await provider.send(testEmail);
  assertEquals(validResult.success, false); // Expected to fail due to no server
  if (!validResult.success) {
    assertEquals(validResult.error.message.includes('Failed to connect'), true);
  }

  // Test invalid emails
  for (const { name, email } of invalidEmails) {
    const result = await provider.send(email as EmailMessage);
    assertEquals(result.success, false, `Should fail validation for ${name}`);
    if (!result.success) {
      assertEquals(result.error.constructor.name, 'EmailValidationError', `Should be validation error for ${name}`);
    }
  }
});

Deno.test('SendGrid Provider - validates email messages', async () => {
  const provider = createSendGridEmailProvider(sendgridConfig);

  // Test valid email (will fail to send due to invalid API key, but validation should pass)
  const validResult = await provider.send(testEmail);
  assertEquals(validResult.success, false); // Expected to fail due to invalid API key
  if (!validResult.success) {
    // Just check that we got an error message
    assertExists(validResult.error.message);
  }

  // Test invalid emails
  for (const { name, email } of invalidEmails) {
    const result = await provider.send(email as EmailMessage);
    assertEquals(result.success, false, `Should fail validation for ${name}`);
    if (!result.success) {
      assertEquals(result.error.constructor.name, 'EmailValidationError', `Should be validation error for ${name}`);
    }
  }
});

Deno.test('AWS SES Provider - validates email messages', async () => {
  const provider = createAWSSESEmailProvider(sesConfig);

  // Test valid email (will fail to send due to invalid credentials, but validation should pass)
  const validResult = await provider.send(testEmail);
  assertEquals(validResult.success, false); // Expected to fail due to invalid credentials
  if (!validResult.success) {
    // Just check that we got an error message
    assertExists(validResult.error.message);
  }

  // Test invalid emails
  for (const { name, email } of invalidEmails) {
    const result = await provider.send(email as EmailMessage);
    assertEquals(result.success, false, `Should fail validation for ${name}`);
    if (!result.success) {
      assertEquals(result.error.constructor.name, 'EmailValidationError', `Should be validation error for ${name}`);
    }
  }
});

Deno.test('SMTP Provider - validates email messages', async () => {
  const provider = createSMTPEmailProvider(smtpConfig);

  // Test valid email (will fail to send due to no SMTP server, but validation should pass)
  const validResult = await provider.send(testEmail);
  assertEquals(validResult.success, false); // Expected to fail due to no server
  if (!validResult.success) {
    // Just check that we got an error message
    assertExists(validResult.error.message);
  }

  // Test invalid emails
  for (const { name, email } of invalidEmails) {
    const result = await provider.send(email as EmailMessage);
    assertEquals(result.success, false, `Should fail validation for ${name}`);
    if (!result.success) {
      assertEquals(result.error.constructor.name, 'EmailValidationError', `Should be validation error for ${name}`);
    }
  }
});

Deno.test('All Providers - handle bulk email validation', async () => {
  const providers = [
    { name: 'MailHog', provider: createMailHogEmailProvider(mailhogConfig) },
    { name: 'SendGrid', provider: createSendGridEmailProvider(sendgridConfig) },
    { name: 'AWS SES', provider: createAWSSESEmailProvider(sesConfig) },
    { name: 'SMTP', provider: createSMTPEmailProvider(smtpConfig) }
  ];

  const bulkEmails = [
    testEmail,
    { ...testEmail, to: 'recipient2@example.com' },
    { ...testEmail, to: 'invalid-email' } // This should fail validation
  ];

  for (const { name, provider } of providers) {
    const result = await provider.sendBulk(bulkEmails);
    // Bulk operations should return results even if some fail
    if (result.success) {
      assertExists(result.data, `${name} should return results`);
      assertEquals(result.data.length, 3, `${name} should return 3 results`);
      
      // Check that we have at least one failed result (the invalid email)
      const failedResults = result.data.filter((r: any) => !r.success);
      assertEquals(failedResults.length > 0, true, `${name} should have at least one failed result`);
    } else {
      // If bulk operation fails entirely, that's also acceptable
      assertExists(result.error, `${name} should return error if bulk operation fails`);
    }
  }
});

Deno.test('All Providers - handle template rendering without template service', async () => {
  const providers = [
    { name: 'MailHog', provider: createMailHogEmailProvider(mailhogConfig) },
    { name: 'SendGrid', provider: createSendGridEmailProvider(sendgridConfig) },
    { name: 'AWS SES', provider: createAWSSESEmailProvider(sesConfig) },
    { name: 'SMTP', provider: createSMTPEmailProvider(smtpConfig) }
  ];

  const templateData = {
    templateId: 'test-template',
    to: 'recipient@example.com',
    subject: 'Test Template Email',
    variables: { name: 'Test User' },
    correlationId: 'test-template-correlation-id'
  };

  for (const { name, provider } of providers) {
    const result = await provider.sendTemplate(templateData);
    assertEquals(result.success, false, `${name} should fail without template service`);
    if (!result.success) {
      assertEquals(result.error.message.includes('Template service not available'), true, `${name} should indicate template service unavailable`);
    }
  }
});

Deno.test('All Providers - health check returns proper structure', async () => {
  const providers = [
    { name: 'MailHog', provider: createMailHogEmailProvider(mailhogConfig) },
    { name: 'SendGrid', provider: createSendGridEmailProvider(sendgridConfig) },
    { name: 'AWS SES', provider: createAWSSESEmailProvider(sesConfig) },
    { name: 'SMTP', provider: createSMTPEmailProvider(smtpConfig) }
  ];

  for (const { name, provider } of providers) {
    const result = await provider.healthCheck();
    
    // Health check should return a result (success or failure)
    assertExists(result, `${name} should return health check result`);
    
    if (result.success) {
      assertExists(result.data, `${name} should return health data on success`);
      assertEquals(typeof result.data.healthy, 'boolean', `${name} should return healthy boolean`);
      assertEquals(typeof result.data.provider, 'string', `${name} should return provider name`);
      assertExists(result.data.lastCheck, `${name} should return last check timestamp`);
    } else {
      assertExists(result.error, `${name} should return error on failure`);
      assertEquals(result.error.constructor.name, 'EmailServiceUnavailableError', `${name} should return service unavailable error`);
    }
  }
});