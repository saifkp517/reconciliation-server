#!/bin/bash

set -e

export PATH="/root/.nvm/versions/node/v24.16.0/bin:$PATH"

cd /var/www/reconciliation-server

git fetch origin
git reset --hard origin/main

npm install
npm run build

pm2 restart 0
