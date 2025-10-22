# SimplyCaster Production Dockerfile
FROM denoland/deno:1.46.3

# Set working directory
WORKDIR /app

# Copy dependency files
COPY deno.json deno.lock* ./

# Cache dependencies
RUN deno cache --reload deno.json

# Copy source code
COPY . .

# Build the application
RUN deno task build

# Create uploads directory
RUN mkdir -p uploads

# Create non-root user
RUN groupadd -r simplycast && useradd -r -g simplycast simplycast
RUN chown -R simplycast:simplycast /app
USER simplycast

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD deno run --allow-net --allow-env health-check.ts

# Start the application
CMD ["deno", "task", "start"]