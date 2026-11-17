#!/usr/bin/env bash
# VS Code tasks may inherit the system Node.js even when an integrated terminal uses nvm.
set -e

if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm use --silent
fi

exec npm "$@"
