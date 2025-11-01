// ============================================================================
// Email Service Interface
// ============================================================================

import { Result } from '../types/common.ts';

/**
 * Email attachment interface
 */
export interface EmailAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
  contentId?: string;
}

/**
 * Email message interface
 */
export interface EmailMessage {
  to: string | string[];
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  priority?: 'low' | 'normal' | 'high';
  correlationId?: string;
}

/**
 * Email template data interface
 */
export interface EmailTemplateData extends Omit<EmailMessage, 'html' | 'text'> {
  templateId: string;
  variables: Record<string, unknown>;
}

/**
 * Email sending result interface
 */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider?: string;
  timestamp: Date;
  correlationId?: string;
}

/**
 * Email configuration interface
 */
export interface EmailConfig {
  provider: 'mailhog' | 'sendgrid' | 'ses' | 'smtp';
  from: {
    email: string;
    name: string;
  };
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth?: {
      user: string;
      pass: string;
    };
  };
  sendgrid?: {
    apiKey: string;
  };
  ses?: {
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
  queue: {
    enabled: boolean;
    concurrency: number;
    retryAttempts: number;
    retryDelay: number;
  };
}

/**
 * Email audit log interface for tracking email delivery status
 */
export interface EmailAuditLog {
  id: string;
  correlationId: string;
  to: string[];
  from: string;
  subject: string;
  templateId?: string;
  provider: string;
  status: 'queued' | 'sent' | 'failed' | 'bounced';
  messageId?: string;
  error?: string;
  attempts: number;
  createdAt: Date;
  sentAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Health status interface
 */
export interface HealthStatus {
  healthy: boolean;
  provider: string;
  lastCheck: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Email service interface
 */
export interface EmailService {
  /**
   * Send a single email
   */
  send(email: EmailMessage): Promise<Result<EmailResult>>;

  /**
   * Send an email using a template
   */
  sendTemplate(templateData: EmailTemplateData): Promise<Result<EmailResult>>;

  /**
   * Send multiple emails in bulk
   */
  sendBulk(emails: EmailMessage[]): Promise<Result<EmailResult[]>>;

  /**
   * Check the health status of the email service
   */
  healthCheck(): Promise<Result<HealthStatus>>;

  /**
   * Render a template with provided data (for testing/preview)
   */
  renderTemplate(templateId: string, variables: Record<string, unknown>): Promise<Result<string>>;
}