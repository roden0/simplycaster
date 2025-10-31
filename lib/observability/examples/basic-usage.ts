/**
 * Basic usage example for the ObservabilityService
 * 
 * This example demonstrates how to:
 * - Initialize the observability service
 * - Create spans and record metrics
 * - Use decorators for automatic instrumentation
 * - Handle graceful shutdown
 */

import {
  initializeObservability,
  createSpan,
  startActiveSpan,
  recordCounter,
  recordHistogram,
  getObservabilityHealth,
  shutdownObservability,
  traced as _traced,
  metered as _metered,
  addCommonAttributes,
  SpanStatusCode,
} from "../index.ts";

// ============================================================================
// BASIC USAGE EXAMPLE
// ============================================================================

async function basicUsageExample() {
  console.log("=== Basic Observability Usage Example ===\n");

  // 1. Initialize the observability service
  console.log("1. Initializing observability service...");
  await initializeObservability();
  
  // Check health status
  const health = getObservabilityHealth();
  console.log("Service health:", {
    healthy: health.healthy,
    initialized: health.initialized,
    uptime: `${health.uptime}ms`,
  });

  // 2. Create and use spans manually
  console.log("\n2. Creating spans manually...");
  
  const span = createSpan('example-operation', {
    attributes: {
      'operation.type': 'example',
      'user.id': 'user-123',
    },
  });
  
  // Add more attributes
  addCommonAttributes(span, {
    userId: 'user-123',
    operation: 'basic-example',
    component: 'example-service',
  });
  
  // Simulate some work
  await new Promise(resolve => setTimeout(resolve, 100));
  
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();

  // 3. Use active spans with callback
  console.log("\n3. Using active spans with callback...");
  
  const result = startActiveSpan('database-query', (span) => {
    span.setAttributes({
      'db.operation': 'SELECT',
      'db.table': 'users',
    });
    
    // Simulate database query
    const queryResult = { id: 'user-123', name: 'John Doe' };
    
    span.setAttributes({
      'db.rows_affected': 1,
    });
    
    return queryResult;
  });
  
  console.log("Query result:", result);

  // 4. Record metrics
  console.log("\n4. Recording metrics...");
  
  recordCounter('requests_total', 1, {
    attributes: {
      method: 'GET',
      endpoint: '/api/users',
      status: '200',
    },
  });
  
  recordHistogram('request_duration_ms', 150, {
    attributes: {
      method: 'GET',
      endpoint: '/api/users',
    },
  });

  // 5. Handle errors with spans
  console.log("\n5. Handling errors with spans...");
  
  try {
    startActiveSpan('error-prone-operation', (span) => {
      span.setAttributes({
        'operation.type': 'risky',
      });
      
      // Simulate an error
      throw new Error('Something went wrong!');
    });
  } catch (error) {
    console.log("Caught expected error:", error instanceof Error ? error.message : String(error));
  }

  // 6. Graceful shutdown
  console.log("\n6. Shutting down observability service...");
  await shutdownObservability();
  
  console.log("\n=== Example completed ===");
}

// ============================================================================
// SERVICE USAGE EXAMPLE
// ============================================================================

class ExampleService {
  async processData(data: string): Promise<string> {
    return await startActiveSpan('ExampleService.processData', async (span) => {
      span.setAttributes({
        'method.class': 'ExampleService',
        'method.name': 'processData',
        'input.data': data,
      });
      
      recordCounter('example_service_process_data_total', 1, {
        attributes: {
          method: 'ExampleService.processData',
          status: 'started',
        },
      });
      
      const startTime = Date.now();
      
      try {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 50));
        
        if (data === 'error') {
          throw new Error('Processing failed');
        }
        
        const result = `Processed: ${data}`;
        
        recordCounter('example_service_process_data_total', 1, {
          attributes: {
            method: 'ExampleService.processData',
            status: 'success',
          },
        });
        
        recordHistogram('example_service_process_data_duration_ms', Date.now() - startTime, {
          attributes: {
            method: 'ExampleService.processData',
          },
        });
        
        return result;
      } catch (error) {
        recordCounter('example_service_process_data_total', 1, {
          attributes: {
            method: 'ExampleService.processData',
            status: 'error',
            error_type: error instanceof Error ? error.constructor.name : 'unknown',
          },
        });
        
        throw error;
      }
    });
  }
  
  calculateSum(a: number, b: number): number {
    return startActiveSpan('ExampleService.calculateSum', (span) => {
      span.setAttributes({
        'method.class': 'ExampleService',
        'method.name': 'calculateSum',
        'input.a': a,
        'input.b': b,
      });
      
      const result = a + b;
      
      span.setAttributes({
        'output.result': result,
      });
      
      recordCounter('example_service_calculate_sum_total', 1, {
        attributes: {
          method: 'ExampleService.calculateSum',
          status: 'success',
        },
      });
      
      return result;
    });
  }
}

async function serviceUsageExample() {
  console.log("\n=== Service Usage Example ===\n");
  
  await initializeObservability();
  
  const service = new ExampleService();
  
  // Test successful operations
  console.log("1. Testing successful operations...");
  const result1 = await service.processData('test-data');
  console.log("Process result:", result1);
  
  const result2 = service.calculateSum(5, 3);
  console.log("Sum result:", result2);
  
  // Test error handling
  console.log("\n2. Testing error handling...");
  try {
    await service.processData('error');
  } catch (error) {
    console.log("Caught expected error:", error instanceof Error ? error.message : String(error));
  }
  
  await shutdownObservability();
  console.log("\n=== Service example completed ===");
}

// ============================================================================
// NESTED SPANS EXAMPLE
// ============================================================================

async function nestedSpansExample() {
  console.log("\n=== Nested Spans Example ===\n");
  
  await initializeObservability();
  
  startActiveSpan('parent-operation', async (parentSpan) => {
    parentSpan.setAttributes({
      'operation.type': 'parent',
      'user.id': 'user-456',
    });
    
    // Child operation 1
    await startActiveSpan('child-operation-1', async (childSpan1) => {
      childSpan1.setAttributes({
        'operation.type': 'child',
        'child.index': 1,
      });
      
      await new Promise(resolve => setTimeout(resolve, 30));
      
      // Grandchild operation
      startActiveSpan('grandchild-operation', (grandchildSpan) => {
        grandchildSpan.setAttributes({
          'operation.type': 'grandchild',
        });
        
        return 'grandchild-result';
      });
    });
    
    // Child operation 2
    await startActiveSpan('child-operation-2', async (childSpan2) => {
      childSpan2.setAttributes({
        'operation.type': 'child',
        'child.index': 2,
      });
      
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    
    return 'parent-result';
  });
  
  await shutdownObservability();
  console.log("\n=== Nested spans example completed ===");
}

// ============================================================================
// RUN EXAMPLES
// ============================================================================

if (import.meta.main) {
  try {
    await basicUsageExample();
    await serviceUsageExample();
    await nestedSpansExample();
  } catch (error) {
    console.error("Example failed:", error);
    Deno.exit(1);
  }
}