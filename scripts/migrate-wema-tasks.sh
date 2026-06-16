#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
SCRIPT_FILE="${ROOT_DIR}/scripts/migrate-wema-tasks.js"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing .env at ${ENV_FILE}" >&2
  exit 1
fi

if [[ ! -f "${SCRIPT_FILE}" ]]; then
  echo "Missing migration script at ${SCRIPT_FILE}" >&2
  exit 1
fi

MONGO_URI="$(grep -E '^MONGO_URI=' "${ENV_FILE}" | cut -d '=' -f2- | tr -d '\r')"

if [[ -z "${MONGO_URI}" ]]; then
  echo "MONGO_URI is not set in .env" >&2
  exit 1
fi

if command -v mongosh >/dev/null 2>&1; then
  MONGOSH_CMD=(mongosh)
elif command -v npx >/dev/null 2>&1; then
  MONGOSH_CMD=(npx -y mongosh)
else
  echo "mongosh or npx is required to run this migration" >&2
  exit 1
fi

echo "Running Wema task migration..."
"${MONGOSH_CMD[@]}" "${MONGO_URI}" --file "${SCRIPT_FILE}"
