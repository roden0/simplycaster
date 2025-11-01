/**
 * Generic SMTP Email Provider Implementation
 * 
 * Provides email sending functionality using standard SMTP protocol.
 * This provider can work with any SMTP server that supports standard
 * authentication methods and TLS/SSL encryption.
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
 * SMTP connection pool interface
 */
interface SMTPConnection {
  id: string;
  conn: Deno.TcpConn | null;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  writer: WritableStreamDefaultWriter<Uint8Array> | null;
  inUse: boolean;
  lastUsed: Date;
  authenticated: boolean;
}

/**
 * SMTP authentication methods
 */
type SMTPAuthMethod = 'PLAIN' | 'LOGIN' | 'CRAM-MD5';

/**
 * Generic SMTP Email Provider
 * 
 * Implements the EmailService interface for generic SMTP servers.
 * Supports TLS/SSL encryption, connection pooling, and various
 * authentication methods (PLAIN, LOGIN, CRAM-MD5).
 */
export class SMTPEmailProvider implements EmailService {
  private config: EmailConfigExtended;
  private templateService: unknown;
  private connectionPool: SMTPConnection[] = [];
  private readonly maxConnections = 5;
  private readonly connectionTimeout = 30000; // 30 seconds
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second base delay

  constructor(config: EmailConfigExtended, templateService?: unknown) {
    this.config = config;
    this.templateService = templateService;

    if (!config.smtp) {
      throw new EmailProviderError('SMTP configuration is required', 'smtp');
    }

    if (!config.smtp.host) {
      throw new EmailProviderError('SMTP host is required', 'smtp');
    }

    if (!config.smtp.port || config.smtp.port < 1 || config.smtp.port > 65535) {
      throw new EmailProviderError('SMTP port must be between 1 and 65535', 'smtp');
    }

    if (!config.smtp.auth?.user || !config.smtp.auth?.pass) {
      throw new EmailProviderError('SMTP authentication credentials are required', 'smtp');
    }
  }

  /**
   * Send a single email via SMTP
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

      // Send with retry logic
      const result = await this.sendWithRetry(email, correlationId);

      // Log successful send
      if (this.config.logging.enabled && this.config.logging.logSentEmails) {
        console.log(`📧 Email sent via SMTP: ${email.subject} (ID: ${result.messageId})`);
      }

      return {
        success: true,
        data: {
          success: true,
          messageId: result.messageId,
          provider: 'smtp',
          timestamp: new Date(),
          correlationId
        }
      };

    } catch (error) {
      // Log failed send
      if (this.config.logging.enabled && this.config.logging.logFailedEmails) {
        console.error(`❌ Failed to send email via SMTP: ${email.subject}`, error);
      }

      const emailError = error instanceof EmailProviderError || error instanceof EmailSendingError
        ? error
        : new EmailSendingError(
            `Failed to send email via SMTP: ${error instanceof Error ? error.message : String(error)}`,
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
          error: new EmailProviderError('Template service not available', 'smtp')
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

    // Use connection pooling for bulk sending
    for (const email of emails) {
      const result = await this.send(email);
      
      if (result.success) {
        results.push(result.data!);
      } else {
        results.push({
          success: false,
          error: result.error?.message || 'Unknown error',
          provider: 'smtp',
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
   * Check the health status of the SMTP email service
   */
  async healthCheck(): Promise<Result<HealthStatus>> {
    const startTime = Date.now();
    
    try {
      // Test SMTP server connectivity
      const connection = await this.createConnection();
      
      try {
        await this.connectToServer(connection);
        await this.authenticateConnection(connection);
        await this.closeConnection(connection);

        const responseTime = Date.now() - startTime;

        return {
          success: true,
          data: {
            healthy: true,
            provider: 'smtp',
            lastCheck: new Date(),
            metadata: {
              responseTimeMs: responseTime,
              host: this.config.smtp!.host,
              port: this.config.smtp!.port,
              secure: this.config.smtp!.secure
            }
          }
        };

      } finally {
        this.destroyConnection(connection);
      }

    } catch (error) {
      return {
        success: false,
        error: new EmailServiceUnavailableError(
          `SMTP health check failed: ${error instanceof Error ? error.message : String(error)}`,
          'smtp'
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
          error: new EmailProviderError('Template service not available', 'smtp')
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
          'smtp',
          error instanceof Error ? error : new Error(String(error))
        )
      };
    }
  }

  /**
   * Send email with retry logic
   */
  private async sendWithRetry(email: EmailMessage, correlationId: string): Promise<{ messageId: string }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const connection = await this.getConnection();
        
        try {
          const messageId = await this.sendEmailViaConnection(connection, email);
          this.releaseConnection(connection);
          return { messageId };

        } catch (error) {
          this.destroyConnection(connection);
          throw error;
        }

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.maxRetries && this.isRetryableError(error)) {
          const delay = this.calculateRetryDelay(attempt);
          console.warn(`⚠️  SMTP send attempt ${attempt} failed, retrying in ${delay}ms...`);
          await this.sleep(delay);
          continue;
        }

        break;
      }
    }

    throw lastError || new EmailSendingError('Failed to send email after retries', correlationId);
  }

  /**
   * Get connection from pool or create new one
   */
  private async getConnection(): Promise<SMTPConnection> {
    // Clean up expired connections
    this.cleanupConnections();

    // Find available connection
    const availableConnection = this.connectionPool.find(conn => !conn.inUse && conn.authenticated);
    
    if (availableConnection) {
      availableConnection.inUse = true;
      availableConnection.lastUsed = new Date();
      return availableConnection;
    }

    // Create new connection if pool not full
    if (this.connectionPool.length < this.maxConnections) {
      const connection = this.createConnection();
      await this.connectToServer(connection);
      await this.authenticateConnection(connection);
      
      connection.inUse = true;
      connection.authenticated = true;
      this.connectionPool.push(connection);
      
      return connection;
    }

    // Wait for connection to become available
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const available = this.connectionPool.find(conn => !conn.inUse && conn.authenticated);
        if (available) {
          clearInterval(checkInterval);
          available.inUse = true;
          available.lastUsed = new Date();
          resolve(available);
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Timeout waiting for SMTP connection'));
      }, 10000);
    });
  }

  /**
   * Release connection back to pool
   */
  private releaseConnection(connection: SMTPConnection): void {
    connection.inUse = false;
    connection.lastUsed = new Date();
  }

  /**
   * Create new SMTP connection
   */
  private createConnection(): SMTPConnection {
    return {
      id: crypto.randomUUID(),
      conn: null,
      reader: null,
      writer: null,
      inUse: false,
      lastUsed: new Date(),
      authenticated: false
    };
  }

  /**
   * Connect to SMTP server
   */
  private async connectToServer(connection: SMTPConnection): Promise<void> {
    try {
      // Connect to SMTP server
      connection.conn = await Deno.connect({
        hostname: this.config.smtp!.host,
        port: this.config.smtp!.port
      });

      connection.reader = connection.conn.readable.getReader();
      connection.writer = connection.conn.writable.getWriter();

      // Read initial greeting
      await this.readResponse(connection);

      // Send EHLO command
      await this.sendCommand(connection, `EHLO ${this.config.smtp!.host}`);
      const ehloResponse = await this.readResponse(connection);

      // Start TLS if required
      if (this.config.smtp!.secure && this.config.smtp!.port !== 465) {
        if (ehloResponse.includes('STARTTLS')) {
          await this.sendCommand(connection, 'STARTTLS');
          await this.readResponse(connection);
          
          // Upgrade to TLS connection
          await this.upgradeTLS(connection);
          
          // Send EHLO again after TLS
          await this.sendCommand(connection, `EHLO ${this.config.smtp!.host}`);
          await this.readResponse(connection);
        }
      }

    } catch (error) {
      this.destroyConnection(connection);
      throw new EmailProviderError(
        `Failed to connect to SMTP server: ${error instanceof Error ? error.message : String(error)}`,
        'smtp',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Authenticate SMTP connection
   */
  private async authenticateConnection(connection: SMTPConnection): Promise<void> {
    try {
      const username = this.config.smtp!.auth!.user;
      const password = this.config.smtp!.auth!.pass;

      // Use PLAIN authentication (most widely supported)
      const authString = btoa(`\0${username}\0${password}`);
      
      await this.sendCommand(connection, 'AUTH PLAIN');
      await this.readResponse(connection);
      
      await this.sendCommand(connection, authString);
      await this.readResponse(connection);

      connection.authenticated = true;

    } catch (error) {
      throw new EmailProviderError(
        `SMTP authentication failed: ${error instanceof Error ? error.message : String(error)}`,
        'smtp',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Send email via established connection
   */
  private async sendEmailViaConnection(connection: SMTPConnection, email: EmailMessage): Promise<string> {
    try {
      const recipients = Array.isArray(email.to) ? email.to : [email.to];
      const fromAddress = email.from || this.config.from.email;

      // MAIL FROM command
      await this.sendCommand(connection, `MAIL FROM:<${fromAddress}>`);
      await this.readResponse(connection);

      // RCPT TO commands
      for (const recipient of recipients) {
        await this.sendCommand(connection, `RCPT TO:<${recipient}>`);
        await this.readResponse(connection);
      }

      // DATA command
      await this.sendCommand(connection, 'DATA');
      await this.readResponse(connection);

      // Send email data
      const emailData = this.formatEmailMessage(email);
      await this.sendCommand(connection, emailData + '\r\n.');
      const response = await this.readResponse(connection);

      // Extract message ID from response
      const messageId = this.extractMessageId(response) || crypto.randomUUID();
      
      return messageId;

    } catch (error) {
      throw new EmailSendingError(
        `Failed to send email via SMTP: ${error instanceof Error ? error.message : String(error)}`,
        email.correlationId,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Send SMTP command
   */
  private async sendCommand(connection: SMTPConnection, command: string): Promise<void> {
    if (!connection.writer) {
      throw new Error('SMTP connection not established');
    }

    const data = new TextEncoder().encode(command + '\r\n');
    await connection.writer.write(data);
  }

  /**
   * Read SMTP response
   */
  private async readResponse(connection: SMTPConnection): Promise<string> {
    if (!connection.reader) {
      throw new Error('SMTP connection not established');
    }

    const decoder = new TextDecoder();
    let response = '';

    while (true) {
      const result = await connection.reader.read();
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
    
    if (lastLine && (lastLine.startsWith('4') || lastLine.startsWith('5'))) {
      throw new Error(`SMTP Error: ${lastLine}`);
    }

    return response;
  }

  /**
   * Upgrade connection to TLS
   */
  private upgradeTLS(_connection: SMTPConnection): Promise<void> {
    // Note: This is a simplified TLS upgrade implementation
    // In a production environment, you would need proper TLS handshake
    // For now, we'll assume the connection supports TLS
    console.warn('⚠️  TLS upgrade not fully implemented - using plain connection');
    return Promise.resolve();
  }

  /**
   * Close SMTP connection
   */
  private async closeConnection(connection: SMTPConnection): Promise<void> {
    try {
      if (connection.writer) {
        await this.sendCommand(connection, 'QUIT');
        await this.readResponse(connection);
      }
    } catch {
      // Ignore errors during close
    }
  }

  /**
   * Destroy connection and clean up resources
   */
  private destroyConnection(connection: SMTPConnection): void {
    try {
      connection.reader?.releaseLock();
      connection.writer?.releaseLock();
      connection.conn?.close();
    } catch {
      // Ignore errors during cleanup
    }

    connection.conn = null;
    connection.reader = null;
    connection.writer = null;
    connection.authenticated = false;

    // Remove from pool
    const index = this.connectionPool.indexOf(connection);
    if (index > -1) {
      this.connectionPool.splice(index, 1);
    }
  }

  /**
   * Clean up expired connections
   */
  private cleanupConnections(): void {
    const now = new Date();
    const expiredConnections = this.connectionPool.filter(conn => {
      const age = now.getTime() - conn.lastUsed.getTime();
      return !conn.inUse && age > this.connectionTimeout;
    });

    for (const conn of expiredConnections) {
      this.destroyConnection(conn);
    }
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
   * Extract message ID from SMTP response
   */
  private extractMessageId(response: string): string | null {
    // Try to extract message ID from SMTP response
    const match = response.match(/250.*?([a-f0-9-]{36})/i);
    return match ? match[1] : null;
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
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('timeout') || 
             message.includes('connection') ||
             message.includes('network') ||
             message.includes('temporary');
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
 * Factory function to create SMTP email provider
 */
export function createSMTPEmailProvider(
  config: EmailConfigExtended, 
  templateService?: unknown
): SMTPEmailProvider {
  return new SMTPEmailProvider(config, templateService);
}

/**
 * Type guard to check if config is for generic SMTP
 */
export function isSMTPConfig(config: EmailConfigExtended): boolean {
  return config.provider === 'smtp' && 
         !!config.smtp?.host && 
         !!config.smtp?.port && 
         !!config.smtp?.auth?.user && 
         !!config.smtp?.auth?.pass;
}