#!/bin/sh
# Public development credentials only; production uses createbuckets.sh and generated secrets.
set -eu
mc mb --ignore-existing local/spaceworks-machines
mc anonymous set none local/spaceworks-machines
mc version enable local/spaceworks-machines
mc admin user add local swmach-app swmach_dev_storage_password >/dev/null
mc admin policy create local swmach-app /bootstrap/storage-policy.json >/dev/null
mc admin policy attach local swmach-app --user swmach-app >/dev/null
echo 'Private development bucket and application identity ready.'
