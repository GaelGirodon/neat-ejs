#!/usr/bin/env bash

#
# check.sh
#
# Check if Neat EJS should be published to match EJS releases
#

ejs_latest_version=$(
  curl -s -H "Accept: application/vnd.npm.install-v1+json" https://registry.npmjs.org/ejs \
    | grep -oP -m 1 '(?<="latest":")[^"]+' || echo "?"
)

echo "ejs@${ejs_latest_version}"

neat_ejs_latest_version=$(
  curl -s -H "Accept: application/vnd.npm.install-v1+json" https://registry.npmjs.org/neat-ejs \
    | grep -oP -m 1 '(?<="latest":")[^"]+' || echo "?"
)

echo "neat-ejs@${neat_ejs_latest_version}"

if [[ "${ejs_latest_version}" != "${neat_ejs_latest_version}" ]]; then
  echo "publish required"
  if [[ -n "${GITHUB_OUTPUT}" ]]; then
    echo "publish=1" >> $GITHUB_OUTPUT
  fi
fi
