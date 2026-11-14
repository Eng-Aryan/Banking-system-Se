#!/bin/sh
# Usage: restore.sh /backups/bank-XXXX.archive.gz.enc   (verifies checksum, decrypts, restores)
set -eu
F="$1"; (cd "$(dirname "$F")" && sha256sum -c "$(basename "$F").sha256")
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$F" | mongorestore --uri="$MONGO_URI" --archive --gzip --drop
echo "restore complete"
