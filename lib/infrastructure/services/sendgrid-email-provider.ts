/**
 * SendGrid Email Provider Implementation
 * 
 * Provides email sending functionality using SendGrid Web API v3.
 * SendGrid is a cloud-based email delivery service that provides
 * reliable email delivery, analytics, and advanced features.
 */

import { 
  EmailService, 
  EmailMessage, 
  EmailTemplateData, 
  EmailResult, 
  HealthStatus
} from '../../domain/services/email-service.ts';
import { EmailConfigExtended } from './email-config.ts';
import { Result } from '../../domain/types/common.ts';
import { 
  EmailProviderError, 
  EmailSendingError, 
  EmailValidationError,
  EmailServiceUnavailableError 
} from '../../domain/errors/email-errors.ts';

/**
 * SendGrid API response interfaces
 */
interface SendGridResponse {
  message?: string;
  errors?: Array<{
    message: string;
    field?: string;
    help?: string;
  }>;
}

interface SendGridSendResponse {
  message_id?: string;
}

/**
 * SendGrid email request format
 */
interface SendGridEmailRequest {
  personalizations: Array<{
    to: Array<{ email: string; name?: string }>;
    subject: string;
    custom_args?: Record<string, string>;
  }>;
  from: {
    email: string;
    name?: string;
  };
  content: Array<{
    type: string;
    value: string;
  }>;
  headers?: Record<string, string>;
  custom_args?: Record<string, string>;
  send_at?: number;
}

/**
 * SendGrid Email Provider
 * 
 * Implements the EmailService interface for SendGrid Web API v3.
 * Provides reliable email delivery with built-in retry logic,
 * error handling, and SendGrid-specific features.
 */
export class SendGridEmailProvider implements EmailService {
  private config: EmailConfigExtended;
  private templateService: unknown;
  private readonly baseUrl = 'https://api.sendgrid.com/v3';
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second base delay

  constructor(config: EmailConfigExtended, templateService?: unknown) {
    this.config = config;
    this.templateService = templateService;

    if (!config.sendgrid?.apiKey) {
      throw new EmailProviderError('SendGrid API key is required', 'sendgrid');
    }

    if (!config.sendgrid.apiKey.startsWith('SG.')) {
      console.warn('⚠️  SendGrid API key format appears invalid (should start with "SG.")');
    }
  }

  /**
   * Send a single email via SendGrid API
   */
  async send(email: EmailMessage): Promise<Result<EmailResult>> {
    const correlationId = email.correlationId || crypto.randomUUID();
    
    try {
      // Validate email message
      const validation = this.validateEmailMessage(email);
      if (!validation.success) {
        return {
          success: false,
          error: new EmailValidationError(validation.error!)
        };
      }

      // Convert to SendGrid format
      const sendGridRequest = this.formatEmailForSendGrid(email);

      // Send with retry logic
      const result = await this.sendWithRetry(sendGridRequest, correlationId);

      // Log successful send
      if (this.config.logging.enabled && this.config.logging.logSentEmails) {
        console.log(`📧 Email sent via SendGrid: ${email.subject} (ID: ${result.messageId})`);
      }

      return {
        success: true,
        data: {
          success: true,
          messageId: result.messageId,
          provider: 'sendgrid',
          timestamp: new Date(),
          correlationId
        }
      };

    } catch (error) {
      // Log failed send
      if (this.config.logging.enabled && this.config.logging.logFailedEmails) {
        console.error(`❌ Failed to send email via SendGrid: ${email.subject}`, error);
      }

      const emailError = error instanceof EmailProviderError || error instanceof EmailSendingError
        ? error
        : new EmailSendingError(
            `Failed to send email via SendGrid: ${error instanceof Error ? error.message : String(error)}`,
            correlationId,
            error instanceof Error ? error : new Error(String(error))
          );

      return {
        success: false,
        error: emailError
      };
    }
  }

  /**
   * Send an email using a template
   */
  async sendTemplate(templateData: EmailTemplateData): Promise<Result<EmailResult>> {
    try {
      if (!this.templateService) {
        return {
          success: false,
          error: new EmailProviderError('Template service not available', 'sendgrid')
        };
      }

      // Render template
      const renderResult = await this.renderTemplate(templateData.templateId, templateData.variables);
      if (!renderResult.success) {
        return {
          success: false,
          error: renderResult.error
        };
      }

      // Create email message with rendered content
      const emailMessage: EmailMessage = {
        to: templateData.to,
        from: templateData.from,
        subject: templateData.subject,
        html: renderResult.data,
        // Generate text version if not provided
        text: this.htmlToText(renderResult.data!),
        attachments: templateData.attachments,
        headers: templateData.headers,
        priority: templateData.priority,
        correlationId: templateData.correlationId
      };

      // Send the email
      return await this.send(emailMessage);

    } catch (error) {
      return {
        success: false,
        error: new EmailSendingError(
          `Failed to send template email: ${error instanceof Error ? error.message : String(error)}`,
          templateData.correlationId,
          error instanceof Error ? error : new Error(String(error))
        )
      };
    }
  }

  /**
   * Send multiple emails in bulk
   */
  async sendBulk(emails: EmailMessage[]): Promise<Result<EmailResult[]>> {
    const results: EmailResult[] = [];
    const errors: Error[] = [];

    // SendGrid supports batch sending, but for simplicity we'll send individually
    // In production, you might want to use SendGrid's batch API for better performance
    for (const email of emails) {
      const result = await this.send(email);
      
      if (result.success) {
        results.push(result.data!);
      } else {
        results.push({
          success: false,
          error: result.error?.message || 'Unknown error',
          provider: 'sendgrid',
          timestamp: new Date(),
          correlationId: email.correlationId
        });
        errors.push(result.error!);
      }
    }

    // Return success if at least some emails were sent
    const successCount = results.filter(r => r.success).length;
    
    if (successCount === 0) {
      return {
        success: false,
        error: new EmailSendingError(`Failed to send all ${emails.length} emails`)
      };
    }

    if (errors.length > 0) {
      console.warn(`⚠️  Sent ${successCount}/${emails.length} emails successfully. ${errors.length} failed.`);
    }

    return {
      success: true,
      data: results
    };
  }

  /**
   * Check the health status of the SendGrid email service
   */
  async healthCheck(): Promise<Result<HealthStatus>> {
    const startTime = Date.now();
    
    try {
      // Test SendGrid API connectivity by making a simple API call
      const response = await fetch(`${this.baseUrl}/user/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.sendgrid!.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return {
          success: true,
          data: {
            healthy: true,
            provider: 'sendgrid',
            lastCheck: new Date(),
            metadata: {
              responseTimeMs: responseTime,
              apiVersion: 'v3',
              status: response.status
            }
          }
        };
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`SendGrid API returned ${response.status}: ${JSON.stringify(errorData)}`);
      }

    } catch (error) {
      return {
        success: false,
        error: new EmailServiceUnavailableError(
          `SendGrid health check failed: ${error instanceof Error ? error.message : String(error)}`,
          'sendgrid'
        )
      };
    }
  }

  /**
   * Render a template with provided data
   */
  async renderTemplate(templateId: string, variables: Record<string, unknown>): Promise<Result<string>> {
    try {
      if (!this.templateService) {
        return {
          success: false,
          error: new EmailProviderError('Template service not available', 'sendgrid')
        };
      }

      // Use the template service to render the template
      const templateServiceTyped = this.templateService as { renderTemplate: (id: string, vars: Record<string, unknown>) => Promise<Result<string>> };
      const result = await templateServiceTyped.renderTemplate(templateId, variables);
      return result;

    } catch (error) {
      return {
        success: false,
        error: new EmailProviderError(
          `Failed to render template: ${error instanceof Error ? error.message : String(error)}`,
          'sendgrid',
          error instanceof Error ? error : new Error(String(error))
        )
      };
    }
  }

  /**
   * Send email with retry logic
   */
  private async sendWithRetry(request: SendGridEmailRequest, correlationId: string): Promise<{ messageId: string }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/mail/send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.sendgrid!.apiKey}`,
            'Content-Type': 'application/json',
            'X-Correlation-ID': correlationId
          },
          body: JSON.stringify(request)
        });

        if (response.ok) {
          // SendGrid returns 202 for successful sends
          const messageId = response.headers.get('X-Message-Id') || crypto.randomUUID();
          return { messageId };
        }

        // Handle SendGrid-specific errors
        const errorData: SendGridResponse = await response.json().catch(() => ({}));
        const errorMessage = this.formatSendGridError(response.status, errorData);

        // Check if error is retryable
        if (this.isRetryableError(response.status)) {
          lastError = new Error(errorMessage);
          
          if (attempt < this.maxRetries) {
            const delay = this.calculateRetryDelay(attempt);
            console.warn(`⚠️  SendGrid send attempt ${attempt} failed (${response.status}), retrying in ${delay}ms...`);
            await this.sleep(delay);
            continue;
          }
        }

        // Non-retryable error or max retries reached
        throw new EmailSendingError(errorMessage, correlationId);

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.maxRetries && this.isNetworkError(error)) {
          const delay = this.calculateRetryDelay(attempt);
          console.warn(`⚠️  SendGrid network error on attempt ${attempt}, retrying in ${delay}ms...`);
          await this.sleep(delay);
          continue;
        }

        break;
      }
    }

    throw lastError || new EmailSendingError('Failed to send email after retries', correlationId);
  }

  /**
   * Format email message for SendGrid API
   */
  private formatEmailForSendGrid(email: EmailMessage): SendGridEmailRequest {
    const recipients = Array.isArray(email.to) ? email.to : [email.to];
    const fromAddress = email.from || this.config.from.email;
    const fromName = this.config.from.name;

    const request: SendGridEmailRequest = {
      personalizations: [{
        to: recipients.map(email => ({ email })),
        subject: email.subject
      }],
      from: {
        email: fromAddress,
        name: fromName
      },
      content: []
    };

    // Add content
    if (email.text) {
      request.content.push({
        type: 'text/plain',
        value: email.text
      });
    }

    if (email.html) {
      request.content.push({
        type: 'text/html',
        value: email.html
      });
    }

    // Add headers
    if (email.headers) {
      request.headers = { ...email.headers };
    }

    // Add correlation ID
    if (email.correlationId) {
      request.custom_args = {
        ...request.custom_args,
        correlation_id: email.correlationId
      };
    }

    // Add priority (SendGrid uses categories for this)
    if (email.priority && email.priority !== 'normal') {
      request.personalizations[0].custom_args = {
        ...request.personalizations[0].custom_args,
        priority: email.priority
      };
    }

    return request;
  }

  /**
   * Validate email message
   */
  private validateEmailMessage(email: EmailMessage): { success: boolean; error?: string } {
    if (!email.to || (Array.isArray(email.to) && email.to.length === 0)) {
      return { success: false, error: 'Email recipient(s) required' };
    }

    if (!email.subject || email.subject.trim().length === 0) {
      return { success: false, error: 'Email subject required' };
    }

    if (!email.html && !email.text) {
      return { success: false, error: 'Email content (HTML or text) required' };
    }

    // Validate email addresses
    const recipients = Array.isArray(email.to) ? email.to : [email.to];
    for (const recipient of recipients) {
      if (!this.isValidEmail(recipient)) {
        return { success: false, error: `Invalid email address: ${recipient}` };
      }
    }

    const fromAddress = email.from || this.config.from.email;
    if (!this.isValidEmail(fromAddress)) {
      return { success: false, error: `Invalid from email address: ${fromAddress}` };
    }

    return { success: true };
  }

  /**
   * Format SendGrid error response
   */
  private formatSendGridError(status: number, errorData: SendGridResponse): string {
    if (errorData.errors && errorData.errors.length > 0) {
      const errors = errorData.errors.map(err => err.message).join(', ');
      return `SendGrid API error (${status}): ${errors}`;
    }

    if (errorData.message) {
      return `SendGrid API error (${status}): ${errorData.message}`;
    }

    // Standard HTTP error messages
    switch (status) {
      case 400:
        return 'SendGrid API error (400): Bad Request - Invalid email data';
      case 401:
        return 'SendGrid API error (401): Unauthorized - Invalid API key';
      case 403:
        return 'SendGrid API error (403): Forbidden - API key lacks permissions';
      case 413:
        return 'SendGrid API error (413): Payload Too Large - Email content too large';
      case 429:
        return 'SendGrid API error (429): Too Many Requests - Rate limit exceeded';
      case 500:
        return 'SendGrid API error (500): Internal Server Error';
      case 502:
        return 'SendGrid API error (502): Bad Gateway';
      case 503:
        return 'SendGrid API error (503): Service Unavailable';
      case 504:
        return 'SendGrid API error (504): Gateway Timeout';
      default:
        return `SendGrid API error (${status}): Unknown error`;
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(status: number): boolean {
    // Retry on server errors and rate limiting
    return status >= 500 || status === 429;
  }

  /**
   * Check if error is a network error
   */
  private isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('network') || 
             message.includes('timeout') || 
             message.includes('connection') ||
             message.includes('fetch');
    }
    return false;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.retryDelay;
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Simple email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Convert HTML to plain text (simple implementation)
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
      .replace(/&amp;/g, '&') // Replace HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
}

/**
 * Factory function to create SendGrid email provider
 */
export function createSendGridEmailProvider(
  config: EmailConfigExtended, 
  templateService?: unknown
): SendGridEmailProvider {
  return new SendGridEmailProvider(config, templateService);
}

/**
 * Type guard to check if config is for SendGrid
 */
export function isSendGridConfig(config: EmailConfigExtended): boolean {
  return config.provider === 'sendgrid' && !!config.sendgrid?.apiKey;
}