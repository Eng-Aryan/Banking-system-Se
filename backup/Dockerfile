FROM mongo:7
RUN apt-get update && apt-get install -y --no-install-recommends openssl cron && rm -rf /var/lib/apt/lists/*
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh
# every 6 hours; first backup 1 minute after start
CMD ["sh","-c","sleep 60; while true; do backup.sh || echo backup FAILED; sleep ${BACKUP_EVERY_SECONDS:-21600}; done"]
