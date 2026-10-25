#!/bin/sh
# Private CA and service certificates for the bundled PostgreSQL, Redis and Silo.
# Runs inside the app image (which has openssl) with the install's tls/ mounted:
#   certificates.sh           create the CA and certificates (refuses to replace a CA)
#   certificates.sh --renew   reissue the service certificates from the existing CA
# Only ca.crt is shared with application containers; ca.key never leaves tls/.
set -eu
umask 077
dir=${SWM_TLS_DIR:-/tls}
case "${1:-}" in
  '') [ ! -e "$dir/ca.key" ] || { echo 'A private CA already exists; use --renew.' >&2; exit 1; }
      openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 3650 \
        -subj '/CN=Space Works Machines private CA' -addext 'basicConstraints=critical,CA:TRUE' \
        -keyout "$dir/ca.key" -out "$dir/ca.crt" 2>/dev/null ;;
  --renew) [ -s "$dir/ca.key" ] || { echo 'No private CA to renew from.' >&2; exit 1; } ;;
  *) echo 'Usage: certificates.sh [--renew]' >&2; exit 64 ;;
esac
for service in db redis minio; do
  mkdir -p "$dir/$service"
  openssl req -new -newkey rsa:2048 -nodes -subj "/CN=$service" \
    -keyout "$dir/$service/private.key" -out "$dir/$service/request.csr" 2>/dev/null
  printf 'subjectAltName=DNS:%s\nextendedKeyUsage=serverAuth\n' "$service" > "$dir/$service/extensions.cnf"
  openssl x509 -req -sha256 -days 825 -in "$dir/$service/request.csr" -CA "$dir/ca.crt" -CAkey "$dir/ca.key" \
    -CAcreateserial -extfile "$dir/$service/extensions.cnf" -out "$dir/$service/public.crt" 2>/dev/null
  rm -f "$dir/$service/request.csr" "$dir/$service/extensions.cnf"
done
chmod 755 "$dir" 2>/dev/null || true  # setup.sh also sets it on the host
chmod 644 "$dir/ca.crt"
echo 'Private TLS certificates ready.'
