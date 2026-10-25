#!/usr/bin/env bash
# shellcheck disable=SC2034 # FIRST_RUN is read by setup.sh
# Sourced only after the deployment questionnaire has been confirmed.
FIRST_RUN=0
if [[ -f "${SWM_STATIC_ENV_FILE:-$ROOT/.env}" ]]; then
  say 'Found an existing .env - keeping your settings and secrets.'
  [[ "${ANSWERS_CONFIRMED:-}" != yes ]] || FIRST_RUN=1
else
  FIRST_RUN=1
  # shellcheck source=scripts/setup-write-environment.sh
  source "$ROOT/scripts/setup-write-environment.sh"
  write_setup_environment
fi
