// ============================================================================
// Email Domain Types
// ============================================================================

/**
 * Email priority levels
 */
export enum EmailPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high'
}

/**
 * Email delivery status
 */
export enum EmailDeliveryStatus {
  QUEUED = 'queued',
  SENT = 'sent',
  FAILED = 'failed',
  BOUNCED = 'bounced'
}

/**
 * Email provider types
 */
export enum EmailProvider {
  MAILHOG = 'mailhog',
  SENDGRID = 'sendgrid',
  SES = 'ses',
  SMTP = 'smtp'
}

/**
 * Email template variable types
 */
export type EmailTemplateVariable = string | number | boolean | Date | null | undefined;

/**
 * Email template context
 */
export interface EmailTemplateContext {
  [key: string]: EmailTemplateVariable | EmailTemplateVariable[] | Record<string, EmailTemplateVariable>;
}

/**
 * Email template configuration
 */
export interface EmailTemplateConfig {
  id: string;
  subject: string;
  requiredVariables: string[];
  optionalVariables?: string[];
  previewText?: string;
  description?: string;
}

/**
 * Email queue message
 */
export interface EmailQueueMessage {
  id: string;
  correlationId: string;
  email: {
    to: string | string[];
    from?: string;
    subject: string;
    html?: string;
    text?: string;
    attachments?: Array<{
      filename: string;
      content: string; // base64 encoded
      contentType: string;
      contentId?: string;
    }>;
    headers?: Record<string, string>;
    priority?: EmailPriority;
  };
  templateId?: string;
  variables?: EmailTemplateContext;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  scheduledAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Email metrics
 */
export interface EmailMetrics {
  totalSent: number;
  totalFailed: number;
  totalQueued: number;
  successRate: number;
  averageDeliveryTime: number;
  providerMetrics: Record<string, {
    sent: number;
    failed: number;
    averageResponseTime: number;
  }>;
  lastUpdated: Date;
}