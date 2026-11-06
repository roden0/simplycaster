# SimplyCaster

A self-hosted studio for recording remote conversations (podcasts, interviews) with studio quality: every Participant records their own voice in their own browser, so a bad connection never ends up in the recording.

Video-call recordings capture what the network delivered: dropouts, compression and robotic voices. SimplyCaster records each voice locally instead (a "double-ender"), uploads it to your server while you talk, and hands you one clean, synchronised Track per person, ready to edit in your usual audio software.

## How it works

- **Rooms of up to 5 Participants.** The Host creates a Room in the backoffice and gets one Invitation link per Guest. Nobody installs anything: they open the link in Chrome, Firefox or Safari 26+.
- **Live conversation.** Participants hear each other in real time over WebRTC, through a TURN server built into the Coordinator.
- **Local recording.** Each browser records its microphone (Opus, in Ogg) and keeps it in the browser's own storage until it is safely on the server.
- **Progressive, resumable upload.** Audio goes up while you record; if the connection drops, it resumes where it stopped.
- **Synchronised Tracks.** The Coordinator gives every browser a reference clock, so the Tracks of a Take line up. Clock drift is corrected when converting.
- **Delivery.** Download the original Ogg files, or 24-bit FLAC with drift correction, for a closed Room.

The server (the *Coordinator*, one Rust binary) only coordinates connections, keeps the reference clock and stores the audio. It never processes audio during recording. Editing and mixing happen outside, in professional software.

> **Status:** early prototype (0.x). It works end to end, but expect breaking changes between minor versions.

## Run your own instance

You need:

- A Linux server with a public IPv4 address and [Docker](https://docs.docker.com/engine/install/) with Compose.
- A domain whose DNS points to the server. Browsers only record over HTTPS; Caddy gets the certificate automatically.
- Open ports: TCP 80 and 443 (web), UDP 3478 and 49160-49199 (live conversation).

```sh
mkdir simplycaster && cd simplycaster
curl -fsSLO https://raw.githubusercontent.com/roden0/simplycaster/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/roden0/simplycaster/main/.env.example -o .env
# Fill in DOMAIN, BACKOFFICE_TOKEN, TURN_PUBLIC_IP and RESTIC_PASSWORD
nano .env
docker compose up -d
```

Then open `https://<DOMAIN>/backoffice/<BACKOFFICE_TOKEN>`, create a Room and send each Participant their link. Keep that backoffice link secret: whoever has it can create Rooms and download every recording.

Recordings live in `./data`, one folder per Room with its Tracks and a `room.json`.

**Already running a reverse proxy** (Traefik, nginx, Coolify)? Remove the `caddy` service, publish `127.0.0.1:3000:3000` on `simplycaster`, and point your proxy at it. It must pass WebSockets through.

## Backups

The `backup` service makes a daily, encrypted, deduplicated [restic](https://restic.net) snapshot of `./data`, and keeps 7 daily, 4 weekly and 6 monthly ones.

- **Default:** into `./backups` on the same server. Easy, but it does not survive losing the server.
- **Off-site (recommended):** set `RESTIC_REPOSITORY` in `.env` to any [restic repository](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html), such as S3, Backblaze B2 or a REST server, plus its credentials. `.env.example` has examples.
- **Your own tool:** remove the `backup` service and back up `./data` however you like.

Keep `RESTIC_PASSWORD` somewhere other than the server: without it, the backups cannot be restored.

```sh
docker compose run --rm --entrypoint restic backup snapshots   # list backups
docker compose stop simplycaster
docker compose run --rm --entrypoint restic backup restore latest --target /
docker compose start simplycaster
```

## Upgrading

Versions follow [SemVer](https://semver.org) and are published as images `ghcr.io/roden0/simplycaster:X.Y.Z`. Read the [release notes](https://github.com/roden0/simplycaster/releases) first; while we are on 0.x, a minor version can break things. Then change the image tag in `docker-compose.yml` and run:

```sh
docker compose up -d
```

Avoid `latest`: pin a version and upgrade when you choose to.

## Configuration

| Variable | Default | |
|---|---|---|
| `BACKOFFICE_TOKEN` | (required) | Secret part of the backoffice URL. |
| `TURN_PUBLIC_IP` | empty | Public IPv4 for TURN. Empty: only direct connections. |
| `TURN_PORT` | `3478` | STUN/TURN UDP port. |
| `TURN_RELAY_PORTS` | `49160-49199` | UDP relay range. |
| `DOMAIN` | (required) | Used by Caddy for HTTPS. |
| `RESTIC_REPOSITORY`, `RESTIC_PASSWORD` | `/backups`, (required) | Backups, see above. |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security issue, see [SECURITY.md](SECURITY.md).

## License

[GNU Affero General Public License v3.0](LICENSE). If you run a modified version as a service for others, you must offer them its source code.
