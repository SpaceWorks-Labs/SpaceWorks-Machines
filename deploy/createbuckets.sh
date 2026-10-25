#!/bin/sh
# Creates the private bucket and an application identity limited to it. Runs
# once per start of the stack and is safe to rerun.
set -eu
# The root credentials reach mc through the environment, never the command line (which `ps` shows).
# Generated passwords are alphanumeric, so they are safe inside the URL.
MC_HOST_local="https://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000"
export MC_HOST_local
until mc ls local >/dev/null 2>&1; do sleep 1; done
mc mb --ignore-existing local/spaceworks-machines
mc anonymous set none local/spaceworks-machines
mc version enable local/spaceworks-machines
mc admin user add local swmach-app "$S3_APP_PASSWORD" >/dev/null
mc admin policy create local swmach-app /bootstrap/storage-policy.json >/dev/null
mc admin policy attach local swmach-app --user swmach-app >/dev/null 2>&1 || true
echo 'Private storage bucket and application policy ready.'
