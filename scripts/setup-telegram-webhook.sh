#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-nclavsvzjzegqvkjezyz}"
FUNCTION_URL="${TELEGRAM_WEBHOOK_URL:-https://${PROJECT_REF}.supabase.co/functions/v1/telegram-webhook}"

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "TELEGRAM_BOT_TOKEN is required." >&2
  exit 1
fi

if [[ -z "${TELEGRAM_WEBHOOK_SECRET:-}" ]]; then
  echo "TELEGRAM_WEBHOOK_SECRET is required." >&2
  exit 1
fi

curl --fail --show-error --silent \
  --request POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  --header "Content-Type: application/json" \
  --data "$(printf '{"url":"%s","secret_token":"%s","allowed_updates":["message"]}' "$FUNCTION_URL" "$TELEGRAM_WEBHOOK_SECRET")"

echo
echo "Telegram webhook set to ${FUNCTION_URL}"
