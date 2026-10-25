#!/usr/bin/env bash
cd "$(dirname "$0")/backend" || exit 1
[ -f .env ] || { echo "backend/.env not found. Run ./setup.sh first."; exit 1; }
echo "J.A.R.V.I.S. starting on http://localhost:5000"
node server.js
