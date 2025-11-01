/**
 * Email Providers Test
 * 
 * Tests for all email provider implementations to ensure they can be
 * instantiated and have the correct interface implementations.
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { EmailConfigExtended } from './email-config.ts';
import { createMailHogEmailProvider } from './mailhog-email-provider.ts';
import { createSendGridEmailProvider } from './sendgrid-email-provider.ts';
import { createAWSSESEmailProvider } from './aws-ses-email-provider.ts';
import { createSMTPEmailProvider } from './smtp-email-provider.ts';
import { createEmailService } from './email-service-factory.ts';

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

Deno.test('MailHog Email Provider - can be instantiated', () => {
  const provider = createMailHogEmailProvider(mailhogConfig);
  assertExists(provider);
  assertEquals(typeof provider.send, 'function');
  assertEquals(typeof provider.sendTemplate, 'function');
  assertEquals(typeof provider.sendBulk, 'function');
  assertEquals(typeof provider.healthCheck, 'function');
  assertEquals(typeof provider.renderTemplate, 'function');
});

Deno.test('SendGrid Email Provider - can be instantiated', () => {
  const provider = createSendGridEmailProvider(sendgridConfig);
  assertExists(provider);
  assertEquals(typeof provider.send, 'function');
  assertEquals(typeof provider.sendTemplate, 'function');
  assertEquals(typeof provider.sendBulk, 'function');
  assertEquals(typeof provider.healthCheck, 'function');
  assertEquals(typeof provider.renderTemplate, 'function');
});

Deno.test('AWS SES Email Provider - can be instantiated', () => {
  const provider = createAWSSESEmailProvider(sesConfig);
  assertExists(provider);
  assertEquals(typeof provider.send, 'function');
  assertEquals(typeof provider.sendTemplate, 'function');
  assertEquals(typeof provider.sendBulk, 'function');
  assertEquals(typeof provider.healthCheck, 'function');
  assertEquals(typeof provider.renderTemplate, 'function');
});

Deno.test('SMTP Email Provider - can be instantiated', () => {
  const provider = createSMTPEmailProvider(smtpConfig);
  assertExists(provider);
  assertEquals(typeof provider.send, 'function');
  assertEquals(typeof provider.sendTemplate, 'function');
  assertEquals(typeof provider.sendBulk, 'function');
  assertEquals(typeof provider.healthCheck, 'function');
  assertEquals(typeof provider.renderTemplate, 'function');
});

Deno.test('Email Service Factory - creates correct providers', async () => {
  // Test MailHog
  const mailhogService = await createEmailService(mailhogConfig);
  assertExists(mailhogService);

  // Test SendGrid
  const sendgridService = await createEmailService(sendgridConfig);
  assertExists(sendgridService);

  // Test AWS SES
  const sesService = await createEmailService(sesConfig);
  assertExists(sesService);

  // Test SMTP
  const smtpService = await createEmailService(smtpConfig);
  assertExists(smtpService);
});

Deno.test('Email Service Factory - validates configurations', async () => {
  // Test invalid MailHog config (missing SMTP)
  const invalidMailhogConfig = { ...mailhogConfig, smtp: undefined };
  try {
    await createEmailService(invalidMailhogConfig);
    throw new Error('Should have thrown error for invalid MailHog config');
  } catch (error) {
    assertEquals((error as Error).message.includes('Invalid MailHog configuration'), true);
  }

  // Test invalid SendGrid config (missing API key)
  const invalidSendgridConfig = { ...sendgridConfig, sendgrid: undefined };
  try {
    await createEmailService(invalidSendgridConfig);
    throw new Error('Should have thrown error for invalid SendGrid config');
  } catch (error) {
    assertEquals((error as Error).message.includes('Invalid SendGrid configuration'), true);
  }

  // Test invalid SES config (missing credentials)
  const invalidSesConfig = { ...sesConfig, ses: { region: 'us-east-1' } };
  try {
    await createEmailService(invalidSesConfig);
    throw new Error('Should have thrown error for invalid SES config');
  } catch (error) {
    assertEquals((error as Error).message.includes('Invalid AWS SES configuration'), true);
  }

  // Test invalid SMTP config (missing auth)
  const invalidSmtpConfig = { 
    ...smtpConfig, 
    smtp: { 
      host: 'smtp.example.com', 
      port: 587, 
      secure: true 
    } 
  };
  try {
    await createEmailService(invalidSmtpConfig);
    throw new Error('Should have thrown error for invalid SMTP config');
  } catch (error) {
    assertEquals((error as Error).message.includes('Invalid SMTP configuration'), true);
  }
});

Deno.test('Email Service Factory - handles unsupported provider', async () => {
  const unsupportedConfig = { 
    ...mailhogConfig, 
    provider: 'unsupported' as 'mailhog' | 'sendgrid' | 'ses' | 'smtp'
  };
  
  try {
    await createEmailService(unsupportedConfig);
    throw new Error('Should have thrown error for unsupported provider');
  } catch (error) {
    assertEquals((error as Error).message.includes('Unsupported email provider'), true);
  }
});