# SimplyCaster: one image with the Coordinator binary and the client it serves.

FROM node:24-slim AS client
WORKDIR /src/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM rust:1.94-slim-trixie AS coordinator
WORKDIR /src/coordinator
COPY coordinator/ ./
RUN cargo build --release --locked

FROM debian:trixie-slim
# FFmpeg for the FLAC delivery conversion (CU10, ADR-0001); it brings the soxr resampler.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY --from=coordinator /src/coordinator/target/release/coordinator /usr/local/bin/coordinator
COPY --from=client /src/client/dist /app/client
ENV BIND=0.0.0.0 \
    PORT=3000 \
    CLIENT_DIST=/app/client \
    DATA_DIR=/data
# Mount persistent storage here, or Tracks are lost on every redeploy.
VOLUME /data
EXPOSE 3000
# Live conversation (ADR-0005): STUN/TURN and its relays. Publish them with the same numbers
# outside (e.g. 49160-49199:49160-49199/udp): the Coordinator tells browsers these ports.
EXPOSE 3478/udp 49160-49199/udp
CMD ["coordinator"]
