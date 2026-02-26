#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-staging}"

if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "staging" ]]; then
  echo "Usage: ./scripts/deploy.sh [dev|staging]"
  exit 1
fi

echo "Deploying to ${ENVIRONMENT}..."
docker compose pull || true
docker compose up -d --build
echo "Deployment complete."
