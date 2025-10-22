# SimplyCaster Dockerfile
FROM denoland/deno:1.37.0

# Set working directory
WORKDIR /app

# Copy dependency files
COPY deno.json deno.lock ./

# Cache dependencies
RUN deno cache --lock=deno.lock deno.json

# Copy source code
COPY . .

# Build the application
RUN deno task build

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD deno run --allow-net --allow-env healthcheck.ts

# Start the application
CMD ["deno", "task", "start"]