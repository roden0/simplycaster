#!/bin/sh
# Backs up a SimplyCaster data folder with restic, from the host: for platforms that, like Coolify, do not
# back up volumes. Install it as /usr/local/sbin/backup-simplycaster.sh (mode 700) with the systemd units
# next to it, and its settings in /etc/simplycaster-backup.env (mode 600). See README.md, "Backups".
set -u
. "${SIMPLYCASTER_BACKUP_ENV:-/etc/simplycaster-backup.env}"
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE
[ -n "${RCLONE_CONFIG:-}" ] && export RCLONE_CONFIG

alert() {
    [ -n "${TELEGRAM_TOKEN_FILE:-}" ] || return 0
    curl -fsS -m 20 "https://api.telegram.org/bot$(cat "$TELEGRAM_TOKEN_FILE")/sendMessage" \
        -d chat_id="$(cat "$TELEGRAM_CHAT_FILE")" --data-urlencode text="$1" > /dev/null || true
}

fail() {
    echo "backup-simplycaster: $1 failed" >&2
    alert "SimplyCaster backup on $(hostname): $1 failed. See journalctl -u backup-simplycaster."
    exit 1
}

[ -d "$DATA_DIR" ] || fail "finding $DATA_DIR"
restic cat config > /dev/null 2>&1 || restic init || fail "creating the repository"
restic backup --host "$(hostname)" --tag simplycaster "$DATA_DIR" || fail "the backup"
# shellcheck disable=SC2086 # KEEP holds several flags
restic forget --prune ${KEEP:---keep-daily 7 --keep-weekly 4 --keep-monthly 6} || fail "pruning"
