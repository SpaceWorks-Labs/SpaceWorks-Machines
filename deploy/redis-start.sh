#!/bin/sh
# Redis with TLS only (port 0) and a password. The configuration is written
# inside the container from REDIS_PASSWORD, so no secret file sits on the host.
set -eu
: "${REDIS_PASSWORD:?set REDIS_PASSWORD}"
mkdir -p /data/tls
cp /run/server-tls/public.crt /run/server-tls/private.key /data/tls/
umask 077
cat > /data/redis.conf <<CONF
port 0
tls-port 6379
tls-cert-file /data/tls/public.crt
tls-key-file /data/tls/private.key
tls-ca-cert-file /tls/ca.crt
tls-auth-clients no
requirepass $REDIS_PASSWORD
appendonly yes
maxmemory-policy noeviction
CONF
chown -R redis:redis /data/tls /data/redis.conf
chmod 600 /data/tls/private.key /data/redis.conf
exec /usr/local/bin/docker-entrypoint.sh redis-server /data/redis.conf
