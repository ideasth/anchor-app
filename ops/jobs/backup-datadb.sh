#!/usr/bin/env bash
# Daily Anchor data.db backup to OneDrive for Business.
#
# Flow:
#   1. Pull a fresh consistent snapshot from /api/admin/db/export
#      (uses better-sqlite3 online backup API — safe with live writers)
#   2. Compress with zstd (typically ~50% size reduction)
#   3. Upload to onedrive:Backups/Anchor/YYYY/MM/anchor-data-YYYY-MM-DDTHHMMSSZ.db.zst
#   4. POST a backup receipt to /api/admin/backup-receipt
#   5. Delete the local temp files
#
# Runs as the deploy user (jod) via a systemd timer at 02:00 local time daily.
# Logs go to journalctl (systemd captures stdout/stderr).
#
# Exit codes:
#   0  success
#   1  generic failure
#   2  secrets missing
#   3  export failed
#   4  upload failed
#   5  receipt POST failed (backup was uploaded though)

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ANCHOR_HOST="${ANCHOR_HOST:-anchor.thinhalo.com}"
ANCHOR_BASE="${ANCHOR_BASE:-https://${ANCHOR_HOST}}"
SECRET_FILE="${ANCHOR_SECRET_FILE:-/opt/anchor/.secrets/anchor_sync_secret}"
RCLONE_REMOTE="${ANCHOR_RCLONE_REMOTE:-onedrive}"
RCLONE_PATH="${ANCHOR_RCLONE_PATH:-Backups/Anchor}"
TMP_DIR="${ANCHOR_TMP_DIR:-/var/tmp/anchor-backup}"
ZSTD_LEVEL="${ANCHOR_ZSTD_LEVEL:-9}"

log() { printf '[%s] [backup-datadb] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { local code="${1:-1}"; shift; log "FAIL: $*"; exit "$code"; }

# ---------------------------------------------------------------------------
# Sanity
# ---------------------------------------------------------------------------

[ -r "$SECRET_FILE" ] || fail 2 "secret file missing or unreadable: $SECRET_FILE"
command -v rclone >/dev/null 2>&1 || fail 1 "rclone not installed"
command -v zstd   >/dev/null 2>&1 || fail 1 "zstd not installed"
command -v curl   >/dev/null 2>&1 || fail 1 "curl not installed"

SECRET=$(cat "$SECRET_FILE")
[ -n "$SECRET" ] || fail 2 "secret file is empty"

mkdir -p "$TMP_DIR"
chmod 700 "$TMP_DIR"

# Cleanup on exit (any path).
TMP_DB=""
TMP_ACTIVITY_DB=""
TMP_BUNDLE=""
TMP_BUNDLE_ZST=""
# shellcheck disable=SC2317  # invoked via trap, shellcheck can't see that
cleanup() {
  for f in "$TMP_DB" "$TMP_ACTIVITY_DB" "$TMP_BUNDLE" "$TMP_BUNDLE_ZST"; do
    [ -n "$f" ] && [ -f "$f" ] && rm -f "$f"
  done
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 1. Export both databases
# ---------------------------------------------------------------------------

STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
YEAR="$(date -u +%Y)"
MONTH="$(date -u +%m)"
TMP_DB="$TMP_DIR/anchor-data-${STAMP}.db"
TMP_ACTIVITY_DB="$TMP_DIR/anchor-activity-${STAMP}.db"
TMP_BUNDLE="$TMP_DIR/anchor-data-${STAMP}.tar"
TMP_BUNDLE_ZST="${TMP_BUNDLE}.zst"

log "Exporting data.db from ${ANCHOR_BASE}/api/admin/db/export"
HTTP_CODE=$(curl -sS -o "$TMP_DB" -w '%{http_code}' \
  --max-time 120 \
  --retry 2 --retry-delay 5 \
  -H "X-Anchor-Sync-Secret: ${SECRET}" \
  "${ANCHOR_BASE}/api/admin/db/export") \
  || fail 3 "curl to export endpoint failed"

if [ "$HTTP_CODE" != "200" ]; then
  fail 3 "export returned HTTP $HTTP_CODE (body kept at $TMP_DB for inspection)"
fi

EXPORT_SIZE=$(stat -c '%s' "$TMP_DB")
log "Export OK ($EXPORT_SIZE bytes)"

# SQLite sanity check on the downloaded file.
MAGIC=$(head -c 16 "$TMP_DB" 2>/dev/null || true)
case "$MAGIC" in
  "SQLite format 3"*) : ;;
  *) fail 3 "downloaded file is not a valid SQLite database (magic: $(printf '%q' "$MAGIC"))" ;;
esac

# Stage 20: also export activity.db if the endpoint exists.
ACTIVITY_EXPORT_SIZE=0
HTTP_CODE_ACTIVITY=$(curl -sS -o "$TMP_ACTIVITY_DB" -w '%{http_code}' \
  --max-time 120 \
  --retry 2 --retry-delay 5 \
  -H "X-Anchor-Sync-Secret: ${SECRET}" \
  "${ANCHOR_BASE}/api/admin/db/export-activity" 2>/dev/null) || HTTP_CODE_ACTIVITY="000"

if [ "$HTTP_CODE_ACTIVITY" = "200" ]; then
  MAGIC_ACT=$(head -c 16 "$TMP_ACTIVITY_DB" 2>/dev/null || true)
  case "$MAGIC_ACT" in
    "SQLite format 3"*)
      ACTIVITY_EXPORT_SIZE=$(stat -c '%s' "$TMP_ACTIVITY_DB")
      log "Activity DB export OK ($ACTIVITY_EXPORT_SIZE bytes)"
      ;;
    *)
      log "WARNING: activity.db export returned non-SQLite content, skipping"
      rm -f "$TMP_ACTIVITY_DB"; TMP_ACTIVITY_DB=""
      ;;
  esac
else
  log "WARNING: activity.db export returned HTTP $HTTP_CODE_ACTIVITY (endpoint may not exist yet), skipping"
  rm -f "$TMP_ACTIVITY_DB"; TMP_ACTIVITY_DB=""
fi

# ---------------------------------------------------------------------------
# 2. Bundle both DBs into a single tar archive, then compress with zstd
# ---------------------------------------------------------------------------

log "Creating tar bundle..."
# Rename files to canonical names inside the archive.
ln -f "$TMP_DB" "$TMP_DIR/data.db" 2>/dev/null || cp "$TMP_DB" "$TMP_DIR/data.db"
TAR_FILES="data.db"
FILES_JSON="[\"data.db\""

if [ -n "$TMP_ACTIVITY_DB" ] && [ -f "$TMP_ACTIVITY_DB" ]; then
  ln -f "$TMP_ACTIVITY_DB" "$TMP_DIR/activity.db" 2>/dev/null || cp "$TMP_ACTIVITY_DB" "$TMP_DIR/activity.db"
  TAR_FILES="$TAR_FILES activity.db"
  FILES_JSON="$FILES_JSON,\"activity.db\""
fi
FILES_JSON="$FILES_JSON]"

# shellcheck disable=SC2086
tar -C "$TMP_DIR" -cf "$TMP_BUNDLE" $TAR_FILES \
  || fail 1 "tar bundle creation failed"

rm -f "$TMP_DIR/data.db" "$TMP_DIR/activity.db"
rm -f "$TMP_DB"; TMP_DB=""
rm -f "$TMP_ACTIVITY_DB"; TMP_ACTIVITY_DB=""

BUNDLE_SIZE=$(stat -c '%s' "$TMP_BUNDLE")
log "Bundle size: $BUNDLE_SIZE bytes (files: $TAR_FILES)"

log "Compressing with zstd level $ZSTD_LEVEL..."
zstd -"$ZSTD_LEVEL" -q -o "$TMP_BUNDLE_ZST" "$TMP_BUNDLE" \
  || fail 1 "zstd compression failed"

COMP_SIZE=$(stat -c '%s' "$TMP_BUNDLE_ZST")
RATIO=$(awk -v a="$COMP_SIZE" -v b="$BUNDLE_SIZE" 'BEGIN { if (b==0) print "n/a"; else printf "%.1f%%", 100*a/b }')
log "Compressed to $COMP_SIZE bytes ($RATIO of original)"

rm -f "$TMP_BUNDLE"; TMP_BUNDLE=""

# ---------------------------------------------------------------------------
# 3. Upload
# ---------------------------------------------------------------------------

REMOTE_DIR="${RCLONE_REMOTE}:${RCLONE_PATH}/${YEAR}/${MONTH}"
REMOTE_FILE="${REMOTE_DIR}/anchor-data-${STAMP}.tar.zst"

log "Uploading to $REMOTE_FILE"
rclone copyto "$TMP_BUNDLE_ZST" "$REMOTE_FILE" \
  --transfers 1 \
  --retries 3 \
  --low-level-retries 5 \
  --stats=0 \
  --use-mmap \
  || fail 4 "rclone copyto failed"

# Verify it landed.
if ! rclone lsf "$REMOTE_DIR" --include "anchor-data-${STAMP}.tar.zst" 2>/dev/null | grep -q . ; then
  fail 4 "upload appeared to succeed but file not visible at $REMOTE_FILE"
fi
log "Upload verified"

# Get the share/web URL for the receipt (rclone link works for OneDrive Business).
ONEDRIVE_URL=""
if URL=$(rclone link "$REMOTE_FILE" 2>/dev/null); then
  ONEDRIVE_URL="$URL"
  log "OneDrive URL: $ONEDRIVE_URL"
else
  ONEDRIVE_URL="onedrive://${RCLONE_PATH}/${YEAR}/${MONTH}/anchor-data-${STAMP}.tar.zst"
  log "rclone link unavailable; using pseudo-URL: $ONEDRIVE_URL"
fi

# ---------------------------------------------------------------------------
# 4. Record receipt
# ---------------------------------------------------------------------------

MTIME=$(date -u +%s)
RECEIPT_BODY=$(printf '{"onedriveUrl":%s,"mtime":%d,"sizeBytes":%d,"filesJson":%s,"note":"daily systemd timer; zstd-%s; ratio=%s; files=%s"}' \
  "$(printf '%s' "$ONEDRIVE_URL" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
  "$MTIME" \
  "$COMP_SIZE" \
  "$(printf '%s' "$FILES_JSON")" \
  "$ZSTD_LEVEL" \
  "$RATIO" \
  "$TAR_FILES")

log "Posting backup receipt..."
RESP=$(curl -sS \
  -o /tmp/anchor-receipt-resp.$$ \
  -w '%{http_code}' \
  --max-time 30 \
  -H "X-Anchor-Sync-Secret: ${SECRET}" \
  -H "Content-Type: application/json" \
  -X POST \
  --data "$RECEIPT_BODY" \
  "${ANCHOR_BASE}/api/admin/backup-receipt") \
  || { log "WARNING: receipt POST failed (backup is uploaded)"; exit 5; }

if [ "$RESP" != "200" ] && [ "$RESP" != "201" ]; then
  log "WARNING: receipt POST returned HTTP $RESP (backup is uploaded)"
  cat /tmp/anchor-receipt-resp.$$ 2>/dev/null | head -5
  rm -f /tmp/anchor-receipt-resp.$$
  exit 5
fi

rm -f /tmp/anchor-receipt-resp.$$
log "Receipt recorded"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

log "BACKUP OK"
log "  remote:  $REMOTE_FILE"
log "  size:    $COMP_SIZE bytes (bundle)"
log "  files:   $TAR_FILES"
log "  stamp:   $STAMP"

exit 0
