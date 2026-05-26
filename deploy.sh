#!/bin/bash

set -e

cd /var/www/reconciliation-server

git fetch origin
git reset --hard origin/main

/root/.nvm/versions/node/v24.16.0/bin/npm install
/root/.nvm/versions/node/v24.16.0/bin/npm run build

/root/.nvm/versions/node/v24.16.0/bin/pm2 restart 0
