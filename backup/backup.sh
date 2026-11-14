#!/bin/sh
# Encrypted MongoDB backup: mongodump -> gzip -> AES-256 (openssl) -> SHA-256 checksum -> rotation.
set -eu
DIR=/backups; STAMP=$(date -u +%Y%m%dT%H%M%SZ); OUT="$DIR/bank-$STAMP.archive.gz.enc"
mongodump --uri="$MONGO_URI" --archive --gzip --oplog 2>/dev/null | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$OUT" \
  || mongodump --uri="$MONGO_URI" --archive --gzip | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$OUT"
(cd "$DIR" && sha256sum "$(basename "$OUT")" > "$OUT.sha256")
find "$DIR" -name 'bank-*' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
echo "[$(date -u +%FT%TZ)] backup ok: $OUT"
