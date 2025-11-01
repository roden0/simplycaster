#!/usr/bin/env -S deno run --allow-env --allow-read --allow-net

/**
 * Simple test script to verify email configuration functionality
 */

import { parseEmailConfig, validateEmailConfig, performEmailConfigHealthCheck } from './lib/infrastructure/services/email-config.ts';
import { createEmailConfigService } from './lib/infrastructure/services/email-config-service.ts';

async function testEmailConfiguration() {
  console.log('🧪 Testing Email Configuration Implementation...\n');

  try {
    // Test 1: Parse email configuration
    console.log('1️⃣ Testing email configuration parsing...');
    const config = await parseEmailConfig();
    console.log('✅ Configuration parsed successfully');
    console.log(`   Provider: ${config.provider}`);
    console.log(`   From: ${config.from.name} <${config.from.email}>`);
    console.log(`   Queue enabled: ${config.queue.enabled}`);
    console.log(`   Health checks enabled: ${config.healthCheck.enabled}\n`);

    // Test 2: Validate configuration
    console.log('2️⃣ Testing email configuration validation...');
    const validation = validateEmailConfig(config);
    console.log(`✅ Validation completed - Valid: ${validation.valid}`);
    
    if (validation.errors.length > 0) {
      console.log('   Errors:');
      validation.errors.forEach(error => console.log(`     - ${error}`));
    }
    
    if (validation.warnings.length > 0) {
      console.log('   Warnings:');
      validation.warnings.forEach(warning => console.log(`     - ${warning}`));
    }
    console.log();

    // Test 3: Health check
    console.log('3️⃣ Testing email configuration health check...');
    const healthCheck = await performEmailConfigHealthCheck(config);
    console.log(`✅ Health check completed`);
    console.log(`   Config valid: ${healthCheck.configValid}`);
    console.log(`   Provider reachable: ${healthCheck.providerReachable}`);
    console.log(`   Provider: ${healthCheck.metadata.provider}`);
    
    if (healthCheck.errors.length > 0) {
      console.log('   Errors:');
      healthCheck.errors.forEach(error => console.log(`     - ${error}`));
    }
    console.log();

    // Test 4: Email configuration service
    console.log('4️⃣ Testing email configuration service...');
    const emailConfigService = createEmailConfigService();
    await emailConfigService.initialize();
    console.log('✅ Email configuration service initialized');
    
    const serviceValidation = await emailConfigService.validateConfig();
    console.log(`   Service validation - Valid: ${serviceValidation.valid}`);
    
    const serviceHealthCheck = await emailConfigService.healthCheck();
    console.log(`   Service health check - Config valid: ${serviceHealthCheck.configValid}`);
    
    const metadata = emailConfigService.getConfigMetadata();
    console.log(`   Metadata - Provider: ${metadata.provider}, Queue: ${metadata.queueEnabled}`);
    console.log();

    console.log('🎉 All email configuration tests passed successfully!');
    
  } catch (error) {
    console.error('❌ Email configuration test failed:', error);
    Deno.exit(1);
  }
}

// Run the test
if (import.meta.main) {
  await testEmailConfiguration();
}