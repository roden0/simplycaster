# Custom Coturn Docker image for SimplyCaster
FROM coturn/coturn:4.6.2-alpine

# Install additional tools for debugging (optional)
RUN apk add --no-cache \
    curl \
    netcat-openbsd

# Create coturn user and group
RUN addgroup -g 1000 turnserver && \
    adduser -D -u 1000 -G turnserver turnserver

# Create necessary directories
RUN mkdir -p /var/log/coturn /var/run && \
    chown -R turnserver:turnserver /var/log/coturn /var/run

# Copy configuration file
COPY turnserver.conf /etc/coturn/turnserver.conf
RUN chown turnserver:turnserver /etc/coturn/turnserver.conf

# Create entrypoint script
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && \
    chown turnserver:turnserver /usr/local/bin/entrypoint.sh

# Switch to non-root user
USER turnserver

# Expose ports
EXPOSE 3478/udp 3478/tcp 5349/tcp 5349/udp
EXPOSE 49152-49252/udp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD nc -zu localhost 3478 || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["turnserver"]