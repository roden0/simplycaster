/**
 * Example: Main Application Integration with Distributed Tracing
 * 
 * This example shows how to integrate distributed tracing into the main application
 * with automatic HTTP request tracing and context propagation.
 */

import { App, staticFiles } from "fresh";
import { define, type State } from "../../../utils.ts";
import { checkDatabaseHealth, db } from "../../../database/connection.ts";
import { initializeContainer } from "../../container/registry.ts";

// Import observability services
import { 
  initializeObservability, 
  getObservabilityHealth,
  shutdownObservability 
} from "../observability-service.ts";
import { withTracing, type TracingMiddlewareOptions } from "../../middleware/tracing.ts";

// Extended state interface with tracing context
interface ExtendedState extends State {
  tracing?: {
    requestId: string;
    traceId?: string;
    spanId?: string;
    userId?: string;
  };
}

export const app = new App<ExtendedState>();

// ============================================================================
// OBSERVABILITY INITIALIZATION
// ============================================================================

console.log("🔧 Initializing observability services...");

try {
  // Initialize OpenTelemetry observability
  await initializeObservability();
  
  // Check observability health
  const observabilityHealth = getObservabilityHealth();
  if (observabilityHealth.healthy) {
    console.log("✅ Observability services initialized successfully");
  } else {
    console.warn("⚠️ Observability services initialized with issues:", observabilityHealth.lastError);
  }
} catch (error) {
  console.error("❌ Failed to initialize observability services:", error);
  // Continue without observability rather than failing startup
}

// ============================================================================
// DEPENDENCY INJECTION CONTAINER
// ============================================================================

console.log("🔧 Initializing dependency injection container...");
const container = initializeContainer(db);
console.log("✅ Dependency injection container initialized");

// Make container available globally for routes
(globalThis as any).serviceContainer = container;

// ============================================================================
// GLOBAL TRACING MIDDLEWARE
// ============================================================================

// Configure global tracing options
const GLOBAL_TRACING_OPTIONS: Partial<TracingMiddlewareOptions> = {
  enableRequestTracing: true,
  enableResponseTracing: true,
  includeRequestBody: false, // Disabled by default for security
  includeResponseBody: false, // Disabled by default for performance
  maxBodySize: 1024,
  skipPaths: [
    '/health',
    '/api/health', 
    '/metrics',
    '/favicon.ico',
    '/_fresh',
    '/assets'
  ],
  skipMethods: ['OPTIONS'],
  spanNameGenerator: (req) => {
    const url = new URL(req.url);
    return `${req.method} ${url.pathname}`;
  },
  attributesExtractor: (req, user) => ({
    'http.route': new URL(req.url).pathname,
    'http.query_string': new URL(req.url).search,
    'user.authenticated': user ? 'true' : 'false',
    'user.role': user?.role || 'anonymous',
  }),
};

// Apply global tracing middleware
app.use(withTracing(async (ctx) => {
  // Add tracing context to state for downstream handlers
  if (ctx.state && (ctx as any).tracing) {
    const tracingContext = (ctx as any).tracing;
    ctx.state.tracing = {
      requestId: tracingContext.requestId,
      traceId: tracingContext.traceContext?.traceId,
      spanId: tracingContext.traceContext?.spanId,
      userId: tracingContext.user?.id,
    };
  }
  
  return await ctx.next();
}, GLOBAL_TRACING_OPTIONS));

// ============================================================================
// DATABASE HEALTH CHECK MIDDLEWARE
// ============================================================================

app.use(async (ctx) => {
  // Skip health check for the health endpoint itself and static assets
  const skipPaths = ['/api/health', '/health', '/assets', '/_fresh', '/favicon.ico'];
  if (skipPaths.some(path => ctx.url.pathname.startsWith(path))) {
    return await ctx.next();
  }
  
  // Check database connectivity on startup
  const isHealthy = await checkDatabaseHealth();
  if (!isHealthy) {
    console.warn("⚠️ Database connection is not healthy");
  }
  
  return await ctx.next();
});

// ============================================================================
// STATIC FILES AND SHARED STATE
// ============================================================================

app.use(staticFiles());

// Pass a shared value from a middleware
app.use(async (ctx) => {
  ctx.state.shared = "hello";
  return await ctx.next();
});

// ============================================================================
// EXAMPLE TRACED API ROUTE
// ============================================================================

// Example of a traced API route (this would normally be in routes/api/)
app.get("/api2/:name", withTracing(async (ctx) => {
  const name = ctx.params.name;
  
  // Access tracing context from state
  const tracingContext = ctx.state.tracing;
  console.log(`Processing request for ${name}, trace ID: ${tracingContext?.traceId}`);
  
  return new Response(
    `Hello, ${name.charAt(0).toUpperCase() + name.slice(1)}!`,
    {
      headers: {
        'Content-Type': 'text/plain',
        // Tracing headers are automatically added by the middleware
      }
    }
  );
}, {
  spanNameGenerator: (req) => `GET /api2/:name`,
  attributesExtractor: (req) => ({
    'api.version': '2',
    'api.endpoint': 'greeting',
  }),
}));

// ============================================================================
// EXAMPLE LOGGER MIDDLEWARE WITH TRACING
// ============================================================================

const exampleLoggerMiddleware = define.middleware((ctx) => {
  const tracingContext = ctx.state.tracing;
  const logMessage = `${ctx.req.method} ${ctx.req.url}`;
  
  if (tracingContext?.traceId) {
    console.log(`[${tracingContext.traceId}] ${logMessage}`);
  } else {
    console.log(logMessage);
  }
  
  return ctx.next();
});

app.use(exampleLoggerMiddleware);

// ============================================================================
// FILE-SYSTEM BASED ROUTES
// ============================================================================

// Include file-system based routes here
app.fsRoutes();

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

// Handle graceful shutdown
const shutdown = async () => {
  console.log("🔄 Starting graceful shutdown...");
  
  try {
    // Shutdown observability services
    await shutdownObservability();
    console.log("✅ Observability services shut down");
  } catch (error) {
    console.error("❌ Error shutting down observability services:", error);
  }
  
  console.log("✅ Graceful shutdown completed");
  Deno.exit(0);
};

// Listen for shutdown signals
Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);

// Handle unhandled promise rejections
globalThis.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
  
  // Try to record in observability if available
  try {
    const { recordCounter } = import("../observability-service.ts");
    recordCounter("unhandled_promise_rejections_total", 1, {
      attributes: {
        error_type: event.reason?.constructor?.name || 'unknown',
        error_message: event.reason?.message || String(event.reason),
      },
    });
  } catch {
    // Ignore errors in error reporting
  }
});

// Handle uncaught exceptions
globalThis.addEventListener("error", (event) => {
  console.error("Uncaught exception:", event.error);
  
  // Try to record in observability if available
  try {
    const { recordCounter } = import("../observability-service.ts");
    recordCounter("uncaught_exceptions_total", 1, {
      attributes: {
        error_type: event.error?.constructor?.name || 'unknown',
        error_message: event.error?.message || String(event.error),
        filename: event.filename || '',
        lineno: event.lineno || 0,
        colno: event.colno || 0,
      },
    });
  } catch {
    // Ignore errors in error reporting
  }
});

export { app };