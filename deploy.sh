#!/bin/bash

set -e

export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

cd /var/www/reconciliation-server

git fetch origin
git reset --hard origin/main

npm install
npm run build

pm2 restart 0
