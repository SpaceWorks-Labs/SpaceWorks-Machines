#!/usr/bin/env bash
# Sourced helper for the guarded installer/recovery acceptance scripts only.
test_worker_email() {
  [[ ${CI:-} == true && "$SWM_COMPOSE_PROJECT" =~ ^swmach-recovery-[a-z0-9-]+$ ]] || return 64
  [[ -f "$ROOT/.spaceworks-recovery-test" ]] || return 64
  local tls="$ROOT/tls/mailpit" network name status=0
  name="$SWM_COMPOSE_PROJECT-mailpit"
  if [[ ! -s "$tls/cert.pem" ]]; then
    mkdir -m 700 "$tls"
    openssl req -newkey rsa:2048 -nodes -keyout "$tls/key.pem" -out "$tls/request.csr" -subj /CN=mailpit >/dev/null 2>&1
    printf 'subjectAltName=DNS:mailpit\nextendedKeyUsage=serverAuth\n' > "$tls/extensions.cnf"
    openssl x509 -req -in "$tls/request.csr" -CA "$ROOT/tls/ca.crt" -CAkey "$ROOT/tls/ca.key" -CAcreateserial \
      -out "$tls/cert.pem" -days 1 -extfile "$tls/extensions.cnf" >/dev/null 2>&1
    rm "$tls/request.csr" "$tls/extensions.cnf"
  fi
  network="$(docker inspect "$("${COMPOSE[@]}" ps -q backend)" --format '{{range $name, $settings := .NetworkSettings.Networks}}{{println $name}}{{end}}' | sed -n '/_edge$/p' | head -n 1)"
  [[ -n "$network" ]] || return 1
  docker run -d --name "$name" --user 0:0 --network "$network" --network-alias mailpit -v "$tls:/tls:ro" \
    axllent/mailpit:v1.27 --smtp-auth-accept-any --smtp-require-starttls --smtp-tls-cert /tls/cert.pem --smtp-tls-key /tls/key.pem >/dev/null
  "${COMPOSE[@]}" run --rm --no-deps -T -e SWM_RECOVERY_SMOKE=1 ops --role ops node docker/ops/jobs-smoke.mjs || status=$?
  docker rm -f "$name" >/dev/null 2>&1 || true
  return "$status"
}
