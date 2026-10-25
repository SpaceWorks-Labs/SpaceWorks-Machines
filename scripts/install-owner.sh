#!/usr/bin/env bash
# Sourced by host entry points. The directory owner also owns setup and updates.
require_install_owner() {
  local entrypoint="$1"; shift
  local owner current name key
  local forwarded=()
  [[ "$(uname -s)" == Linux ]] || return 0
  owner="$(stat -c %u "$ROOT")"
  current="$(id -u)"
  [[ "$owner" != "$current" ]] || return 0
  if [[ "$owner" == 0 ]]; then
    command -v sudo >/dev/null 2>&1 || {
      printf 'ERROR: %s is root-owned. Run sudo bash %q' "$ROOT" "$entrypoint" >&2
      printf ' %q' "$@" >&2; printf '\n' >&2
      exit 1
    }
    # Preserve only the host configuration knobs, never ambient secrets.
    for key in SWM_STATIC_ENV_FILE SWM_UPDATE_INSTALL_DIR SWM_COMPOSE_BUILD_LAYER SWM_COMPOSE_PROJECT \
      SWM_REPOSITORY SWM_INSTALL_REPOSITORY_PINNED SWM_RUNNER_DIR \
      SWM_IMAGE_TAG SWM_BACKEND_IMAGE SWM_FRONTEND_IMAGE; do
      if [[ -n "${!key:-}" ]]; then forwarded+=("$key=${!key}"); fi
    done
    printf 'Root-owned install: continuing as root using sudo.\n'
    exec sudo env ${forwarded[@]+"${forwarded[@]}"} bash "$entrypoint" "$@"
  fi
  name="$(stat -c %U "$ROOT")"
  printf 'ERROR: %s belongs to %s (UID %s). Sign in as that user and run bash %q' \
    "$ROOT" "$name" "$owner" "$entrypoint" >&2
  printf ' %q' "$@" >&2; printf '\n' >&2
  exit 1
}
