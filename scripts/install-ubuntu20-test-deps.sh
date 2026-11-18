#!/usr/bin/env bash
# Test dependencies for the Ubuntu 20.04 baseline, including headless Electron.
set -euo pipefail

source /etc/os-release
if [[ "${ID:-}" != ubuntu || "${VERSION_ID:-}" != 20.04 ]]; then
  echo 'This dependency installer is for Ubuntu 20.04 only. See docs/en/environment.md.' >&2
  exit 1
fi
if [[ "$(id -u)" != 0 ]]; then
  echo 'Run this script as root in the CI container, or use sudo on an Ubuntu 20.04 development machine.' >&2
  exit 1
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  ca-certificates curl git tar xz-utils \
  libasound2 libatk1.0-0 libatk-bridge2.0-0 libcairo2 libcups2 \
  libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0 libgtk-3-0 \
  libnspr4 libnss3 libpango-1.0-0 libsecret-1-0 \
  libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 \
  libxfixes3 libxkbcommon0 libxrandr2 libxshmfence1 \
  fonts-dejavu-core fonts-noto-cjk xvfb xauth
