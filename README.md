# SimplyCaster

A self-hosted studio for recording remote conversations (podcasts, interviews) with studio quality: every Participant records their own voice in their own browser, so a bad connection never ends up in the recording.

Video-call recordings capture what the network delivered: dropouts, compression and robotic voices. SimplyCaster records each voice locally instead (a "double-ender"), uploads it to your server while you talk, and hands you one clean, synchronised Track per person, ready to edit in your usual audio software.

## How it works

- **Rooms of up to 5 Participants.** The Host creates a Room in the backoffice and gets one Invitation link per Guest. Nobody installs anything: they open the link in Chrome, Firefox or Safari 26+.
- **Live conversation.** Participants hear each other in real time over WebRTC, through a TURN server built into the Coordinator.
- **Local recording.** Each browser records its microphone (Opus, in Ogg) and keeps it in the browser's own storage until it is safely on the server.
- **Progressive, resumable upload.** Audio goes up while you record; if the connection drops, it resumes where it stopped.
- **Synchronised Tracks.** The Coordinator gives every browser a reference clock, so the Tracks of a Take line up. Clock drift is corrected when converting.
- **Publishing.** Once edited, upload each finished episode as an mp3 and the instance serves your podcast's feed for Apple Podcasts, Spotify and any other app (see [Publishing podcasts](#publishing-podcasts)).
- **Delivery.** Download the original Ogg files, or, for a closed Room, 24-bit FLAC: one file per Participant and Take, starting at the Sync tone and as long as the Take, with drift corrected and silence where a browser lost audio or reconnected. Drop them all at zero in your editor.

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

Then open `https://<DOMAIN>/backoffice` and sign in with your `BACKOFFICE_TOKEN` as the Initial Admin. The menu has a Dashboard (open Rooms, free disk space, your passkeys), Rooms and, for Admins, Accounts. In Accounts, create an Admin Account for yourself and open its link to register a passkey; once that works, delete the Initial Admin and the token stops working. Hosts get their Accounts the same way: each sees and manages only the Rooms they created. In Rooms, create a Room and send each Participant their link; Participants need no Account. Keep the token secret while it works: whoever has it can manage every Account and download every recording. Each enrolment and Invitation link is secret too.

If no Admin can sign in any more, remove the Admins from `data/accounts.json` and restart: the Initial Admin comes back.

Recordings live in `./data`, one folder per Room with its Tracks and a `room.json`.

**Already running a reverse proxy** (Traefik, nginx, Coolify)? Remove the `caddy` service, publish `127.0.0.1:3000:3000` on `simplycaster`, and point your proxy at it. It must pass WebSockets through.

## Publishing podcasts

Recording and publishing are two separate things: Rooms give you the source Tracks; once you have edited and mixed an episode in your own software, you upload the finished mp3 to a Podcast, and the instance serves its feed. Nothing links an Episode to a Room.

Publishing needs `PUBLIC_URL` (feeds carry absolute addresses); without it the Podcasts section does not appear. Any Account can create a Podcast and edit any Podcast, its details and its Episodes; only its creator or an Admin can delete it.

**1. Create the Podcast.** In the backoffice, Podcasts → New Podcast, with its name. Its address comes from the name and never changes, even if you rename it, because subscribers follow that address: `Charlas de Código` becomes `https://<DOMAIN>/podcasts/charlas-de-codigo/`.

**2. Fill in its details.** Open it and complete *Podcast details*. Apple Podcasts requires a description, language (`es`, `en-US`…), category, author, owner email and cover; the page lists whatever is still missing.

- The **cover** is a square JPEG or PNG from 1400 to 3000 pixels a side.
- The **owner email** is public in the feed: Apple writes to it to confirm the Podcast is yours. Use an address meant for that.
- **Type**: *Episodic* lists the newest first (talk shows, news); *Serial* in order (a story told in seasons).

**3. Add Episodes.** New Episode, with:

| Field | |
|---|---|
| Title | Required. The Episode's address comes from it and never changes. |
| Show notes | Basic HTML: paragraphs, links, lists. |
| Publication date | Empty: a draft, not in the feed. In the past: in the feed. In the future: scheduled (see below). |
| Audio | The finished mp3, up to 500 MB. Its duration is read by your browser. |
| Explicit, type, season, number | Optional; explicit follows the Podcast unless you set it. |
| Image | Optional square artwork for this Episode, same rules as the cover. |
| Transcript | Optional, WebVTT (`.vtt`) or SubRip (`.srt`); Apple Podcasts shows it alongside the audio. |

Edit an Episode to change its details or replace any of its files: its identity in the feed stays the same, so apps update it instead of showing it twice.

**4. The feed.** It is a static file, regenerated on every change; the Podcast page shows its address and when it was last generated. A scheduled Episode enters the feed the next time it is regenerated after its date, not at its exact time: press *Regenerate feed* then. Only what is in the feed can be downloaded: drafts and scheduled Episodes are not reachable from outside.

**5. Submit it.** Paste the feed address (`https://<DOMAIN>/podcasts/<podcast>/feed.xml`) into [Apple Podcasts Connect](https://podcastsconnect.apple.com), [Spotify for Creators](https://creators.spotify.com) or the [Podcast Index](https://podcastindex.org/add); most other apps (Pocket Casts, Overcast, AntennaPod) find it through those or accept the address directly.

The files live in `./data/podcasts/<podcast>/` and go into the backups with everything else, so budget disk space for the mp3s too: the Dashboard shows what is left. Behind your own reverse proxy, allow uploads of at least 500 MB (for example `client_max_body_size 500m;` in nginx).

## Backups

The `backup` service makes a daily, encrypted, deduplicated [restic](https://restic.net) snapshot of `./data`, and keeps 7 daily, 4 weekly and 6 monthly ones.

- **Default:** into `./backups` on the same server. Easy, but it does not survive losing the server.
- **Off-site (recommended):** set `RESTIC_REPOSITORY` in `.env` to any [restic repository](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html), such as S3, Backblaze B2 or a REST server, plus its credentials. `.env.example` has examples.
- **Anything rclone reaches** (pCloud, Google Drive, OneDrive, Dropbox…): restic calls rclone itself with `RESTIC_REPOSITORY=rclone:<remote>:<path>`. The `backup` image has no rclone, so lend it the host's in a `docker-compose.override.yml`, which Compose loads on its own when present:

  ```yaml
  services:
    backup:
      environment:
        RCLONE_CONFIG: /rclone/rclone.conf
      volumes:
        - /usr/bin/rclone:/usr/local/bin/rclone:ro      # rclone is a single static binary
        - ~/.config/rclone/rclone.conf:/rclone/rclone.conf:ro
  ```
- **Your own tool:** remove the `backup` service and back up `./data` however you like.
- **Without this compose file** (Coolify, which does not back up volumes, or any other platform): [`deploy/host-backup/`](deploy/host-backup/) has the same restic backup as a script and a systemd timer for the host, with the same repository choices and an optional Telegram alert when it fails.

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
| `BACKOFFICE_TOKEN` | (required) | Credential of the Initial Admin, at least 32 characters. |
| `PUBLIC_URL` | `https://<DOMAIN>` in Compose | Address people use, for passkeys, which belong to this domain (changing it means registering them again), and for the feeds of published Podcasts. Without it only the token works, and Podcasts are off. |
| `TURN_PUBLIC_IP` | empty | Public IPv4 for TURN. Empty: only direct connections. |
| `TURN_PORT` | `3478` | STUN/TURN UDP port. |
| `TURN_RELAY_PORTS` | `49160-49199` | UDP relay range. |
| `DOMAIN` | (required) | Used by Caddy for HTTPS. |
| `RESTIC_REPOSITORY`, `RESTIC_PASSWORD` | `/backups`, (required) | Backups, see above. |
| `BACKUP_KEEP` | `--keep-daily 7 --keep-weekly 4` | How long backups last, about a month; deleted audio stays in them until then. |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security issue, see [SECURITY.md](SECURITY.md).

## Supporting the project

SimplyCaster is free software. If it is useful to you, you can support its development on [Liberapay](https://liberapay.com/roencinas/).

## License

[GNU Affero General Public License v3.0](LICENSE). If you run a modified version as a service for others, you must offer them its source code.
