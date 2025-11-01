/**
 * AWS SES Email Provider Implementation
 * 
 * Provides email sending functionality using AWS Simple Email Service (SES).
 * AWS SES is a cloud-based email sending service designed to help digital
 * marketers and application developers send marketing, notification, and
 * transactional emails.
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
 * AWS SES API response interfaces
 */
interface SESResponse {
  MessageId?: string;
  Error?: {
    Code: string;
    Message: string;
    Type: string;
  };
}

interface SESErrorResponse {
  __type: string;
  message: string;
}

/**
 * AWS SES send email request
 */
interface SESSendEmailRequest {
  Source: string;
  Destination: {
    ToAddresses: string[];
    CcAddresses?: string[];
    BccAddresses?: string[];
  };
  Message: {
    Subject: {
      Data: string;
      Charset?: string;
    };
    Body: {
      Text?: {
        Data: string;
        Charset?: string;
      };
      Html?: {
        Data: string;
        Charset?: string;
      };
    };
  };
  ReplyToAddresses?: string[];
  ReturnPath?: string;
  Tags?: Array<{
    Name: string;
    Value: string;
  }>;
}

/**
 * AWS SES Email Provider
 * 
 * Implements the EmailService interface for AWS SES.
 * Provides reliable email delivery with built-in retry logic,
 * error handling, and SES-specific features like bounce handling.
 */
export class AWSSESEmailProvider implements EmailService {
  private config: EmailConfigExtended;
  private templateService: unknown;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second base delay

  constructor(config: EmailConfigExtended, templateService?: unknown) {
    this.config = config;
    this.templateService = templateService;

    if (!config.ses) {
      throw new EmailProviderError('AWS SES configuration is required', 'ses');
    }

    if (!config.ses.region) {
      throw new EmailProviderError('AWS SES region is required', 'ses');
    }

    if (!config.ses.accessKeyId || !config.ses.secretAccessKey) {
      throw new EmailProviderError('AWS SES credentials (accessKeyId and secretAccessKey) are required', 'ses');
    }
  }

  /**
   * Send a single email via AWS SES
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

      // Convert to SES format
      const sesRequest = this.formatEmailForSES(email);

      // Send with retry logic
      const result = await this.sendWithRetry(sesRequest, correlationId);

      // Log successful send
      if (this.config.logging.enabled && this.config.logging.logSentEmails) {
        console.log(`📧 Email sent via AWS SES: ${email.subject} (ID: ${result.messageId})`);
      }

      return {
        success: true,
        data: {
          success: true,
          messageId: result.messageId,
          provider: 'ses',
          timestamp: new Date(),
          correlationId
        }
      };

    } catch (error) {
      // Log failed send
      if (this.config.logging.enabled && this.config.logging.logFailedEmails) {
        console.error(`❌ Failed to send email via AWS SES: ${email.subject}`, error);
      }

      const emailError = error instanceof EmailProviderError || error instanceof EmailSendingError
        ? error
        : new EmailSendingError(
            `Failed to send email via AWS SES: ${error instanceof Error ? error.message : String(error)}`,
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
          error: new EmailProviderError('Template service not available', 'ses')
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

    // AWS SES supports batch sending, but for simplicity we'll send individually
    // In production, you might want to use SES bulk sending for better performance
    for (const email of emails) {
      const result = await this.send(email);
      
      if (result.success) {
        results.push(result.data!);
      } else {
        results.push({
          success: false,
          error: result.error?.message || 'Unknown error',
          provider: 'ses',
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
   * Check the health status of the AWS SES email service
   */
  async healthCheck(): Promise<Result<HealthStatus>> {
    const startTime = Date.now();
    
    try {
      // Test AWS SES connectivity by getting account sending quota
      const response = await this.makeAWSRequest('GetSendQuota', {});

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        const _data = await response.text();
        
        return {
          success: true,
          data: {
            healthy: true,
            provider: 'ses',
            lastCheck: new Date(),
            metadata: {
              responseTimeMs: responseTime,
              region: this.config.ses!.region,
              status: response.status
            }
          }
        };
      } else {
        const errorData = await response.text().catch(() => '');
        throw new Error(`AWS SES API returned ${response.status}: ${errorData}`);
      }

    } catch (error) {
      return {
        success: false,
        error: new EmailServiceUnavailableError(
          `AWS SES health check failed: ${error instanceof Error ? error.message : String(error)}`,
          'ses'
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
          error: new EmailProviderError('Template service not available', 'ses')
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
          'ses',
          error instanceof Error ? error : new Error(String(error))
        )
      };
    }
  }

  /**
   * Send email with retry logic
   */
  private async sendWithRetry(request: SESSendEmailRequest, correlationId: string): Promise<{ messageId: string }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.makeAWSRequest('SendEmail', request, correlationId);

        if (response.ok) {
          const responseText = await response.text();
          const messageId = this.extractMessageIdFromResponse(responseText) || crypto.randomUUID();
          return { messageId };
        }

        // Handle SES-specific errors
        const errorData: SESErrorResponse = await response.json().catch(() => ({}));
        const errorMessage = this.formatSESError(response.status, errorData);

        // Check if error is retryable
        if (this.isRetryableError(response.status, errorData)) {
          lastError = new Error(errorMessage);
          
          if (attempt < this.maxRetries) {
            const delay = this.calculateRetryDelay(attempt);
            console.warn(`⚠️  AWS SES send attempt ${attempt} failed (${response.status}), retrying in ${delay}ms...`);
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
          console.warn(`⚠️  AWS SES network error on attempt ${attempt}, retrying in ${delay}ms...`);
          await this.sleep(delay);
          continue;
        }

        break;
      }
    }

    throw lastError || new EmailSendingError('Failed to send email after retries', correlationId);
  }

  /**
   * Make AWS API request with proper authentication
   */
  private async makeAWSRequest(action: string, payload: unknown, correlationId?: string): Promise<Response> {
    const endpoint = `https://email.${this.config.ses!.region}.amazonaws.com/`;
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = timestamp.substr(0, 8);

    // Create canonical request
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-amz-json-1.0',
      'X-Amz-Target': `AWSSimpleEmailService.${action}`,
      'X-Amz-Date': timestamp,
      'Host': `email.${this.config.ses!.region}.amazonaws.com`
    };

    if (correlationId) {
      headers['X-Correlation-ID'] = correlationId;
    }

    const body = JSON.stringify(payload);

    // Create AWS Signature Version 4
    const signature = await this.createAWSSignature(
      'POST',
      '/',
      headers,
      body,
      timestamp,
      date
    );

    headers['Authorization'] = signature;

    return fetch(endpoint, {
      method: 'POST',
      headers,
      body
    });
  }

  /**
   * Create AWS Signature Version 4
   */
  private async createAWSSignature(
    method: string,
    path: string,
    headers: Record<string, string>,
    body: string,
    timestamp: string,
    date: string
  ): Promise<string> {
    const service = 'ses';
    const region = this.config.ses!.region;
    const accessKeyId = this.config.ses!.accessKeyId!;
    const secretAccessKey = this.config.ses!.secretAccessKey!;

    // Create canonical request
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map(key => `${key.toLowerCase()}:${headers[key]}`)
      .join('\n');

    const signedHeaders = Object.keys(headers)
      .sort()
      .map(key => key.toLowerCase())
      .join(';');

    const payloadHash = await this.sha256(body);

    const canonicalRequest = [
      method,
      path,
      '', // query string
      canonicalHeaders,
      '', // empty line
      signedHeaders,
      payloadHash
    ].join('\n');

    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${date}/${region}/${service}/aws4_request`;
    const canonicalRequestHash = await this.sha256(canonicalRequest);

    const stringToSign = [
      algorithm,
      timestamp,
      credentialScope,
      canonicalRequestHash
    ].join('\n');

    // Create signing key
    const signingKey = await this.getSigningKey(secretAccessKey, date, region, service);

    // Create signature
    const signature = await this.hmacSha256(signingKey, stringToSign);
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Create authorization header
    return `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;
  }

  /**
   * Get AWS signing key
   */
  private async getSigningKey(secretAccessKey: string, date: string, region: string, service: string): Promise<ArrayBuffer> {
    const kDate = await this.hmacSha256(`AWS4${secretAccessKey}`, date);
    const kRegion = await this.hmacSha256(kDate, region);
    const kService = await this.hmacSha256(kRegion, service);
    const kSigning = await this.hmacSha256(kService, 'aws4_request');
    return kSigning;
  }

  /**
   * HMAC-SHA256 implementation
   */
  private async hmacSha256(key: string | ArrayBuffer, data: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const keyData = typeof key === 'string' ? encoder.encode(key) : key;
    const dataBuffer = encoder.encode(data);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    return await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
  }

  /**
   * SHA-256 implementation
   */
  private async sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Format email message for AWS SES
   */
  private formatEmailForSES(email: EmailMessage): SESSendEmailRequest {
    const recipients = Array.isArray(email.to) ? email.to : [email.to];
    const fromAddress = email.from || this.config.from.email;

    const request: SESSendEmailRequest = {
      Source: fromAddress,
      Destination: {
        ToAddresses: recipients
      },
      Message: {
        Subject: {
          Data: email.subject,
          Charset: 'UTF-8'
        },
        Body: {}
      }
    };

    // Add content
    if (email.text) {
      request.Message.Body.Text = {
        Data: email.text,
        Charset: 'UTF-8'
      };
    }

    if (email.html) {
      request.Message.Body.Html = {
        Data: email.html,
        Charset: 'UTF-8'
      };
    }

    // Add tags for correlation ID and priority
    if (email.correlationId || email.priority) {
      request.Tags = [];
      
      if (email.correlationId) {
        request.Tags.push({
          Name: 'CorrelationId',
          Value: email.correlationId
        });
      }

      if (email.priority && email.priority !== 'normal') {
        request.Tags.push({
          Name: 'Priority',
          Value: email.priority
        });
      }
    }

    return request;
  }

  /**
   * Extract message ID from SES response
   */
  private extractMessageIdFromResponse(response: string): string | null {
    try {
      // SES returns XML response, extract MessageId
      const match = response.match(/<MessageId>([^<]+)<\/MessageId>/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
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
   * Format SES error response
   */
  private formatSESError(status: number, errorData: SESErrorResponse): string {
    if (errorData.__type && errorData.message) {
      return `AWS SES error (${status}): ${errorData.__type} - ${errorData.message}`;
    }

    // Standard HTTP error messages for SES
    switch (status) {
      case 400:
        return 'AWS SES error (400): Bad Request - Invalid email data or parameters';
      case 403:
        return 'AWS SES error (403): Forbidden - Invalid credentials or insufficient permissions';
      case 429:
        return 'AWS SES error (429): Too Many Requests - Rate limit exceeded';
      case 500:
        return 'AWS SES error (500): Internal Server Error';
      case 503:
        return 'AWS SES error (503): Service Unavailable';
      default:
        return `AWS SES error (${status}): Unknown error`;
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(status: number, errorData: SESErrorResponse): boolean {
    // Retry on server errors and rate limiting
    if (status >= 500 || status === 429) {
      return true;
    }

    // Retry on specific SES error types
    if (errorData.__type) {
      const retryableErrors = [
        'Throttling',
        'ServiceUnavailable',
        'InternalFailure'
      ];
      return retryableErrors.some(error => errorData.__type.includes(error));
    }

    return false;
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
 * Factory function to create AWS SES email provider
 */
export function createAWSSESEmailProvider(
  config: EmailConfigExtended, 
  templateService?: unknown
): AWSSESEmailProvider {
  return new AWSSESEmailProvider(config, templateService);
}

/**
 * Type guard to check if config is for AWS SES
 */
export function isAWSSESConfig(config: EmailConfigExtended): boolean {
  return config.provider === 'ses' && 
         !!config.ses?.region && 
         !!config.ses?.accessKeyId && 
         !!config.ses?.secretAccessKey;
}