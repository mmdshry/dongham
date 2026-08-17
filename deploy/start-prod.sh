#!/bin/bash
set -euo pipefail
cd /home/dongham/public_html/apps/api
exec /usr/local/bin/node --env-file=/home/dongham/public_html/.env dist/index.js
