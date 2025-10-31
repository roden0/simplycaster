/**
 * Tests for StructuredLogger
 */

import { assertEquals, assertExists, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { 
  StructuredLogger, 
  createLogger, 
  configureLogger, 
  initializeLogger,
  type LogLevel,
  type LogContext,
  type LoggerConfig 
} from "./structured-logger.ts";

// Mock console.log to capture output
let capturedLogs: string[] = [];
const originalConsoleLog = console.log;

function mockConsoleLog() {
  capturedLogs = [];
  console.log = (message: string) => {
    capturedLogs.push(message);
  };
}

function restoreConsoleLog() {
  console.log = originalConsoleLog;
}

Deno.test("StructuredLogger - Basic logging functionality", () => {
  mockConsoleLog();
  
  try {
    const logger = new StructuredLogger({
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      environment: 'test',
      level: 'debug',
      enableStructured: true,
      enableConsole: false,
    });

    logger.info('Test message');
    
    assertEquals(capturedLogs.length, 1);
    const logEntry = JSON.parse(capturedLogs[0]);
    
    assertEquals(logEntry.level, 'info');
    assertEquals(logEntry.message, 'Test message');
    assertEquals(logEntry.service, 'test-service');
    assertEquals(logEntry.version, '1.0.0');
    assertEquals(logEntry.environment, 'test');
    assertExists(logEntry.timestamp);
  } finally {
    restoreConsoleLog();
  }
});

Deno.test("StructuredLogger - Log levels filtering", () => {
  mockConsoleLog();
  
  try {
    const logger = new StructuredLogger({
      level: 'warn',
      enableStructured: true,
    });

    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warning message');
    logger.error('Error message');
    
    // Only warn and error should be logged
    assertEquals(capturedLogs.length, 2);
    
    const warnEntry = JSON.parse(capturedLogs[0]);
    const errorEntry = JSON.parse(capturedLogs[1]);
    
    assertEquals(warnEntry.level, 'warn');
    assertEquals(warnEntry.message, 'Warning message');
    assertEquals(errorEntry.level, 'error');
    assertEquals(errorEntry.message, 'Error message');
  } finally {
    restoreConsoleLog();
  }
});

Deno.test("StructuredLogger - Context propagation", () => {
  mockConsoleLog();
  
  try {
    const logger = new StructuredLogger({
      enableStructured: true,
    });

    const context: LogContext = {
      userId: 'user123',
      roomId: 'room456',
      operation: 'test-operation',
      component: 'test-component',
    };

    logger.info('Test with context', context);
    
    assertEquals(capturedLogs.length, 1);
    const logEntry = JSON.parse(capturedLogs[0]);
    
    assertEquals(logEntry.userId, 'user123');
    assertEquals(logEntry.roomId, 'room456');
    assertEquals(logEntry.operation, 'test-operation');
    assertEquals(logEntry.component, 'test-component');
  } finally {
    restoreConsoleLog();
  }
});

Deno.test("StructuredLogger - Error logging with stack trace", () => {
  mockConsoleLog();
  
  try {
    const logger = new StructuredLogger({
      enableStructured: true,
    });

    const testError = new Error('Test error message');
    logger.error('Error occurred', testError);
    
    assertEquals(capturedLogs.length, 1);
    const logEntry = JSON.parse(capturedLogs[0]);
    
    assertEquals(logEntry.level, 'error');
    assertEquals(logEntry.message, 'Error occurred');
    assertExists(logEntry.error);
    assertEquals(logEntry.error.name, 'Error');
    assertEquals(logEntry.error.message, 'Test error message');
    assertExists(logEntry.error.stack);
  } finally {
    restoreConsoleLog();
  }
});

Deno.test("StructuredLogger - Child logger with inherited context", () => {
  mockConsoleLog();
  
  try {
    const parentLogger = new StructuredLogger({
      enableStructured: true,
    }, {
      component: 'parent-component',
      userId: 'user123',
    });

    const childLogger = parentLogger.child({
      operation: 'child-operation',
      roomId: 'room456',
    });

    childLogger.info('Child logger message');
    
    assertEquals(capturedLogs.length, 1);
    const logEntry = JSON.parse(capturedLogs[0]);
    
    // Should inherit parent context
    assertEquals(logEntry.component, 'parent-component');
    assertEquals(logEntry.userId, 'user123');
    // Should have child context
    assertEquals(logEntry.operation, 'child-operation');
    assertEquals(logEntry.roomId, 'room456');
  } finally {
    restoreConsoleLog();
  }
});

Deno.test("StructuredLogger - Human-readable format", () => {
  mockConsoleLog();
  
  try {
    const logger = new StructuredLogger({
      enableStructured: false,
      enableConsole: true,
    });

    logger.info('Human readable message', {
      userId: 'user123',
      operation: 'test-op',
    });
    
    assertEquals(capturedLogs.length, 1);
    const logOutput = capturedLogs[0];
    
    assertStringIncludes(logOutput, 'INFO');
    assertStringIncludes(logOutput, 'Human readable message');
    assertStringIncludes(logOutput, 'user:user123');
    assertStringIncludes(logOutput, 'op:test-op');
  } finally {
    restoreConsoleLog();
  }
});

Deno.test("StructuredLogger - Configuration from environment", () => {
  // Set environment variables
  Deno.env.set('OTEL_SERVICE_NAME', 'env-test-service');
  Deno.env.set('OTEL_SERVICE_VERSION', '2.0.0');
  Deno.env.set('OTEL_ENVIRONMENT', 'production');
  Deno.env.set('LOG_LEVEL', 'warn');
  
  try {
    initializeLogger();
    const logger = createLogger();
    
    mockConsoleLog();
    
    logger.info('This should not be logged');
    logger.warn('This should be logged');
    
    assertEquals(capturedLogs.length, 1);
    const logEntry = JSON.parse(capturedLogs[0]);
    
    assertEquals(logEntry.service, 'env-test-service');
    assertEquals(logEntry.version, '2.0.0');
    assertEquals(logEntry.environment, 'production');
    assertEquals(logEntry.level, 'warn');
  } finally {
    restoreConsoleLog();
    // Clean up environment variables
    Deno.env.delete('OTEL_SERVICE_NAME');
    Deno.env.delete('OTEL_SERVICE_VERSION');
    Deno.env.delete('OTEL_ENVIRONMENT');
    Deno.env.delete('LOG_LEVEL');
  }
});

Deno.test("StructuredLogger - Global logger configuration", () => {
  mockConsoleLog();
  
  try {
    const customConfig: Partial<LoggerConfig> = {
      serviceName: 'global-test',
      level: 'error',
    };
    
    configureLogger(customConfig);
    const logger = createLogger();
    
    logger.info('Should not log');
    logger.error('Should log');
    
    assertEquals(capturedLogs.length, 1);
    const logEntry = JSON.parse(capturedLogs[0]);
    
    assertEquals(logEntry.service, 'global-test');
    assertEquals(logEntry.level, 'error');
  } finally {
    restoreConsoleLog();
    // Reset to defaults
    configureLogger({
      serviceName: 'simplycast',
      level: 'info',
    });
  }
});

Deno.test("StructuredLogger - Metadata handling", () => {
  mockConsoleLog();
  
  try {
    const logger = new StructuredLogger({
      enableStructured: true,
    });

    const metadata = {
      requestId: 'req-123',
      duration: 150,
      statusCode: 200,
      nested: {
        key: 'value',
        array: [1, 2, 3],
      },
    };

    logger.info('Request completed', { metadata });
    
    assertEquals(capturedLogs.length, 1);
    const logEntry = JSON.parse(capturedLogs[0]);
    
    assertExists(logEntry.metadata);
    assertEquals(logEntry.metadata.requestId, 'req-123');
    assertEquals(logEntry.metadata.duration, 150);
    assertEquals(logEntry.metadata.statusCode, 200);
    assertEquals(logEntry.metadata.nested.key, 'value');
    assertEquals(logEntry.metadata.nested.array, [1, 2, 3]);
  } finally {
    restoreConsoleLog();
  }
});