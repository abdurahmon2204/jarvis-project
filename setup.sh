#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "==== J.A.R.V.I.S. first-time setup ===="
command -v node >/dev/null || { echo "Node.js not found. Install the LTS version from https://nodejs.org"; exit 1; }
node -e "process.exit(Number(process.versions.node.split('.')[0])>=20?0:1)" || { echo "Node.js 20+ required, you have $(node -v)"; exit 1; }
echo "[1/3] Installing backend packages..."
cd backend && npm install --no-audit --no-fund
if [ ! -f .env ]; then
  cp .env.example .env
  echo "[2/3] backend/.env created. Open it now and set GROQ_API_KEY or GEMINI_API_KEY (and MONGODB_URI if you use a database)."
  echo "      Then run ./setup.sh again to run the checks."
  exit 0
fi
echo "[3/3] Running checks..."
npm run doctor
echo "Done. Start the app with ./start.sh"
