#!/bin/bash

set -e

cd /var/www/reconciliation-server

git fetch origin
git reset --hard origin/main

npm install
npm run build

pm2 restart 0
