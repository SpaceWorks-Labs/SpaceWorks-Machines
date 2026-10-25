#!/usr/bin/env bash
# Compose dotenv single quotes suppress interpolation of operator-provided secrets.
env_setting() {
  local value="$2"
  value="${value//\\/\\\\}"
  value="${value//\'/\\\'}"
  printf "%s='%s'\n" "$1" "$value" >> "$SETUP_ENV_FILE"
}

write_setup_environment() {
  [[ "${ANSWERS_CONFIRMED:-}" == yes ]] || die 'Confirm the deployment questions first.'
  SETUP_ENV_FILE="${SWM_STATIC_ENV_FILE:-$ROOT/.env}"
  (umask 077; set -o noclobber; : > "$SETUP_ENV_FILE")
  chmod 600 "$SETUP_ENV_FILE"
  local scheme=https layer=none app_url
  [[ "$HTTPS_MODE" != 1 ]] || scheme=http
  [[ "$HTTPS_MODE" != 2 ]] || layer=tls
  [[ "$HTTPS_MODE" != 3 ]] || layer=proxy
  app_url="$scheme://$WEBHOST"
  # Backend for a Netlify website: links, sign-in and Server Actions use the website's origin.
  [[ -z "$SITE_ORIGIN" ]] || app_url="$SITE_ORIGIN"
  configure_release_repository || die 'Invalid GitHub repository.'
  env_setting SWM_REPOSITORY "$SWM_REPOSITORY"
  env_setting SWM_BACKEND_IMAGE "$SWM_BACKEND_IMAGE"
  env_setting SWM_FRONTEND_IMAGE "$SWM_FRONTEND_IMAGE"
  env_setting SWM_LAYER "$layer"
  env_setting SWM_STORAGE "$([[ "$STORAGE" == 1 ]] && echo bundled || echo external)"
  env_setting PUBLIC_APP_BASE_URL "$app_url"
  env_setting SITE_ADDRESS "$([[ "$HTTPS_MODE" == 2 ]] && echo "$WEBHOST" || echo "http://$WEBHOST")"
  [[ "$HTTPS_MODE" != 1 ]] || env_setting ALLOW_PLAIN_HTTP 1
  [[ -z "$TLS_EMAIL" ]] || env_setting TLS_EMAIL "$TLS_EMAIL"
  env_setting HTTP_PORT 80
  if [[ "$RUN_FRONTEND" == 2 ]]; then
    env_setting DEPLOYMENT_MODE backend
    env_setting FRONTEND_GATEWAY_SECRET "$(hex_key)"
  fi
  # Generated alphanumerics stay URL-safe inside the connection strings Compose builds.
  env_setting POSTGRES_PASSWORD "$(rand_key 40)"
  env_setting POSTGRES_APP_PASSWORD "$(rand_key 40)"
  env_setting REDIS_PASSWORD "$(rand_key 40)"
  env_setting MINIO_ROOT_USER "swmach-$(rand_key 12)"
  env_setting MINIO_ROOT_PASSWORD "$(rand_key 40)"
  env_setting S3_APP_PASSWORD "$(rand_key 40)"
  env_setting AUTH_SECRET "$(rand_key 64)"
  env_setting CRON_SECRET "$(rand_key 48)"
  env_setting HEALTHCHECK_SECRET "$(rand_key 48)"
  env_setting NEXT_SERVER_ACTIONS_ENCRYPTION_KEY "$(aes_key)"
  env_setting MFA_ENCRYPTION_KEY "$(aes_key)"
  env_setting PAYMENT_SECRETS_KEY "$(aes_key)"
  env_setting SUPER_ADMIN_EMAIL "$SUPER_ADMIN_EMAIL"
  env_setting EMAIL_FROM "$EMAIL_FROM"
  env_setting SMTP_HOST "$SMTP_HOST"
  env_setting SMTP_PORT "$SMTP_PORT"
  env_setting SMTP_SECURE "$([[ "$SMTP_PORT" == 465 ]] && echo true || echo false)"
  env_setting SMTP_USER "$SMTP_USER"
  env_setting SMTP_PASSWORD "$SMTP_PASSWORD"
  if [[ "$STORAGE" == 2 ]]; then
    env_setting S3_ENDPOINT "$S3_ENDPOINT"
    env_setting S3_REGION "$S3_REGION"
    env_setting S3_BUCKET "$S3_BUCKET"
    env_setting S3_ACCESS_KEY_ID "$S3_ACCESS_KEY"
    env_setting S3_SECRET_ACCESS_KEY "$S3_SECRET_KEY"
  fi
}
