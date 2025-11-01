/**
 * MailHog Email Provider Implementation
 * 
 * Provides SMTP email sending functionality specifically for MailHog
 * development environment. MailHog is an email testing tool that captures
 * and displays emails without sending them to real recipients.
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
 * SMTP connection interface for MailHog
 */
interface SMTPConnection {
  connect(): Promise<void>;
  authenticate(username?: string, password?: string): Promise<void>;
  send(from: string, to: string[], data: string): Promise<string>;
  quit(): Promise<void>;
  close(): void;
}

/**
 * Simple SMTP client implementation for MailHog
 * MailHog doesn't require authentication and uses plain SMTP
 */
class MailHogSMTPClient implements SMTPConnection {
  private conn: Deno.TcpConn | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  constructor(
    private host: string,
    private port: number,
    private timeout: number = 10000
  ) {}

  async connect(): Promise<void> {
    try {
      this.conn = await Deno.connect({ 
        hostname: this.host, 
        port: this.port 
      });

      this.reader = this.conn.readable.getReader();
      this.writer = this.conn.writable.getWriter();

      // Read initial greeting
      await this.readResponse();
      
      // Send EHLO command
      await this.sendCommand('EHLO localhost');
      await this.readResponse();
    } catch (error) {
      this.close();
      throw new EmailProviderError(
        `Failed to connect to MailHog SMTP server at ${this.host}:${this.port}`,
        'mailhog',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async authenticate(_username?: string, _password?: string): Promise<void> {
    // MailHog doesn't require authentication
    return Promise.resolve();
  }

  async send(from: string, to: string[], data: string): Promise<string> {
    try {
      // MAIL FROM command
      await this.sendCommand(`MAIL FROM:<${from}>`);
      await this.readResponse();

      // RCPT TO commands
      for (const recipient of to) {
        await this.sendCommand(`RCPT TO:<${recipient}>`);
        await this.readResponse();
      }

      // DATA command
      await this.sendCommand('DATA');
      await this.readResponse();

      // Send email data
      await this.sendCommand(data + '\r\n.');
      const response = await this.readResponse();

      // Extract message ID from response (MailHog format)
      const messageId = this.extractMessageId(response) || crypto.randomUUID();
      
      return messageId;
    } catch (error) {
      throw new EmailSendingError(
        'Failed to send email via MailHog SMTP',
        undefined,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  async quit(): Promise<void> {
    try {
      if (this.writer) {
        await this.sendCommand('QUIT');
        await this.readResponse();
      }
    } catch {
      // Ignore errors during quit
    } finally {
      this.close();
    }
  }

  close(): void {
    try {
      this.reader?.releaseLock();
      this.writer?.releaseLock();
      this.conn?.close();
    } catch {
      // Ignore errors during close
    }
    this.reader = null;
    this.writer = null;
    this.conn = null;
  }

  private async sendCommand(command: string): Promise<void> {
    if (!this.writer) {
      throw new Error('SMTP connection not established');
    }

    const data = new TextEncoder().encode(command + '\r\n');
    await this.writer.write(data);
  }

  private async readResponse(): Promise<string> {
    if (!this.reader) {
      throw new Error('SMTP connection not established');
    }

    const decoder = new TextDecoder();
    let response = '';
    let buffer = new Uint8Array(1024);

    while (true) {
      const result = await this.reader.read();
      if (result.done) {
        break;
      }

      const chunk = decoder.decode(result.value);
      response += chunk;

      // Check if we have a complete response (ends with \r\n)
      if (response.includes('\r\n')) {
        break;
      }
    }

    // Check for SMTP error codes
    const lines = response.split('\r\n').filter(line => line.length > 0);
    const lastLine = lines[lines.length - 1];
    
    if (lastLine && lastLine.startsWith('4') || lastLine.startsWith('5')) {
      throw new Error(`SMTP Error: ${lastLine}`);
    }

    return response;
  }

  private extractMessageId(response: string): string | null {
    // Try to extract message ID from MailHog response
    const match = response.match(/250.*?([a-f0-9-]{36})/i);
    return match ? match[1] : null;
  }
}

/**
 * MailHog Email Provider
 * 
 * Implements the EmailService interface for MailHog SMTP server.
 * MailHog is a development email testing tool that captures emails
 * without sending them to real recipients.
 */
export class MailHogEmailProvider implements EmailService {
  private config: EmailConfigExtended;
  private templateService: any; // Will be injected

  constructor(config: EmailConfigExtended, templateService?: any) {
    this.config = config;
    this.templateService = templateService;

    if (!config.smtp) {
      throw new EmailProviderError('SMTP configuration is required for MailHog provider', 'mailhog');
    }
  }

  /**
   * Send a single email via MailHog SMTP
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

      // Create SMTP client
      const client = new MailHogSMTPClient(
        this.config.smtp!.host,
        this.config.smtp!.port,
        10000 // 10 second timeout
      );

      try {
        // Connect to MailHog
        await client.connect();

        // Prepare email data
        const emailData = this.formatEmailMessage(email);
        const recipients = Array.isArray(email.to) ? email.to : [email.to];
        const fromAddress = email.from || this.config.from.email;

        // Send email
        const messageId = await client.send(fromAddress, recipients, emailData);

        // Close connection
        await client.quit();

        // Log successful send
        if (this.config.logging.enabled && this.config.logging.logSentEmails) {
          console.log(`📧 Email sent via MailHog: ${email.subject} (ID: ${messageId})`);
        }

        return {
          success: true,
          data: {
            success: true,
            messageId,
            provider: 'mailhog',
            timestamp: new Date(),
            correlationId
          }
        };

      } finally {
        client.close();
      }

    } catch (error) {
      // Log failed send
      if (this.config.logging.enabled && this.config.logging.logFailedEmails) {
        console.error(`❌ Failed to send email via MailHog: ${email.subject}`, error);
      }

      const emailError = error instanceof EmailProviderError || error instanceof EmailSendingError
        ? error
        : new EmailSendingError(
            `Failed to send email via MailHog: ${error instanceof Error ? error.message : String(error)}`,
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
          error: new EmailProviderError('Template service not available', 'mailhog')
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

    for (const email of emails) {
      const result = await this.send(email);
      
      if (result.success) {
        results.push(result.data!);
      } else {
        results.push({
          success: false,
          error: result.error?.message || 'Unknown error',
          provider: 'mailhog',
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
   * Check the health status of the MailHog email service
   */
  async healthCheck(): Promise<Result<HealthStatus>> {
    const startTime = Date.now();
    
    try {
      // Test connection to MailHog SMTP server
      const client = new MailHogSMTPClient(
        this.config.smtp!.host,
        this.config.smtp!.port,
        5000 // 5 second timeout for health check
      );

      try {
        await client.connect();
        await client.quit();

        const responseTime = Date.now() - startTime;

        return {
          success: true,
          data: {
            healthy: true,
            provider: 'mailhog',
            lastCheck: new Date(),
            metadata: {
              responseTimeMs: responseTime,
              host: this.config.smtp!.host,
              port: this.config.smtp!.port,
              secure: false
            }
          }
        };

      } finally {
        client.close();
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        error: new EmailServiceUnavailableError(
          `MailHog health check failed: ${error instanceof Error ? error.message : String(error)}`,
          'mailhog'
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
          error: new EmailProviderError('Template service not available', 'mailhog')
        };
      }

      // Use the template service to render the template
      const result = await this.templateService.renderTemplate(templateId, variables);
      return result;

    } catch (error) {
      return {
        success: false,
        error: new EmailProviderError(
          `Failed to render template: ${error instanceof Error ? error.message : String(error)}`,
          'mailhog',
          error instanceof Error ? error : new Error(String(error))
        )
      };
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
   * Format email message for SMTP transmission
   */
  private formatEmailMessage(email: EmailMessage): string {
    const recipients = Array.isArray(email.to) ? email.to : [email.to];
    const fromAddress = email.from || this.config.from.email;
    const fromName = this.config.from.name;
    
    let message = '';
    
    // Headers
    message += `From: ${fromName} <${fromAddress}>\r\n`;
    message += `To: ${recipients.join(', ')}\r\n`;
    message += `Subject: ${email.subject}\r\n`;
    message += `Date: ${new Date().toUTCString()}\r\n`;
    message += `Message-ID: <${crypto.randomUUID()}@${this.config.smtp!.host}>\r\n`;
    
    // Add custom headers
    if (email.headers) {
      for (const [key, value] of Object.entries(email.headers)) {
        message += `${key}: ${value}\r\n`;
      }
    }

    // Priority header
    if (email.priority && email.priority !== 'normal') {
      const priorityValue = email.priority === 'high' ? '1' : '5';
      message += `X-Priority: ${priorityValue}\r\n`;
    }

    // Correlation ID header
    if (email.correlationId) {
      message += `X-Correlation-ID: ${email.correlationId}\r\n`;
    }

    // MIME headers for multipart content
    if (email.html && email.text) {
      const boundary = `boundary_${crypto.randomUUID().replace(/-/g, '')}`;
      message += `MIME-Version: 1.0\r\n`;
      message += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
      message += `\r\n`;
      
      // Text part
      message += `--${boundary}\r\n`;
      message += `Content-Type: text/plain; charset=utf-8\r\n`;
      message += `Content-Transfer-Encoding: 8bit\r\n`;
      message += `\r\n`;
      message += `${email.text}\r\n`;
      
      // HTML part
      message += `--${boundary}\r\n`;
      message += `Content-Type: text/html; charset=utf-8\r\n`;
      message += `Content-Transfer-Encoding: 8bit\r\n`;
      message += `\r\n`;
      message += `${email.html}\r\n`;
      
      message += `--${boundary}--\r\n`;
    } else if (email.html) {
      message += `MIME-Version: 1.0\r\n`;
      message += `Content-Type: text/html; charset=utf-8\r\n`;
      message += `Content-Transfer-Encoding: 8bit\r\n`;
      message += `\r\n`;
      message += `${email.html}\r\n`;
    } else if (email.text) {
      message += `MIME-Version: 1.0\r\n`;
      message += `Content-Type: text/plain; charset=utf-8\r\n`;
      message += `Content-Transfer-Encoding: 8bit\r\n`;
      message += `\r\n`;
      message += `${email.text}\r\n`;
    }

    return message;
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
 * Factory function to create MailHog email provider
 */
export function createMailHogEmailProvider(
  config: EmailConfigExtended, 
  templateService?: any
): MailHogEmailProvider {
  return new MailHogEmailProvider(config, templateService);
}

/**
 * Type guard to check if config is for MailHog
 */
export function isMailHogConfig(config: EmailConfigExtended): boolean {
  return config.provider === 'mailhog' && !!config.smtp;
}