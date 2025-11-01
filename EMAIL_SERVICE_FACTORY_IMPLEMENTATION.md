# Email Service Factory Implementation

This document describes the implementation of the enhanced email service factory with provider selection, fallback support, and application startup initialization.

## Overview

The email service factory provides a comprehensive solution for creating and managing email services with:

- **Provider Selection**: Automatic selection of email providers based on environment configuration
- **Fallback Support**: High availability through multiple fallback providers
- **Health Monitoring**: Continuous health checks with automatic failover
- **Application Startup**: Seamless integration with application initialization
- **Configuration Validation**: Comprehensive validation of email configurations

## Architecture

### Core Components

1. **EmailServiceFactory**: Basic factory for creating email services
2. **EnvironmentEmailServiceFactory**: Environment-aware factory with caching
3. **EmailServiceManager**: Manager for handling multiple providers and fallbacks
4. **EmailServiceProviderRegistry**: Registry for custom email providers

### Factory Classes

#### EmailServiceFactory

Basic factory implementation that creates email services based on configuration:

```typescript
const factory = EmailServiceFactory.getInstance();
const emailService = await factory.createEmailService(config, templateService);
```

#### EnvironmentEmailServiceFactory

Enhanced factory that uses environment configuration and provides caching:

```typescript
const factory = EnvironmentEmailServiceFactory.getInstance();
const emailService = await factory.createEmailService(); // Uses environment config
```

#### EmailServiceManager

Manages multiple email providers with automatic failover:

```typescript
const manager = new EmailServiceManager(config);
manager.setPrimaryService(primaryService);
manager.addFallbackService(fallbackService);

// Automatic failover on send
const result = await manager.send(email);
```

## Configuration

### Primary Provider Configuration

Configure the primary email provider using environment variables:

```bash
# MailHog (Development)
EMAIL_PROVIDER=mailhog
EMAIL_SMTP_HOST=mailhog
EMAIL_SMTP_PORT=1025

# SendGrid (Production)
EMAIL_PROVIDER=sendgrid
EMAIL_SENDGRID_API_KEY=SG.your_api_key

# AWS SES (Production)
EMAIL_PROVIDER=ses
EMAIL_SES_REGION=us-east-1
EMAIL_SES_ACCESS_KEY_ID=your_access_key
EMAIL_SES_SECRET_ACCESS_KEY=your_secret_key

# Generic SMTP (Production)
EMAIL_PROVIDER=smtp
EMAIL_SMTP_HOST=smtp.yourdomain.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=true
EMAIL_SMTP_USER=your_user
EMAIL_SMTP_PASS=your_password
```

### Fallback Provider Configuration

Configure fallback providers using JSON format:

```bash
EMAIL_FALLBACK_PROVIDERS='[
  {
    "provider": "ses",
    "priority": 1,
    "config": {
      "ses": {
        "region": "us-east-1",
        "accessKeyId": "fallback_key",
        "secretAccessKey": "fallback_secret"
      }
    }
  },
  {
    "provider": "smtp",
    "priority": 2,
    "config": {
      "smtp": {
        "host": "backup-smtp.yourdomain.com",
        "port": 587,
        "secure": true,
        "auth": {
          "user": "backup_user",
          "pass": "backup_password"
        }
      }
    }
  }
]'
```

### Factory Configuration

```bash
# Factory Settings
EMAIL_USE_ENVIRONMENT_FACTORY=true
EMAIL_ENABLE_AUTO_FAILOVER=true
EMAIL_HEALTH_CHECK_INTERVAL=300000
EMAIL_MAX_FAILOVER_ATTEMPTS=3
```

## Usage

### Basic Usage

```typescript
import { getEmailServiceFactory } from './lib/infrastructure/services/email-service-factory.ts';

// Get factory instance
const factory = getEmailServiceFactory();

// Create email service
const emailService = await factory.createEmailService();

// Send email
const result = await emailService.send({
  to: 'user@example.com',
  subject: 'Test Email',
  text: 'Hello World!'
});
```

### With Fallbacks

```typescript
import { createEmailServiceWithFallbacks } from './lib/infrastructure/services/email-service-factory.ts';

// Create manager with fallbacks
const manager = await createEmailServiceWithFallbacks();

// Send email (automatic failover)
const result = await manager.send(email);

// Check health of all services
const health = await manager.healthCheck();
console.log('Primary healthy:', health.data.primaryHealthy);
console.log('Fallbacks available:', health.data.fallbacksAvailable);
```

### Application Startup

```typescript
import { initializeEmailServicesOnStartup } from './lib/infrastructure/services/email-service-factory.ts';

// Initialize on application startup
const result = await initializeEmailServicesOnStartup({
  validateConfiguration: true,
  performHealthChecks: true,
  enableFallbacks: true,
  logConfiguration: true,
  failOnConfigurationError: false
});

if (result.success) {
  console.log('Email services initialized successfully');
  const manager = result.manager;
}
```

### Container Integration

```typescript
import { Container } from './lib/container/container.ts';
import { initializeCompleteEmailSystem } from './lib/container/registry.ts';

// Initialize container
const container = new Container();

// Initialize complete email system
await initializeCompleteEmailSystem(container);

// Get email service from container
const emailService = await container.get('emailService');
```

## Health Monitoring

### Health Check Features

- **Cached Health Checks**: Results are cached for 30 seconds to avoid excessive checks
- **Provider Connectivity**: Tests actual connectivity to email providers
- **Automatic Failover**: Switches to fallback providers when primary fails
- **Health Statistics**: Provides detailed statistics about service health

### Health Check Example

```typescript
const manager = await createEmailServiceWithFallbacks();

// Get health status
const health = await manager.healthCheck();

console.log('Overall healthy:', health.data.healthy);
console.log('Primary healthy:', health.data.primaryHealthy);
console.log('Fallbacks available:', health.data.fallbacksAvailable);
console.log('Service details:', health.data.services);
```

## Error Handling

### Provider Errors

The factory handles various provider-specific errors:

- **Configuration Errors**: Invalid or missing configuration
- **Connectivity Errors**: Network or authentication failures
- **Provider-Specific Errors**: API rate limits, quota exceeded, etc.

### Fallback Behavior

When the primary provider fails:

1. Health check cache is updated
2. Next available fallback is selected
3. Email is sent through fallback provider
4. Primary provider is retried after cache expiry

### Error Recovery

```typescript
try {
  const result = await manager.send(email);
} catch (error) {
  if (error instanceof EmailProviderError) {
    console.error('Provider error:', error.provider, error.message);
    
    // Check if any services are available
    const health = await manager.healthCheck();
    if (!health.data.healthy) {
      console.error('No email services available');
    }
  }
}
```

## Performance Optimization

### Caching

- **Factory Caching**: Environment factory caches managers for 5 minutes
- **Health Check Caching**: Health results cached for 30 seconds
- **Configuration Caching**: Parsed configurations are cached

### Connection Pooling

- **SMTP Connections**: Reused across multiple emails
- **HTTP Connections**: Persistent connections for API-based providers
- **Resource Management**: Automatic cleanup of unused connections

## Security Considerations

### Credential Management

- **Environment Variables**: Sensitive data stored in environment variables
- **Secret Files**: Support for file-based secrets
- **Credential Rotation**: Easy switching between providers for rotation

### Validation

- **Configuration Validation**: Comprehensive validation of all settings
- **Provider Verification**: Connectivity tests during initialization
- **Input Sanitization**: All email data is validated before sending

## Monitoring and Observability

### Metrics

The factory integrates with the existing observability stack:

- **Email Delivery Rates**: Success/failure rates per provider
- **Health Check Results**: Provider availability metrics
- **Failover Events**: Automatic failover occurrences
- **Performance Metrics**: Response times and throughput

### Logging

Structured logging for all operations:

```typescript
// Health check logging
console.log('Email service health check:', {
  provider: 'sendgrid',
  healthy: true,
  responseTime: 150,
  lastCheck: new Date()
});

// Failover logging
console.warn('Email provider failover:', {
  from: 'sendgrid',
  to: 'ses',
  reason: 'health_check_failed',
  timestamp: new Date()
});
```

## Testing

### Unit Tests

Test individual factory components:

```bash
deno test lib/infrastructure/services/email-service-factory.test.ts
```

### Integration Tests

Test complete email workflows:

```bash
deno run --allow-all test-email-service-factory.ts
```

### Health Check Tests

Verify health monitoring:

```typescript
const manager = await createEmailServiceWithFallbacks();
const health = await manager.healthCheck();
assert(health.success || health.data.fallbacksAvailable > 0);
```

## Deployment

### Development

Use MailHog for development:

```bash
EMAIL_PROVIDER=mailhog
EMAIL_SMTP_HOST=mailhog
EMAIL_SMTP_PORT=1025
```

### Production

Configure primary and fallback providers:

```bash
# Primary: SendGrid
EMAIL_PROVIDER=sendgrid
EMAIL_SENDGRID_API_KEY=SG.production_key

# Fallbacks: SES and SMTP
EMAIL_FALLBACK_PROVIDERS='[...]'
EMAIL_ENABLE_AUTO_FAILOVER=true
```

### High Availability

For maximum availability:

1. Configure multiple fallback providers
2. Enable health check monitoring
3. Set up alerting for provider failures
4. Monitor failover events

## Troubleshooting

### Common Issues

1. **Configuration Validation Errors**
   - Check environment variables
   - Validate JSON format for fallbacks
   - Verify provider-specific settings

2. **Health Check Failures**
   - Check network connectivity
   - Verify provider credentials
   - Review provider status pages

3. **Failover Not Working**
   - Check fallback configuration
   - Verify health check intervals
   - Review error logs

### Debug Mode

Enable debug logging:

```bash
EMAIL_LOG_LEVEL=debug
EMAIL_LOGGING_ENABLED=true
```

### Health Check Debugging

```typescript
const manager = await createEmailServiceWithFallbacks();

// Clear cache to force fresh health checks
manager.clearHealthCheckCache();

// Get detailed health status
const health = await manager.healthCheck();
console.log('Detailed health:', JSON.stringify(health, null, 2));
```

## Requirements Fulfilled

This implementation fulfills the requirements for task 13:

- ✅ **Build email service factory with provider selection logic**: Implemented `EmailServiceFactory` and `EnvironmentEmailServiceFactory`
- ✅ **Implement provider switching based on environment configuration**: Environment-based configuration with automatic provider selection
- ✅ **Add fallback provider support for high availability**: `EmailServiceManager` with automatic failover and health monitoring
- ✅ **Create email service initialization in application startup**: Complete startup initialization functions integrated with container registry

The implementation provides a robust, scalable, and maintainable email service factory that supports multiple providers, automatic failover, and seamless application integration.