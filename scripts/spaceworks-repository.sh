#!/usr/bin/env bash
# Read only named configuration values; never execute the private .env as shell code.
repository_env_value() {
  local key="$1" value="" file="${SWM_STATIC_ENV_FILE:-$ROOT/.env}"
  if [[ -f "$file" ]]; then
    value="$(sed -n "s/^${key}=//p" "$file" | tail -n 1 | tr -d '\r')"
    if [[ "$value" == \"*\" || "$value" == \'*\' ]]; then value="${value:1:${#value}-2}"; fi
  fi
  printf '%s' "$value"
}

configure_release_repository() {
  local owner key value
  SWM_REPOSITORY="${SWM_REPOSITORY:-$(repository_env_value SWM_REPOSITORY)}"
  SWM_REPOSITORY="${SWM_REPOSITORY:-SpaceWorks-Labs/SpaceWorks-Machines}"
  [[ "$SWM_REPOSITORY" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?/[A-Za-z0-9_.-]{1,100}$ ]] \
    && [[ "$SWM_REPOSITORY" != */. && "$SWM_REPOSITORY" != */.. ]] || {
    printf 'ERROR: SWM_REPOSITORY must be a GitHub owner/repo name.\n' >&2
    return 1
  }
  owner="$(printf '%s' "${SWM_REPOSITORY%%/*}" | tr '[:upper:]' '[:lower:]')"
  for key in SWM_BACKEND_IMAGE SWM_FRONTEND_IMAGE; do
    value="${!key:-$(repository_env_value "$key")}"
    if [[ -z "$value" ]]; then
      case "$key" in
        SWM_BACKEND_IMAGE) value="ghcr.io/$owner/spaceworks-machines-backend" ;;
        SWM_FRONTEND_IMAGE) value="ghcr.io/$owner/spaceworks-machines-frontend" ;;
      esac
    fi
    export "$key=$value"
  done
  export SWM_REPOSITORY
}

# The bundled services that serve requests, as this installation runs them.
serving_services() {
  SERVING_SERVICES=(backend worker beat)
  [[ "$(repository_env_value SWM_LAYER)" == proxy ]] || SERVING_SERVICES+=(caddy)
}

# The security-patched edge is built locally even when app images are published.
# An installation behind its own proxy has no bundled edge to build.
build_web_edge() {
  [[ "$(repository_env_value SWM_LAYER)" == proxy ]] || "${COMPOSE[@]}" build caddy
}
