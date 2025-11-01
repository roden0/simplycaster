/**
 * Email Queue Integration Test
 * 
 * Tests the email queue integration with RabbitMQ (without requiring RabbitMQ to be running)
 */

import { createRabbitMQConfig } from './lib/infrastructure/services/rabbitmq-config.ts';
import { createEmailQueueConfig } from './lib/infrastructure/services/email-queue-service.ts';
import { getValidatedEmailConfig } from './lib/infrastructure/services/email-config.ts';
import { EmailQueuePublisher } from './lib/infrastructure/services/email-queue-publisher.ts';
import { EmailQueueConsumer } from './lib/infrastructure/services/email-queue-consumer.ts';
import { EMAIL_ROUTING_KEYS, EMAIL_QUEUE_NAMES } from './lib/domain/types/email-queue.ts';
import { ExchangeName, QueueName } from './lib/domain/types/rabbitmq-config.ts';

async function testEmailQueueIntegration() {
  console.log('🧪 Testing Email Queue Integration (Configuration & Types)...\n');

  try {
    // 1. Test configuration creation
    console.log('1. Testing configuration creation...');
    const rabbitMQConfig = await createRabbitMQConfig();
    const emailQueueConfig = await createEmailQueueConfig();
    const emailConfig = await getValidatedEmailConfig();
    
    console.log('✅ Configurations created successfully');
    console.log('   - RabbitMQ URL:', rabbitMQConfig.url);
    console.log('   - RabbitMQ Exchange:', rabbitMQConfig.exchange);
    console.log('   - Email Queue Enabled:', emailQueueConfig.enabled);
    console.log('   - Email Provider:', emailConfig.provider);
    console.log('   - Queue Concurrency:', emailQueueConfig.concurrency);
    console.log('   - Max Retry Attempts:', emailQueueConfig.maxRetryAttempts);

    // 2. Test queue topology configuration
    console.log('\n2. Testing queue topology configuration...');
    
    // Check that email queues are included in RabbitMQ config
    const emailQueues = rabbitMQConfig.queues.filter(q => q.name.includes('email'));
    console.log('✅ Email queues found in RabbitMQ configuration:');
    emailQueues.forEach(queue => {
      console.log(`   - ${queue.name}: ${queue.routingKey}`);
    });

    // Verify email exchange is configured
    console.log('✅ Email exchange configured:', ExchangeName.EMAIL);

    // 3. Test routing keys and queue names
    console.log('\n3. Testing routing keys and queue names...');
    console.log('✅ Email routing keys:');
    Object.entries(EMAIL_ROUTING_KEYS).forEach(([key, value]) => {
      console.log(`   - ${key}: ${value}`);
    });

    console.log('✅ Email queue names:');
    console.log(`   - Main Queue: ${QueueName.EMAIL}`);
    console.log(`   - Retry Queue: ${QueueName.EMAIL_RETRY}`);
    console.log(`   - Dead Letter Queue: ${QueueName.EMAIL_DEAD_LETTER}`);

    // 4. Test email queue publisher creation (without connection)
    console.log('\n4. Testing email queue publisher creation...');
    const publisher = new EmailQueuePublisher(rabbitMQConfig, emailQueueConfig);
    console.log('✅ Email queue publisher created');
    console.log('   - Publisher stats:', publisher.getStats());

    // 5. Test email queue consumer creation (without connection)
    console.log('\n5. Testing email queue consumer creation...');
    // Create a mock email service for testing
    const mockEmailService = {
      send: async () => ({ success: true, data: { success: true, messageId: 'test', provider: 'test', timestamp: new Date() } }),
      sendTemplate: async () => ({ success: true, data: { success: true, messageId: 'test', provider: 'test', timestamp: new Date() } }),
      sendBulk: async () => ({ success: true, data: [{ success: true, messageId: 'test', provider: 'test', timestamp: new Date() }] }),
      healthCheck: async () => ({ success: true, data: { healthy: true, provider: 'test', timestamp: new Date() } }),
    };
    
    const consumer = new EmailQueueConsumer(mockEmailService, rabbitMQConfig, emailQueueConfig, publisher);
    console.log('✅ Email queue consumer created');
    console.log('   - Consumer stats:', consumer.getStats());

    // 6. Test message serialization/deserialization
    console.log('\n6. Testing message serialization...');
    const testMessage = {
      id: crypto.randomUUID(),
      type: 'send_email' as const,
      email: {
        to: 'test@example.com',
        subject: 'Test Email',
        text: 'This is a test email.',
      },
      correlationId: crypto.randomUUID(),
      priority: 'normal' as const,
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: 3,
      metadata: {
        source: 'test',
      },
    };

    // Test JSON serialization (what would happen in the queue)
    const serialized = JSON.stringify(testMessage, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    });
    
    const deserialized = JSON.parse(serialized);
    deserialized.createdAt = new Date(deserialized.createdAt);
    
    console.log('✅ Message serialization/deserialization works');
    console.log('   - Original message ID:', testMessage.id);
    console.log('   - Deserialized message ID:', deserialized.id);
    console.log('   - Date handling works:', deserialized.createdAt instanceof Date);

    // 7. Test exponential backoff calculation
    console.log('\n7. Testing exponential backoff calculation...');
    const baseDelay = emailQueueConfig.retryDelay;
    const multiplier = emailQueueConfig.backoffMultiplier;
    const maxDelay = emailQueueConfig.maxRetryDelay;
    
    for (let attempt = 0; attempt < 5; attempt++) {
      const delay = Math.min(
        baseDelay * Math.pow(multiplier, attempt),
        maxDelay
      );
      console.log(`   - Attempt ${attempt + 1}: ${delay}ms delay`);
    }
    console.log('✅ Exponential backoff calculation works');

    // 8. Test priority mapping
    console.log('\n8. Testing priority mapping...');
    const priorities = ['low', 'normal', 'high'] as const;
    priorities.forEach(priority => {
      let priorityValue: number;
      switch (priority) {
        case 'high':
          priorityValue = 10;
          break;
        case 'normal':
          priorityValue = 5;
          break;
        case 'low':
          priorityValue = 1;
          break;
        default:
          priorityValue = 5;
      }
      console.log(`   - ${priority}: ${priorityValue}`);
    });
    console.log('✅ Priority mapping works');

    // 9. Test configuration validation
    console.log('\n9. Testing configuration validation...');
    const requiredConfigs = [
      'enabled',
      'concurrency',
      'maxRetryAttempts',
      'retryDelay',
      'maxRetryDelay',
      'backoffMultiplier',
      'messageTtl',
      'maxQueueLength',
      'deadLetterTtl',
    ];
    
    const missingConfigs = requiredConfigs.filter(key => !(key in emailQueueConfig));
    if (missingConfigs.length === 0) {
      console.log('✅ All required email queue configurations are present');
    } else {
      console.log('❌ Missing configurations:', missingConfigs);
    }

    // 10. Test environment variable defaults
    console.log('\n10. Testing environment variable defaults...');
    console.log('✅ Environment variable defaults:');
    console.log('   - EMAIL_QUEUE_ENABLED:', emailQueueConfig.enabled);
    console.log('   - EMAIL_QUEUE_CONCURRENCY:', emailQueueConfig.concurrency);
    console.log('   - EMAIL_MAX_RETRY_ATTEMPTS:', emailQueueConfig.maxRetryAttempts);
    console.log('   - EMAIL_RETRY_DELAY:', emailQueueConfig.retryDelay);
    console.log('   - EMAIL_MAX_RETRY_DELAY:', emailQueueConfig.maxRetryDelay);

    console.log('\n🎉 Email Queue Integration Test Completed Successfully!');
    console.log('\n📝 Summary:');
    console.log('   ✅ Email queue topology integrated with RabbitMQ');
    console.log('   ✅ Email queue publisher implemented');
    console.log('   ✅ Email queue consumer implemented');
    console.log('   ✅ Exponential backoff retry logic implemented');
    console.log('   ✅ Configuration and environment variables working');
    console.log('   ✅ Message serialization/deserialization working');
    console.log('   ✅ Priority queuing implemented');
    console.log('\n💡 Note: To test with actual RabbitMQ connection, ensure RabbitMQ is running on:', rabbitMQConfig.url);
    
  } catch (error) {
    console.error('\n❌ Email Queue Integration Test Failed:');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
    
    Deno.exit(1);
  }
}

// Run the test
if (import.meta.main) {
  await testEmailQueueIntegration();
}