import { App, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";
import { checkDatabaseHealth, db } from "./database/connection.ts";
import { initializeContainer } from "./lib/container/registry.ts";

export const app = new App<State>();

// Initialize dependency injection container
console.log("🔧 Initializing dependency injection container...");
const container = initializeContainer(db);
console.log("✅ Dependency injection container initialized");

// Make container available globally for routes
(globalThis as any).serviceContainer = container;

// Database health check middleware
app.use(async (ctx) => {
  // Skip health check for the health endpoint itself
  if (ctx.url.pathname === "/api/health") {
    return await ctx.next();
  }
  
  // Check database connectivity on startup
  const isHealthy = await checkDatabaseHealth();
  if (!isHealthy) {
    console.warn("⚠️ Database connection is not healthy");
  }
  
  return await ctx.next();
});

app.use(staticFiles());

// Pass a shared value from a middleware
app.use(async (ctx) => {
  ctx.state.shared = "hello";
  return await ctx.next();
});

// this is the same as the /api/:name route defined via a file. feel free to delete this!
app.get("/api2/:name", (ctx) => {
  const name = ctx.params.name;
  return new Response(
    `Hello, ${name.charAt(0).toUpperCase() + name.slice(1)}!`,
  );
});

// this can also be defined via a file. feel free to delete this!
const exampleLoggerMiddleware = define.middleware((ctx) => {
  console.log(`${ctx.req.method} ${ctx.req.url}`);
  return ctx.next();
});
app.use(exampleLoggerMiddleware);

// Include file-system based routes here
app.fsRoutes();
